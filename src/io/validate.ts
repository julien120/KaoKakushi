const SUPPORTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/bmp",
]);

export function isSupportedImageFile(file: {
  type: string;
  name: string;
}): boolean {
  if (SUPPORTED_TYPES.has(file.type)) {
    return true;
  }
  // ドラッグ元によっては type が空になることがあるため拡張子でも判定する
  if (file.type === "") {
    return /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(file.name);
  }
  return false;
}
