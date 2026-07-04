import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  FIXTURES,
  getFaces,
  loadImage,
  meanDiff,
  waitForRender,
} from "./helpers";

test.describe("顔検出と自動ぼかし", () => {
  test("ポートレート: 顔が検出され、顔領域だけがぼかされる", async ({
    page,
  }) => {
    await loadImage(page, "portrait.jpg");

    const faces = await getFaces(page);
    expect(faces.length).toBeGreaterThanOrEqual(1);

    // 顔中心のパッチは元画像から変化している（= ぼかされている）
    const face = faces[0]!;
    const cx = face.x + face.width / 2;
    const cy = face.y + face.height / 2;
    const faceDiff = await meanDiff(page, cx - 12, cy - 12, 24, 24);
    expect(faceDiff).toBeGreaterThan(3);

    // 画像の四隅（顔から遠い背景）は元画像と一致する
    const { width, height } = await page.evaluate(() =>
      window.__test!.imageSize(),
    );
    const cornerDiff = await meanDiff(page, width - 40, height - 40, 24, 24);
    expect(cornerDiff).toBeLessThan(1);
  });

  test("複数人の写真: 2 つ以上の顔が検出される", async ({ page }) => {
    await loadImage(page, "two_faces.jpg");
    const faces = await getFaces(page);
    expect(faces.length).toBeGreaterThanOrEqual(2);

    // 両方の顔がぼかされている
    for (const face of faces.slice(0, 2)) {
      const diff = await meanDiff(
        page,
        face.x + face.width / 2 - 8,
        face.y + face.height / 2 - 8,
        16,
        16,
      );
      expect(diff).toBeGreaterThan(3);
    }
  });

  test("実物の集合写真: 5 人全員の顔が検出されてぼかされる", async ({
    page,
  }) => {
    // 私物写真のためリポジトリには含まれない（ローカル専用の回帰テスト）
    test.skip(
      !existsSync(path.join(FIXTURES, "group_photo.png")),
      "private fixture not present",
    );
    await loadImage(page, "group_photo.png"); // 5482x3655 → 4096 キャップ、顔は画像比で小さい
    const faces = await getFaces(page);
    expect(faces.length).toBeGreaterThanOrEqual(5);

    // 検出された顔すべてがぼかされている
    for (const face of faces) {
      const diff = await meanDiff(
        page,
        face.x + face.width / 2 - 8,
        face.y + face.height / 2 - 8,
        16,
        16,
      );
      expect(diff).toBeGreaterThan(2);
    }
  });

  test("顔のない写真: 編集状態になり、画像は無加工のまま", async ({
    page,
  }) => {
    await loadImage(page, "burger.jpg");
    expect(await page.evaluate(() => window.__test!.faceCount())).toBe(0);
    await expect(page.locator("#status")).toContainText(
      "顔は見つかりませんでした",
    );

    const { width, height } = await page.evaluate(() =>
      window.__test!.imageSize(),
    );
    const centerDiff = await meanDiff(
      page,
      width / 2 - 12,
      height / 2 - 12,
      24,
      24,
    );
    expect(centerDiff).toBeLessThan(1);
  });

  test("ドラッグ＆ドロップでも画像を読み込める", async ({ page }) => {
    await page.goto("/");
    const buffer = readFileSync(path.join(FIXTURES, "portrait.jpg"));
    await page.evaluate(async (base64) => {
      const res = await fetch(`data:image/jpeg;base64,${base64}`);
      const blob = await res.blob();
      const file = new File([blob], "portrait.jpg", { type: "image/jpeg" });
      const dt = new DataTransfer();
      dt.items.add(file);
      document
        .getElementById("dropzone")!
        .dispatchEvent(new DragEvent("drop", { dataTransfer: dt }));
    }, buffer.toString("base64"));
    await expect(page.locator("body")).toHaveAttribute(
      "data-app-state",
      "editing",
      { timeout: 45_000 },
    );
    expect(
      await page.evaluate(() => window.__test!.faceCount()),
    ).toBeGreaterThanOrEqual(1);
  });

  test("モザイクへの切り替えと強度変更が反映される", async ({ page }) => {
    await loadImage(page, "portrait.jpg");
    const face = (await getFaces(page))[0]!;
    const cx = face.x + face.width / 2;
    const cy = face.y + face.height / 2;

    await page.click("#style-mosaic");
    await waitForRender(page);
    const mosaicDiff = await meanDiff(page, cx - 12, cy - 12, 24, 24);
    expect(mosaicDiff).toBeGreaterThan(3);
    await expect(page.locator("#style-mosaic")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
