import { renderBlurred, type BlurStyle } from "./blur";
import { expandBox, type Size } from "./coords";
import type { MaskState, Stroke } from "./mask-ops";

/** 検出 bbox をどれだけ広げてぼかすか（髪・輪郭カバー） */
const FACE_EXPAND_FACTOR = 1.35;

/**
 * レイヤー合成の中核。
 * source → blurred、mask（白 = ぼかす領域）、
 * composite = source + (blurred ∘ mask)
 */
export class EditorPipeline {
  readonly source = document.createElement("canvas");
  readonly composite = document.createElement("canvas");
  private readonly blurred = document.createElement("canvas");
  private readonly mask = document.createElement("canvas");
  private readonly maskedBlur = document.createElement("canvas");
  imageSize: Size = { width: 0, height: 0 };

  setImage(bitmap: ImageBitmap): void {
    this.imageSize = { width: bitmap.width, height: bitmap.height };
    for (const canvas of [
      this.source,
      this.blurred,
      this.mask,
      this.maskedBlur,
      this.composite,
    ]) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    this.source.getContext("2d")!.drawImage(bitmap, 0, 0);
  }

  get hasImage(): boolean {
    return this.imageSize.width > 0;
  }

  setBlur(style: BlurStyle, strength: number): void {
    renderBlurred(this.source, this.blurred, style, strength);
  }

  /**
   * mask を state から再生（宣言的に全消し→全描き直し）。
   * previewStroke は描画中の未確定ストローク。
   */
  renderMask(state: MaskState, previewStroke?: Stroke): void {
    const ctx = this.mask.getContext("2d")!;
    const { width, height } = this.imageSize;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    for (const face of state.faces) {
      const box = expandBox(face, FACE_EXPAND_FACTOR, this.imageSize);
      const feather = Math.max(2, Math.min(box.width, box.height) * 0.08);
      ctx.filter = `blur(${feather}px)`;
      ctx.beginPath();
      ctx.ellipse(
        box.x + box.width / 2,
        box.y + box.height / 2,
        box.width / 2,
        box.height / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.filter = "none";
    for (const stroke of state.strokes) {
      drawStroke(ctx, stroke);
    }
    if (previewStroke) {
      drawStroke(ctx, previewStroke);
    }
    ctx.restore();
  }

  renderComposite(): void {
    const { width, height } = this.imageSize;
    const maskedCtx = this.maskedBlur.getContext("2d")!;
    maskedCtx.save();
    maskedCtx.clearRect(0, 0, width, height);
    maskedCtx.drawImage(this.blurred, 0, 0);
    maskedCtx.globalCompositeOperation = "destination-in";
    maskedCtx.drawImage(this.mask, 0, 0);
    maskedCtx.restore();

    const ctx = this.composite.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.source, 0, 0);
    ctx.drawImage(this.maskedBlur, 0, 0);
  }

  drawToDisplay(display: HTMLCanvasElement): void {
    if (!this.hasImage) return;
    const ctx = display.getContext("2d")!;
    ctx.clearRect(0, 0, display.width, display.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.composite, 0, 0, display.width, display.height);
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const first = stroke.points[0];
  if (!first) return;
  ctx.globalCompositeOperation =
    stroke.mode === "add" ? "source-over" : "destination-out";
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (stroke.points.length === 1) {
    ctx.beginPath();
    ctx.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i]!;
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}
