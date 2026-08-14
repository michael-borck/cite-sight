import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Bridge for reading URL-evidence screenshots captured during analysis.
 * Desktop supplies Electron's preload reader; surfaces without a reader
 * (web) render nothing — no special-casing needed downstream.
 */
export const ScreenshotContext = createContext<(path: string) => Promise<string | null>>(
  async () => null,
);

export function ScreenshotThumbnail({ path }: { path: string }) {
  const read = useContext(ScreenshotContext);
  const [src, setSrc] = useState<string | null>(null);

  // Read asynchronously; guard against setting state after unmount.
  useEffect(() => {
    let alive = true;
    read(path).then((dataUrl) => {
      if (alive && dataUrl) setSrc(dataUrl);
    });
    return () => { alive = false; };
  }, [path, read]);

  if (!src) return null;

  return (
    <div className="ref-screenshot">
      <img src={src} alt="Page screenshot" className="screenshot-img" />
    </div>
  );
}
