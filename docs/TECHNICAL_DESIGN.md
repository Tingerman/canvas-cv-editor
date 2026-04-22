# CV-Editor —— 基于 Canvas 2D 自研渲染引擎的在线简历编辑器

> 关键词:Canvas 2D、自研图形引擎、脏矩阵/坐标变换、状态机驱动的交互、命令模式撤销栈、Figma 风格组合、矢量吸附、富文本排版、Pinia 响应式优化

---

## 0. TL;DR(先给自己一张名片)

一个**零第三方图形库**(不引入 Fabric.js / Konva.js / Paper.js)、从 0 手写 Canvas 2D 渲染引擎的 WYSIWYG 简历编辑器,总代码量约 4k 行 TypeScript。核心交付:

- **渲染引擎**:Scene / Renderer / HitTest / InteractionController / SnapEngine 五层解耦架构
- **完整交互**:多选、拖拽、八向缩放、旋转、矩形框选、对齐吸附、空格拖拽视口、Ctrl+滚轮缩放
- **Figma 风格组合**:相对坐标 + `innerW/innerH` 缩放基线,支持任意嵌套、不失真缩放/旋转
- **富文本**:多 run 模型 + DOM `contenteditable` 浮层双向同步
- **无依赖对齐吸附**:左/中/右 × 上/中/下 九线吸附 + 页面中线边缘吸附,O(k·n) 实时计算
- **命令模式撤销栈**:300ms 合并窗口 + 100 步容量,"输入一个字母 = 一步撤销"而不是每个字符一步
- **导出管线**:PNG / PDF / JSON 三格式,修复了一个 RAF 与 await 的经典竞态 bug
- **持久化**:debounced localStorage + FontFace API 自定义字体注册

---

## 1. 为什么不直接用 Fabric / Konva?(技术选型决策)

| 维度 | Fabric.js | Konva.js | 自研 Canvas 2D |
|------|-----------|----------|----------------|
| 包体积 | ~300KB gzip | ~180KB gzip | 0(仅 Canvas API) |
| 事件模型 | 自建 | 自建 | 自建 |
| 富文本 | 有但弱 | 基本没有 | 自由定制 |
| 坐标/矩阵 | 自己的 fabric.Object | Stage/Layer 双层 | 完全可控 |
| 简历场景适配 | 通用绘图偏重 | 游戏/动画偏重 | 贴合 WYSIWYG |
| 学习/维护成本 | 被框架绑架 | 被框架绑架 | 自己的,可控 |

**决策**:简历编辑器场景特殊 —— 纸张固定尺寸、节点类型少(文本/图片/形状)、但富文本要求高。通用库为了通用性背了太多包袱,实际项目里往往要覆盖 / 绕过框架的默认行为。自研反而边界清晰、代码量更小。

> 面试高阶答:"库不是银弹,当领域模型和库的抽象错位时,自研是更正确的选择"。

---

## 2. Canvas 2D 从 0 讲起(写给没写过 Canvas 的自己)

### 2.1 Canvas 是什么

一块像素位图。HTML 里 `<canvas>` 是一块 DOM 元素,JS 通过 `canvas.getContext('2d')` 拿到画笔 `ctx`,对它调用绘图 API,像素就被填到 canvas 这块内存里。**它是立即模式(immediate mode)**—— 你画完就忘记了,下一帧要重画必须自己从头再画一次。这和 DOM 完全不同,DOM 是保留模式(retained mode)—— 你 `div.style.left = '100px'` 它自己会记住并重绘。

这个差异决定了**整个图形引擎的核心任务就是两件事**:
1. 维护"当前有什么"的数据结构(我们叫 **Scene / Document**)
2. 写一个 **Renderer**,每帧从数据结构里算出像素画到 canvas 上

### 2.2 三个最重要的 API

```js
ctx.save();                   // 入栈一次当前变换/样式
ctx.translate(dx, dy);        // 平移
ctx.rotate(rad);              // 旋转(绕当前原点)
ctx.scale(sx, sy);            // 缩放
ctx.fillRect(0, 0, 100, 50);  // 画矩形
ctx.restore();                // 出栈,变换回到 save 时的状态
```

