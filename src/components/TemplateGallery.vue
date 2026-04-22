<template>
  <div class="backdrop" @click.self="$emit('close')">
    <div class="modal panel">
      <div class="header">
        <h3>选择模板</h3>
        <button class="icon" @click="$emit('close')"><X :size="16" /></button>
      </div>
      <div class="grid">
        <div
          v-for="t in templates"
          :key="t.id"
          class="card"
          @click="pick(t)"
        >
          <div class="preview"><canvas :ref="(el: any) => bindCanvas(el, t)" /></div>
          <div class="info">
            <strong>{{ t.name }}</strong>
            <p>{{ t.description }}</p>
          </div>
        </div>
      </div>
      <div class="footer">
        <button @click="startBlank">空白开始</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick } from 'vue';
import { X } from 'lucide-vue-next';
import { templates, type TemplateEntry } from '@/templates';
import { useEditorStore } from '@/store/editor';
import { createEmptyDocument } from '@/types/document';
import { renderToCanvas } from '@/services/exporter';

const emit = defineEmits<{ close: [] }>();
const store = useEditorStore();

async function bindCanvas(el: HTMLCanvasElement | null, t: TemplateEntry) {
  if (!el) return;
  await nextTick();
  const preview = await renderToCanvas(t.doc, 0.5);
  el.width = preview.width;
  el.height = preview.height;
  const ctx = el.getContext('2d')!;
  ctx.drawImage(preview, 0, 0);
}

function pick(t: TemplateEntry) {
  store.replaceDocument(JSON.parse(JSON.stringify(t.doc)), '应用模板');
  emit('close');
}

function startBlank() {
  store.replaceDocument(createEmptyDocument(), '新建文档');
  emit('close');
}
</script>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  width: min(960px, 92vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}
.header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--panel-border);
}
.header h3 { margin: 0; font-size: 15px; }
.grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  padding: 16px;
}
.card {
  border: 1px solid var(--panel-border);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
  transition: transform .15s, box-shadow .15s;
  background: #fff;
}
.card:hover { transform: translateY(-2px); box-shadow: var(--shadow); border-color: var(--accent); }
.preview {
  aspect-ratio: 794 / 1123;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.preview canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.info { padding: 10px 12px; }
.info p { margin: 4px 0 0 0; color: var(--text-secondary); font-size: 12px; }
.footer {
  padding: 12px 16px;
  border-top: 1px solid var(--panel-border);
  text-align: right;
}
</style>
