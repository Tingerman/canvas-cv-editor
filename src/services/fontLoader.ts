const FONT_KEY = 'cv-editor.custom-fonts.v1';

interface StoredFont {
  family: string;
  dataUrl: string;
}

const builtinFonts = [
  'sans-serif',
  'serif',
  'monospace',
  '"Helvetica Neue"',
  'Arial',
  'Georgia',
  '"Courier New"',
  '"PingFang SC"',
  '"Microsoft YaHei"'
];

const registeredFamilies = new Set<string>(builtinFonts);

export function listFontFamilies(): string[] {
  return Array.from(registeredFamilies);
}

export async function registerFontFromDataUrl(family: string, dataUrl: string) {
  if (!('FontFace' in window)) return;
  try {
    const face = new FontFace(family, `url(${dataUrl})`);
    await face.load();
    (document.fonts as any).add(face);
    registeredFamilies.add(family);
  } catch (err) {
    console.warn('Font load failed', family, err);
  }
}

export async function uploadFont(file: File): Promise<string> {
  const family = file.name.replace(/\.[^.]+$/, '');
  const dataUrl = await fileToDataUrl(file);
  await registerFontFromDataUrl(family, dataUrl);

  // Persist
  const stored = loadStored();
  if (!stored.find((s) => s.family === family)) {
    stored.push({ family, dataUrl });
    try {
      localStorage.setItem(FONT_KEY, JSON.stringify(stored));
    } catch {
      // quota - silently ignore
    }
  }
  return family;
}

export async function restoreFonts() {
  const stored = loadStored();
  await Promise.all(stored.map((s) => registerFontFromDataUrl(s.family, s.dataUrl)));
}

function loadStored(): StoredFont[] {
  try {
    const raw = localStorage.getItem(FONT_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

export async function fileToImageDataUrl(file: File, maxDim = 1600, maxBytes = 2 * 1024 * 1024): Promise<string> {
  const raw = await fileToDataUrl(file);
  if (file.size <= maxBytes) {
    const { url } = await maybeDownscale(raw, maxDim);
    return url;
  }
  const { url } = await maybeDownscale(raw, maxDim);
  return url;
}

function maybeDownscale(dataUrl: string, maxDim: number): Promise<{ url: string }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const longest = Math.max(width, height);
      if (longest <= maxDim) return res({ url: dataUrl });
      const scale = maxDim / longest;
      const c = document.createElement('canvas');
      c.width = Math.floor(width * scale);
      c.height = Math.floor(height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      res({ url: c.toDataURL('image/jpeg', 0.9) });
    };
    img.onerror = () => res({ url: dataUrl });
    img.src = dataUrl;
  });
}