所有变换都作用于**坐标系**而不是图形。`ctx.translate(100, 0)` 相当于把坐标系原点挪到 (100,0),**之后你画的所有东西都以新原点为基准**。

这听起来绕,但一旦理解它 = 栈式变换,就能用 `save/restore` 包成"局部坐标"。这是我们引擎里 `drawNodeAtWorld` 能简单写出来的底层原因:

```ts
ctx.save();
ctx.translate(node.x, node.y);   // 进入节点的局部坐标
applyNodeTransform(ctx, node);   // 再叠加旋转
drawNode(ctx, node);             // 画节点(以自己左上角为 (0,0))
ctx.restore();                   // 离开节点的局部坐标
```

### 2.3 设备像素比 (DPR) 与清晰度

HiDPI 屏幕(Retina, DPR=2)的 1 个 CSS 像素 = 4 个物理像素。如果你只设 `canvas.width = 800`,浏览器会把 800 像素的位图放大两倍显示 → 模糊。正确做法:

```ts
canvas.width  = Math.floor(cssWidth * dpr);
canvas.height = Math.floor(cssHeight * dpr);
canvas.style.width  = cssWidth + 'px';
canvas.style.height = cssHeight + 'px';
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);  // 以 CSS 像素为单位绘图
```

> 我们项目里 `Renderer.resize()` 和每次 `render()` 开头都做了这件事。这是"文字不糊"的第一块砖。

---

## 3. 核心架构:五大件 + 数据流

```
  ┌───────────────────┐   mutation    ┌──────────────────┐
  │  UI (Vue 组件)   │ ────────────> │  Pinia Store     │
  │                   │               │  (useEditor)     │
  └──────┬────────────┘   ◀──────────┴───────┬──────────┘
         │ pointer events                     │ shallowRef + triggerRef
         ▼                                    ▼
  ┌───────────────────┐                ┌──────────────────┐
  │InteractionCtrl    │                │  Document (JSON) │
  │ (状态机)          │                │  nodes + order   │
  └──────┬────────────┘                └──────┬───────────┘
         │ 查询命中                             │ 读
         ▼                                     ▼
  ┌───────────────────┐      ┌──────────────────────────────┐
  │     HitTest       │      │   Scene(Document 视图封装)    │
  └───────────────────┘      └──────┬───────────────────────┘
                                    │
                                    ▼
                             ┌─────────────┐    吸附解算    ┌──────────────┐
                             │  Renderer   │◀──────────────│  SnapEngine  │
                             └─────────────┘                └──────────────┘
                                    │
                                    ▼
                            ┌──────────────┐
                            │   Canvas     │
                            └──────────────┘
```

| 模块 | 职责 | 对应文件 |
|------|------|---------|
| **Document** | 纯数据:节点字典 + 层级顺序,可 JSON 序列化 | `src/types/document.ts` |
| **Scene** | Document 的运行时视图,提供 `getNode` / `getWorldBounds` / `worldToLocalMatrix` 等查询 | `src/engine/Scene.ts` |
| **Renderer** | 每帧清屏 + 画背景 + 画节点 + 画选中框/吸附线/框选矩形 | `src/engine/Renderer.ts` |
| **HitTest** | 屏幕坐标 → 节点命中判断,递归下钻到组内部 | `src/engine/HitTest.ts` |
| **InteractionController** | 鼠标/键盘事件状态机:idle → dragging / resizing / rotating / marquee / panning | `src/engine/InteractionController.ts` |
| **SnapEngine** | 移动/缩放时计算吸附偏移量和参考线 | `src/engine/SnapEngine.ts` |
| **Store (Pinia)** | 所有状态变更入口,配合 History 管理撤销栈 | `src/store/editor.ts`, `src/store/history.ts` |

