import classic from './classic.json';
import modern from './modern.json';
import creative from './creative.json';
import type { Document } from '@/types/document';

export interface TemplateEntry {
  id: string;
  name: string;
  description: string;
  doc: Document;
}

export const templates: TemplateEntry[] = [
  { id: 'classic', name: '经典单栏', description: '传统、稳重、适合大多数行业', doc: classic as Document },
  { id: 'modern',  name: '现代双栏', description: '深色侧栏，适合设计/产品', doc: modern as Document },
  { id: 'creative',name: '创意彩色', description: '活泼色彩，适合创意岗位', doc: creative as Document }
];
