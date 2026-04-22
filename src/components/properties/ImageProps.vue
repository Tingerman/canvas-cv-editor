<template>
  <section class="section">
    <div class="section-title">图片</div>
    <div class="col">
      <button @click="replaceImage">替换图片</button>
      <div>
        <label>填充方式</label>
        <select :value="node.objectFit" @change="set('objectFit', ($event.target as HTMLSelectElement).value)">
          <option value="cover">裁剪填充 (cover)</option>
          <option value="contain">完整显示 (contain)</option>
          <option value="fill">拉伸 (fill)</option>
        </select>
      </div>
      <div>
        <label>圆角</label>
        <input type="number" :value="node.borderRadius" min="0" @change="set('borderRadius', +($event.target as HTMLInputElement).value)" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/store/editor';
import { fileToImageDataUrl } from '@/services/fontLoader';
import type { ImageNode } from '@/types/document';

const props = defineProps<{ node: ImageNode }>();
const store = useEditorStore();

function set(key: keyof ImageNode, val: any) {
  store.transactUpdate('修改图片', props.node.id, { [key]: val } as any);
}
function replaceImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const url = await fileToImageDataUrl(file);
    set('src', url);
  };
  input.click();
}
</script>
