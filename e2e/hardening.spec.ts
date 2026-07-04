import { expect, test } from "@playwright/test";
import path from "node:path";
import { FIXTURES, loadImage, meanDiff, waitForRender } from "./helpers";

test.describe("エッジケース", () => {
  test("巨大画像は処理解像度 4096px にキャップされる", async ({ page }) => {
    await loadImage(page, "big.jpg"); // 6000x3000
    const size = await page.evaluate(() => window.__test!.imageSize());
    expect(size.width).toBe(4096);
    expect(size.height).toBe(2048);
  });

  test("EXIF 回転付き画像は正しい向きで読み込まれる", async ({ page }) => {
    // rotated.jpg は 400x200 + Orientation=6 (90 度回転) → 実表示は 200x400
    await loadImage(page, "rotated.jpg");
    const size = await page.evaluate(() => window.__test!.imageSize());
    expect(size.width).toBe(200);
    expect(size.height).toBe(400);
  });

  test("画像でないファイルは拒否され、待機画面のまま", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("#file-input", path.join(FIXTURES, "note.txt"));
    await expect(page.locator("#toast")).toBeVisible();
    await expect(page.locator("#toast")).toContainText("画像ファイル");
    await expect(page.locator("body")).toHaveAttribute(
      "data-app-state",
      "idle",
    );
  });

  test("連続で画像を投入しても最後の画像が勝つ", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("#file-input", path.join(FIXTURES, "portrait.jpg"));
    await page.setInputFiles("#file-input", path.join(FIXTURES, "burger.jpg"));
    await expect(page.locator("body")).toHaveAttribute(
      "data-app-state",
      "editing",
      { timeout: 45_000 },
    );
    // burger.jpg (480x325, 顔なし) が最終状態
    await expect
      .poll(() => page.evaluate(() => window.__test!.imageSize().width))
      .toBe(480);
    expect(await page.evaluate(() => window.__test!.faceCount())).toBe(0);
  });

  test("「別の写真」で待機画面に戻り、再度読み込める", async ({ page }) => {
    await loadImage(page, "portrait.jpg");
    await page.click("#reset");
    await expect(page.locator("body")).toHaveAttribute(
      "data-app-state",
      "idle",
    );
    await page.setInputFiles("#file-input", path.join(FIXTURES, "burger.jpg"));
    await expect(page.locator("body")).toHaveAttribute(
      "data-app-state",
      "editing",
      { timeout: 45_000 },
    );
    expect(await page.evaluate(() => window.__test!.imageSize().width)).toBe(
      480,
    );
  });

  test("検出モデルのロードに失敗しても手動ぼかしは使える", async ({
    page,
  }) => {
    // WASM とモデルへのリクエストを遮断してロード失敗を再現
    await page.route("**/ort/**", (route) => route.abort());
    await page.route("**/models/**", (route) => route.abort());
    // 中央にテクスチャがある burger.jpg を使う（平坦な領域はぼかしても画素差が出ないため）
    await loadImage(page, "burger.jpg");

    await expect(page.locator("#status")).toContainText(
      "顔検出モデルを読み込めませんでした",
    );
    expect(await page.evaluate(() => window.__test!.faceCount())).toBe(0);

    // 追加ブラシでの手動ぼかしは機能する
    const { width, height } = await page.evaluate(() =>
      window.__test!.imageSize(),
    );
    await page.click("#mode-add");
    await page.locator("#brush-size").fill("80");
    const rect = await page.locator("#display").boundingBox();
    await page.mouse.move(rect!.x + rect!.width / 4, rect!.y + rect!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      rect!.x + (rect!.width * 3) / 4,
      rect!.y + rect!.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();
    await waitForRender(page);
    expect(
      await meanDiff(page, width / 2 - 12, height / 2 - 12, 24, 24),
    ).toBeGreaterThan(3);
  });
});

test.describe("タッチ操作", () => {
  test("タッチのドラッグでブラシが使える", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP タッチ合成は Chromium のみ");
    await loadImage(page, "burger.jpg");
    const { width, height } = await page.evaluate(() =>
      window.__test!.imageSize(),
    );
    await page.click("#mode-add");
    await page.locator("#brush-size").fill("80");

    const rect = (await page.locator("#display").boundingBox())!;
    const y = rect.y + rect.height / 2;
    const x0 = rect.x + rect.width / 4;
    const x1 = rect.x + (rect.width * 3) / 4;

    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: x0, y }],
    });
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y }],
      });
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await waitForRender(page);
    expect(
      await meanDiff(page, width / 2 - 12, height / 2 - 12, 24, 24),
    ).toBeGreaterThan(3);
  });
});
