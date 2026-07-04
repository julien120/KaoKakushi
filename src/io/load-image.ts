import { capSize } from "../editor/coords";

export const MAX_PROCESSING_SIDE = 4096;

/**
 * File → 処理解像度の ImageBitmap。
 * - EXIF 回転を適用（座標ズレバグの根絶）
 * - 長辺を MAX_PROCESSING_SIDE にキャップ（メモリ上限・iOS Safari の canvas 面積制限対策）
 */
export async function loadImageFile(
  file: Blob,
  maxSide = MAX_PROCESSING_SIDE,
): Promise<ImageBitmap> {
  const original = await createBitmapWithOrientation(file);
  const capped = capSize(original.width, original.height, maxSide);
  if (capped.width === original.width && capped.height === original.height) {
    return original;
  }
  const canvas = document.createElement("canvas");
  canvas.width = capped.width;
  canvas.height = capped.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(original, 0, 0, capped.width, capped.height);
  original.close();
  return createImageBitmap(canvas);
}

async function createBitmapWithOrientation(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // 古いブラウザ向けフォールバック（現行ブラウザは EXIF をデフォルトで尊重する）
    return createImageBitmap(file);
  }
}
