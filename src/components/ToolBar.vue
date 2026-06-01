<template>
  <div class="tool-bar panel">
    <button class="icon" @click="store.addNode('text')" title="添加文本"><Type :size="16" /></button>
    <button class="icon" @click="addImage" title="添加图片"><ImageIcon :size="16" /></button>
    <button class="icon" @click="addShape('rect')" title="矩形"><Square :size="16" /></button>
    <button class="icon" @click="addShape('ellipse')" title="椭圆"><Circle :size="16" /></button>
    <button class="icon" @click="addShape('line')" title="直线"><Minus :size="16" /></button>

    <div class="sep" v-show="selectedNodes.length >= 2" />

    <template v-if="selectedNodes.length >= 2">
      <button class="icon" @click="store.alignNodes('left')"        title="左对齐"><AlignLeft :size="16" /></button>
      <button class="icon" @click="store.alignNodes('centerH')"     title="水平居中"><AlignCenter :size="16" /></button>
      <button class="icon" @click="store.alignNodes('right')"       title="右对齐"><AlignRight :size="16" /></button>
      <div class="sep" />
      <button class="icon" @click="store.alignNodes('top')"         title="顶对齐"><AlignStartVertical :size="16" /></button>
      <button class="icon" @click="store.alignNodes('centerV')"     title="垂直居中"><AlignCenterVertical :size="16" /></button>
      <button class="icon" @click="store.alignNodes('bottom')"      title="底对齐"><AlignEndVertical :size="16" /></button>
      <div class="sep" />
      <button class="icon" @click="store.alignNodes('distributeH')" title="水平均布" :disabled="selectedNodes.length < 3"><AlignHorizontalSpaceAround :size="16" /></button>
      <button class="icon" @click="store.alignNodes('distributeV')" title="垂直均布" :disabled="selectedNodes.length < 3"><AlignVerticalSpaceAround :size="16" /></button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import {
  Type, Image as ImageIcon, Square, Circle, Minus,
  AlignLeft, AlignCenter, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignHorizontalSpaceAround, AlignVerticalSpaceAround
} from 'lucide-vue-next';
import { useEditorStore } from '@/store/editor';
import { fileToImageDataUrl } from '@/services/fontLoader';
import type { ShapeKind } from '@/types/document';

const store = useEditorStore();
const { selectedNodes } = storeToRefs(store);

function addShape(shape: ShapeKind) {
  const overrides: any = { shape };
  if (shape === 'ellipse') overrides.w = 120;
  if (shape === 'line') { overrides.h = 2; overrides.fill = '#1f2937'; }
  store.addNode('shape', overrides);
}

function addImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const url = await fileToImageDataUrl(file);
    store.addNode('image', { src: url });
  };
  input.click();
}
</script>

<style scoped>
.tool-bar {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  align-items: center;
}
.sep {
  width: 1px;
  height: 18px;
  background: var(--border, #e5e7eb);
  margin: 0 2px;
  flex-shrink: 0;
}
.icon:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
