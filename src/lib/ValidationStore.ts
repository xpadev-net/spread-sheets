import type {
  CellAddress,
  CellRange,
  CellValue,
  ValidationRule,
  ValidationResult,
} from "./types.ts";

function key(row: number, col: number): string {
  return `${row},${col}`;
}

/**
 * Validation rules per cell. Overlap semantics: at most one active rule per
 * cell — the most recent setValidation() call covering a cell wins.
 */
export class ValidationStore {
  #rules = new Map<string, ValidationRule>();

  setValidation(range: CellRange, rule: ValidationRule | null): void {
    for (let r = range.start.row; r <= range.end.row; r++) {
      for (let c = range.start.col; c <= range.end.col; c++) {
        const k = key(r, c);
        if (rule) this.#rules.set(k, rule);
        else this.#rules.delete(k);
      }
    }
  }

  getValidation(row: number, col: number): ValidationRule | null {
    return this.#rules.get(key(row, col)) ?? null;
  }

  getListOptions(address: CellAddress, rule: ValidationRule): string[] | null {
    if (rule.type !== "list") return null;
    return typeof rule.values === "function" ? rule.values(address) : rule.values;
  }

  evaluate(address: CellAddress, value: CellValue): ValidationResult {
    const rule = this.getValidation(address.row, address.col);
    if (!rule) return { ok: true, mode: "warn" };
    const mode = rule.mode ?? "warn";

    if (value === null) return { ok: true, mode };

    switch (rule.type) {
      case "list": {
        if (!rule.strict) return { ok: true, mode };
        const options = this.getListOptions(address, rule) ?? [];
        if (rule.multiple) {
          const parts = typeof value === "string" ? value.split(",").map((p) => p.trim()).filter((p) => p !== "") : [];
          const ok = parts.every((p) => options.includes(p));
          return ok
            ? { ok: true, mode }
            : { ok: false, mode, message: `Value must be a comma-separated list of: ${options.join(", ")}` };
        }
        const ok = typeof value === "string" && options.includes(value);
        return ok
          ? { ok: true, mode }
          : { ok: false, mode, message: `Value must be one of: ${options.join(", ")}` };
      }
      case "checkbox": {
        return typeof value === "boolean"
          ? { ok: true, mode }
          : { ok: false, mode, message: "Value must be true or false" };
      }
      case "number": {
        const num = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(num)) {
          return { ok: false, mode, message: "Value must be a number" };
        }
        if (rule.integer && !Number.isInteger(num)) {
          return { ok: false, mode, message: "Value must be an integer" };
        }
        if (rule.min !== undefined && num < rule.min) {
          return { ok: false, mode, message: `Value must be >= ${rule.min}` };
        }
        if (rule.max !== undefined && num > rule.max) {
          return { ok: false, mode, message: `Value must be <= ${rule.max}` };
        }
        return { ok: true, mode };
      }
      case "text": {
        const str = String(value);
        if (rule.maxLength !== undefined && str.length > rule.maxLength) {
          return { ok: false, mode, message: `Value must be at most ${rule.maxLength} characters` };
        }
        if (rule.pattern && !rule.pattern.test(str)) {
          return { ok: false, mode, message: "Value does not match the required pattern" };
        }
        return { ok: true, mode };
      }
      case "date": {
        const str = String(value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
          return { ok: false, mode, message: "Value must be a date in YYYY-MM-DD format" };
        }
        if (rule.min !== undefined && str < rule.min) {
          return { ok: false, mode, message: `Date must be on or after ${rule.min}` };
        }
        if (rule.max !== undefined && str > rule.max) {
          return { ok: false, mode, message: `Date must be on or before ${rule.max}` };
        }
        return { ok: true, mode };
      }
      case "custom": {
        const result = rule.validate(value, address);
        return result === true
          ? { ok: true, mode }
          : { ok: false, mode, message: result };
      }
    }
  }
}
