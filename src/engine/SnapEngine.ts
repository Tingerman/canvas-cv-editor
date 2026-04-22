import type { AnyNode } from '@/types/document';
import type { Scene } from './Scene';
import type { Bounds, Vec2 } from './utils/geometry';
import type { SnapGuide } from './Renderer';

const DEFAULT_THRESHOLD = 6;

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

/** Compute the 3 horizontal & 3 vertical reference lines for a bounds. */
function refsOf(b: Bounds) {
  return {
    xs: [b.x, b.x + b.w / 2, b.x + b.w],
    ys: [b.y, b.y + b.h / 2, b.y + b.h]
  };
}

/**
 * Given a node being moved, compute snap corrections against all other
 * top-level nodes plus the page edges/center.
 */
export function computeMoveSnap(
  scene: Scene,
  moving: AnyNode[],
  zoom: number
): SnapResult {
  if (!moving.length) return { dx: 0, dy: 0, guides: [] };
  const threshold = DEFAULT_THRESHOLD / zoom;

  // Combined bounds of all moving nodes
  const combined = unionBounds(moving.map((n) => scene.getWorldBounds(n)));
  const movingRefs = refsOf(combined);

  const movingIds = new Set(moving.map((n) => n.id));
  const page = scene.doc.page;
  const candXs: { value: number; from: number; to: number }[] = [
    { value: 0, from: 0, to: page.height },
    { value: page.width / 2, from: 0, to: page.height },
    { value: page.width, from: 0, to: page.height }
  ];
  const candYs: { value: number; from: number; to: number }[] = [
    { value: 0, from: 0, to: page.width },
    { value: page.height / 2, from: 0, to: page.width },
    { value: page.height, from: 0, to: page.width }
  ];

  for (const id of scene.doc.order) {
    if (movingIds.has(id)) continue;
    const n = scene.getNode(id);
    if (!n || !n.visible) continue;
    const b = scene.getWorldBounds(n);
    candXs.push(
      { value: b.x, from: b.y, to: b.y + b.h },
      { value: b.x + b.w / 2, from: b.y, to: b.y + b.h },
      { value: b.x + b.w, from: b.y, to: b.y + b.h }
    );
    candYs.push(
      { value: b.y, from: b.x, to: b.x + b.w },
      { value: b.y + b.h / 2, from: b.x, to: b.x + b.w },
      { value: b.y + b.h, from: b.x, to: b.x + b.w }
    );
  }

  let bestDx = 0;
  let bestAbsDx = threshold;
  let guideX: SnapGuide | null = null;
  for (const mx of movingRefs.xs) {
    for (const c of candXs) {
      const diff = c.value - mx;
      if (Math.abs(diff) < bestAbsDx) {
        bestAbsDx = Math.abs(diff);
        bestDx = diff;
        guideX = {
          axis: 'x',
          value: c.value,
          from: Math.min(c.from, combined.y),
          to: Math.max(c.to, combined.y + combined.h)
        };
      }
    }
  }

  let bestDy = 0;
  let bestAbsDy = threshold;
  let guideY: SnapGuide | null = null;
  for (const my of movingRefs.ys) {
    for (const c of candYs) {
      const diff = c.value - my;
      if (Math.abs(diff) < bestAbsDy) {
        bestAbsDy = Math.abs(diff);
        bestDy = diff;
        guideY = {
          axis: 'y',
          value: c.value,
          from: Math.min(c.from, combined.x),
          to: Math.max(c.to, combined.x + combined.w)
        };
      }
    }
  }

  const guides: SnapGuide[] = [];
  if (guideX) guides.push(guideX);
  if (guideY) guides.push(guideY);
  return { dx: bestDx, dy: bestDy, guides };
}

function unionBounds(list: Bounds[]): Bounds {
  const x1 = Math.min(...list.map((b) => b.x));
  const y1 = Math.min(...list.map((b) => b.y));
  const x2 = Math.max(...list.map((b) => b.x + b.w));
  const y2 = Math.max(...list.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// Unused helper export to avoid dead-code warnings if future use
export type { Vec2 };
