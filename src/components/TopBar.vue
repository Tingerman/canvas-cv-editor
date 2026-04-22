<template>
  <div class="top-bar panel">
    <div class="group">
      <button @click="openGallery?.()" title="模板库">模板</button>
      <button @click="importJSON" title="导入 JSON">导入</button>
    </div>
    <div class="divider" />
    <div class="group">
      <button class="icon" @click="store.undo()" :disabled="!store.canUndo()" title="撤销 Ctrl+Z">
        <Undo2 :size="16" />
      </button>
      <button class="icon" @click="store.redo()" :disabled="!store.canRedo()" title="重做 Ctrl+Shift+Z">
        <Redo2 :size="16" />
      </button>
    </div>
    <div class="divider" />
    <div class="group zoom">
      <button class="icon" @click="setZoom(zoom - 0.1)" title="缩小"><Minus :size="16" /></button>
      <span class="zoom-label">{{ Math.round(zoom * 100) }}%</span>
      <button class="icon" @click="setZoom(zoom + 0.1)" title="放大"><Plus :size="16" /></button>
      <button @click="setZoom(1)">100%</button>
      <button @click="fitToScreen">适应</button>
    </div>
    <div class="spacer" />
    <div class="group">
      <button class="primary" @click="onExport('png')">导出 PNG</button>
      <button class="primary" @click="onExport('pdf')">导出 PDF</button>
      <button @click="onExport('json')">导出 JSON</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { Undo2, Redo2, Plus, Minus } from 'lucide-vue-next';
import { useEditorStore } from '@/store/editor';
import { exportPNG, exportPDF, exportJSON } from '@/services/exporter';
import { validateDocument } from '@/types/document';

const store = useEditorStore();
const { zoom: zoomRef, doc } = storeToRefs(store);
const zoom = computed(() => zoomRef.value);

const openGallery = inject<() => void>('openGallery');
const toast = inject<(m: string, t?: 'info' | 'error') => void>('toast');

function setZoom(v: number) {
  store.setZoom(v);
}

function fitToScreen() {
  // best-effort: just reset
  store.setZoom(0.75);
  store.setPan(40, 40);
}

async function onExport(kind: 'png' | 'pdf' | 'json') {
  try {
    if (kind === 'png') await exportPNG(doc.value);
    else if (kind === 'pdf') await exportPDF(doc.value);
    else exportJSON(doc.value);
    toast?.('导出成功');
  } catch (err) {
    toast?.('导出失败：' + (err as Error).message, 'error');
  }
}

function importJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      if (!validateDocument(obj)) {
        toast?.('JSON 格式不合法', 'error');
        return;
      }
      store.replaceDocument(obj, '导入 JSON');
      toast?.('导入成功');
    } catch (err) {
      toast?.('导入失败：' + (err as Error).message, 'error');
    }
  };
  input.click();
}
</script>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin: 8px 8px 0 8px;
  height: 44px;
}
.group { display: flex; gap: 4px; align-items: center; }
.divider { width: 1px; height: 24px; background: var(--panel-border); }
.spacer { flex: 1; }
.zoom-label {
  min-width: 42px;
  text-align: center;
  color: var(--text-secondary);
}
</style>
