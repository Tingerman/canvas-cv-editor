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

export interface PageData {
  id: string;
  meta: Page;
  nodes: Record<string, AnyNode>;
  order: string[]; // top-level zIndex order (bottom -> top)
}

export interface Document {
  version: 2;
  pages: PageData[];
  currentPageIndex: number;
}

// ----- factories -----

export function uid(prefix = 'n'): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 10);
}

export const A4 = { width: 794, height: 1123 };

export function createEmptyDocument(): Document {
  return {
    version: 2,
    pages: [
      {
        id: uid('p'),
        meta: { width: A4.width, height: A4.height, background: '#ffffff' },
        nodes: {},
        order: []
      }
    ],
    currentPageIndex: 0
  };
}

/** Migrate a v1 document (or any raw object) to the current v2 format. */
export function migrateDocument(raw: any): Document | null {
  if (!raw || typeof raw !== 'object') return null;

  // Already v2
  if (raw.version === 2 && Array.isArray(raw.pages)) {
    const doc = raw as Document;
    // Clamp index — treat missing/out-of-range as first page
    doc.currentPageIndex = Math.max(
      0,
      Math.min(doc.currentPageIndex ?? 0, doc.pages.length - 1)
    );
    // Backfill any page missing an id
    for (const p of doc.pages) {
      if (!p.id) p.id = uid('p');
      if (!p.nodes) p.nodes = {};
      if (!Array.isArray(p.order)) p.order = [];
    }
    return doc;
  }

  // v1-like: has page/nodes/order structure regardless of version field
  // covers: version === 1, version missing entirely, version wrong
  if (raw.page && typeof raw.page.width === 'number' && raw.nodes) {
    return {
      version: 2,
      pages: [
        {
          id: uid('p'),
          meta: {
            width: raw.page.width,
            height: raw.page.height ?? A4.height,
            background: raw.page.background ?? '#ffffff'
          },
          nodes: raw.nodes ?? {},
          order: Array.isArray(raw.order) ? raw.order : []
        }
      ],
      currentPageIndex: 0
    };
  }

  return null;
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
  if (d.version !== 2) return false;
  if (!Array.isArray(d.pages) || d.pages.length === 0) return false;
  if (typeof d.currentPageIndex !== 'number') return false;
  for (const page of d.pages) {
    if (!page.meta || typeof page.meta.width !== 'number' || typeof page.meta.height !== 'number') return false;
    if (!page.nodes || typeof page.nodes !== 'object') return false;
    if (!Array.isArray(page.order)) return false;
    for (const id of page.order) {
      if (!page.nodes[id]) return false;
    }
    for (const id of Object.keys(page.nodes)) {
      const n = page.nodes[id];
      if (!n || typeof n.id !== 'string' || typeof n.type !== 'string') return false;
      // Backfill group defaults for forward compatibility
      if (n.type === 'group') {
        if (!Array.isArray(n.children)) n.children = [];
        if (typeof n.innerW !== 'number') n.innerW = n.w;
        if (typeof n.innerH !== 'number') n.innerH = n.h;
      }
    }
  }
  return true;
}
