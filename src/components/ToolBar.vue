<template>
  <div class="tool-bar panel">
    <button class="icon" @click="store.addNode('text')" title="添加文本"><Type :size="16" /></button>
    <button class="icon" @click="addImage" title="添加图片"><ImageIcon :size="16" /></button>
    <button class="icon" @click="addShape('rect')" title="矩形"><Square :size="16" /></button>
    <button class="icon" @click="addShape('ellipse')" title="椭圆"><Circle :size="16" /></button>
    <button class="icon" @click="addShape('line')" title="直线"><Minus :size="16" /></button>
  </div>
</template>

<script setup lang="ts">
import { Type, Image as ImageIcon, Square, Circle, Minus } from 'lucide-vue-next';
import { useEditorStore } from '@/store/editor';
import { fileToImageDataUrl } from '@/services/fontLoader';
import type { ShapeKind } from '@/types/document';

const store = useEditorStore();

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
</style>
