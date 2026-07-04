import { YuNetFaceDetector } from "./detection/yunet-detector";
import type { BlurStyle } from "./editor/blur";
import { attachBrush } from "./editor/brush";
import {
  displayToImage,
  displayToImageScale,
  fitContain,
  type Point,
} from "./editor/coords";
import {
  canUndo,
  emptyMask,
  pushStroke,
  setFaces,
  undo,
  type BrushMode,
  type MaskState,
  type Stroke,
} from "./editor/mask-ops";
import { EditorPipeline } from "./editor/pipeline";
import { downloadBlob, exportImage, type ExportFormat } from "./io/export";
import { loadImageFile } from "./io/load-image";
import { isSupportedImageFile } from "./io/validate";

type AppState = "idle" | "detecting" | "editing";

export interface TestHook {
  state: () => AppState;
  faceCount: () => number;
  imageSize: () => { width: number; height: number };
  samplePatch: (
    x: number,
    y: number,
    w: number,
    h: number,
    layer: "source" | "composite",
  ) => number[];
  faces: () => { x: number; y: number; width: number; height: number }[];
}

declare global {
  interface Window {
    __test?: TestHook;
  }
}

export function startApp(): void {
  const el = {
    dropzone: document.getElementById("dropzone")!,
    fileInput: document.getElementById("file-input") as HTMLInputElement,
    editor: document.getElementById("editor")!,
    status: document.getElementById("status")!,
    canvasWrap: document.getElementById("canvas-wrap")!,
    display: document.getElementById("display") as HTMLCanvasElement,
    brushCursor: document.getElementById("brush-cursor")!,
    modeProtect: document.getElementById("mode-protect") as HTMLButtonElement,
    modeAdd: document.getElementById("mode-add") as HTMLButtonElement,
    brushSize: document.getElementById("brush-size") as HTMLInputElement,
    undoButton: document.getElementById("undo") as HTMLButtonElement,
    styleGaussian: document.getElementById(
      "style-gaussian",
    ) as HTMLButtonElement,
    styleMosaic: document.getElementById("style-mosaic") as HTMLButtonElement,
    blurStrength: document.getElementById("blur-strength") as HTMLInputElement,
    format: document.getElementById("format") as HTMLSelectElement,
    download: document.getElementById("download") as HTMLButtonElement,
    reset: document.getElementById("reset") as HTMLButtonElement,
    toast: document.getElementById("toast")!,
  };

  const pipeline = new EditorPipeline();
  const detector = new YuNetFaceDetector();
  let state: AppState = "idle";
  let mask: MaskState = emptyMask();
  let brushMode: BrushMode = "protect";
  let blurStyle: BlurStyle = "gaussian";
  let detectorFailed = false;
  let loadToken = 0;
  let renderQueued = false;
  let previewStroke: Stroke | undefined;

  // 初回操作を待たせないよう裏で先にモデルをロードしておく
  detector.init().catch(() => {
    detectorFailed = true;
  });

  function setState(next: AppState): void {
    state = next;
    document.body.dataset["appState"] = next;
    el.dropzone.hidden = next !== "idle";
    el.editor.hidden = next === "idle";
    el.download.disabled = next !== "editing";
  }

  function showToast(message: string): void {
    el.toast.textContent = message;
    el.toast.hidden = false;
    window.setTimeout(() => {
      el.toast.hidden = true;
    }, 4000);
  }

  function setStatus(message: string): void {
    el.status.textContent = message;
  }

  /** mask → composite → 表示 を rAF で 1 フレームにまとめて再描画 */
  function requestRender(): void {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      pipeline.renderMask(mask, previewStroke);
      pipeline.renderComposite();
      pipeline.drawToDisplay(el.display);
    });
  }

  function layoutDisplay(): void {
    if (!pipeline.hasImage) return;
    const wrapWidth = el.canvasWrap.clientWidth;
    if (wrapWidth === 0) return;
    // ヘッダー + ツールバーが同一画面に収まる高さを確保する
    const maxHeight = Math.max(
      240,
      Math.min(window.innerHeight * 0.6, window.innerHeight - 380),
    );
    const size = fitContain(pipeline.imageSize, {
      width: wrapWidth,
      height: maxHeight,
    });
    el.display.style.width = `${size.width}px`;
    el.display.style.height = `${size.height}px`;
    const dpr = window.devicePixelRatio || 1;
    el.display.width = Math.round(size.width * dpr);
    el.display.height = Math.round(size.height * dpr);
    requestRender();
  }

  async function handleFile(file: File | Blob & { name?: string }): Promise<void> {
    const named = file as { type: string; name?: string };
    if (!isSupportedImageFile({ type: named.type, name: named.name ?? "" })) {
      showToast("画像ファイル (JPEG / PNG / WebP など) を選んでください");
      return;
    }
    const token = ++loadToken;
    setState("detecting");
    setStatus("画像を読み込んで顔を探しています…");
    try {
      const bitmap = await loadImageFile(file);
      if (token !== loadToken) {
        bitmap.close();
        return;
      }
      pipeline.setImage(bitmap);
      mask = emptyMask();
      previewStroke = undefined;

      let faces: MaskState["faces"] = [];
      try {
        faces = await detector.detect(bitmap);
        detectorFailed = false;
      } catch (error) {
        console.error("顔検出に失敗:", error);
        detectorFailed = true;
      }
      bitmap.close();
      if (token !== loadToken) return;

      mask = setFaces(mask, faces);
      pipeline.setBlur(blurStyle, Number(el.blurStrength.value));
      setState("editing");
      layoutDisplay();
      updateUndoButton();

      if (detectorFailed) {
        setStatus(
          "顔検出モデルを読み込めませんでした。「ぼかし追加」ブラシで手動でぼかせます。",
        );
      } else if (faces.length === 0) {
        setStatus(
          "顔は見つかりませんでした。「ぼかし追加」ブラシで好きな場所をぼかせます。",
        );
      } else {
        setStatus(
          `${faces.length} 件の顔をぼかしました。かけすぎた所は「ぼかし解除」ブラシでなぞってください。`,
        );
      }
    } catch {
      if (token !== loadToken) return;
      setState("idle");
      showToast("画像を読み込めませんでした。別のファイルでお試しください。");
    }
  }

  // --- 画像の入力経路: ドロップ / クリック選択 / ペースト ---
  el.dropzone.addEventListener("click", () => el.fileInput.click());
  el.dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      el.fileInput.click();
    }
  });
  el.fileInput.addEventListener("change", () => {
    const file = el.fileInput.files?.[0];
    if (file) void handleFile(file);
    el.fileInput.value = "";
  });
  for (const target of [el.dropzone, document.body]) {
    target.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.dropzone.classList.add("drag-over");
    });
    target.addEventListener("dragleave", () => {
      el.dropzone.classList.remove("drag-over");
    });
    target.addEventListener("drop", (e) => {
      e.preventDefault();
      el.dropzone.classList.remove("drag-over");
      const file = e.dataTransfer?.files?.[0];
      if (file) void handleFile(file);
    });
  }
  window.addEventListener("paste", (e) => {
    const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
      f.type.startsWith("image/"),
    );
    if (file) void handleFile(file);
  });

  // --- ブラシ ---
  function toImagePoint(clientX: number, clientY: number): Point {
    const rect = el.display.getBoundingClientRect();
    return displayToImage(
      { x: clientX - rect.left, y: clientY - rect.top },
      { width: rect.width, height: rect.height },
      pipeline.imageSize,
    );
  }

  function brushSizeImagePx(): number {
    const rect = el.display.getBoundingClientRect();
    return (
      Number(el.brushSize.value) *
      displayToImageScale(
        { width: rect.width, height: rect.height },
        pipeline.imageSize,
      )
    );
  }

  attachBrush(el.display, {
    getMode: () => brushMode,
    getSizeImagePx: brushSizeImagePx,
    toImagePoint,
    onPreview: (stroke) => {
      previewStroke = stroke;
      requestRender();
    },
    onCommit: (stroke) => {
      previewStroke = undefined;
      mask = pushStroke(mask, stroke);
      updateUndoButton();
      requestRender();
    },
  });

  // ブラシカーソルの円プレビュー
  el.display.addEventListener("pointermove", (e) => {
    const size = Number(el.brushSize.value);
    el.brushCursor.hidden = false;
    el.brushCursor.style.width = `${size}px`;
    el.brushCursor.style.height = `${size}px`;
    const wrapRect = el.canvasWrap.getBoundingClientRect();
    el.brushCursor.style.left = `${e.clientX - wrapRect.left}px`;
    el.brushCursor.style.top = `${e.clientY - wrapRect.top}px`;
  });
  el.display.addEventListener("pointerleave", () => {
    el.brushCursor.hidden = true;
  });

  function updateUndoButton(): void {
    el.undoButton.disabled = !canUndo(mask);
  }

  el.undoButton.addEventListener("click", () => {
    mask = undo(mask);
    updateUndoButton();
    requestRender();
  });

  // --- モード・スタイル切り替え ---
  function selectButton(
    selected: HTMLButtonElement,
    other: HTMLButtonElement,
  ): void {
    selected.setAttribute("aria-pressed", "true");
    other.setAttribute("aria-pressed", "false");
  }
  el.modeProtect.addEventListener("click", () => {
    brushMode = "protect";
    selectButton(el.modeProtect, el.modeAdd);
  });
  el.modeAdd.addEventListener("click", () => {
    brushMode = "add";
    selectButton(el.modeAdd, el.modeProtect);
  });
  function applyBlurSettings(): void {
    if (!pipeline.hasImage) return;
    pipeline.setBlur(blurStyle, Number(el.blurStrength.value));
    requestRender();
  }
  el.styleGaussian.addEventListener("click", () => {
    blurStyle = "gaussian";
    selectButton(el.styleGaussian, el.styleMosaic);
    applyBlurSettings();
  });
  el.styleMosaic.addEventListener("click", () => {
    blurStyle = "mosaic";
    selectButton(el.styleMosaic, el.styleGaussian);
    applyBlurSettings();
  });
  el.blurStrength.addEventListener("input", applyBlurSettings);

  // --- 書き出し・リセット ---
  el.download.addEventListener("click", () => {
    void (async () => {
      try {
        const format = el.format.value as ExportFormat;
        const blob = await exportImage(pipeline.composite, format);
        const stamp = new Date()
          .toISOString()
          .replace(/[-:]/g, "")
          .slice(0, 15);
        downloadBlob(blob, `kao-kakushi-${stamp}.${format}`);
      } catch {
        showToast("書き出しに失敗しました。もう一度お試しください。");
      }
    })();
  });

  el.reset.addEventListener("click", () => {
    loadToken++;
    mask = emptyMask();
    previewStroke = undefined;
    setState("idle");
  });

  window.addEventListener("resize", layoutDisplay);

  setState("idle");

  // --- E2E テスト用フック（画像データは返すが外部送信は一切しない） ---
  window.__test = {
    state: () => state,
    faceCount: () => mask.faces.length,
    faces: () =>
      mask.faces.map(({ x, y, width, height }) => ({ x, y, width, height })),
    imageSize: () => ({ ...pipeline.imageSize }),
    samplePatch: (x, y, w, h, layer) => {
      const canvas = layer === "source" ? pipeline.source : pipeline.composite;
      const data = canvas
        .getContext("2d")!
        .getImageData(x, y, w, h).data;
      return Array.from(data);
    },
  };
}
