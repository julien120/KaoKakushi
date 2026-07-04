import { describe, expect, it } from "vitest";
import {
  decodeYuNet,
  imageDataToTensor,
  YUNET_STRIDES,
  type YuNetRawOutputs,
} from "../src/detection/yunet";

/** padW x padH の全ストライド分の空出力を作る */
function emptyOutputs(padW: number, padH: number): YuNetRawOutputs {
  const raw: YuNetRawOutputs = { cls: {}, obj: {}, bbox: {} };
  for (const s of YUNET_STRIDES) {
    const cells = (padW / s) * (padH / s);
    raw.cls[s] = new Float32Array(cells);
    raw.obj[s] = new Float32Array(cells);
    raw.bbox[s] = new Float32Array(cells * 4);
  }
  return raw;
}

describe("decodeYuNet", () => {
  it("全セルがスコア 0 なら何も返さない", () => {
    expect(decodeYuNet(emptyOutputs(64, 32), 64, 32, 0.5)).toEqual([]);
  });

  it("1 セルの検出を OpenCV と同じ式でデコードする", () => {
    const raw = emptyOutputs(64, 32);
    // stride 8, row=1, col=2 (cols=8) → idx=10
    const idx = 1 * 8 + 2;
    raw.cls[8]![idx] = 1;
    raw.obj[8]![idx] = 1;
    raw.bbox[8]![idx * 4] = 0.5; // dx
    raw.bbox[8]![idx * 4 + 1] = 0.5; // dy
    raw.bbox[8]![idx * 4 + 2] = Math.log(2); // w = 2*stride
    raw.bbox[8]![idx * 4 + 3] = Math.log(3); // h = 3*stride

    const boxes = decodeYuNet(raw, 64, 32, 0.5);
    expect(boxes).toHaveLength(1);
    const box = boxes[0]!;
    // cx=(2+0.5)*8=20, cy=(1+0.5)*8=12, w=16, h=24
    expect(box.x).toBeCloseTo(20 - 8);
    expect(box.y).toBeCloseTo(12 - 12);
    expect(box.width).toBeCloseTo(16);
    expect(box.height).toBeCloseTo(24);
    expect(box.score).toBeCloseTo(1);
  });

  it("score = sqrt(cls * obj) で、閾値未満は捨てる", () => {
    const raw = emptyOutputs(32, 32);
    raw.cls[16]![0] = 0.5;
    raw.obj[16]![0] = 0.5; // score = 0.5
    expect(decodeYuNet(raw, 32, 32, 0.6)).toHaveLength(0);
    const kept = decodeYuNet(raw, 32, 32, 0.4);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.score).toBeCloseTo(0.5);
  });

  it("cls / obj は 0..1 にクランプされる（異常値でもスコアが暴れない）", () => {
    const raw = emptyOutputs(32, 32);
    raw.cls[32]![0] = 5; // → 1 扱い
    raw.obj[32]![0] = -2; // → 0 扱い
    expect(decodeYuNet(raw, 32, 32, 0.01)).toHaveLength(0);
  });
});

describe("imageDataToTensor", () => {
  it("RGBA → NCHW の BGR 平面に変換する", () => {
    // 2x1 画像: ピクセル0 = (10,20,30), ピクセル1 = (40,50,60)
    const image = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]),
    } as ImageData;
    const tensor = imageDataToTensor(image);
    // B 平面, G 平面, R 平面 の順
    expect(Array.from(tensor)).toEqual([30, 60, 20, 50, 10, 40]);
  });
});
