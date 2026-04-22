<template>
  <section class="section">
    <div class="section-title">文本</div>
    <div class="col">
      <label>内容</label>
      <textarea rows="3" :value="plainText" @change="updateText(($event.target as HTMLTextAreaElement).value)" />
      <div class="row">
        <select :value="node.fontFamily" @change="set('fontFamily', ($event.target as HTMLSelectElement).value)">
          <option v-for="f in fonts" :key="f" :value="f">{{ f.replace(/"/g, '') }}</option>
        </select>
        <input type="number" :value="node.fontSize" min="6" max="200" style="width: 64px" @change="set('fontSize', +($event.target as HTMLInputElement).value)" />
      </div>
      <div class="row">
        <input type="color" :value="node.color" @input="set('color', ($event.target as HTMLInputElement).value)" />
        <button class="icon" :class="{ active: allBold }" @click="toggleAll('bold')" title="加粗"><Bold :size="14" /></button>
        <button class="icon" :class="{ active: allItalic }" @click="toggleAll('italic')" title="斜体"><Italic :size="14" /></button>
        <button class="icon" :class="{ active: allUnderline }" @click="toggleAll('underline')" title="下划线"><Underline :size="14" /></button>
      </div>
      <div class="row">
        <button class="icon" :class="{ active: node.align === 'left' }" @click="set('align', 'left')"><AlignLeft :size="14" /></button>
        <button class="icon" :class="{ active: node.align === 'center' }" @click="set('align', 'center')"><AlignCenter :size="14" /></button>
        <button class="icon" :class="{ active: node.align === 'right' }" @click="set('align', 'right')"><AlignRight :size="14" /></button>
        <div style="flex:1" />
        <label style="margin:0">行高</label>
        <input type="number" step="0.1" :value="node.lineHeight" style="width: 60px" @change="set('lineHeight', +($event.target as HTMLInputElement).value)" />
      </div>
      <div class="row">
        <button @click="uploadCustomFont">上传字体</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-vue-next';
import { useEditorStore } from '@/store/editor';
import { listFontFamilies, uploadFont } from '@/services/fontLoader';
import type { TextNode, TextRun } from '@/types/document';

const props = defineProps<{ node: TextNode }>();
const store = useEditorStore();
const fonts = computed(() => listFontFamilies());

const plainText = computed(() => props.node.runs.map((r) => r.text).join(''));
const allBold = computed(() => props.node.runs.every((r) => r.bold));
const allItalic = computed(() => props.node.runs.every((r) => r.italic));
const allUnderline = computed(() => props.node.runs.every((r) => r.underline));

function set(key: keyof TextNode, val: any) {
  // Node-level font / color settings should take effect globally, so strip
  // per-run overrides for the same attribute at the same time.
  const patch: Partial<TextNode> = { [key]: val } as any;
  if (key === 'fontSize' || key === 'fontFamily' || key === 'color') {
    const runKey = key as 'fontSize' | 'fontFamily' | 'color';
    patch.runs = props.node.runs.map((r) => {
      const { [runKey]: _dropped, ...rest } = r;
      return rest as TextRun;
    });
  }
  store.transactUpdate('修改文本', props.node.id, patch as any);
}
function updateText(text: string) {
  const newRuns: TextRun[] = [{ text }];
  set('runs', newRuns);
}
function toggleAll(key: 'bold' | 'italic' | 'underline') {
  const all = props.node.runs.every((r) => r[key]);
  const runs = props.node.runs.map((r) => ({ ...r, [key]: !all }));
  set('runs', runs);
}
async function uploadCustomFont() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ttf,.otf,.woff,.woff2';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const family = await uploadFont(file);
    set('fontFamily', `"${family}"`);
  };
  input.click();
}
</script>

<style scoped>
textarea { resize: vertical; min-height: 48px; }
button.icon.active { background: #eef2ff; color: var(--accent); border-color: var(--accent); }
.row { gap: 6px; }
</style>
