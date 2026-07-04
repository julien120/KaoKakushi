import { expect, test } from "@playwright/test";
import { brushDrag, getFaces, loadImage, meanDiff } from "./helpers";

test.describe("ブラシツール", () => {
  test("保護ブラシで塗った顔はぼかしが解除され、undo で戻る", async ({
    page,
  }) => {
    await loadImage(page, "portrait.jpg");
    const face = (await getFaces(page))[0]!;
    const cx = face.x + face.width / 2;
    const cy = face.y + face.height / 2;

    // ぼかされている状態を確認
    expect(await meanDiff(page, cx - 12, cy - 12, 24, 24)).toBeGreaterThan(3);

    // 保護ブラシ（デフォルト選択）を最大サイズにして顔の中心を横になぞる
    await page.click("#mode-protect");
    await page.locator("#brush-size").fill("100");
    await brushDrag(page, { x: cx - face.width / 2, y: cy }, { x: cx + face.width / 2, y: cy });

    // 中心パッチが元画像に戻っている
    expect(await meanDiff(page, cx - 12, cy - 12, 24, 24)).toBeLessThan(1);

    // undo でぼかしが復活する
    await expect(page.locator("#undo")).toBeEnabled();
    await page.click("#undo");
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        ),
    );
    expect(await meanDiff(page, cx - 12, cy - 12, 24, 24)).toBeGreaterThan(3);
    await expect(page.locator("#undo")).toBeDisabled();
  });

  test("追加ブラシで塗った場所は顔がなくてもぼかされる", async ({ page }) => {
    await loadImage(page, "burger.jpg");
    const { width, height } = await page.evaluate(() =>
      window.__test!.imageSize(),
    );
    const cx = width / 2;
    const cy = height / 2;

    // 最初は無加工
    expect(await meanDiff(page, cx - 12, cy - 12, 24, 24)).toBeLessThan(1);

    await page.click("#mode-add");
    await expect(page.locator("#mode-add")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.locator("#brush-size").fill("80");
    await brushDrag(page, { x: cx - width / 4, y: cy }, { x: cx + width / 4, y: cy });

    expect(await meanDiff(page, cx - 12, cy - 12, 24, 24)).toBeGreaterThan(3);
  });

  test("保護ブラシは追加ブラシより優先される（後勝ち）", async ({ page }) => {
    await loadImage(page, "burger.jpg");
    const { width, height } = await page.evaluate(() =>
      window.__test!.imageSize(),
    );
    const cx = width / 2;
    const cy = height / 2;

    await page.click("#mode-add");
    await page.locator("#brush-size").fill("80");
    await brushDrag(page, { x: cx - width / 4, y: cy }, { x: cx + width / 4, y: cy });
    expect(await meanDiff(page, cx - 12, cy - 12, 24, 24)).toBeGreaterThan(3);

    await page.click("#mode-protect");
    await brushDrag(page, { x: cx - width / 4, y: cy }, { x: cx + width / 4, y: cy });
    expect(await meanDiff(page, cx - 12, cy - 12, 24, 24)).toBeLessThan(1);
  });
});
