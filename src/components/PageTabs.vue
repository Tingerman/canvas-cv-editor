<template>
  <div class="page-tabs">
    <button
      v-for="(page, i) in pages"
      :key="page.id"
      class="tab"
      :class="{ active: i === currentPageIndex }"
      @click="store.switchPage(i)"
    >
      <span class="tab-label">{{ i + 1 }}</span>
      <span
        v-if="pages.length > 1"
        class="tab-delete"
        title="删除此页"
        @click.stop="store.deletePage(i)"
      >×</span>
    </button>
    <button class="tab tab-add" title="新增页面" @click="store.addPage()">+</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/store/editor';

const store = useEditorStore();
const { doc } = storeToRefs(store);
const pages = computed(() => doc.value.pages);
const currentPageIndex = computed(() => doc.value.currentPageIndex);
</script>

<style scoped>
.page-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--panel-bg, #f3f4f6);
  border-top: 1px solid var(--border, #e5e7eb);
  flex-shrink: 0;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  background: var(--bg, #fff);
  font-size: 12px;
  cursor: pointer;
  color: var(--text, #374151);
  transition: background 0.12s;
  min-width: 32px;
  justify-content: center;
}

.tab:hover {
  background: var(--hover-bg, #e5e7eb);
}

.tab.active {
  background: var(--accent, #4f46e5);
  color: #fff;
  border-color: var(--accent, #4f46e5);
}

.tab-delete {
  font-size: 14px;
  line-height: 1;
  opacity: 0.6;
  padding: 0 2px;
  border-radius: 2px;
}
.tab-delete:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.15);
}

.tab-add {
  font-size: 16px;
  font-weight: bold;
  padding: 3px 8px;
}
</style>
