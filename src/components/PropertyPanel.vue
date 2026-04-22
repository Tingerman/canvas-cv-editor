<template>
  <div class="property-panel panel">
    <div class="header">属性</div>
    <div class="body">
      <template v-if="node">
        <section class="section">
          <div class="section-title">变换</div>
          <div class="grid">
            <div><label>X</label><input type="number" :value="round(node.x)" @change="update('x', +($event.target as HTMLInputElement).value)" /></div>
            <div><label>Y</label><input type="number" :value="round(node.y)" @change="update('y', +($event.target as HTMLInputElement).value)" /></div>
            <div><label>宽</label><input type="number" :value="round(node.w)" @change="update('w', +($event.target as HTMLInputElement).value)" /></div>
            <div><label>高</label><input type="number" :value="round(node.h)" @change="update('h', +($event.target as HTMLInputElement).value)" /></div>
            <div><label>旋转(°)</label><input type="number" :value="round(node.rotation * 180 / Math.PI)" @change="update('rotation', +($event.target as HTMLInputElement).value * Math.PI / 180)" /></div>
            <div>
              <label>透明度</label>
              <input type="range" min="0" max="1" step="0.05" :value="node.opacity" @input="update('opacity', +($event.target as HTMLInputElement).value)" />
            </div>
          </div>
        </section>
        <TextProps v-if="node.type === 'text'" :node="node" />
        <ImageProps v-if="node.type === 'image'" :node="node" />
        <ShapeProps v-if="node.type === 'shape'" :node="node" />
      </template>
      <template v-else>
        <div class="empty">
          <p>选中一个元素以查看其属性</p>
          <p class="hint">· 滚轮 + Ctrl/Cmd 缩放画布<br>· 空格 + 拖拽 平移画布<br>· 双击文本进入编辑</p>
        </div>
        <section class="section">
          <div class="section-title">页面</div>
          <div class="col">
            <label>背景色</label>
            <input type="color" :value="doc.page.background" @input="setPageBg(($event.target as HTMLInputElement).value)" />
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/store/editor';
import TextProps from './properties/TextProps.vue';
import ImageProps from './properties/ImageProps.vue';
import ShapeProps from './properties/ShapeProps.vue';

const store = useEditorStore();
const { doc, selectedNodes } = storeToRefs(store);

const node = computed(() => (selectedNodes.value.length === 1 ? selectedNodes.value[0] : null));

function round(v: number) {
  return Math.round(v * 100) / 100;
}

function update(key: string, value: any) {
  if (!node.value) return;
  store.transactUpdate('修改属性', node.value.id, { [key]: value } as any);
}

function setPageBg(v: string) {
  store.transact('修改页面背景', () => {
    doc.value.page.background = v;
    store.markDocChanged();
  });
}
</script>

<style scoped>
.property-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.header {
  padding: 8px 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--panel-border);
}
.body { flex: 1; overflow-y: auto; padding: 10px 12px; }
.section { padding: 8px 0; border-bottom: 1px solid var(--panel-border); }
.section:last-child { border-bottom: none; }
.section-title { font-weight: 600; margin-bottom: 6px; font-size: 12px; color: var(--text-secondary); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.empty { color: var(--text-secondary); text-align: center; padding: 16px; }
.empty .hint { font-size: 11px; text-align: left; line-height: 1.8; margin-top: 16px; }
</style>
