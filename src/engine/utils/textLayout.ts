import type { TextNode, TextRun } from '@/types/document';

interface LaidLine {
  segments: { run: TextRun; text: string; width: number }[];
  width: number;
  height: number;
  ascent: number;
}

interface LayoutCache {
  key: string;
  lines: LaidLine[];
  totalHeight: number;
}

const layoutCaches = new WeakMap<TextNode, LayoutCache>();

export function layoutText(ctx: CanvasRenderingContext2D, n: TextNode): LayoutCache {
  const key = cacheKey(n);
  const cached = layoutCaches.get(n);
  if (cached && cached.key === key) return cached;

  const lines: LaidLine[] = [];
  const baseSize = n.fontSize;
  const baseFamily = n.fontFamily;

  const currentLineSegs: LaidLine['segments'] = [];
  let currentWidth = 0;
  let currentMaxSize = baseSize;

  const flushLine = () => {
    const height = currentMaxSize * n.lineHeight;
    lines.push({
      segments: [...currentLineSegs],
      width: currentWidth,
      height,
      ascent: currentMaxSize * 0.8
    });
    currentLineSegs.length = 0;
    currentWidth = 0;
    currentMaxSize = baseSize;
  };

  for (const run of n.runs) {
    const size = run.fontSize ?? baseSize;
    const family = run.fontFamily ?? baseFamily;
    ctx.font = buildFont({ ...run, fontSize: size, fontFamily: family });

    // Split the run text by explicit newlines first
    const rawChunks = run.text.split('\n');
    for (let ci = 0; ci < rawChunks.length; ci++) {
      const chunk = rawChunks[ci];
      // Greedy word wrap
      const words = splitWords(chunk);
      for (const word of words) {
        const wWidth = ctx.measureText(word).width;
        if (currentWidth + wWidth > n.w && currentLineSegs.length > 0) {
          flushLine();
          ctx.font = buildFont({ ...run, fontSize: size, fontFamily: family });
        }
        // Append to current line (merge with last seg if same run)
        const last = currentLineSegs[currentLineSegs.length - 1];
        if (last && last.run === run) {
          last.text += word;
          last.width += wWidth;
        } else {
          currentLineSegs.push({ run, text: word, width: wWidth });
        }
        currentWidth += wWidth;
        if (size > currentMaxSize) currentMaxSize = size;
      }
      if (ci < rawChunks.length - 1) flushLine();
    }
  }
  if (currentLineSegs.length > 0 || lines.length === 0) flushLine();

  const totalHeight = lines.reduce((s, l) => s + l.height, 0);
  const result: LayoutCache = { key, lines, totalHeight };
  layoutCaches.set(n, result);
  return result;
}

function splitWords(text: string): string[] {
  // Split keeping spaces and CJK characters individually (CJK allows breaking anywhere)
  const out: string[] = [];
  let buf = '';
  for (const ch of text) {
    if (/[\s]/.test(ch)) {
      if (buf) { out.push(buf); buf = ''; }
      out.push(ch);
    } else if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) {
      if (buf) { out.push(buf); buf = ''; }
      out.push(ch);
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function buildFont(r: TextRun): string {
  const style = r.italic ? 'italic ' : '';
  const weight = r.bold ? '700 ' : '400 ';
  const size = (r.fontSize ?? 16) + 'px ';
  const family = r.fontFamily ?? 'sans-serif';
  return style + weight + size + family;
}

function cacheKey(n: TextNode): string {
  return [
    n.w,
    n.fontFamily,
    n.fontSize,
    n.lineHeight,
    n.align,
    n.color,
    JSON.stringify(n.runs)
  ].join('|');
}

export function drawText(ctx: CanvasRenderingContext2D, n: TextNode) {
  const layout = layoutText(ctx, n);
  ctx.textBaseline = 'alphabetic';
  let y = 0;
  for (const line of layout.lines) {
    let x = 0;
    if (n.align === 'center') x = (n.w - line.width) / 2;
    else if (n.align === 'right') x = n.w - line.width;

    const baseline = y + line.ascent;
    for (const seg of line.segments) {
      const run = seg.run;
      const size = run.fontSize ?? n.fontSize;
      const family = run.fontFamily ?? n.fontFamily;
      ctx.font = buildFont({ ...run, fontSize: size, fontFamily: family });
      ctx.fillStyle = run.color ?? n.color;
      ctx.fillText(seg.text, x, baseline);
      if (run.underline) {
        ctx.strokeStyle = ctx.fillStyle as string;
        ctx.lineWidth = Math.max(1, size / 16);
        ctx.beginPath();
        ctx.moveTo(x, baseline + 2);
        ctx.lineTo(x + seg.width, baseline + 2);
        ctx.stroke();
      }
      x += seg.width;
    }
    y += line.height;
  }
}
