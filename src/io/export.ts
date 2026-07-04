export type ExportFormat = "png" | "jpeg";

/**
 * composite を再エンコードして書き出す。
 * canvas 経由の再エンコードにより EXIF/GPS 等のメタデータは必ず除去される。
 */
export function exportImage(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("画像の書き出しに失敗しました"));
        }
      },
      format === "png" ? "image/png" : "image/jpeg",
      0.92,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
