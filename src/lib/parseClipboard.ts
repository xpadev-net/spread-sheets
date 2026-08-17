import { coerceValue } from "./coerceValue.ts";
import type { CellValue } from "./types.ts";

function normalizeRows(rows: string[][]): string[][] {
  const maxCols = Math.max(0, ...rows.map((row) => row.length));
  return rows.map((row) => row.concat(Array(maxCols - row.length).fill("")));
}

/**
 * External spreadsheets — Google Sheets in particular — put a text/html
 * <table> flavor on the clipboard alongside text/plain when you copy a
 * range from the actual web page (as opposed to copying from a native app).
 * Parsing that table preserves the 2D structure directly instead of
 * guessing a delimiter, so it's tried first.
 */
function parseHtmlTable(html: string): string[][] | null {
  if (!html.includes("<table")) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const trs = Array.from(doc.querySelectorAll("table tr"));
  if (trs.length === 0) return null;
  const rows = trs.map((tr) =>
    Array.from(tr.querySelectorAll("td, th")).map((cell) => (cell.textContent ?? "").trim()),
  );
  return rows.some((row) => row.length > 0) ? rows : null;
}

/** Plain-text fallback: detect comma vs. tab as the column delimiter, matching how Excel/Sheets write text/plain. */
function parseDelimitedText(text: string): string[][] | null {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return null;
  const commaCount = (text.match(/,/g) ?? []).length;
  const tabCount = (text.match(/\t/g) ?? []).length;
  const delimiter = tabCount >= commaCount ? "\t" : ",";
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
}

/**
 * Parses a paste ClipboardEvent's DataTransfer into a CellValue grid,
 * preferring an HTML <table> flavor over plain text when both are present.
 */
export function parseClipboardData(clipboardData: DataTransfer): CellValue[][] | null {
  const html = clipboardData.getData("text/html");
  let rows: string[][] | null = html ? parseHtmlTable(html) : null;

  if (!rows) {
    const text = clipboardData.getData("text/plain");
    rows = text ? parseDelimitedText(text) : null;
  }

  if (!rows || rows.length === 0) return null;
  return normalizeRows(rows).map((row) => row.map(coerceValue));
}
