import { expect, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

// window.__test の型は src/app.ts の declare global が同じ tsconfig 配下で有効
/** フィクスチャ画像を読み込み、編集状態 + 初回描画完了まで待つ */
export async function loadImage(page: Page, fixture: string): Promise<void> {
  await page.goto("/");
  await page.setInputFiles("#file-input", path.join(FIXTURES, fixture));
  await expect(page.locator("body")).toHaveAttribute(
    "data-app-state",
    "editing",
    { timeout: 45_000 },
  );
  // editing 直後は rAF での初回 composite 描画がまだの可能性がある（遅い CI で顕在化）
  await waitForRender(page);
}

/** source と composite の指定パッチの RGB 平均絶対差（0 = 同一） */
export function meanDiff(
  page: Page,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<number> {
  return page.evaluate(
    ([px, py, pw, ph]) => {
      const hook = window.__test!;
      const a = hook.samplePatch(px!, py!, pw!, ph!, "source");
      const b = hook.samplePatch(px!, py!, pw!, ph!, "composite");
      let sum = 0;
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        sum +=
          Math.abs(a[i]! - b[i]!) +
          Math.abs(a[i + 1]! - b[i + 1]!) +
          Math.abs(a[i + 2]! - b[i + 2]!);
        n += 3;
      }
      return sum / n;
    },
    [
      Math.round(x),
      Math.round(y),
      Math.round(w),
      Math.round(h),
    ] as const,
  );
}

export function getFaces(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }[]> {
  return page.evaluate(() => window.__test!.faces());
}

/** 画像座標の 2 点間を表示キャンバス上でドラッグしてブラシ操作する */
export async function brushDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const [start, end] = await page.evaluate(
    ([f, t]) => {
      const rect = document
        .getElementById("display")!
        .getBoundingClientRect();
      const img = window.__test!.imageSize();
      const map = (p: { x: number; y: number }) => ({
        x: rect.left + (p.x / img.width) * rect.width,
        y: rect.top + (p.y / img.height) * rect.height,
      });
      return [map(f!), map(t!)] as const;
    },
    [from, to] as const,
  );
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      start.x + ((end.x - start.x) * i) / steps,
      start.y + ((end.y - start.y) * i) / steps,
    );
  }
  await page.mouse.up();
  await waitForRender(page);
}

/** rAF でキューされた再描画が反映されるのを待つ */
export function waitForRender(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}
