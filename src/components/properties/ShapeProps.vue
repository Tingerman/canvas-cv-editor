<template>
  <section class="section">
    <div class="section-title">形状</div>
    <div class="col">
      <div>
        <label>类型</label>
        <select :value="node.shape" @change="set('shape', ($event.target as HTMLSelectElement).value)">
          <option value="rect">矩形</option>
          <option value="ellipse">椭圆</option>
          <option value="line">直线</option>
        </select>
      </div>
      <div v-if="node.shape !== 'line'">
        <label>填充色</label>
        <input type="color" :value="colorOrWhite(node.fill)" @input="set('fill', ($event.target as HTMLInputElement).value)" />
        <button style="margin-top:4px" @click="set('fill', 'transparent')">透明填充</button>
      </div>
      <div>
        <label>描边色</label>
        <input type="color" :value="colorOrWhite(node.stroke)" @input="set('stroke', ($event.target as HTMLInputElement).value)" />
      </div>
      <div>
        <label>描边粗细</label>
        <input type="number" :value="node.strokeWidth" min="0" @change="set('strokeWidth', +($event.target as HTMLInputElement).value)" />
      </div>
      <div v-if="node.shape === 'rect'">
        <label>圆角</label>
        <input type="number" :value="node.cornerRadius" min="0" @change="set('cornerRadius', +($event.target as HTMLInputElement).value)" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/store/editor';
import type { ShapeNode } from '@/types/document';

const props = defineProps<{ node: ShapeNode }>();
const store = useEditorStore();

function set(key: keyof ShapeNode, val: any) {
  store.transactUpdate('修改形状', props.node.id, { [key]: val } as any);
}

function colorOrWhite(c: string) {
  return c && c.startsWith('#') ? c : '#ffffff';
}
</script>
