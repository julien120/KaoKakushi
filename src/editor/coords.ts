import type { FaceBox } from "../detection/types";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * 長辺が maxSide を超える場合に収まるよう縮小したサイズを返す。
 * 巨大写真のメモリ上限（処理解像度キャップ）に使う。
 */
export function capSize(width: number, height: number, maxSide: number): Size {
  const longest = Math.max(width, height);
  if (longest <= maxSide) {
    return { width, height };
  }
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** アスペクト比を保って箱に収める (object-fit: contain) */
export function fitContain(image: Size, box: Size): Size {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  };
}

/**
 * 表示キャンバス上の CSS ピクセル座標 → 処理画像ピクセル座標。
 * キャンバスは画像と同アスペクトで表示される前提（contain フィット済み）。
 */
export function displayToImage(
  point: Point,
  displaySize: Size,
  imageSize: Size,
): Point {
  return {
    x: (point.x / displaySize.width) * imageSize.width,
    y: (point.y / displaySize.height) * imageSize.height,
  };
}

/** 表示サイズに対するブラシ径などを画像座標系へ変換する係数 */
export function displayToImageScale(
  displaySize: Size,
  imageSize: Size,
): number {
  return imageSize.width / displaySize.width;
}

/**
 * 顔 bbox を中心基準で factor 倍に拡張し、画像内にクランプする。
 * 髪や輪郭まで覆うためのマージン。
 */
export function expandBox(
  box: FaceBox,
  factor: number,
  imageSize: Size,
): FaceBox {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const w = box.width * factor;
  const h = box.height * factor;
  const x0 = Math.max(0, cx - w / 2);
  const y0 = Math.max(0, cy - h / 2);
  const x1 = Math.min(imageSize.width, cx + w / 2);
  const y1 = Math.min(imageSize.height, cy + h / 2);
  return { ...box, x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
