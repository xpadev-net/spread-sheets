# @xpadev-net/spread-sheets

A React spreadsheet UI component: a Canvas-rendered grid with CJK-IME-safe cell
editing, per-cell/range data validation (including dropdown lists), rectangular
range selection, autofill, and paste support for external Google Sheets HTML
tables.

**Out of scope by design:** there is no formula/calculation engine, and no
file, network, or clipboard-backend persistence. This is purely an
input/output UI component — you own the data (`initialData` in, `getData()`
out) and any storage or computation around it.

**Live demo & docs:** https://xpadev-net.github.io/spread-sheets/

## Requirements

- React 19 (`react`, `react-dom` — declared as peer dependencies, not bundled)

## Installation

This package is not published to a registry. Build it locally and consume it
via a `file:` dependency or your package manager's workspace linking:

```bash
pnpm install
pnpm run pack   # builds dist/index.js, dist/index.d.ts, dist/index.css via tsdown
```

Then, from a consuming project's `package.json`:

```json
{
  "dependencies": {
    "@xpadev-net/spread-sheets": "file:../path/to/spread-sheets"
  }
}
```

## Quick start

```tsx
import { useRef } from "react";
import { Spreadsheet, type SpreadsheetHandle } from "@xpadev-net/spread-sheets";
import "@xpadev-net/spread-sheets/style.css";

function App() {
  const sheetRef = useRef<SpreadsheetHandle>(null);

  return (
    <div style={{ width: 800, height: 500 }}>
      <Spreadsheet
        ref={sheetRef}
        rows={100}
        cols={26}
        validations={[
          {
            range: { start: { row: 0, col: 2 }, end: { row: 99, col: 2 } },
            rule: { type: "list", values: ["Apple", "Banana", "Cherry"], strict: true, mode: "warn" },
          },
        ]}
        onChange={(e) => console.log("cell changed", e)}
      />
    </div>
  );
}
```

The `<Spreadsheet>` component sizes itself to fill its parent — give the
parent an explicit width/height (as above), a flex/grid layout, or similar.

## `<Spreadsheet>` props

