import * as ort from "onnxruntime-web/wasm";
import { makeTiles, mergeBoxes } from "./tiling";
import type { FaceBox, FaceDetectionAdapter } from "./types";
import {
  decodeYuNet,
  imageDataToTensor,
  YUNET_INPUT_SIZE,
  YUNET_STRIDES,
  type YuNetRawOutputs,
} from "./yunet";

const SCORE_THRESHOLD = 0.6;
/** 長辺がこれ以上ならタイル再検出も行う */
const TILING_THRESHOLD = 1600;

/**
 * YuNet (OpenCV Zoo, MIT) アダプタ。BlazeFace short-range は入力 128px 固定で
 * 集合写真の小さい顔を検出できないため、可変解像度で小顔に強い YuNet を使う。
 * ONNX Runtime の WASM とモデルは public/ からセルフホスト配信（外部通信ゼロ）。
 */
export class YuNetFaceDetector implements FaceDetectionAdapter {
  private session: ort.InferenceSession | null = null;
  private initPromise: Promise<void> | null = null;

  init(): Promise<void> {
    this.initPromise ??= (async () => {
      const base = import.meta.env.BASE_URL;
      ort.env.wasm.wasmPaths = `${base}ort/`;
      // SharedArrayBuffer (cross-origin isolation) を要求しないようシングルスレッド
      ort.env.wasm.numThreads = 1;
      this.session = await ort.InferenceSession.create(
        `${base}models/face_detection_yunet_2023mar.onnx`,
        { executionProviders: ["wasm"] },
      );
    })();
    return this.initPromise;
  }

  async detect(image: ImageBitmap): Promise<FaceBox[]> {
    await this.init();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")!.drawImage(image, 0, 0);

    // 全体 1 パス + 大きい画像は 2x2 オーバーラップタイルで小顔を拾う
    const regions = [{ x: 0, y: 0, width: image.width, height: image.height }];
    if (Math.max(image.width, image.height) >= TILING_THRESHOLD) {
      regions.push(...makeTiles(image.width, image.height, 2, 0.15));
    }
    const boxes: FaceBox[] = [];
    for (const region of regions) {
      boxes.push(...(await this.detectRegion(canvas, region)));
    }
    return mergeBoxes(boxes);
  }

  private async detectRegion(
    source: HTMLCanvasElement,
    region: { x: number; y: number; width: number; height: number },
  ): Promise<FaceBox[]> {
    // モデル入力は 640x640 固定: アスペクト比を保って収め、右下を黒でパディング
    const size = YUNET_INPUT_SIZE;
    const scale = size / Math.max(region.width, region.height);
    const scaledW = Math.max(1, Math.round(region.width * scale));
    const scaledH = Math.max(1, Math.round(region.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      source,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      scaledW,
      scaledH,
    );

    const tensor = new ort.Tensor(
      "float32",
      imageDataToTensor(ctx.getImageData(0, 0, size, size)),
      [1, 3, size, size],
    );
    const session = this.session!;
    const results = await session.run({ [session.inputNames[0]!]: tensor });

    const raw: YuNetRawOutputs = { cls: {}, obj: {}, bbox: {} };
    for (const stride of YUNET_STRIDES) {
      raw.cls[stride] = results[`cls_${stride}`]!.data as Float32Array;
      raw.obj[stride] = results[`obj_${stride}`]!.data as Float32Array;
      raw.bbox[stride] = results[`bbox_${stride}`]!.data as Float32Array;
    }

    // パディング入力座標 → 領域内座標 → 元画像座標
    return decodeYuNet(raw, size, size, SCORE_THRESHOLD).map((box) => ({
      ...box,
      x: box.x / scale + region.x,
      y: box.y / scale + region.y,
      width: box.width / scale,
      height: box.height / scale,
    }));
  }
}
