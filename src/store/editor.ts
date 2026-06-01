import { defineStore } from 'pinia';
import { ref, computed, shallowRef, triggerRef } from 'vue';
import {
  createEmptyDocument,
  createNode,
  migrateDocument,
  uid,
  type AnyNode,
  type Document,
  type PageData,
  type NodeType,
  type TextNode
} from '@/types/document';
import { History } from './history';

function cloneDoc(doc: Document): Document {
  return JSON.parse(JSON.stringify(doc));
}

export const useEditorStore = defineStore('editor', () => {
  const doc = shallowRef<Document>(createEmptyDocument());
  const selection = ref<string[]>([]);
  const zoom = ref(1);
  const pan = ref({ x: 40, y: 40 });
  const history = new History();
  const historyVersion = ref(0);

  // Transaction state: snapshot taken at beginInteraction; commit pushes diff.
  let pendingSnapshot: Document | null = null;

  /** Shortcut to access the active page (mutable). */
  const cp = (): PageData => doc.value.pages[doc.value.currentPageIndex];

  function markDocChanged() {
    triggerRef(doc);
  }

  function beginInteraction() {
    pendingSnapshot = cloneDoc(doc.value);
  }
  function commitInteraction(label: string) {
    if (!pendingSnapshot) return;
    history.push({
      label,
      before: pendingSnapshot,
      after: cloneDoc(doc.value),
      time: performance.now()
    });
    historyVersion.value++;
    pendingSnapshot = null;
  }
  function cancelInteraction() {
    pendingSnapshot = null;
  }
  /** Shortcut: wrap a synchronous mutation with a history entry. */
  function transact(label: string, fn: () => void) {
    beginInteraction();
    fn();
    commitInteraction(label);
  }

  function undo() {
    const prev = history.undo();
    if (prev) {
      doc.value = prev;
      markDocChanged();
      const prevNodes = prev.pages[prev.currentPageIndex].nodes;
      selection.value = selection.value.filter((id) => prevNodes[id]);
      historyVersion.value++;
    }
  }
  function redo() {
    const next = history.redo();
    if (next) {
      doc.value = next;
      markDocChanged();
      const nextNodes = next.pages[next.currentPageIndex].nodes;
      selection.value = selection.value.filter((id) => nextNodes[id]);
      historyVersion.value++;
    }
  }

  // ---- selection ----
  function setSelection(ids: string[], additive = false) {
    if (additive) {
      const merged = Array.from(new Set([...selection.value, ...ids]));
      selection.value = merged;
    } else {
      selection.value = ids;
    }
  }

  const selectedNodes = computed<AnyNode[]>(() =>
    selection.value.map((id) => cp().nodes[id]).filter((n): n is AnyNode => !!n)
  );

  // ---- node operations ----
  function addNode(type: NodeType, overrides: Partial<AnyNode> = {}) {
    transact('添加' + type, () => {
      const n = createNode(type, overrides);
      cp().nodes[n.id] = n;
      cp().order.push(n.id);
      selection.value = [n.id];
      markDocChanged();
    });
  }

  function deleteSelected() {
    if (!selection.value.length) return;
    transact('删除', () => {
      const toDelete = new Set<string>();
      for (const id of selection.value) {
        for (const d of collectDescendants(id)) toDelete.add(d);
      }
      for (const id of toDelete) {
        delete cp().nodes[id];
        const idx = cp().order.indexOf(id);
        if (idx >= 0) cp().order.splice(idx, 1);
      }
      selection.value = [];
      markDocChanged();
    });
  }

  /** Returns the node itself plus all its descendants (for groups). */
  function collectDescendants(id: string): string[] {
    const out: string[] = [];
    const visit = (nid: string) => {
      const n = cp().nodes[nid];
      if (!n) return;
      out.push(nid);
      if (n.type === 'group') {
        for (const c of n.children) visit(c);
      }
    };
    visit(id);
    return out;
  }

  function moveNodes(ids: string[], dx: number, dy: number) {
    if (!dx && !dy) return;
    for (const id of ids) {
      const n = cp().nodes[id];
      if (!n || n.locked) continue;
      n.x += dx;
      n.y += dy;
    }
    markDocChanged();
  }

  function nudge(dx: number, dy: number) {
    if (!selection.value.length) return;
    transact('微调', () => moveNodes(selection.value, dx, dy));
  }

  function resizeNode(id: string, patch: Partial<Pick<AnyNode, 'x' | 'y' | 'w' | 'h'>>) {
    const n = cp().nodes[id];
    if (!n || n.locked) return;
    Object.assign(n, patch);
    markDocChanged();
  }
  function rotateNode(id: string, rotation: number) {
    const n = cp().nodes[id];
    if (!n || n.locked) return;
    n.rotation = rotation;
    markDocChanged();
  }
  function updateNode(id: string, patch: Partial<AnyNode>) {
    const n = cp().nodes[id];
    if (!n) return;
    Object.assign(n, patch);
    markDocChanged();
  }
  function transactUpdate(label: string, id: string, patch: Partial<AnyNode>) {
    transact(label, () => updateNode(id, patch));
  }

  // ---- clipboard ----
  /** Each clipboard entry is a subtree: the root plus a map of descendant nodes. */
  interface ClipboardEntry {
    root: AnyNode;
    subtree: Record<string, AnyNode>;
  }
  let clipboard: ClipboardEntry[] = [];

  function snapshotSubtree(id: string): ClipboardEntry | null {
    const root = cp().nodes[id];
    if (!root) return null;
    const subtree: Record<string, AnyNode> = {};
    for (const nid of collectDescendants(id)) {
      subtree[nid] = JSON.parse(JSON.stringify(cp().nodes[nid]));
    }
    return { root: subtree[id], subtree };
  }

  function pasteSubtree(entry: ClipboardEntry, offset: { x: number; y: number }): string {
    // Remap all ids within the subtree
    const idMap = new Map<string, string>();
    for (const oldId of Object.keys(entry.subtree)) {
      idMap.set(oldId, uid(entry.subtree[oldId].type.slice(0, 1)));
    }
    for (const [oldId, node] of Object.entries(entry.subtree)) {
      const clone = JSON.parse(JSON.stringify(node)) as AnyNode;
      clone.id = idMap.get(oldId)!;
      if (clone.parentId && idMap.has(clone.parentId)) {
        clone.parentId = idMap.get(clone.parentId)!;
      }
      if (clone.type === 'group') {
        clone.children = clone.children.map((c) => idMap.get(c) ?? c);
      }
      cp().nodes[clone.id] = clone;
    }
    const newRootId = idMap.get(entry.root.id)!;
    const newRoot = cp().nodes[newRootId];
    newRoot.x += offset.x;
    newRoot.y += offset.y;
    cp().order.push(newRootId);
    return newRootId;
  }

  function copy() {
    clipboard = selection.value
      .map((id) => snapshotSubtree(id))
      .filter((e): e is ClipboardEntry => !!e);
  }
  function paste() {
    if (!clipboard.length) return;
    transact('粘贴', () => {
      const newIds: string[] = [];
      for (const entry of clipboard) {
        newIds.push(pasteSubtree(entry, { x: 10, y: 10 }));
      }
      selection.value = newIds;
      markDocChanged();
    });
  }
  function duplicate() {
    copy();
    paste();
  }

  // ---- group / ungroup ----
  function group() {
    // Pick currently-selected top-level nodes (at least 2)
    const topLevelIds = selection.value.filter((id) => cp().order.includes(id));
    if (topLevelIds.length < 2) return;

    transact('组合', () => {
      // Compute union of world AABB
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of topLevelIds) {
        const n = cp().nodes[id];
        if (!n) continue;
        const b = nodeWorldAABB(n);
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.x + b.w > maxX) maxX = b.x + b.w;
        if (b.y + b.h > maxY) maxY = b.y + b.h;
      }
      if (!isFinite(minX)) return;
      const bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      const groupNode = createNode('group', {
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        innerW: bounds.w,
        innerH: bounds.h,
        name: '组合'
      }) as any;

      // Preserve top-level order of selected (for z-index within group)
      const orderedChildIds = cp().order.filter((id) => topLevelIds.includes(id));

      // Convert children to relative coords and attach
      for (const id of orderedChildIds) {
        const child = cp().nodes[id];
        if (!child) continue;
        child.x -= bounds.x;
        child.y -= bounds.y;
        child.parentId = groupNode.id;
      }
      groupNode.children = orderedChildIds;

      // Remove children from top-level order
      cp().order = cp().order.filter((id) => !topLevelIds.includes(id));

      // Insert group and select it
      cp().nodes[groupNode.id] = groupNode;
      cp().order.push(groupNode.id);
      selection.value = [groupNode.id];
      markDocChanged();
    });
  }

  function ungroup() {
    const groups = selection.value
      .map((id) => cp().nodes[id])
      .filter((n): n is any => n && n.type === 'group');
    if (!groups.length) return;

    transact('取消组合', () => {
      const newSelection: string[] = [];
      for (const g of groups) {
        const sx = g.innerW > 0 ? g.w / g.innerW : 1;
        const sy = g.innerH > 0 ? g.h / g.innerH : 1;
        const cos = Math.cos(g.rotation);
        const sin = Math.sin(g.rotation);
        const gCx = g.x + g.w / 2;
        const gCy = g.y + g.h / 2;

        const groupIdx = cp().order.indexOf(g.id);

        const releasedIds: string[] = [];
        for (const childId of g.children) {
          const child = cp().nodes[childId];
          if (!child) continue;

          const ox = child.x * sx;
          const oy = child.y * sy;
          const oW = child.w * sx;
          const oH = child.h * sy;

          const childCxOuter = ox + oW / 2;
          const childCyOuter = oy + oH / 2;
          const relCx = childCxOuter - g.w / 2;
          const relCy = childCyOuter - g.h / 2;

          const worldCx = gCx + relCx * cos - relCy * sin;
          const worldCy = gCy + relCx * sin + relCy * cos;

          child.x = worldCx - oW / 2;
          child.y = worldCy - oH / 2;
          child.w = oW;
          child.h = oH;
          child.rotation = child.rotation + g.rotation;
          child.parentId = null;

          if (child.type === 'group') {
            const gChild = child as any;
            gChild.innerW = oW / sx;
            gChild.innerH = oH / sy;
          }

          releasedIds.push(childId);
        }

        cp().order.splice(groupIdx, 1, ...releasedIds);
        delete cp().nodes[g.id];
        newSelection.push(...releasedIds);
      }
      selection.value = newSelection;
      markDocChanged();
    });
  }

  /** AABB of a node in world space, accounting for rotation. Duplicates Scene logic
   *  to avoid a circular import. */
  function nodeWorldAABB(n: AnyNode) {
    const { x, y, w, h, rotation } = n;
    if (!rotation) return { x, y, w, h };
    const cx = x + w / 2;
    const cy = y + h / 2;
    const corners = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h]
    ];
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const translated = corners.map(([px, py]) => {
      const rx = px - cx;
      const ry = py - cy;
      return [cx + rx * cos - ry * sin, cy + rx * sin + ry * cos];
    });
    const xs = translated.map((p) => p[0]);
    const ys = translated.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }

  // ---- layering ----
  function bringToFront() {
    if (!selection.value.length) return;
    transact('置顶', () => {
      for (const id of selection.value) {
        const idx = cp().order.indexOf(id);
        if (idx >= 0) {
          cp().order.splice(idx, 1);
          cp().order.push(id);
        }
      }
      markDocChanged();
    });
  }
  function sendToBack() {
    if (!selection.value.length) return;
    transact('置底', () => {
      for (const id of selection.value.slice().reverse()) {
        const idx = cp().order.indexOf(id);
        if (idx >= 0) {
          cp().order.splice(idx, 1);
          cp().order.unshift(id);
        }
      }
      markDocChanged();
    });
  }
  function bringForward() {
    if (!selection.value.length) return;
    transact('上移', () => {
      for (const id of selection.value) {
        const idx = cp().order.indexOf(id);
        if (idx >= 0 && idx < cp().order.length - 1) {
          [cp().order[idx], cp().order[idx + 1]] = [
            cp().order[idx + 1],
            cp().order[idx]
          ];
        }
      }
      markDocChanged();
    });
  }
  function sendBackward() {
    if (!selection.value.length) return;
    transact('下移', () => {
      for (const id of selection.value) {
        const idx = cp().order.indexOf(id);
        if (idx > 0) {
          [cp().order[idx], cp().order[idx - 1]] = [
            cp().order[idx - 1],
            cp().order[idx]
          ];
        }
      }
      markDocChanged();
    });
  }

  function reorder(newOrder: string[]) {
    transact('调整图层顺序', () => {
      cp().order = newOrder;
      markDocChanged();
    });
  }

  function toggleLock(id: string) {
    transact('锁定', () => {
      const n = cp().nodes[id];
      if (n) n.locked = !n.locked;
      markDocChanged();
    });
  }
  function toggleVisible(id: string) {
    transact('显隐', () => {
      const n = cp().nodes[id];
      if (n) n.visible = !n.visible;
      markDocChanged();
    });
  }
  function renameNode(id: string, name: string) {
    transact('重命名', () => {
      const n = cp().nodes[id];
      if (n) n.name = name;
      markDocChanged();
    });
  }

  // ---- alignment ----
  function alignNodes(direction: AlignDirection) {
    // Only operate on top-level, unlocked nodes that are currently selected
    const order = cp().order;
    const targets = selection.value
      .filter((id) => order.includes(id))
      .map((id) => cp().nodes[id])
      .filter((n): n is AnyNode => !!n && !n.locked);
    if (targets.length < 2) return;

    transact('对齐', () => {
      const bboxes = targets.map((n) => nodeWorldAABB(n));
      const minX = Math.min(...bboxes.map((b) => b.x));
      const minY = Math.min(...bboxes.map((b) => b.y));
      const maxX = Math.max(...bboxes.map((b) => b.x + b.w));
      const maxY = Math.max(...bboxes.map((b) => b.y + b.h));
      const unionW = maxX - minX;
      const unionH = maxY - minY;

      if (direction === 'distributeH') {
        if (targets.length < 3) return;
        const sorted = [...targets].sort((a, b) => a.x - b.x);
        const totalNodeW = sorted.reduce((s, n) => s + n.w, 0);
        const gap = (unionW - totalNodeW) / (sorted.length - 1);
        let cursor = minX;
        for (const n of sorted) {
          n.x = cursor;
          cursor += n.w + gap;
        }
      } else if (direction === 'distributeV') {
        if (targets.length < 3) return;
        const sorted = [...targets].sort((a, b) => a.y - b.y);
        const totalNodeH = sorted.reduce((s, n) => s + n.h, 0);
        const gap = (unionH - totalNodeH) / (sorted.length - 1);
        let cursor = minY;
        for (const n of sorted) {
          n.y = cursor;
          cursor += n.h + gap;
        }
      } else {
        for (const n of targets) {
          if (direction === 'left')    n.x = minX;
          if (direction === 'centerH') n.x = minX + unionW / 2 - n.w / 2;
          if (direction === 'right')   n.x = maxX - n.w;
          if (direction === 'top')     n.y = minY;
          if (direction === 'centerV') n.y = minY + unionH / 2 - n.h / 2;
          if (direction === 'bottom')  n.y = maxY - n.h;
        }
      }
      markDocChanged();
    });
  }

  // ---- page management ----
  function addPage() {
    transact('新增页面', () => {
      const firstPage = doc.value.pages[0];
      doc.value.pages.push({
        id: uid('p'),
        meta: { ...firstPage.meta },
        nodes: {},
        order: []
      });
      doc.value.currentPageIndex = doc.value.pages.length - 1;
      selection.value = [];
      markDocChanged();
    });
  }

  function deletePage(index: number) {
    if (doc.value.pages.length <= 1) return; // guard: never delete last page
    transact('删除页面', () => {
      doc.value.pages.splice(index, 1);
      doc.value.currentPageIndex = Math.min(
        doc.value.currentPageIndex,
        doc.value.pages.length - 1
      );
      selection.value = [];
      markDocChanged();
    });
  }

  function switchPage(index: number) {
    if (index === doc.value.currentPageIndex) return;
    if (index < 0 || index >= doc.value.pages.length) return;
    doc.value.currentPageIndex = index;
    selection.value = [];
    markDocChanged();
  }

  // ---- document I/O ----
  function replaceDocument(newDoc: Document | any, historyLabel = '替换文档') {
    const migrated = migrateDocument(newDoc) ?? newDoc;
    transact(historyLabel, () => {
      doc.value = migrated;
      doc.value.currentPageIndex = 0;
      selection.value = [];
      markDocChanged();
    });
  }
  function setZoom(z: number, anchor?: { x: number; y: number }) {
    const prevZoom = zoom.value;
    zoom.value = Math.max(0.1, Math.min(4, z));
    if (anchor) {
      pan.value = {
        x: pan.value.x - anchor.x * (zoom.value - prevZoom),
        y: pan.value.y - anchor.y * (zoom.value - prevZoom)
      };
    }
  }
  function setPan(x: number, y: number) {
    pan.value = { x, y };
  }

  return {
    // state
    doc,
    selection,
    selectedNodes,
    zoom,
    pan,
    historyVersion,
    // history
    beginInteraction,
    commitInteraction,
    cancelInteraction,
    transact,
    undo,
    redo,
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    // selection
    setSelection,
    // nodes
    addNode,
    deleteSelected,
    moveNodes,
    nudge,
    resizeNode,
    rotateNode,
    updateNode,
    transactUpdate,
    // clipboard
    copy,
    paste,
    duplicate,
    // group
    group,
    ungroup,
    collectDescendants,
    // layering
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    reorder,
    toggleLock,
    toggleVisible,
    renameNode,
    // pages
    addPage,
    deletePage,
    switchPage,
    // alignment
    alignNodes,
    // document
    replaceDocument,
    setZoom,
    setPan,
    markDocChanged
  };
});

export type TextNodeUpdater = Partial<TextNode>;

export type AlignDirection =
  | 'left' | 'centerH' | 'right'
  | 'top'  | 'centerV' | 'bottom'
  | 'distributeH' | 'distributeV';
