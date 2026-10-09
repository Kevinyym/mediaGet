// @ts-nocheck
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/xhs/route.js";
import { collectXhsVideoUrls } from "@/lib/xhs-video";

const cover = "https://sns-webpic-qc.xhscdn.com/cover.jpg";
const streamUrl = "https://sns-video-hw.xhscdn.com/video.mp4";
const originUrl = "https://sns-video-bd.xhscdn.com/spectrum/original.mp4";
let sequence = 0;

async function parseNote(note, headStatuses = [200], headHeaders = {}) {
  const noteId = `video-regression-${++sequence}`;
  const state = { note: { currentNoteId: noteId, noteDetailMap: {
    [noteId]: { note: { title: "视频测试", user: {}, imageList: [{ urlDefault: cover }], ...note } },
  } } };
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(
    `<script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script>`
  ));
  for (const status of headStatuses) fetchMock.mockResolvedValueOnce(new Response(null, { status, headers: headHeaders }));
  vi.stubGlobal("fetch", fetchMock);
  const response = await GET(new Request(
    `http://localhost/api/xhs?url=${encodeURIComponent(`https://www.xiaohongshu.com/explore/${noteId}`)}`
  ));
  return { result: await response.json(), fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe("Xiaohongshu video extraction", () => {
  it("returns an origin-key video instead of its cover when streams are absent", async () => {
    const { result, fetchMock } = await parseNote({ type: "video", video: {
      consumer: { originVideoKey: "spectrum/original.mp4" },
    } });
    expect(result).toMatchObject({ code: 200, data: { type: "video", url: originUrl } });
    expect(result.data.cover).toContain(encodeURIComponent(cover));
    expect(result.data.images).toBeUndefined();
    expect(fetchMock).toHaveBeenNthCalledWith(2, originUrl, expect.objectContaining({ method: "HEAD" }));
  });

  it("looks past an empty first stream and normalizes HTTP addresses", async () => {
    const { result } = await parseNote({ type: "video", video: { media: { stream: {
      h264: [{}, { masterUrl: streamUrl.replace("https:", "http:") }],
    } } } });
    expect(result).toMatchObject({ code: 200, data: { type: "video", url: streamUrl } });
  });

  it("tries stream backups when the origin address is gone", async () => {
    const { result } = await parseNote({ type: "video", video: {
      consumer: { originVideoKey: "spectrum/original.mp4" },
      media: { stream: { h264: [{ backupUrls: [streamUrl] }] } },
    } }, [404, 200]);
    expect(result.data.url).toBe(streamUrl);
  });

  it("keeps video type when a CDN refuses HEAD", async () => {
    const { result } = await parseNote({ type: "video", video: {
      media: { stream: { av1: [{ masterUrl: streamUrl }] } },
    } }, [405], { "content-type": "text/html" });
    expect(result).toMatchObject({ code: 200, data: { type: "video", url: streamUrl } });
  });

  it("reports missing video addresses instead of returning the cover as an image", async () => {
    const { result, fetchMock } = await parseNote({ type: "video", video: {} }, []);
    expect(result.code).toBe(400);
    expect(result.msg).toContain("视频地址");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a definitively missing video rather than returning the cover", async () => {
    const { result } = await parseNote({ type: "video", video: {
      consumer: { originVideoKey: "spectrum/original.mp4" },
    } }, [410]);
    expect(result.code).toBe(400);
  });

  it("preserves genuine image notes", async () => {
    const { result, fetchMock } = await parseNote({ type: "normal" }, []);
    expect(result).toMatchObject({ code: 200, data: { type: "image" } });
    expect(result.data.images).toEqual([`/api/image?url=${encodeURIComponent(cover)}`]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an image response at a purported video address", async () => {
    const { result } = await parseNote({ type: "video", video: {
      consumer: { originVideoKey: "spectrum/original.mp4" },
    } }, [200], { "content-type": "image/jpeg" });
    expect(result.code).toBe(400);
  });

  it("deduplicates all codec streams and ignores malformed media fields", () => {
    expect(collectXhsVideoUrls({ video: {
      consumer: { originVideoKey: "//evil.example/video" },
      media: { stream: {
        h264: [null, { backupUrls: [false, "javascript:alert(1)", streamUrl], masterUrl: streamUrl }],
        h265: [{ masterUrl: "https://sns-video-hw.xhscdn.com/hevc.mp4" }],
      } },
    } })).toEqual([streamUrl, "https://sns-video-hw.xhscdn.com/hevc.mp4"]);
  });
});