**为什么这样分?** 核心原则是**数据和表现分离**:
- Document 是唯一真相(Single Source of Truth),能序列化到 localStorage,能导出 JSON,能被任何平台读回来。
- Renderer 是纯函数,输入 Scene+Viewport 输出像素,没有副作用、没有状态。
- InteractionController 是状态机,只负责翻译事件到 Store 的 action 调用。
- Store 是唯一的变更入口,所有变更都进撤销栈。

---

## 4. 渲染管线(每一帧发生了什么)

```ts
Renderer.render() {
  // 1. 清屏(按 DPR 设 transform)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // 2. 进入 "世界坐标" —— 叠加视口 pan + zoom
  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  // 3. 画纸张背景 + 阴影
  ctx.shadowColor = 'rgba(0,0,0,.15)'; ctx.shadowBlur = 20;
  ctx.fillRect(0, 0, page.w, page.h);

  // 4. 按 order 数组从底到顶画每个节点,并裁剪在页面内
  ctx.save(); ctx.rect(0,0,page.w,page.h); ctx.clip();
  for (const id of doc.order) {
    ctx.save();
    ctx.translate(node.x, node.y);
    applyNodeTransform(ctx, node);   // 旋转绕中心
    drawNode(ctx, node, scene);      // 分派到 drawText / drawImage / drawShape / drawGroup
    ctx.restore();
  }
  ctx.restore();

  // 5. 在世界坐标上画"不被裁剪"的 UI:选中框、8 个 handle、吸附参考线、框选矩形
  this.drawSelection();
  this.drawSnapGuides();
  this.drawMarquee();

  ctx.restore();
}
```

### 4.1 RAF 批量渲染(为什么不是每个事件画一次)

任何改变状态的地方都只调 `requestRender()`,里面做的事:

```ts
requestRender() {
  if (this.rafId !== null) return;     // 本帧已排队,直接跳过
  this.rafId = requestAnimationFrame(() => {
    this.rafId = null;
    this.render();
  });
}
```

这样即使一帧里有 100 次 mutation(拖动时鼠标能触发几十次 `pointermove`),也只画一次。这是"画布不掉帧"的第二块砖。

### 4.2 为什么要裁剪到页面内

简历是 A4 纸,用户把节点拖出纸外,显示效果应该是被"纸张边界"切掉。用 `ctx.clip()` 一行解决。导出时同样裁剪,保证打印出来的 PDF 不会有纸外的鬼影。

---

## 5. 坐标系统:四套坐标,变换公式要记清

| 名字 | 定义 | 场景 |
|------|------|------|
| **Screen** | 浏览器视口像素,鼠标事件原始坐标 | `e.offsetX/offsetY` |
| **World** | 纸张左上角为 (0,0),设计稿坐标 | Document 里 node.x/y 一般都是这个 |
| **Local** | 以节点自身左上角为 (0,0),不含旋转 | 画节点内部内容、HitTest 时反推 |
| **Relative(Group 内部)** | 以组的左上角为 (0,0),Group 存入 innerW/innerH 时使用 | 组合功能核心 |

### 5.1 Screen ↔ World

```ts
world = (screen - pan) / zoom
screen = world * zoom + pan
```

### 5.2 World ↔ Local(带旋转)

点 `(wx, wy)` 要判断是否在节点 `node` 内部,不能直接和 AABB 比较 —— 因为节点可能被旋转了。正确做法:

1. 平移到节点中心:`p' = (wx - cx, wy - cy)`
2. 反向旋转 `-node.rotation`:
   ```
   lx = p'.x·cos(-θ) - p'.y·sin(-θ)
   ly = p'.x·sin(-θ) + p'.y·cos(-θ)
   ```
3. 再平移回节点左上角:`p_local = (lx + w/2, ly + h/2)`
4. 然后就能 `0 <= p_local.x <= w && 0 <= p_local.y <= h` 了

这段逻辑在 `HitTest.worldToLocal()` 里 —— 命中判断的灵魂。

### 5.3 旋转节点的 AABB(世界包围盒)

