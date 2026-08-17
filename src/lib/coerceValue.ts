import type { CellValue } from "./types.ts";

/**
 * Best-effort coercion of user-typed or pasted text into a CellValue:
 * numeric-looking strings become numbers, empty becomes null, everything
 * else stays a string.
 */
export function coerceValue(raw: string): CellValue {
  if (raw === "") return null;
  const trimmed = raw.trim();
  if (trimmed !== "" && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }
  return raw;
}
