import type { AnyNode, TextNode, ImageNode, ShapeNode, GroupNode } from '@/types/document';
import type { Scene } from '../Scene';
import { drawText } from '../utils/textLayout';

const imageCache = new Map<string, HTMLImageElement>();

export function getCachedImage(src: string, onLoad: () => void): HTMLImageElement | null {
  if (!src) return null;
  let img = imageCache.get(src);
  if (img) return img.complete && img.naturalWidth > 0 ? img : null;
  img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => onLoad();
  img.src = src;
  imageCache.set(src, img);
  return null;
}

/** Draw a node in its local (pre-transform) coordinates: origin at (0,0), size (w,h). */
export function drawNode(
  ctx: CanvasRenderingContext2D,
  node: AnyNode,
  scene: Scene,
  onAsyncLoad: () => void
) {
  ctx.save();
  ctx.globalAlpha *= node.opacity;
  switch (node.type) {
    case 'shape':
      drawShape(ctx, node);
      break;
    case 'image':
      drawImage(ctx, node, onAsyncLoad);
      break;
    case 'text':
      drawText(ctx, node);
      break;
    case 'group':
      drawGroup(ctx, node, scene, onAsyncLoad);
      break;
  }
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, n: ShapeNode) {
  ctx.beginPath();
  if (n.shape === 'rect') {
    if (n.cornerRadius > 0) roundRect(ctx, 0, 0, n.w, n.h, n.cornerRadius);
    else ctx.rect(0, 0, n.w, n.h);
  } else if (n.shape === 'ellipse') {
    ctx.ellipse(n.w / 2, n.h / 2, n.w / 2, n.h / 2, 0, 0, Math.PI * 2);
  } else if (n.shape === 'line') {
    ctx.moveTo(0, n.h / 2);
    ctx.lineTo(n.w, n.h / 2);
  }
  if (n.shape !== 'line' && n.fill && n.fill !== 'transparent') {
    ctx.fillStyle = n.fill;
    ctx.fill();
  }
  if (n.strokeWidth > 0 && n.stroke && n.stroke !== 'transparent') {
    ctx.lineWidth = n.strokeWidth;
    ctx.strokeStyle = n.stroke;
    if (n.dash.length) ctx.setLineDash(n.dash);
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawImage(ctx: CanvasRenderingContext2D, n: ImageNode, onAsyncLoad: () => void) {
  if (!n.src) {
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, n.w, n.h);
    ctx.strokeStyle = '#9ca3af';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(0, 0, n.w, n.h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('图片占位', n.w / 2, n.h / 2);
    return;
  }
  const img = getCachedImage(n.src, onAsyncLoad);
  if (!img) {
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, n.w, n.h);
    return;
  }

  if (n.borderRadius > 0) {
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, 0, 0, n.w, n.h, n.borderRadius);
    ctx.clip();
  }

  const { sx, sy, sw, sh, dx, dy, dw, dh } = fitImage(img, n);
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);

  if (n.borderRadius > 0) ctx.restore();
}

function fitImage(img: HTMLImageElement, n: ImageNode) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (n.objectFit === 'fill') {
    return { sx: 0, sy: 0, sw: iw, sh: ih, dx: 0, dy: 0, dw: n.w, dh: n.h };
  }
  const ir = iw / ih;
  const nr = n.w / n.h;
  if (n.objectFit === 'contain') {
    if (ir > nr) {
      const dh = n.w / ir;
      return { sx: 0, sy: 0, sw: iw, sh: ih, dx: 0, dy: (n.h - dh) / 2, dw: n.w, dh };
    } else {
      const dw = n.h * ir;
      return { sx: 0, sy: 0, sw: iw, sh: ih, dx: (n.w - dw) / 2, dy: 0, dw, dh: n.h };
    }
  }
  // cover
  if (ir > nr) {
    const sw = ih * nr;
    return { sx: (iw - sw) / 2, sy: 0, sw, sh: ih, dx: 0, dy: 0, dw: n.w, dh: n.h };
  } else {
    const sh = iw / nr;
    return { sx: 0, sy: (ih - sh) / 2, sw: iw, sh, dx: 0, dy: 0, dw: n.w, dh: n.h };
  }
}

function drawGroup(
  ctx: CanvasRenderingContext2D,
  group: GroupNode,
  scene: Scene,
  onAsyncLoad: () => void
) {
  const sx = group.innerW > 0 ? group.w / group.innerW : 1;
  const sy = group.innerH > 0 ? group.h / group.innerH : 1;
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  for (const childId of group.children) {
    const child = scene.getNode(childId);
    if (!child || !child.visible) continue;
    // Children store coords relative to the group's inner coord system.
    ctx.save();
    ctx.translate(child.x, child.y);
    applyNodeTransform(ctx, child);
    drawNode(ctx, child, scene, onAsyncLoad);
    ctx.restore();
  }
}

export function applyNodeTransform(ctx: CanvasRenderingContext2D, node: AnyNode) {
  if (node.rotation) {
    ctx.translate(node.w / 2, node.h / 2);
    ctx.rotate(node.rotation);
    ctx.translate(-node.w / 2, -node.h / 2);
  }
}

// re-export for TextNode consumers
export type { TextNode };
