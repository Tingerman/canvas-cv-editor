import type { Document } from '@/types/document';
import { Scene } from '@/engine/Scene';
import { drawNode } from '@/engine/nodes/drawNode';
import { jsPDF } from 'jspdf';

/** Render the document onto an offscreen canvas (node content only, no UI). */
export async function renderToCanvas(doc: Document, scale = 2): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(doc.page.width * scale);
  canvas.height = Math.floor(doc.page.height * scale);
  const ctx = canvas.getContext('2d')!;

  // Preload images BEFORE any drawing so no async gap exists after we set the transform.
  await preloadImages(doc);

  const scene = new Scene(doc);

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, doc.page.width, doc.page.height);

  // Page background
  ctx.fillStyle = doc.page.background;
  ctx.fillRect(0, 0, doc.page.width, doc.page.height);

  // Clip to page so overflow is hidden
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, doc.page.width, doc.page.height);
  ctx.clip();

  // Draw each top-level node
  for (const id of doc.order) {
    const node = doc.nodes[id];
    if (!node || !node.visible) continue;
    ctx.save();
    ctx.globalAlpha = node.opacity;
    ctx.translate(node.x, node.y);
    if (node.rotation) {
      ctx.translate(node.w / 2, node.h / 2);
      ctx.rotate(node.rotation);
      ctx.translate(-node.w / 2, -node.h / 2);
    }
    drawNode(ctx, node, scene, () => {});
    ctx.restore();
  }

  ctx.restore();
  return canvas;
}

function preloadImages(doc: Document): Promise<void> {
  const srcs = Object.values(doc.nodes)
    .filter((n): n is any => n.type === 'image' && (n as any).src)
    .map((n) => (n as any).src as string);
  return Promise.all(
    srcs.map(
      (src) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = () => res();
          img.onerror = () => res();
          img.src = src;
        })
    )
  ).then(() => void 0);
}

export async function exportPNG(doc: Document, scale = 2, filename = 'resume.png') {
  const canvas = await renderToCanvas(doc, scale);
  canvas.toBlob((blob) => {
    if (!blob) return;
    download(blob, filename);
  }, 'image/png');
}

export async function exportPDF(doc: Document, filename = 'resume.pdf') {
  const scale = 2;
  const canvas = await renderToCanvas(doc, scale);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const pdf = new jsPDF({
    orientation: doc.page.width < doc.page.height ? 'portrait' : 'landscape',
    unit: 'px',
    format: [doc.page.width, doc.page.height],
    hotfixes: ['px_scaling']
  });
  pdf.addImage(dataUrl, 'JPEG', 0, 0, doc.page.width, doc.page.height);
  pdf.save(filename);
}

export function exportJSON(doc: Document, filename = 'resume.json') {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  download(blob, filename);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
