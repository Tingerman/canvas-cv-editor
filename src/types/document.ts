// Document / Node type definitions for the CV editor

export type NodeType = 'text' | 'image' | 'shape' | 'group';

export interface BaseNode {
  id: string;
  type: NodeType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // radians
  opacity: number; // 0..1
  locked: boolean;
  visible: boolean;
  parentId: string | null;
}

export interface TextRun {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface TextNode extends BaseNode {
  type: 'text';
  runs: TextRun[];
  align: 'left' | 'center' | 'right';
  lineHeight: number; // multiplier
  fontFamily: string;
  fontSize: number;
  color: string;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  src: string; // dataURL
  objectFit: 'cover' | 'contain' | 'fill';
  borderRadius: number;
}

export type ShapeKind = 'rect' | 'ellipse' | 'line';

export interface ShapeNode extends BaseNode {
  type: 'shape';
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash: number[];
  cornerRadius: number;
}

export interface GroupNode extends BaseNode {
  type: 'group';
  children: string[];
  /** Canvas dimensions at the moment children's relative coords were baked. */
  innerW: number;
  innerH: number;
}

export type AnyNode = TextNode | ImageNode | ShapeNode | GroupNode;

export interface Page {
  width: number;
  height: number;
  background: string;
}

export interface Document {
  version: 1;
  page: Page;
  nodes: Record<string, AnyNode>;
  order: string[]; // top-level zIndex order (bottom -> top)
}

// ----- factories -----

export function uid(prefix = 'n'): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 10);
}

export const A4 = { width: 794, height: 1123 };

export function createEmptyDocument(): Document {
  return {
    version: 1,
    page: { width: A4.width, height: A4.height, background: '#ffffff' },
    nodes: {},
    order: []
  };
}

export function createNode(type: NodeType, overrides: Partial<AnyNode> = {}): AnyNode {
  const base: BaseNode = {
    id: uid(type.slice(0, 1)),
    type,
    name: defaultName(type),
    x: 100,
    y: 100,
    w: 200,
    h: 60,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    parentId: null
  };

  switch (type) {
    case 'text':
      return {
        ...base,
        h: 40,
        type: 'text',
        runs: [{ text: '双击编辑文本' }],
        align: 'left',
        lineHeight: 1.4,
        fontFamily: 'sans-serif',
        fontSize: 16,
        color: '#1f2937',
        ...overrides
      } as TextNode;
    case 'image':
      return {
        ...base,
        w: 160,
        h: 160,
        type: 'image',
        src: '',
        objectFit: 'cover',
        borderRadius: 0,
        ...overrides
      } as ImageNode;
    case 'shape':
      return {
        ...base,
        w: 120,
        h: 80,
        type: 'shape',
        shape: 'rect',
        fill: '#4f46e5',
        stroke: 'transparent',
        strokeWidth: 0,
        dash: [],
        cornerRadius: 0,
        ...overrides
      } as ShapeNode;
    case 'group':
      return {
        ...base,
        type: 'group',
        children: [],
        innerW: base.w,
        innerH: base.h,
        ...overrides
      } as GroupNode;
  }
}

function defaultName(type: NodeType): string {
  return { text: '文本', image: '图片', shape: '形状', group: '分组' }[type];
}

// ----- validation -----

export function validateDocument(obj: unknown): obj is Document {
  if (!obj || typeof obj !== 'object') return false;
  const d = obj as any;
  if (d.version !== 1) return false;
  if (!d.page || typeof d.page.width !== 'number' || typeof d.page.height !== 'number') return false;
  if (!d.nodes || typeof d.nodes !== 'object') return false;
  if (!Array.isArray(d.order)) return false;
  for (const id of d.order) {
    if (!d.nodes[id]) return false;
  }
  for (const id of Object.keys(d.nodes)) {
    const n = d.nodes[id];
    if (!n || typeof n.id !== 'string' || typeof n.type !== 'string') return false;
    // Backfill group defaults for forward compatibility
    if (n.type === 'group') {
      if (!Array.isArray(n.children)) n.children = [];
      if (typeof n.innerW !== 'number') n.innerW = n.w;
      if (typeof n.innerH !== 'number') n.innerH = n.h;
    }
  }
  return true;
}
