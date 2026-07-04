import { describe, expect, it } from "vitest";
import {
  capSize,
  displayToImage,
  displayToImageScale,
  expandBox,
  fitContain,
} from "../src/editor/coords";

describe("capSize", () => {
  it("上限以下ならそのまま", () => {
    expect(capSize(800, 600, 4096)).toEqual({ width: 800, height: 600 });
  });

  it("横長画像は長辺=上限に縮小、アスペクト比維持", () => {
    const size = capSize(8192, 4096, 4096);
    expect(size.width).toBe(4096);
    expect(size.height).toBe(2048);
  });

  it("縦長画像も長辺基準", () => {
    const size = capSize(2000, 10000, 4096);
    expect(size.height).toBe(4096);
    expect(size.width).toBe(Math.round(2000 * (4096 / 10000)));
  });

  it("極端な縦横比でも 0 にならない", () => {
    const size = capSize(100000, 10, 4096);
    expect(size.width).toBe(4096);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });
});

describe("fitContain", () => {
  it("横長画像を横長の箱に収める", () => {
    expect(
      fitContain({ width: 2000, height: 1000 }, { width: 1000, height: 800 }),
    ).toEqual({ width: 1000, height: 500 });
  });

  it("縦長画像は高さ基準で収まる", () => {
    expect(
      fitContain({ width: 1000, height: 2000 }, { width: 1000, height: 500 }),
    ).toEqual({ width: 250, height: 500 });
  });

  it("箱より小さい画像は拡大される (contain)", () => {
    expect(
      fitContain({ width: 100, height: 100 }, { width: 400, height: 300 }),
    ).toEqual({ width: 300, height: 300 });
  });
});

describe("displayToImage", () => {
  it("表示座標を画像座標へスケールする", () => {
    const p = displayToImage(
      { x: 100, y: 50 },
      { width: 400, height: 300 },
      { width: 1600, height: 1200 },
    );
    expect(p).toEqual({ x: 400, y: 200 });
  });

  it("等倍表示なら座標は変わらない", () => {
    const p = displayToImage(
      { x: 12, y: 34 },
      { width: 800, height: 600 },
      { width: 800, height: 600 },
    );
    expect(p).toEqual({ x: 12, y: 34 });
  });

  it("往復変換が一致する", () => {
    const display = { width: 390, height: 520 };
    const image = { width: 3000, height: 4000 };
    const original = { x: 123, y: 456 };
    const there = displayToImage(original, display, image);
    const back = displayToImage(there, image, display);
    expect(back.x).toBeCloseTo(original.x);
    expect(back.y).toBeCloseTo(original.y);
  });
});

describe("displayToImageScale", () => {
  it("縮小表示なら 1 より大きい係数", () => {
    expect(
      displayToImageScale(
        { width: 500, height: 400 },
        { width: 2000, height: 1600 },
      ),
    ).toBe(4);
  });
});

describe("expandBox", () => {
  const image = { width: 1000, height: 1000 };

  it("中心を保って拡大する", () => {
    const expanded = expandBox(
      { x: 400, y: 400, width: 200, height: 200, score: 1 },
      1.5,
      image,
    );
    expect(expanded).toMatchObject({ x: 350, y: 350, width: 300, height: 300 });
  });

  it("画像端でクランプされる", () => {
    const expanded = expandBox(
      { x: 0, y: 0, width: 100, height: 100, score: 1 },
      2,
      image,
    );
    expect(expanded.x).toBe(0);
    expect(expanded.y).toBe(0);
    expect(expanded.width).toBe(150);
    expect(expanded.height).toBe(150);
  });

  it("factor=1 なら変化しない", () => {
    const box = { x: 10, y: 20, width: 30, height: 40, score: 0.5 };
    expect(expandBox(box, 1, image)).toEqual(box);
  });
});
