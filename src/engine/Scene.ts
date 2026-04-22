import type { AnyNode, Document } from '@/types/document';
import type { Bounds } from './utils/geometry';
import * as M from './utils/matrix';

/**
 * Scene wraps the Document for the renderer: it does NOT own the document
 * (the Pinia store does), but provides convenient read-only accessors and
 * dirty tracking.
 */
export class Scene {
  doc: Document;
  dirty = true;

  constructor(doc: Document) {
    this.doc = doc;
  }

  setDocument(doc: Document) {
    this.doc = doc;
    this.markDirty();
  }

  markDirty() {
    this.dirty = true;
  }

  getNode(id: string): AnyNode | undefined {
    return this.doc.nodes[id];
  }

  topLevelOrder(): string[] {
    return this.doc.order;
  }

  /** World bounds of a node (AABB after rotation). */
  getWorldBounds(node: AnyNode): Bounds {
    const { x, y, w, h, rotation } = node;
    if (!rotation) return { x, y, w, h };
    const cx = x + w / 2;
    const cy = y + h / 2;
    const corners: [number, number][] = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h]
    ];
    const m = M.rotate(M.translate(M.identity(), cx, cy), rotation);
    const translated = corners.map(([px, py]) => M.applyPoint(m, px - cx, py - cy));
    const xs = translated.map((p) => p[0]);
    const ys = translated.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }

  /** Returns the local-space matrix that converts world -> local. */
  worldToLocalMatrix(node: AnyNode): M.Mat {
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    // forward: translate(cx,cy) * rotate(r) * translate(-cx,-cy) * translate(x,y) ... simpler:
    // world = R(center) * (local - origin) + origin shifted...
    // Build forward then invert.
    let m = M.identity();
    m = M.translate(m, cx, cy);
    m = M.rotate(m, node.rotation);
    m = M.translate(m, -node.w / 2, -node.h / 2);
    return M.invert(m);
  }
}
