/** Shrinks a chosen logo to max 400px and ≤200KB, returning a PNG/JPEG data URL. */
const MAX_SIDE = 400;
const MAX_BYTES = 200 * 1024;

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
      reject(new Error('This picture could not be opened. Please choose a PNG or JPEG picture.'));
    };
    img.src = url;
  });
}

const approxBytes = (dataUrl: string) => Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

export async function resizeLogo(file: File): Promise<string> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This phone could not shrink the picture.');

  // PNG keeps see-through backgrounds, which suits most logos.
  if (file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/svg+xml') {
    ctx.drawImage(img, 0, 0, w, h);
    const png = canvas.toDataURL('image/png');
    if (approxBytes(png) <= MAX_BYTES) return png;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  for (const q of [0.9, 0.8, 0.7, 0.55, 0.4]) {
    const jpg = canvas.toDataURL('image/jpeg', q);
    if (approxBytes(jpg) <= MAX_BYTES) return jpg;
  }
  throw new Error('This picture is too big. Please choose a smaller one.');
}
