// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMedia } from "@/utils/downloadMedia";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("downloadMedia", () => {
  it.each([true, false])("uses a browser blob on success and proxy on failure (%s)", async (direct) => {
    vi.useFakeTimers();
    const src = "https://cdn.example.com/video.mp4?x=1&y=2";
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (!direct) throw new TypeError("CORS");
      return { ok: true, headers: new Headers({ "content-type": "video/mp4" }), blob: async () => new Blob(["media"]) };
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => "blob:media"),
      revokeObjectURL: vi.fn(),
    }));
    let saved = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved = this.getAttribute("href") || "";
      expect(this.download).toBe("test.mp4");
    });
    await downloadMedia(src, "test.mp4");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saved).toBe(direct ? "blob:media" : `/api/video-proxy?url=${encodeURIComponent(src)}&download=1&filename=test.mp4`);
    expect(document.querySelector("a")).toBeNull();
    await vi.runAllTimersAsync();
    if (direct) expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:media");
  });
});