选中一组节点时要画一个总的包围框。光用 `{x, y, w, h}` 不对,旋转后的节点 AABB 是**四个角点取 min/max**:

```ts
const cx = x + w/2, cy = y + h/2;
const corners = [[0,0],[w,0],[w,h],[0,h]].map(([px,py]) => {
  const ox = px - w/2, oy = py - h/2;
  const rx = ox*cos(θ) - oy*sin(θ);
  const ry = ox*sin(θ) + oy*cos(θ);
  return { x: cx + rx, y: cy + ry };
});
const minX = Math.min(...corners.map(c => c.x));
// ...
```

---

## 6. 交互状态机(InteractionController)

一个典型的编辑器,鼠标要做至少 7 件事:点选、多选(Shift)、拖动、缩放(8 方向)、旋转、框选、平移视口。如果写成 if-else 必然乱成一团。用**显式状态机**:

```
状态枚举:  idle | dragging | resizing | rotating | marquee | panning

事件:     pointerdown / pointermove / pointerup / keydown / wheel

状态转移表(节选):
  idle + pointerdown on handle      -> resizing (记录 startBounds)
  idle + pointerdown on rotateHandle-> rotating (记录 startAngle)
  idle + pointerdown on node        -> dragging (记录 anchor)
  idle + pointerdown on empty       -> marquee  (记录 startPt)
  idle + space + pointerdown        -> panning
  * + pointerup                     -> idle (提交到撤销栈)
```

每个状态 `pointermove` 的行为都不同:
- `dragging`:算 delta,调 `SnapEngine.snap()`,调 `store.moveNodes()`
- `resizing`:根据 handle 名字(nw/n/ne/e/se/s/sw/w)做不同方向的尺寸计算,**且要考虑节点自身的旋转**(否则旋转 45 度后往右拖 handle,节点会斜着缩)
- `rotating`:`atan2(mouse - center) - atan2(start - center)`
- `marquee`:实时更新框选矩形,ptup 时算出所有 AABB 与之相交的节点

**高阶细节**:`beginInteraction()` / `commitInteraction()` 是 Store 的一对 API。状态进入非 idle 时调 begin(快照一次 Document),退回 idle 时调 commit(把 (before, after) 作为一条命令压栈)。这样拖 100 像素产生的 100 次 `moveNodes` 合并成 **1 步撤销**。

---

## 7. SnapEngine —— 吸附对齐是怎么做的

PPT / Figma 里拖一个框,它会"咔"一下吸到其他对象的左边、中心、右边。算法本质:

1. 每个参考节点提供 **6 条参考线**:左、水平中、右、上、竖中、下。再加上页面的中线和四边 —— 总共 ~ (n-1)·6 + 6 = 6n 条。
2. 被拖动的节点(候选)也有 6 条线。
3. 两两对比,若某对 `Math.abs(候选.x - 参考.x) < threshold`,就命中一次吸附,记录吸附偏移量 `dx = 参考 - 候选`。
4. 水平和垂直方向各取**最近**的一次吸附,应用偏移到拖动 delta。
5. 命中的参考线记录下来,交给 Renderer 画成品红虚线。

阈值设计:`6 / zoom` —— 随缩放调整,放大时容差不应该变大。

复杂度 O(n),n 是页面节点数,每帧都算也完全够用。代码见 `SnapEngine.snap()`。

---

## 8. 富文本模型(TextNode 的 runs 数组)

为什么不用 DOM?因为我们要导出 PNG/PDF,要精确像素级控制。为什么不用"一段纯字符串"?因为富文本要支持每个字符有自己的颜色/字号/粗体。

**数据结构**:
```ts
interface TextRun {
  text: string;
  fontFamily?: string;  // 可省略,继承节点级默认
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}
interface TextNode {
  type: 'text';
  runs: TextRun[];       // 多段同属性片段
  fontFamily: string;    // 节点级默认
  fontSize: number;
  color: string;
  lineHeight: number;
  align: 'left'|'center'|'right';
  // ...
}
```

