// Shared between GridRenderer (canvas display) and EditorOverlay (the
// live edit box) so wrap/ellipsis line-breaking and sizing stay consistent
// between what's being typed and what gets rendered after commit.

export const LINE_HEIGHT = 16;
export const WRAP_VERTICAL_PADDING = 4;
export const CELL_PADDING_X = 6;

/** Truncates `text` with a trailing '…' so it fits within maxWidth, measured with ctx's current font. */
export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  if (ctx.measureText(ellipsis).width > maxWidth) return ellipsis;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

/**
 * Greedy character-by-character wrap (not word-based): CJK text has no
 * spaces to break on, and this library treats CJK as a first-class case
 * throughout, so wrapping by character is the one strategy that works for
 * both CJK and Latin text without a script-aware line-breaking algorithm.
 */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const ch of text) {
    const candidate = current + ch;
    if (current !== "" && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}
