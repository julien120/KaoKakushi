import type { FaceBox } from "./types";

export const YUNET_STRIDES = [8, 16, 32] as const;
/** HuggingFace 配布の 2023mar ONNX は入力 640x640 固定 */
export const YUNET_INPUT_SIZE = 640;

/** ONNX 出力（ストライド別の cls / obj / bbox フラット配列） */
export interface YuNetRawOutputs {
  cls: Record<number, Float32Array>;
  obj: Record<number, Float32Array>;
  bbox: Record<number, Float32Array>;
}

/**
 * YuNet 2023mar の出力デコード（OpenCV objdetect/face_detect.cpp と同等）。
 * - score = sqrt(clamp01(cls) * clamp01(obj))
 * - cx = (col + dx) * stride, cy = (row + dy) * stride
 * - w = exp(bw) * stride, h = exp(bh) * stride
 * 返る座標は「パディング済み入力画像」のピクセル座標。
 */
export function decodeYuNet(
  outputs: YuNetRawOutputs,
  padWidth: number,
  padHeight: number,
  scoreThreshold: number,
): FaceBox[] {
  const boxes: FaceBox[] = [];
  for (const stride of YUNET_STRIDES) {
    const cols = padWidth / stride;
    const rows = padHeight / stride;
    const cls = outputs.cls[stride]!;
    const obj = outputs.obj[stride]!;
    const bbox = outputs.bbox[stride]!;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const score = Math.sqrt(clamp01(cls[idx]!) * clamp01(obj[idx]!));
        if (score < scoreThreshold) continue;
        const cx = (c + bbox[idx * 4]!) * stride;
        const cy = (r + bbox[idx * 4 + 1]!) * stride;
        const w = Math.exp(bbox[idx * 4 + 2]!) * stride;
        const h = Math.exp(bbox[idx * 4 + 3]!) * stride;
        boxes.push({ x: cx - w / 2, y: cy - h / 2, width: w, height: h, score });
      }
    }
  }
  return boxes;
}

/**
 * ImageData → YuNet 入力テンソル (NCHW, BGR, 0–255, float32)。
 * OpenCV の blobFromImage(scalefactor=1, mean=0, BGR) と同等。
 */
export function imageDataToTensor(image: ImageData): Float32Array {
  const { width, height, data } = image;
  const plane = width * height;
  const tensor = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    tensor[i] = data[i * 4 + 2]!; // B
    tensor[plane + i] = data[i * 4 + 1]!; // G
    tensor[plane * 2 + i] = data[i * 4]!; // R
  }
  return tensor;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
