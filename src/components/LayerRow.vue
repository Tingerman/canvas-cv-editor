<template>
  <div>
    <div
      class="layer-item"
      :class="{ active: selection.includes(id) }"
      :style="{ paddingLeft: 6 + depth * 14 + 'px' }"
      @click="onClick"
    >
      <button
        v-if="node?.type === 'group'"
        class="icon small caret"
        @click.stop="expanded = !expanded"
      >
        <ChevronDown v-if="expanded" :size="12" />
        <ChevronRight v-else :size="12" />
      </button>
      <span v-else class="caret-spacer" />
      <button class="icon small" @click.stop="store.toggleVisible(id)" :title="node?.visible ? '隐藏' : '显示'">
        <Eye v-if="node?.visible" :size="14" />
        <EyeOff v-else :size="14" />
      </button>
      <button class="icon small" @click.stop="store.toggleLock(id)" :title="node?.locked ? '解锁' : '锁定'">
        <Lock v-if="node?.locked" :size="14" />
        <LockOpen v-else :size="14" />
      </button>
      <component :is="typeIcon" :size="14" class="type-icon" />
      <span class="name" @dblclick.stop="rename">{{ node?.name }}</span>
    </div>
    <template v-if="node?.type === 'group' && expanded">
      <LayerRow
        v-for="childId in reversedChildren"
        :key="childId"
        :id="childId"
        :depth="depth + 1"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import {
  Type, Image as ImageIcon, Square, Folder,
  Eye, EyeOff, Lock, LockOpen,
  ChevronDown, ChevronRight
} from 'lucide-vue-next';
import { useEditorStore } from '@/store/editor';

const props = defineProps<{ id: string; depth: number }>();
const store = useEditorStore();
const { doc, selection } = storeToRefs(store);

const node = computed(() => doc.value.nodes[props.id]);
const expanded = ref(true);

const reversedChildren = computed(() => {
  if (!node.value || node.value.type !== 'group') return [];
  return node.value.children.slice().reverse();
});

const typeIcon = computed(() => {
  const t = node.value?.type;
  if (t === 'text') return Type;
  if (t === 'image') return ImageIcon;
  if (t === 'shape') return Square;
  return Folder;
});

function onClick(e: MouseEvent) {
  const additive = e.shiftKey || e.metaKey || e.ctrlKey;
  // Clicking an item inside a group selects the top-level ancestor group.
  const targetId = topLevelAncestor(props.id);
  if (additive) {
    const list = selection.value.includes(targetId)
      ? selection.value.filter((x) => x !== targetId)
      : [...selection.value, targetId];
    store.setSelection(list);
  } else {
    store.setSelection([targetId]);
  }
}

function topLevelAncestor(id: string): string {
  let cur = doc.value.nodes[id];
  while (cur && cur.parentId) {
    cur = doc.value.nodes[cur.parentId];
  }
  return cur ? cur.id : id;
}

function rename() {
  if (!node.value) return;
  const cur = node.value.name;
  const next = prompt('重命名', cur);
  if (next !== null && next !== cur) store.renameNode(props.id, next);
}
</script>

<style scoped>
.layer-item {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}
.layer-item:hover { background: #f3f4f6; }
.layer-item.active { background: #eef2ff; color: var(--accent); }
.icon.small { width: 22px; height: 22px; padding: 0; }
.caret-spacer { width: 22px; }
.type-icon { color: var(--text-secondary); margin-right: 2px; }
.name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
</style>