### 8.1 排版算法(换行)

Canvas 没有自动换行,必须自己实现:

1. 把 runs 摊平成字符序列,每个字符带自己的样式
2. 从左到右累加宽度(`ctx.measureText`),遇到以下情况换行:
   - 遇到 `\n`
   - 累加宽度 + 下一个字符宽度 > `node.w`(此时需考虑 CJK 任意位置可断行,ASCII 按 word 断)
3. 每行输出时按 `node.align` 计算起始 x,按 `ctx.fillText` 逐字符画

### 8.2 contenteditable 浮层(编辑态)

直接在 Canvas 上写字是没有光标、没有选区、没有 IME 的。解决方案:**双击节点时在画布上覆盖一个 `position: absolute` 的 `contenteditable` div**,位置/字号都继承自 node,透明背景,用户在 DOM 里编辑。回车/失焦时把 HTML 反解析为 runs:

```ts
htmlToRuns(html: string): TextRun[] {
  // 遍历每个 text node,向上找所有带 style 的祖先,合并 style -> run
}
```

**踩过的坑**:最初根元素的 `style.fontSize = fontSize * zoom` 被 `htmlToRuns` 读回来,每个 run 都被塞进了一个带 zoom 的 fontSize,导致面板调节点级 fontSize 无效 → 修复:解析时跳过根元素的 inline style,只读子元素 style;面板改节点级属性时一并清空 runs 的对应 key。

---

## 9. 重头戏:组合(Group)是怎么做到"不失真缩放"的

Figma / PPT 的"组合"看似简单,数学上非常坑。两种典型方案:

### 方案 A(朴素):子节点存世界坐标
组合时不改子节点,组自己画一个边框,移动组时同步移动所有子节点。缺点:**缩放组时要一个个改子节点的 x/y/w/h**,嵌套组的数学非常可怕,浮点误差会逐步累积导致"转一圈回去位置不对"。

### 方案 B(采用):子节点存相对坐标 + 组存 innerW/innerH

**数据模型关键新增**:
```ts
interface GroupNode {
  type: 'group';
  w: number;           // 组的当前显示宽高
  h: number;
  innerW: number;      // 子节点相对坐标的"基准宽度"
  innerH: number;      // 基准高度
  children: string[];
  rotation: number;
}
```

**不变量**(核心):
> 子节点 `child.x/y` 是**相对坐标**(以组左上角为原点,以 `innerW/innerH` 为基准量的坐标)。

**渲染时**:
```ts
drawGroup(ctx, group) {
  const sx = group.w / group.innerW;
  const sy = group.h / group.innerH;
  ctx.scale(sx, sy);            // 临时把坐标系按缩放比例拉伸
  for (const childId of group.children) {
    ctx.save();
    ctx.translate(child.x, child.y);
    applyNodeTransform(ctx, child);
    drawNode(ctx, child);       // 子节点以为自己在一个 innerW×innerH 的世界里
    ctx.restore();
  }
}
```

**好处**:
- 拖动组的缩放 handle 只改 `group.w` 和 `group.h`,子节点一个字节都不碰 → **零累积误差**,缩放无论多少次都完美复原
- 嵌套组天然支持:嵌套组自己也有 innerW/innerH,外层缩放会让内层的 `w/h` 同比变化,绘制时继续按比例解算
- 旋转:组自己旋转,子节点坐标不变(因为相对坐标本身就在组的坐标系里)

**命中测试**(Figma 风格):
```ts
hitTestRecursive(world, node):
  if (node.type !== 'group'): 
    return AABB包含? node : null
  // 进入组的坐标系
  local = worldToLocal(world, node)       // 反向旋转
  inner = { x: local.x/sx, y: local.y/sy } // 反向缩放
  for child in node.children(倒序):
    hit = hitTestRecursive(inner, child)
    if hit: return hit
  return null   // 空白区域不算命中(Figma 行为)
```

### 9.1 group() 和 ungroup() 的数学

