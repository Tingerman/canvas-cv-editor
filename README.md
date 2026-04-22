# Canvas 简历编辑器

一个纯前端、基于原生 Canvas 2D API 自研渲染引擎的简历编辑器。Vue 3 + Vite + TypeScript。

## 快速开始

```bash
npm install
npm run dev
```

然后打开 http://localhost:5173。

## 功能

- 文本 / 图片 / 形状（矩形、椭圆、直线）节点
- 拖拽 / 8 向缩放（Shift 等比 / Alt 中心锚）/ 旋转（Shift 15° 吸附）
- 对齐吸附（画布边缘、中线、其他节点的 6 条参考线）
- 多选、框选、复制、粘贴、删除
- 图层面板：顺序调整、锁定、隐藏、重命名
- 撤销 / 重做（300ms 合并，最多 100 步）
- 富文本内联编辑（双击文本）：加粗 / 斜体 / 下划线 / 对齐 / 字体 / 字号 / 颜色
- 自定义字体上传（ttf/otf/woff/woff2，本地持久化）
- 3 套预置模板
- 导出 PNG / PDF / JSON；可导入 JSON
- localStorage 自动保存

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` / `Ctrl + Y` | 重做 |
| `Ctrl/Cmd + C / V` | 复制 / 粘贴 |
| `Ctrl/Cmd + D` | 直接复制 |
| `Ctrl/Cmd + ]` / `[` | 上移 / 下移一层 |
| `Delete` / `Backspace` | 删除所选 |
| 方向键 / Shift+方向键 | 微调 1px / 10px |
| `Ctrl/Cmd + 滚轮` | 缩放画布 |
| `空格 + 拖拽` | 平移画布 |
| 双击文本 | 进入编辑 |

## 目录结构

```
src/
├── App.vue                     # 三栏布局
├── main.ts                     # Vue 入口
├── style.css                   # 全局样式 / 设计变量
├── components/                 # UI 组件（TopBar / ToolBar / CanvasStage / LayerPanel / PropertyPanel / TemplateGallery）
│   └── properties/             # 属性面板类型专属控件
├── engine/                     # 框架无关渲染引擎
│   ├── Scene.ts                # 场景（Document 的只读视图 + 世界坐标计算）
│   ├── Renderer.ts             # 渲染器（视口变换 / 选中框 / 吸附线 / 框选）
│   ├── HitTest.ts              # 命中测试
│   ├── InteractionController.ts# 交互状态机
│   ├── SnapEngine.ts           # 对齐吸附
│   ├── nodes/drawNode.ts       # 各类节点绘制
│   └── utils/                  # matrix / geometry / textLayout
├── store/                      # Pinia store + 历史栈
├── services/                   # persistence / exporter / fontLoader
├── templates/                  # 3 套预置模板
└── types/document.ts           # Document / Node 类型定义
```

## 架构要点

- **引擎与 UI 解耦**：`engine/` 目录完全不依赖 Vue，可以单独拿去嵌入其他框架。
- **单向数据流**：交互控制器 → Pinia store 变更 document → watch 重新驱动 Renderer。
- **脏渲染**：使用 `requestAnimationFrame` 合批渲染。
- **历史快照**：每次交互在 `beginInteraction` 时拍快照，`commitInteraction` 时提交，支持时间窗口合并避免撤销栈爆炸。
- **富文本**：非编辑态 canvas 直接绘制 `TextRun[]`；双击进入编辑态时在 canvas 上方叠 `contenteditable` DOM 继承节点 transform，失焦回写。

## 非目标

单页 A4，不含多页、账号、协同。
