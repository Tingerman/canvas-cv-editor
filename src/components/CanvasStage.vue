<template>
  <div class="canvas-stage" ref="containerEl">
    <canvas ref="canvasEl" />
    <div
      v-if="editingId && editingStyle"
      class="text-overlay"
      :style="editingStyle"
      contenteditable
      ref="editorEl"
      @blur="commitTextEdit"
      @keydown.stop
      v-html="editingInitialHTML"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/store/editor';
import { Scene } from '@/engine/Scene';
import { Renderer } from '@/engine/Renderer';
import { InteractionController, type ControllerHooks } from '@/engine/InteractionController';
import type { TextNode, TextRun } from '@/types/document';

const store = useEditorStore();
const { doc, selection, zoom, pan } = storeToRefs(store);

const containerEl = ref<HTMLDivElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const editorEl = ref<HTMLDivElement | null>(null);

let scene: Scene | null = null;
let renderer: Renderer | null = null;
let controller: InteractionController | null = null;
let resizeObserver: ResizeObserver | null = null;

// --- Text editing state ---
const editingId = ref<string | null>(null);
const editingInitialHTML = ref('');
const editingStyle = ref<Record<string, string> | null>(null);

onMounted(() => {
  const canvas = canvasEl.value!;
  const container = containerEl.value!;

  scene = new Scene(doc.value);
  renderer = new Renderer(canvas, scene, {
    zoom: zoom.value,
    panX: pan.value.x,
    panY: pan.value.y,
    cssWidth: container.clientWidth,
    cssHeight: container.clientHeight
  });
  renderer.resize(container.clientWidth, container.clientHeight);

  const hooks: ControllerHooks = {
    beginInteraction: () => store.beginInteraction(),
    commitInteraction: (label) => store.commitInteraction(label),
    cancelInteraction: () => store.cancelInteraction(),
    setSelection: (ids, additive) => store.setSelection(ids, additive),
    getSelection: () => selection.value.slice(),
    moveNodes: (ids, dx, dy) => store.moveNodes(ids, dx, dy),
    resizeNode: (id, patch) => store.resizeNode(id, patch),
    rotateNode: (id, rotation) => store.rotateNode(id, rotation),
    deleteSelected: () => store.deleteSelected(),
    nudge: (dx, dy) => store.nudge(dx, dy),
    requestTextEdit: (id) => startTextEdit(id),
    setZoom: (z, anchor) => store.setZoom(z, anchor),
    setPan: (x, y) => store.setPan(x, y)
  };
  controller = new InteractionController(renderer, scene, hooks);

  resizeObserver = new ResizeObserver(() => {
    if (renderer && container) renderer.resize(container.clientWidth, container.clientHeight);
  });
  resizeObserver.observe(container);
});

onBeforeUnmount(() => {
  controller?.dispose();
  resizeObserver?.disconnect();
});

// Reactive wiring: whenever anything changes, update renderer
watch(
  [doc, selection, zoom, pan],
  () => {
    if (!renderer || !scene) return;
    scene.setDocument(doc.value);
    renderer.scene = scene;
    renderer.viewport.zoom = zoom.value;
    renderer.viewport.panX = pan.value.x;
    renderer.viewport.panY = pan.value.y;
    renderer.selection.ids = selection.value.slice();
    renderer.selection.bounds = computeSelectionBounds();
    renderer.requestRender();
  },
  { deep: true, immediate: true }
);

