import classic from './classic.json';
import modern from './modern.json';
import creative from './creative.json';
import { migrateDocument, createEmptyDocument, type Document } from '@/types/document';

export interface TemplateEntry {
  id: string;
  name: string;
  description: string;
  doc: Document;
}

function toDoc(raw: unknown): Document {
  // Templates are checked into source as v1; migrate at module load so consumers
  // (preview canvas, replaceDocument) always receive a valid v2 doc.
  return migrateDocument(JSON.parse(JSON.stringify(raw))) ?? createEmptyDocument();
}

export const templates: TemplateEntry[] = [
  { id: 'classic', name: '经典单栏', description: '传统、稳重、适合大多数行业', doc: toDoc(classic) },
  { id: 'modern',  name: '现代双栏', description: '深色侧栏，适合设计/产品', doc: toDoc(modern) },
  { id: 'creative',name: '创意彩色', description: '活泼色彩，适合创意岗位', doc: toDoc(creative) }
];
