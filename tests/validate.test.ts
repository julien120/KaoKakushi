import { describe, expect, it } from "vitest";
import { isSupportedImageFile } from "../src/io/validate";

describe("isSupportedImageFile", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/avif"])(
    "%s を受け付ける",
    (type) => {
      expect(isSupportedImageFile({ type, name: "photo" })).toBe(true);
    },
  );

  it.each(["application/pdf", "text/plain", "video/mp4", "image/svg+xml"])(
    "%s を拒否する",
    (type) => {
      expect(isSupportedImageFile({ type, name: "file" })).toBe(false);
    },
  );

  it("type が空でも拡張子が画像なら受け付ける", () => {
    expect(isSupportedImageFile({ type: "", name: "IMG_0123.JPG" })).toBe(true);
    expect(isSupportedImageFile({ type: "", name: "notes.txt" })).toBe(false);
  });
});
