import { describe, expect, it } from "vitest";
import { iou, makeTiles, mergeBoxes, remapBox } from "../src/detection/tiling";
import type { FaceBox } from "../src/detection/types";

function box(
  x: number,
  y: number,
  width: number,
  height: number,
  score = 0.9,
): FaceBox {
  return { x, y, width, height, score };
}

describe("makeTiles", () => {
  it("grid=1 は画像全体のタイル 1 枚を返す", () => {
    expect(makeTiles(100, 80, 1)).toEqual([
      { x: 0, y: 0, width: 100, height: 80 },
    ]);
  });

  it("grid=2 は 4 タイルを返し、画像全体をカバーする", () => {
    const tiles = makeTiles(1000, 800, 2, 0.15);
    expect(tiles).toHaveLength(4);
    // 左上タイルは原点から始まる
    expect(tiles[0]).toMatchObject({ x: 0, y: 0 });
    // 右下タイルは画像の右下端で終わる
    const last = tiles[3]!;
    expect(last.x + last.width).toBe(1000);
    expect(last.y + last.height).toBe(800);
    // 全タイルが画像内に収まる
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.width).toBeLessThanOrEqual(1000);
      expect(t.y + t.height).toBeLessThanOrEqual(800);
    }
  });

  it("隣接タイルはオーバーラップする（境界上の顔の取りこぼし防止）", () => {
    const tiles = makeTiles(1000, 800, 2, 0.15);
    const [topLeft, topRight] = [tiles[0]!, tiles[1]!];
    // 左上タイルの右端は右上タイルの左端より右にある
    expect(topLeft.x + topLeft.width).toBeGreaterThan(topRight.x);
  });
});

describe("remapBox", () => {
  it("タイル原点分だけオフセットする", () => {
    const remapped = remapBox(box(10, 20, 30, 40), {
      x: 500,
      y: 400,
      width: 600,
      height: 480,
    });
    expect(remapped).toMatchObject({ x: 510, y: 420, width: 30, height: 40 });
  });
});

describe("iou", () => {
  it("同一ボックスは 1", () => {
    const a = box(0, 0, 100, 100);
    expect(iou(a, a)).toBeCloseTo(1);
  });

  it("重なりなしは 0", () => {
    expect(iou(box(0, 0, 10, 10), box(100, 100, 10, 10))).toBe(0);
  });

  it("半分重なりは 1/3", () => {
    // 交差 50x100=5000, 合併 10000+10000-5000=15000
    expect(iou(box(0, 0, 100, 100), box(50, 0, 100, 100))).toBeCloseTo(1 / 3);
  });

  it("面積ゼロのボックスは 0（ゼロ除算しない）", () => {
    expect(iou(box(0, 0, 0, 0), box(0, 0, 0, 0))).toBe(0);
  });
});

describe("mergeBoxes", () => {
  it("重複ボックスはスコアの高い方だけ残る", () => {
    const merged = mergeBoxes([
      box(0, 0, 100, 100, 0.5),
      box(5, 5, 100, 100, 0.9),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.score).toBe(0.9);
  });

  it("離れたボックスは両方残る", () => {
    const merged = mergeBoxes([
      box(0, 0, 50, 50, 0.8),
      box(200, 200, 50, 50, 0.7),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("空配列は空配列を返す", () => {
    expect(mergeBoxes([])).toEqual([]);
  });

  it("3 つ以上の連鎖重複も最高スコア 1 つに集約される", () => {
    const merged = mergeBoxes([
      box(0, 0, 100, 100, 0.6),
      box(2, 2, 100, 100, 0.7),
      box(4, 4, 100, 100, 0.8),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.score).toBe(0.8);
  });
});