**group()**(把 N 个选中节点打包成组):
1. 算所有选中节点的世界 AABB → 这是新组的 `{x, y, w, h}`
2. `innerW = w, innerH = h`(初始时 scale = 1)
3. 每个子节点 `child.x -= groupX; child.y -= groupY`(转成相对坐标)
4. `child.parentId = group.id`
5. 在 `doc.order` 顶部插入组

**ungroup()**(反向,并且组可能被缩放/旋转过,难点):
组当前 `(w, h)` 可能不等于 `(innerW, innerH)`,且 `group.rotation ≠ 0`。每个子节点要还原到世界坐标:
1. 外层坐标 `ox = child.x * sx, oy = child.y * sy`(反向缩放)
2. 子节点的世界中心 = 组中心 + 绕组中心旋转 `(ox + child.w·sx/2, oy + child.h·sy/2)`:
   ```
   lx = ox + child.w·sx/2 - group.w/2
   ly = oy + child.h·sy/2 - group.h/2
   wx = group.cx + lx·cos(θ) - ly·sin(θ)
   wy = group.cy + lx·sin(θ) + ly·cos(θ)
   ```
3. `child.x = wx - childNewW/2; child.y = wy - childNewH/2`
4. `child.rotation += group.rotation`(旋转累加)
5. 如果子节点自己也是组 → 更新 innerW/innerH 以保持内层视觉尺寸

这段代码在 `editor.store.ungroup()`,调试花了不少时间,但一旦对了就对了。

---

## 10. 撤销/重做:命令模式 + 合并窗口

```ts
interface Command {
  label: string;           // 'move' / 'resize' / 'edit-text' / ...
  before: Document;        // 深拷贝的快照
  after: Document;
  time: number;
}
class HistoryStack {
  stack: Command[] = [];
  cursor = -1;
  capacity = 100;
  mergeWindow = 300; // ms
  
  push(cmd) {
    const top = this.stack[this.cursor];
    // 同 label 且 300ms 内 → 合并:top.after = cmd.after(before 保持最早那次)
    if (top && top.label === cmd.label && cmd.time - top.time < this.mergeWindow) {
      top.after = cmd.after; top.time = cmd.time;
    } else {
      // 切掉 redo 分支
      this.stack = this.stack.slice(0, this.cursor + 1);
      this.stack.push(cmd);
      this.cursor++;
      if (this.stack.length > this.capacity) { this.stack.shift(); this.cursor--; }
    }
  }
}
```

**合并窗口**是关键体验:
- 在文本节点连续打字时,每敲一个字都会 commit 一次 `edit-text`,没有合并的话 Ctrl+Z 要按一百次 → 灾难
- 连续拖动时每个 pointermove 一次 commit 也不合理

合并的条件是 **同 label + 时间差 < 300ms**。换一个操作立刻就切分段,所以不会误合并。

**内存考量**:每步存整个 Document 的深拷贝,100 步 × ~50KB ≈ 5MB,用户不会感觉到。更进一步可以存 delta,但当前场景没必要(KISS)。

---

## 11. 响应式集成:Pinia 的 shallowRef + triggerRef 小技巧

Vue 的 reactive 默认是深度代理。Document 里有上百个节点,每个节点又有十几个字段,`reactive(doc)` 会让每次访问都走 Proxy trap,渲染热路径(每帧 RAF)里会被这个 trap 一直打。

**优化**:Document 用 `shallowRef` 持有,所有 mutation 结束后手动 `triggerRef(docRef)`:

```ts
const docRef = shallowRef<Document>(initialDoc);
function moveNodes(ids, dx, dy) {
  for (const id of ids) {
    const n = docRef.value.nodes[id];
    n.x += dx; n.y += dy;
  }
  triggerRef(docRef);   // 手动通知
}
```

Renderer 订阅 `docRef` 的变化时就 `requestRender()`,RAF 合并保证一帧一画。

这不是 Vue 官方推荐"优雅姿势",但在图形编辑器场景下是**正确的**—— 图形库本来就有自己的不可变视角 + 手动失效模型。

