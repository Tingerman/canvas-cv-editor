import type { AnyNode, GroupNode } from '@/types/document';
import type { Scene } from './Scene';
import type { Vec2 } from './utils/geometry';
import { HANDLE_NAMES, HANDLE_SIZE, type HandleName } from './Renderer';

/** Transform a world point into the node's local pre-transform coordinates (origin at node top-left). */
export function worldToLocal(node: AnyNode, wx: number, wy: number): Vec2 {
  // Forward transform used in rendering:
  //   translate(node.x, node.y) -> translate(w/2,h/2) -> rotate(r) -> translate(-w/2,-h/2)
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const rx = wx - cx;
  const ry = wy - cy;
  const cos = Math.cos(-node.rotation);
  const sin = Math.sin(-node.rotation);
  const lx = rx * cos - ry * sin + node.w / 2;
  const ly = rx * sin + ry * cos + node.h / 2;
  return { x: lx, y: ly };
}

export function hitTestNode(node: AnyNode, wx: number, wy: number): boolean {
  if (!node.visible) return false;
  const { x, y } = worldToLocal(node, wx, wy);
  return x >= 0 && x <= node.w && y >= 0 && y <= node.h;
}

/**
 * Recursively test whether the given node (or any descendant, for groups)
 * is hit by the point. Returns the deepest hit leaf, or null.
 * For groups, empty space inside the group is NOT considered a hit — only
 * actual child content counts.
 */
function hitTestRecursive(scene: Scene, node: AnyNode, wx: number, wy: number): AnyNode | null {
  if (!node.visible) return null;
  if (node.type === 'group') {
    const g = node as GroupNode;
    // Transform (wx, wy) into group's inner coordinate system:
    //   outer local (0..w, 0..h) via worldToLocal
    //   then divide by (w/innerW, h/innerH) to reach inner (0..innerW, 0..innerH)
    const outer = worldToLocal(g, wx, wy);
    // Quick reject: if outside outer box with small slack, cannot be inside either
    if (
      outer.x < -0.01 || outer.x > g.w + 0.01 ||
      outer.y < -0.01 || outer.y > g.h + 0.01
    ) return null;
    const sx = g.innerW > 0 ? g.w / g.innerW : 1;
    const sy = g.innerH > 0 ? g.h / g.innerH : 1;
    const ix = outer.x / sx;
    const iy = outer.y / sy;
    for (let i = g.children.length - 1; i >= 0; i--) {
      const child = scene.getNode(g.children[i]);
      if (!child) continue;
      const leaf = hitTestRecursive(scene, child, ix, iy);
      if (leaf) return leaf;
    }
    return null;
  }
  return hitTestNode(node, wx, wy) ? node : null;
}

export interface DeepHit {
  topLevel: AnyNode;
  leaf: AnyNode;
}

/** Deep hit test: returns the top-level node and the leaf descendant that was hit. */
export function hitTestDeep(scene: Scene, wx: number, wy: number): DeepHit | null {
  const order = scene.doc.order;
  for (let i = order.length - 1; i >= 0; i--) {
    const node = scene.getNode(order[i]);
    if (!node || !node.visible) continue;
    const leaf = hitTestRecursive(scene, node, wx, wy);
    if (leaf) return { topLevel: node, leaf };
  }
  return null;
}

/** Shallow hit test: returns the top-level node whose (or whose descendant's) content was hit. */
export function hitTest(scene: Scene, wx: number, wy: number): AnyNode | null {
  const r = hitTestDeep(scene, wx, wy);
  return r ? r.topLevel : null;
}

/**
 * Test whether a world-space point hits one of the selection handles
 * for a given node. `zoom` is used to compute the screen-sized handle box.
 */
export function hitTestHandle(
  node: AnyNode,
  wx: number,
  wy: number,
  zoom: number
): HandleName | null {
  const { x: lx, y: ly } = worldToLocal(node, wx, wy);
  const hs = HANDLE_SIZE / zoom;
  const half = hs / 2;
  const positions: Record<HandleName, [number, number]> = {
    nw: [0, 0],
    n: [node.w / 2, 0],
    ne: [node.w, 0],
    e: [node.w, node.h / 2],
    se: [node.w, node.h],
    s: [node.w / 2, node.h],
    sw: [0, node.h],
    w: [0, node.h / 2],
    rotate: [node.w / 2, -20 / zoom]
  };
  for (const name of [...HANDLE_NAMES, 'rotate' as const]) {
    const [hx, hy] = positions[name];
    if (lx >= hx - half - 2 / zoom && lx <= hx + half + 2 / zoom &&
        ly >= hy - half - 2 / zoom && ly <= hy + half + 2 / zoom) {
      return name;
    }
  }
  return null;
}

export function nodesInBounds(scene: Scene, box: { x: number; y: number; w: number; h: number }) {
  const hits: AnyNode[] = [];
  for (const id of scene.doc.order) {
    const node = scene.getNode(id);
    if (!node || !node.visible || node.locked) continue;
    const b = scene.getWorldBounds(node);
    const intersects =
      !(b.x + b.w < box.x || box.x + box.w < b.x || b.y + b.h < box.y || box.y + box.h < b.y);
    if (intersects) hits.push(node);
  }
  return hits;
}
