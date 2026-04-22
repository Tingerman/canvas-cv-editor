import type { AnyNode } from '@/types/document';
import type { Scene } from './Scene';
import { drawNode, applyNodeTransform } from './nodes/drawNode';
import type { Bounds, Vec2 } from './utils/geometry';

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
  cssWidth: number;
  cssHeight: number;
}

export interface SelectionVisual {
  ids: string[];
  /** world bounding rect (AABB) */
  bounds: Bounds | null;
  /** if a single rotated node is selected, also track rotation origin */
  singleRotation: number;
  singleCenter: Vec2 | null;
}

export interface RenderOverlay {
  marquee: Bounds | null;
  snapGuides: SnapGuide[];
  hoverHandle: string | null;
}

export interface SnapGuide {
  axis: 'x' | 'y';
  value: number; // world coord
  from: number;
  to: number;
}

export const HANDLE_SIZE = 8;
export const HANDLE_NAMES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type HandleName = (typeof HANDLE_NAMES)[number] | 'rotate';

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scene: Scene;
  viewport: Viewport;
  selection: SelectionVisual = { ids: [], bounds: null, singleRotation: 0, singleCenter: null };
  overlay: RenderOverlay = { marquee: null, snapGuides: [], hoverHandle: null };
  private rafId: number | null = null;

  constructor(canvas: HTMLCanvasElement, scene: Scene, viewport: Viewport) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.scene = scene;
    this.viewport = viewport;
  }

  resize(cssWidth: number, cssHeight: number) {
    const dpr = window.devicePixelRatio || 1;
    this.viewport.cssWidth = cssWidth;
    this.viewport.cssHeight = cssHeight;
    this.canvas.width = Math.floor(cssWidth * dpr);
    this.canvas.height = Math.floor(cssHeight * dpr);
    this.canvas.style.width = cssWidth + 'px';
    this.canvas.style.height = cssHeight + 'px';
    this.requestRender();
  }

  requestRender() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  render() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewport.cssWidth, this.viewport.cssHeight);

    // Viewport transform (apply pan & zoom)
    ctx.save();
    ctx.translate(this.viewport.panX, this.viewport.panY);
    ctx.scale(this.viewport.zoom, this.viewport.zoom);

    // Page background + shadow
    const page = this.scene.doc.page;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.15)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = page.background;
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.restore();

    // Clip to page so overflow is hidden
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, page.width, page.height);
    ctx.clip();

    // Draw nodes in order
    for (const id of this.scene.doc.order) {
      const node = this.scene.getNode(id);
      if (!node || !node.visible) continue;
      this.drawNodeAtWorld(node);
    }
    ctx.restore();

    // Selection UI (in world space, but not clipped)
    this.drawSelection();
    this.drawSnapGuides();
    this.drawMarquee();

    ctx.restore();
  }

  private drawNodeAtWorld(node: AnyNode) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(node.x, node.y);
    applyNodeTransform(ctx, node);
    drawNode(ctx, node, this.scene, () => this.requestRender());
    ctx.restore();
  }

  private drawSelection() {
    const ctx = this.ctx;
    const { ids, bounds } = this.selection;
    if (!ids.length || !bounds) return;

    const single = ids.length === 1 ? this.scene.getNode(ids[0]) : null;
    ctx.save();
    ctx.lineWidth = 1 / this.viewport.zoom;
    ctx.strokeStyle = 'var(--accent)';
    ctx.strokeStyle = '#4f46e5';

    if (single) {
      // Draw oriented rect around the node
      ctx.save();
      ctx.translate(single.x + single.w / 2, single.y + single.h / 2);
      ctx.rotate(single.rotation);
      ctx.translate(-single.w / 2, -single.h / 2);
      ctx.strokeRect(0, 0, single.w, single.h);
      // 8 handles
      const hs = HANDLE_SIZE / this.viewport.zoom;
      const coords: Record<string, [number, number]> = {
        nw: [0, 0],
        n: [single.w / 2, 0],
        ne: [single.w, 0],
        e: [single.w, single.h / 2],
        se: [single.w, single.h],
        s: [single.w / 2, single.h],
        sw: [0, single.h],
        w: [0, single.h / 2]
      };
      ctx.fillStyle = '#fff';
      for (const name of HANDLE_NAMES) {
        const [hx, hy] = coords[name];
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
      // rotate handle
      const rhy = -20 / this.viewport.zoom;
      ctx.beginPath();
      ctx.moveTo(single.w / 2, 0);
      ctx.lineTo(single.w / 2, rhy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(single.w / 2, rhy, hs / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else {
      // Multi: AABB
      ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    }
    ctx.restore();
  }

  private drawSnapGuides() {
    const guides = this.overlay.snapGuides;
    if (!guides.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#ff00aa';
    ctx.lineWidth = 1 / this.viewport.zoom;
    ctx.setLineDash([4 / this.viewport.zoom, 3 / this.viewport.zoom]);
    for (const g of guides) {
      ctx.beginPath();
      if (g.axis === 'x') {
        ctx.moveTo(g.value, g.from);
        ctx.lineTo(g.value, g.to);
      } else {
        ctx.moveTo(g.from, g.value);
        ctx.lineTo(g.to, g.value);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMarquee() {
    const m = this.overlay.marquee;
    if (!m) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(79,70,229,.1)';
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 1 / this.viewport.zoom;
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.strokeRect(m.x, m.y, m.w, m.h);
    ctx.restore();
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.viewport.panX) / this.viewport.zoom,
      y: (sy - this.viewport.panY) / this.viewport.zoom
    };
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    return {
      x: wx * this.viewport.zoom + this.viewport.panX,
      y: wy * this.viewport.zoom + this.viewport.panY
    };
  }
}