function computeSelectionBounds() {
  if (!scene || !selection.value.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of selection.value) {
    const n = scene.getNode(id);
    if (!n) continue;
    const b = scene.getWorldBounds(n);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ---- Text editing overlay ----
async function startTextEdit(id: string) {
  const node = doc.value.nodes[id];
  if (!node || node.type !== 'text') return;
  editingId.value = id;
  editingInitialHTML.value = textNodeToHTML(node);
  editingStyle.value = buildOverlayStyle(node);
  store.beginInteraction();
  await nextTick();
  editorEl.value?.focus();
  // Select all
  const range = document.createRange();
  range.selectNodeContents(editorEl.value!);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function textNodeToHTML(node: TextNode): string {
  return node.runs
    .map((r) => {
      let txt = escapeHtml(r.text).replace(/\n/g, '<br>');
      if (r.bold) txt = `<b>${txt}</b>`;
      if (r.italic) txt = `<i>${txt}</i>`;
      if (r.underline) txt = `<u>${txt}</u>`;
      const styles: string[] = [];
      if (r.color) styles.push(`color:${r.color}`);
      if (r.fontFamily) styles.push(`font-family:${r.fontFamily}`);
      if (r.fontSize) styles.push(`font-size:${r.fontSize}px`);
      if (styles.length) txt = `<span style="${styles.join(';')}">${txt}</span>`;
      return txt;
    })
    .join('');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}

function buildOverlayStyle(node: TextNode): Record<string, string> {
  const vp = renderer!.viewport;
  const left = node.x * vp.zoom + vp.panX;
  const top = node.y * vp.zoom + vp.panY;
  return {
    position: 'absolute',
    left: left + 'px',
    top: top + 'px',
    width: node.w * vp.zoom + 'px',
    minHeight: node.h * vp.zoom + 'px',
    transform: `rotate(${node.rotation}rad)`,
    transformOrigin: `${(node.w * vp.zoom) / 2}px ${(node.h * vp.zoom) / 2}px`,
    fontFamily: node.fontFamily,
    fontSize: node.fontSize * vp.zoom + 'px',
    color: node.color,
    lineHeight: String(node.lineHeight),
    textAlign: node.align,
    padding: '0',
    margin: '0',
    background: 'rgba(255,255,255,.7)',
    outline: '2px solid #4f46e5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflow: 'visible',
    zIndex: '5'
  };
}

function commitTextEdit() {
  if (!editingId.value || !editorEl.value) return;
  const id = editingId.value;
  const node = doc.value.nodes[id];
  if (!node || node.type !== 'text') return;
  const runs = htmlToRuns(editorEl.value);
  store.updateNode(id, { runs } as any);
  editingId.value = null;
  editingStyle.value = null;
  store.commitInteraction('编辑文本');
}

function htmlToRuns(root: HTMLElement): TextRun[] {
  const runs: TextRun[] = [];
  const walk = (node: Node, inherited: TextRun, isRoot: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text) runs.push({ ...inherited, text });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const style: TextRun = { ...inherited, text: '' };
    const tag = el.tagName.toLowerCase();
    if (tag === 'b' || tag === 'strong') style.bold = true;
    if (tag === 'i' || tag === 'em') style.italic = true;
    if (tag === 'u') style.underline = true;
    if (tag === 'br') { runs.push({ ...inherited, text: '\n' }); return; }
    if (tag === 'div' || tag === 'p') {
      if (runs.length > 0 && !runs[runs.length - 1].text.endsWith('\n')) {
        runs.push({ ...inherited, text: '\n' });
      }
    }
    const color = isRoot ? '' : el.style.color;
    const ff = isRoot ? '' : el.style.fontFamily;
    const fs = isRoot ? '' : el.style.fontSize;
    if (color) style.color = color;
    if (ff) style.fontFamily = ff;
    if (fs) style.fontSize = parseFloat(fs);
    for (const c of Array.from(el.childNodes)) walk(c, style, false);
  };
  walk(root, { text: '' }, true);
  // Merge adjacent runs with identical style
  const merged: TextRun[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && sameStyle(last, r)) last.text += r.text;
    else merged.push({ ...r });
  }
  return merged.length ? merged : [{ text: '' }];
}

function sameStyle(a: TextRun, b: TextRun): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline &&
    a.color === b.color && a.fontFamily === b.fontFamily && a.fontSize === b.fontSize;
}

// Public API for PropertyPanel to trigger formatting while editing
defineExpose({ /* reserved */ });
</script>

<style scoped>
.canvas-stage {
  position: relative;
  background: var(--canvas-bg);
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--panel-border);
}
canvas {
  display: block;
  position: absolute;
  inset: 0;
  cursor: default;
}
.text-overlay {
  outline: 2px solid var(--accent);
  caret-color: var(--accent);
}
</style>
