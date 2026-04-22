<template>
  <div class="app-root">
    <TopBar />
    <div class="app-body">
      <LayerPanel class="side left" />
      <div class="stage-area">
        <ToolBar />
        <CanvasStage class="stage" />
      </div>
      <PropertyPanel class="side right" />
    </div>
    <TemplateGallery v-if="showGallery" @close="showGallery = false" />
    <div class="toast-layer">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="{ error: t.type === 'error' }"
      >{{ t.message }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import TopBar from './components/TopBar.vue';
import ToolBar from './components/ToolBar.vue';
import CanvasStage from './components/CanvasStage.vue';
import LayerPanel from './components/LayerPanel.vue';
import PropertyPanel from './components/PropertyPanel.vue';
import TemplateGallery from './components/TemplateGallery.vue';
import { useEditorStore } from './store/editor';
import { loadDocument, saveDocument, debounce } from './services/persistence';
import { restoreFonts } from './services/fontLoader';
import { templates } from './templates';

const store = useEditorStore();
const { doc, historyVersion } = storeToRefs(store);
const showGallery = ref(false);

interface Toast { id: number; message: string; type?: 'info' | 'error' }
const toasts = ref<Toast[]>([]);
let toastId = 0;
function toast(message: string, type: 'info' | 'error' = 'info') {
  const id = ++toastId;
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 2500);
}
provide('toast', toast);
provide('openGallery', () => (showGallery.value = true));

// --- Boot ---
onMounted(async () => {
  await restoreFonts();
  const existing = loadDocument();
  if (existing) {
    store.replaceDocument(existing, '恢复文档');
  } else {
    showGallery.value = true;
  }
});

// --- Keyboard shortcuts ---
function onGlobalKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
  else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); }
  else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); store.copy(); }
  else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); store.paste(); }
  else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); store.duplicate(); }
  else if (mod && e.key.toLowerCase() === 'g' && e.shiftKey) { e.preventDefault(); store.ungroup(); }
  else if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); store.group(); }
  else if (mod && e.key === ']') { e.preventDefault(); store.bringForward(); }
  else if (mod && e.key === '[') { e.preventDefault(); store.sendBackward(); }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey));
onUnmounted(() => window.removeEventListener('keydown', onGlobalKey));

// --- Auto save ---
const saveDebounced = debounce(() => {
  const res = saveDocument(doc.value);
  if (!res.ok) toast('保存失败：' + res.error, 'error');
}, 500);
watch([doc, historyVersion], () => saveDebounced());
</script>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}
.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
  gap: 8px;
  padding: 8px;
}
.side {
  width: 240px;
  flex-shrink: 0;
  overflow-y: auto;
}
.stage-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stage {
  flex: 1;
  min-height: 0;
}
</style>
