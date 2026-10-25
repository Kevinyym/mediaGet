// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DirectVideo from "@/components/videos/DirectVideo";

afterEach(cleanup);

describe("DirectVideo", () => {
  it("loads directly, retries through the proxy once, then reports failure", () => {
    const src = "https://video.twimg.com/test.mp4?x=1&y=2";
    const onError = vi.fn();
    const view = render(<DirectVideo src={src} onError={onError} />);
    const video = view.container.querySelector("video")!;
    expect(video.getAttribute("src")).toBe(src);
    fireEvent.error(video);
    expect(video.getAttribute("src")).toBe(`/api/video-proxy?url=${encodeURIComponent(src)}`);
    expect(onError).not.toHaveBeenCalled();
    fireEvent.error(video);
    expect(onError).toHaveBeenCalledTimes(1);
    view.rerender(<DirectVideo src="https://cdn.example.com/next.mp4" onError={onError} />);
    expect(video.getAttribute("src")).toBe("https://cdn.example.com/next.mp4");
  });

  it("does not wrap an existing proxy URL again", () => {
    const onError = vi.fn();
    const src = "/api/video-proxy?url=existing";
    const view = render(<DirectVideo src={src} onError={onError} />);
    const video = view.container.querySelector("video")!;
    fireEvent.error(video);
    expect(video.getAttribute("src")).toBe(src);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
