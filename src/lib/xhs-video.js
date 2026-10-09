/** Collect video addresses independently of the cover image list. */
export function collectXhsVideoUrls(note) {
  const candidates = new Set();
  const add = (value) => {
    if (typeof value !== "string" || !value.trim()) return;
    try {
      const url = new URL(value.trim().replace(/^\/\//, "https://"));
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return;
      url.protocol = "https:";
      candidates.add(url.toString());
    } catch { /* malformed media address */ }
  };

  const video = note?.video;
  const originKey = video?.consumer?.originVideoKey || video?.consumer?.origin_video_key;
  // Keys are CDN paths, never executable code or a user supplied host.
  if (typeof originKey === "string" && /^[\w/-]+(?:\.[\w-]+)*$/.test(originKey) &&
      !originKey.startsWith("/") && !originKey.split("/").includes("..")) {
    add(`https://sns-video-bd.xhscdn.com/${originKey}`);
  }
  const stream = video?.media?.stream;
  if (stream && typeof stream === "object") {
    const codecs = [...new Set(["h264", "h265", "av1", ...Object.keys(stream)])];
    for (const codec of codecs) {
      const entries = stream[codec];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        if (Array.isArray(entry.backupUrls)) entry.backupUrls.forEach(add);
        add(entry.masterUrl);
      }
    }
  }
  return [...candidates];
}
