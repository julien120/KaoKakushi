import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadImage } from "./helpers";

test.describe("書き出し", () => {
  test("PNG でダウンロードでき、中身が有効な PNG である", async ({ page }) => {
    await loadImage(page, "portrait.jpg");
    const downloadPromise = page.waitForEvent("download");
    await page.click("#download");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^kao-kakushi-.*\.png$/);

    const filePath = await download.path();
    const bytes = readFileSync(filePath);
    // PNG シグネチャ
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(bytes.length).toBeGreaterThan(10_000);
  });

  test("JPEG 書き出しで EXIF メタデータが除去される", async ({ page }) => {
    await loadImage(page, "portrait.jpg"); // 元画像は EXIF 付き
    await page.selectOption("#format", "jpeg");
    const downloadPromise = page.waitForEvent("download");
    await page.click("#download");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.jpeg$/);

    const bytes = readFileSync(await download.path());
    // JPEG SOI マーカー
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    // 元画像のメタデータ（撮影者名・コピーライト文）が引き継がれていない
    // ※ WebKit は再エンコード時に無害な最小 EXIF スタブを書くため、
    //   「Exif マーカーの完全不在」ではなく「元情報と GPS の不在」を検証する
    expect(bytes.includes(Buffer.from("Pete Souza"))).toBe(false);
    expect(bytes.includes(Buffer.from("WHITE HOUSE"))).toBe(false);
    expect(bytes.includes(Buffer.from("GPS"))).toBe(false);
  });
});
