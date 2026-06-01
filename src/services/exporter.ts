import type { Document } from '@/types/document';
import { Scene } from '@/engine/Scene';
import { drawNode } from '@/engine/nodes/drawNode';
import { jsPDF } from 'jspdf';

/** Render a single page onto an offscreen canvas (node content only, no UI). */
export async function renderPageToCanvas(
  doc: Document,
  pageIndex: number,
  scale = 2
): Promise<HTMLCanvasElement> {
  const page = doc.pages[pageIndex];
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(page.meta.width * scale);
  canvas.height = Math.floor(page.meta.height * scale);
  const ctx = canvas.getContext('2d')!;

  // Preload images BEFORE any drawing so no async gap exists after we set the transform.
  await preloadImagesForPage(page.nodes);

  // Temporarily point the scene at the requested page
  const snapshot: Document = { ...doc, currentPageIndex: pageIndex };
  const scene = new Scene(snapshot);

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, page.meta.width, page.meta.height);

  // Page background
  ctx.fillStyle = page.meta.background;
  ctx.fillRect(0, 0, page.meta.width, page.meta.height);

  // Clip to page so overflow is hidden
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, page.meta.width, page.meta.height);
  ctx.clip();

  // Draw each top-level node
  for (const id of page.order) {
    const node = page.nodes[id];
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

/** Render the current page (convenience wrapper used by PNG export). */
export async function renderToCanvas(doc: Document, scale = 2): Promise<HTMLCanvasElement> {
  return renderPageToCanvas(doc, doc.currentPageIndex, scale);
}

function preloadImagesForPage(nodes: Record<string, any>): Promise<void> {
  const srcs = Object.values(nodes)
    .filter((n): n is any => n.type === 'image' && n.src)
    .map((n) => n.src as string);
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
  const firstPage = doc.pages[0];
  const pdf = new jsPDF({
    orientation: firstPage.meta.width < firstPage.meta.height ? 'portrait' : 'landscape',
    unit: 'px',
    format: [firstPage.meta.width, firstPage.meta.height],
    hotfixes: ['px_scaling']
  });

  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    const canvas = await renderPageToCanvas(doc, i, scale);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    if (i > 0) {
      pdf.addPage([page.meta.width, page.meta.height]);
    }
    pdf.addImage(dataUrl, 'JPEG', 0, 0, page.meta.width, page.meta.height);
  }

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
