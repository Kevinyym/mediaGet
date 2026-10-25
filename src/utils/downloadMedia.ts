/** 直连下载支持 CORS 的媒体；失败时才交给现有同源代理保存。 */
export async function downloadMedia(src: string, filename: string): Promise<void> {
  let objectUrl: string | undefined;
  let href: string;
  try {
    const response = await fetch(src, {
      mode: "cors",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok || /text\/html|application\/json/i.test(response.headers.get("content-type") || "")) {
      throw new Error("Media unavailable");
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("Empty media");
    objectUrl = URL.createObjectURL(blob);
    href = objectUrl;
  } catch {
    href = `/api/video-proxy?url=${encodeURIComponent(src)}&download=1&filename=${encodeURIComponent(filename)}`;
  }
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** 兼容原有代理下载链接，同时保留链接地址供无脚本场景使用。 */
export function handleMediaDownload(event: {
  preventDefault(): void;
  currentTarget: HTMLAnchorElement;
}): void {
  const url = new URL(event.currentTarget.href);
  const src = url.searchParams.get("url");
  if (!src) return;
  event.preventDefault();
  void downloadMedia(src, url.searchParams.get("filename") || "video.mp4");
}
