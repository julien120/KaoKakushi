import { expect, test } from "@playwright/test";
import { loadImage } from "./helpers";

test.describe("プライバシー保証", () => {
  test("読み込みから書き出しまで外部リクエストがゼロ", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname !== "localhost" && url.protocol !== "data:") {
        externalRequests.push(request.url());
      }
    });

    await loadImage(page, "portrait.jpg");
    const downloadPromise = page.waitForEvent("download");
    await page.click("#download");
    await downloadPromise;

    expect(externalRequests).toEqual([]);
  });
});
