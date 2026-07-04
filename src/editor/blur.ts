export type BlurStyle = "gaussian" | "mosaic";

/**
 * source 全体のぼかし版を target に描く。
 * 弱いガウスぼかし単体は復元攻撃に弱いため、必ず大きく縮小してから
 * 拡大する（情報を実際に破棄する）。strength は 0–100。
 */
export function renderBlurred(
  source: HTMLCanvasElement,
  target: HTMLCanvasElement,
  style: BlurStyle,
  strength: number,
): void {
  const { width, height } = source;
  target.width = width;
  target.height = height;
  const ctx = target.getContext("2d")!;

  const divisor = 8 + (clamp(strength, 0, 100) / 100) * 32; // 8..40
  const smallW = Math.max(1, Math.round(width / divisor));
  const smallH = Math.max(1, Math.round(height / divisor));
  const small = document.createElement("canvas");
  small.width = smallW;
  small.height = smallH;
  const smallCtx = small.getContext("2d")!;
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.imageSmoothingQuality = "high";
  smallCtx.drawImage(source, 0, 0, smallW, smallH);

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (style === "mosaic") {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, width, height);
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // 端の透明フリンジを避けるため、まず素の拡大でベースを敷く
    ctx.drawImage(small, 0, 0, width, height);
    ctx.filter = `blur(${Math.max(2, Math.round(divisor / 3))}px)`;
    ctx.drawImage(small, 0, 0, width, height);
  }
  ctx.restore();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
