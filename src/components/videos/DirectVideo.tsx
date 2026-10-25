"use client";

import { useState, type ComponentPropsWithRef } from "react";

/** 浏览器直连优先；媒体加载失败后仅尝试一次同源代理。 */
export default function DirectVideo({ src, onError, ...props }: ComponentPropsWithRef<"video">) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const canProxy = typeof src === "string" && /^https?:\/\//i.test(src);
  const usingProxy = canProxy && failedSrc === src;
  return (
    <video
      {...props}
      src={usingProxy ? `/api/video-proxy?url=${encodeURIComponent(src)}` : src}
      onError={(event) => {
        if (canProxy && !usingProxy) setFailedSrc(src);
        else onError?.(event);
      }}
    />
  );
}
