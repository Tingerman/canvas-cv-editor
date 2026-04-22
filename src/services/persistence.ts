import type { Document } from '@/types/document';
import { validateDocument } from '@/types/document';

const KEY = 'cv-editor.document.v1';

export function saveDocument(doc: Document) {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
}

export function loadDocument(): Document | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return validateDocument(obj) ? (obj as Document) : null;
  } catch {
    return null;
  }
}

export function clearDocument() {
  localStorage.removeItem(KEY);
}

export function debounce<F extends (...args: any[]) => void>(fn: F, ms: number): F {
  let t: number | undefined;
  return ((...args: any[]) => {
    if (t !== undefined) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  }) as F;
}
