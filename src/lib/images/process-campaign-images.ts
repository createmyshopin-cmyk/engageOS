export const BANNER_SIZE = { width: 1200, height: 600 } as const;
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const LOGO_SIZE = 512;

export type ProcessedCampaignBanner = {
  bannerDataUrl: string;
  ogImageDataUrl: string;
  bannerBytes: number;
  ogBytes: number;
  originalBytes: number;
};

export type ProcessedCampaignLogo = {
  logoDataUrl: string;
  logoBytes: number;
  originalBytes: number;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function resizeCover(
  img: HTMLImageElement,
  targetW: number,
  targetH: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const scale = Math.max(targetW / img.width, targetH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (targetW - w) / 2;
  const y = (targetH - h) / 2;

  ctx.drawImage(img, x, y, w, h);
  return canvas;
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/webp", quality);
}

function dataUrlByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Compress a campaign banner and derive a 1200×630 OG thumbnail for link previews.
 * Runs in the browser via canvas — call only from client components.
 */
export async function processCampaignBanner(file: File): Promise<ProcessedCampaignBanner> {
  const img = await loadImage(file);

  const bannerCanvas = resizeCover(img, BANNER_SIZE.width, BANNER_SIZE.height);
  const bannerDataUrl = canvasToWebp(bannerCanvas, 0.82);

  const ogCanvas = resizeCover(img, OG_SIZE.width, OG_SIZE.height);
  const ogImageDataUrl = canvasToWebp(ogCanvas, 0.82);

  return {
    bannerDataUrl,
    ogImageDataUrl,
    bannerBytes: dataUrlByteSize(bannerDataUrl),
    ogBytes: dataUrlByteSize(ogImageDataUrl),
    originalBytes: file.size,
  };
}

/** Compress a square campaign logo (512×512 cover crop). */
export async function processCampaignLogo(file: File): Promise<ProcessedCampaignLogo> {
  const img = await loadImage(file);
  const canvas = resizeCover(img, LOGO_SIZE, LOGO_SIZE);
  const logoDataUrl = canvasToWebp(canvas, 0.85);

  return {
    logoDataUrl,
    logoBytes: dataUrlByteSize(logoDataUrl),
    originalBytes: file.size,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