---

## 12. 导出管线 —— 附一个真实的 RAF 竞态 bug

导出 PNG:
```
Document -> 创建离屏 Canvas(w*scale, h*scale) -> 预加载所有图片 ->
  ctx.setTransform(scale, 0, 0, scale, 0, 0) -> 画背景 -> 按 order 画每个节点 ->
  canvas.toBlob('image/png') -> 下载
```

导出 PDF:在 PNG 的基础上 `toDataURL('image/jpeg', 0.95)` + `jsPDF.addImage(..., 'JPEG', ...)`。

### 12.1 真实踩坑:左上角出现小缩略图

**症状**:导出的 PNG 左上角出现一个 1x 比例的叠图。

**根因分析**:原代码为了复用 Renderer,`new Renderer(canvas, ...)` 然后 `renderer.resize(...)`,但 `resize()` 内部会 `requestRender()` —— 排了一个 RAF 回调。接着代码走 `ctx.scale(scale, scale)` 设好手动变换,然后 `await preloadImages(doc)` → **这个 await 让出了主线程**,排好的 RAF 回调先被执行了!RAF 里 `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` 重置了手动的 scale。await 结束后,循环继续画节点但此时没有 scale,相当于以 1x 把节点画到 canvas 左上角 → 小缩略图。

**修复策略**:
1. **移除 Renderer 实例**:导出压根是手动画的,Renderer 只是被"借用来 resize 画布",纯属过度设计 → 删掉
2. **把 preloadImages 移到 setTransform 之前**:消灭 await 和画图之间的异步间隙
3. **删掉 `Object.defineProperty(window, 'devicePixelRatio', ...)` 的 hack**:不再依赖 Renderer 也就不用动全局 DPR

**教训**:`requestAnimationFrame` 的回调是**隔 event loop 一帧**才执行的,函数里只要有 `await`,排好的 RAF 就有机会插进来捣乱。任何同步的 ctx 状态设置一定要和实际绘制放在同一个同步代码块内。

> 面试讲这个故事能打到两分:一是抓出 RAF 与 Microtask 的时序关系(异步竞态),二是反思"为了复用而复用"是重构的常见陷阱。

---

## 13. 持久化与字体加载

### 13.1 localStorage 持久化(debounced)

```ts
// 每次 mutation 后调用,500ms 内多次调用只保存最后一次
const saveDebounced = debounce(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(docRef.value));
  } catch (e) {
    if (e.name === 'QuotaExceededError') showToast('存储已满');
  }
}, 500);
```

加载时走 `validateDocument()` —— 我们的 Schema 校验,对缺字段兜底(Group 的 `innerW/innerH` 就靠这招做**向前兼容**:老数据里没这字段,加载时自动用 `w/h` 回填)。

### 13.2 自定义字体(FontFace API)

用户上传 .ttf → 转 base64 → `new FontFace(name, arraybuffer)` → `document.fonts.add(f)` → 等 `f.load()` → 加入 Document 的 `customFonts` 列表 + localStorage 持久化。

下次打开页面时从 localStorage 读出来,再走一遍 FontFace 注册流程 → 字体恢复。

---

## 14. 性能关卡

| 优化点 | 做法 | 收益 |
|--------|------|------|
| RAF 批量渲染 | `requestRender` 幂等 | 一帧只画一次 |
| Pinia shallowRef | `shallowRef + triggerRef` | 避免深度 Proxy trap |
| 图片缓存 | `imageCache: Map<src, HTMLImageElement>` | 节点每帧不新建 Image |
| DPR 精准设定 | `Math.floor(cssW * dpr)` | 避免亚像素抖动模糊 |
| 吸附 O(n) | 遍历节点直接算线,无空间索引 | 百级节点完全够用,避免过度设计 |
| 撤销合并窗口 | 300ms + same label 合并 | 文本输入 Ctrl+Z 合理 |

