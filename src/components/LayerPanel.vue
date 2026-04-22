<template>
  <div class="layer-panel panel">
    <div class="header">图层</div>
    <div class="list">
      <LayerRow
        v-for="id in reversed"
        :key="id"
        :id="id"
        :depth="0"
      />
      <div v-if="!reversed.length" class="empty">暂无图层，使用左上工具栏添加</div>
    </div>
    <div class="footer">
      <button class="icon" @click="store.group()" title="组合 Ctrl+G"><Boxes :size="14" /></button>
      <button class="icon" @click="store.ungroup()" title="取消组合 Ctrl+Shift+G"><PackageOpen :size="14" /></button>
      <div class="sep" />
      <button class="icon" @click="store.bringToFront()" title="置顶"><ChevronsUp :size="14" /></button>
      <button class="icon" @click="store.bringForward()" title="上移"><ChevronUp :size="14" /></button>
      <button class="icon" @click="store.sendBackward()" title="下移"><ChevronDown :size="14" /></button>
      <button class="icon" @click="store.sendToBack()" title="置底"><ChevronsDown :size="14" /></button>
      <div class="spacer" />
      <button class="icon" @click="store.deleteSelected()" title="删除"><Trash2 :size="14" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import {
  Boxes, PackageOpen,
  ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, Trash2
} from 'lucide-vue-next';
import { useEditorStore } from '@/store/editor';
import LayerRow from './LayerRow.vue';

const store = useEditorStore();
const { doc } = storeToRefs(store);

const reversed = computed(() => doc.value.order.slice().reverse());
</script>

<style scoped>
.layer-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.header {
  padding: 8px 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--panel-border);
}
.list { flex: 1; overflow-y: auto; padding: 4px; }
.empty { color: var(--text-secondary); font-size: 12px; padding: 12px; text-align: center; }
.footer {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid var(--panel-border);
  flex-wrap: wrap;
}
.sep { width: 1px; background: var(--panel-border); margin: 0 2px; }
.spacer { flex: 1; }
</style>