| Prop | Type | Description |
| --- | --- | --- |
| `rows` | `number` | Row count. Fixed for the component's lifetime. |
| `cols` | `number` | Column count. Fixed for the component's lifetime. |
| `columns?` | `ColumnDef[]` | Per-column config, indexed by column. See [`ColumnDef`](#columndef). |
| `initialData?` | `CellValue[][]` | Initial cell values, `rows` × `cols`. `null` entries are empty cells. |
| `validations?` | `{ range: CellRange; rule: ValidationRule }[]` | Validation rules applied at mount. Later `setValidation` calls (via the ref) can add/change/remove rules at runtime. |
| `onChange?` | `(e: CellChangeEvent) => void` | Fires on every committed cell write, from any source (see [`CellChangeEvent`](#cellchangeevent)). |
| `onValidationError?` | `(e: ValidationErrorEvent) => void` | Fires when a written value fails its cell's validation rule — including `warn`-mode failures, which still commit. |
| `onSelectionChange?` | `(range: CellRange) => void` | Fires whenever the selected range changes. |

## Imperative API (`SpreadsheetHandle`)

Obtained via `ref`. Every value-mutating method funnels through the same
validation pipeline as user edits — an imperative `setValue` on a cell with a
`reject`-mode rule can fail exactly like a rejected keystroke would.

| Method | Description |
| --- | --- |
| `getValue(row, col): CellValue` | Reads a single cell. Throws `RangeError` if out of bounds. |
| `setValue(row, col, value): boolean` | Writes a single cell. Returns `false` only if a `reject`-mode rule blocked the write. |
| `getRangeValues(range): CellValue[][]` | Reads a rectangular range as a 2D array. |
| `setRangeValues(range, values): { applied: CellAddress[]; rejected: CellAddress[] }` | Writes a rectangular range; reports which cells were written vs. rejected. |
| `getData(): CellValue[][]` | Snapshot of the entire sheet, always `rows` × `cols`. |
| `setData(data)` | Replaces the entire sheet. `data` must be exactly `rows` × `cols` (throws `RangeError` otherwise). |
| `setValidation(range, rule \| null)` | Sets (or, with `null`, clears) the validation rule for every cell in `range`. Overlapping cells: the most recent call covering a cell wins. |
| `getValidation(row, col): ValidationRule \| null` | Reads the active rule for a cell. |
| `getSelection(): CellRange` | Reads the current selection. |
| `setSelection(range)` | Sets the current selection. |
| `getColumnWidth(col): number` / `setColumnWidth(col, width)` | Reads/sets a column's width in pixels. `setColumnWidth` pins the column the same way a manual drag-resize does. |
| `getRowHeight(row): number` / `setRowHeight(row, height)` | Reads/sets a row's height in pixels. `setRowHeight` pins the row against the automatic wrap-height growth described below. |
| `getColumnOverflow(col): TextOverflowMode` / `setColumnOverflow(col, mode)` | Reads/sets a column's text overflow behavior at runtime. |

## Types

### `CellValue`

```ts
type CellValue = string | number | boolean | null; // null = empty cell
```

### `CellAddress` / `CellRange`

```ts
type CellAddress = { row: number; col: number }; // 0-based
type CellRange = { start: CellAddress; end: CellAddress }; // inclusive
```

### `ColumnDef`

```ts
type ColumnDef = {
  width?: number;              // pixels; default 100
  header?: string;             // shown instead of the A/B/C… label; truncated with an ellipsis if it overflows
  overflow?: "ellipsis" | "wrap"; // default "ellipsis"
};
```

`columns` is indexed by column position — `columns[2]` configures column C
regardless of its `header` text. Omit an index (or pass `{}`) to use the
defaults for that column.

### `TextOverflowMode`

```ts
type TextOverflowMode = "ellipsis" | "wrap";
```

- **`ellipsis`** (default): text wider than the column is truncated with `…`.
  While editing, the edit box grows *horizontally* to show the full value
  (overlapping later columns), independent of the column's own width.
- **`wrap`**: text wraps within the column's width across multiple lines.
  Wrapping is **character-based**, not word-based — this is deliberate so
  CJK text (which has no spaces to break on) wraps correctly, at the cost of
  breaking mid-word for Latin text. A row still in "auto" height (i.e. never
  explicitly resized — see `setRowHeight`) grows automatically to fit the
  tallest wrapped cell in it, for both the committed display and the edit
  box while editing that cell.

### `ValidationRule`

A discriminated union on `type`. Every variant accepts an optional
`mode?: "reject" | "warn"` (default `"warn"`):

- **`"reject"`**: an invalid value is not written; the cell keeps its
  previous value.
- **`"warn"`**: an invalid value *is* written, and the cell shows a small red
  warning indicator. Hovering the cell, or selecting it (when not being
  edited), shows the validation message in a tooltip.

```ts
type ListValidationRule = {
  type: "list";
  values: string[] | ((ctx: CellAddress) => string[]);
  strict?: boolean; // when true, only listed values are valid; also enables the dropdown-only entry restriction
  mode?: "reject" | "warn";
};

type NumberValidationRule = {
  type: "number";
  min?: number;
  max?: number;
  integer?: boolean;
  mode?: "reject" | "warn";
};

type TextValidationRule = {
  type: "text";
  maxLength?: number;
  pattern?: RegExp;
  mode?: "reject" | "warn";
};

type DateValidationRule = {
  type: "date";
  min?: string; // 'YYYY-MM-DD'
  max?: string; // 'YYYY-MM-DD'
  mode?: "reject" | "warn";
};
// Calendar-date validation only — values are plain 'YYYY-MM-DD' strings.
// No Date object, no timezone conversion, no ISO datetime.

type CustomValidationRule = {
  type: "custom";
  validate: (value: CellValue, address: CellAddress) => true | string; // return an error message string to fail
  mode?: "reject" | "warn";
};
```

A `list` rule makes its cells dropdown-enabled: entering edit mode opens a
popup of the options, filtered live by whatever's been typed (case-insensitive
substring match) — the popup hides itself entirely if nothing matches. With
`strict: true`, free text that doesn't match an option is invalid per `mode`
above; without `strict`, any text is accepted and the list is offered purely
as a typing aid.

### `CellChangeEvent`

```ts
type CellChangeEvent = {
  address: CellAddress;
  oldValue: CellValue;
  newValue: CellValue;
  source: "edit" | "dropdown" | "fill" | "api" | "paste";
};
```

### `ValidationErrorEvent`

```ts
type ValidationErrorEvent = {
  address: CellAddress;
  value: CellValue;
  rule: ValidationRule;
  message: string;
  source: CellChangeEvent["source"];
};
```

## Interaction reference

| Action | Behavior |
| --- | --- |
| Click a cell | Selects it. |
| Click + drag | Selects a rectangular range. |
| Shift + click / Shift + Arrow | Extends the selection. |
| Click a column header | Selects the entire column. |
| Click a row header | Selects the entire row. |
| Drag across column/row headers | Extends a multi-column/row selection. |
| Drag a column/row header's edge | Resizes that column/row (pins it against wrap-mode auto-height, for rows). |
| Double-click a cell / `Enter` / `F2` | Opens the cell for editing with its existing value pre-filled. |
| Type directly on a selected cell | Opens the cell for editing, replacing its value — IME composition (e.g. Japanese, Chinese, Korean input) is fully supported here, including mid-composition edge cases like the box losing focus. |
| `Enter` / `Tab` (editing) | Commits and moves to the next row/column (`Shift` reverses direction). |
| `Escape` (editing) | Discards the edit. |
| `Delete` / `Backspace` (not editing) | Clears every cell in the current selection. |
| Cmd/Ctrl + `C` | Copies the selection (also mirrors to the OS clipboard as TSV, best-effort). |
| Cmd/Ctrl + `V` | Pastes into the selection. Prefers an HTML `<table>` clipboard flavor (what copying from the actual Google Sheets web page produces) over plain text; plain text falls back to comma/tab-delimited parsing. |
| Drag the small handle at the selection's bottom-right corner | Autofill: a single numeric cell increments by 1 per step; any other selection tiles its pattern into the dragged-over cells. This is this library's own simple rule, not a reimplementation of Excel/Sheets' pattern-detection autofill — there is no calculation engine here. |

## What this library intentionally does not do

- **No formulas or calculations.** Cells hold literal values only.
- **No persistence.** No file I/O, no network calls, no `localStorage`. Get
  the data out with `getData()`/`getRangeValues()` and store it however you
  like; put it back in with `initialData` or `setData()`.
- **No autofill pattern detection.** See the autofill row above.

## Development

```bash
pnpm install
pnpm run dev     # Vite dev server for the demo app (src/App.tsx)
pnpm run check   # tsc --noEmit
pnpm run build   # typecheck + build the demo app
pnpm run pack    # build the publishable library (dist/)
```