下一步如果节点上千,可以上 R-Tree 做空间索引加速 HitTest 和 SnapEngine。

---

## 15. 项目目录对照表

```
src/
├── types/document.ts          # 数据结构 + createNode + validateDocument
├── engine/
│   ├── Scene.ts               # Document 运行时视图
│   ├── Renderer.ts            # 每帧画布绘制
│   ├── HitTest.ts             # 坐标命中(递归进组)
│   ├── InteractionController.ts # 状态机
│   ├── SnapEngine.ts          # 吸附算法
│   └── nodes/drawNode.ts      # 节点绘制分发(drawText/Image/Shape/Group)
├── store/
│   ├── editor.ts              # Pinia 主 store + group/ungroup
│   └── history.ts             # 命令栈 + 合并窗口
├── services/
│   ├── persistence.ts         # localStorage debounced 读写
│   ├── exporter.ts            # PNG/PDF/JSON 导出
│   └── fontLoader.ts          # FontFace 注册 + 持久化
├── components/
│   ├── CanvasStage.vue        # 画布 + contenteditable 浮层
│   ├── LayerPanel.vue         # 递归图层树
│   ├── LayerRow.vue           # 递归行组件
│   ├── PropertyPanel.vue      # 右侧属性面板
│   ├── ToolBar.vue, TopBar.vue
│   └── properties/{Text,Image,Shape}Props.vue
└── templates/{classic,modern,creative}.json
```

---

## 16. 面试要点速记(吹牛稿)

**一句话**:"我用 Vue 3 + TypeScript 从 0 写了一个纯 Canvas 2D 的简历编辑器,没用 Fabric/Konva,实现了完整的选择-拖拽-八向缩放-旋转-组合-撤销重做-吸附对齐-富文本-PNG/PDF 导出。"

**亮点 1 —— 架构解耦**:
> "我把引擎拆成 Scene / Renderer / HitTest / InteractionController / SnapEngine 五层,数据流单向,每帧 RAF 驱动一次渲染,Pinia 用 shallowRef + triggerRef 避免深度响应的性能开销。"

**亮点 2 —— Figma 风格组合**:
> "组合功能我用了相对坐标 + innerW/innerH 的设计,缩放组时不动子节点只改 sx/sy,嵌套组天然支持、无累积浮点误差。ungroup 时要做缩放 + 绕中心旋转 + 平移的逆变换,这段数学我完整推导并落地了。"

**亮点 3 —— 撤销栈合并窗口**:
> "命令模式 + 300ms 同 label 合并,解决了连续打字每字符一步撤销的反直觉体验,也合并了拖拽过程中的上百次 move 事件。"

**亮点 4 —— RAF 竞态 bug 的排查**:
> "导出时左上角出现缩略图的 bug,根因是 RAF 回调在 await 让出主线程期间插队执行,重置了我设好的 ctx.setTransform。修复是去掉多余的 Renderer 复用、把异步操作前置到所有 ctx 设置之前。这是典型的并发执行顺序问题。"

**亮点 5 —— HiDPI 精准渲染**:
> "正确处理 devicePixelRatio,canvas 内部位图按物理像素分配、CSS 尺寸按逻辑像素,在 Retina 屏下文字锐利不糊。"

**被追问准备**:
- 为什么不用 Fabric?→ 第 1 节
- HitTest 怎么处理旋转?→ 第 5.2 节
- 怎么保证性能?→ 第 14 节
- 数据怎么持久化?→ 第 13 节
- 组合怎么实现?→ 第 9 节(最该练熟的一题)

---

## 17. 可扩展路径

- 空间索引(R-Tree):千级节点场景加速 HitTest/Snap
- 矢量形状(SVG 路径):扩展 ShapeNode
- 多页支持:`pages: Page[]`,Renderer 切换 page
- 协同编辑:Document 本就是 JSON,接 Yjs CRDT 即可
- 主题/样式库:把组预设成"简历模块",拖入复用
- 离屏 Canvas worker 渲染:极端性能场景下可考虑
