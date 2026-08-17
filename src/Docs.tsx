import type React from "react";

const styles = {
  page: {
    maxWidth: 860,
    margin: "0 auto",
    padding: "8px 16px 64px",
    lineHeight: 1.6,
    color: "#202124",
    // Explicit light background: the page otherwise inherits whatever is
    // behind it (e.g. a dark host page), making this dark text unreadable —
    // same class of bug as the canvas needing its own background fill.
    background: "#ffffff",
    minHeight: "100%",
  } satisfies React.CSSProperties,
  h2: {
    fontSize: 20,
    marginTop: 40,
    marginBottom: 8,
    borderBottom: "1px solid #dadce0",
    paddingBottom: 6,
  } satisfies React.CSSProperties,
  h3: {
    fontSize: 15,
    marginTop: 24,
    marginBottom: 6,
  } satisfies React.CSSProperties,
  p: {
    fontSize: 14,
    margin: "8px 0",
  } satisfies React.CSSProperties,
  code: {
    background: "#f1f3f4",
    borderRadius: 3,
    padding: "1px 5px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12.5,
  } satisfies React.CSSProperties,
  pre: {
    background: "#f8f9fa",
    border: "1px solid #dadce0",
    borderRadius: 6,
    padding: 12,
    overflowX: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12.5,
    lineHeight: 1.5,
  } satisfies React.CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    margin: "8px 0 16px",
  } satisfies React.CSSProperties,
  th: {
    textAlign: "left",
    borderBottom: "2px solid #dadce0",
    padding: "6px 8px",
    background: "#f8f9fa",
  } satisfies React.CSSProperties,
  td: {
    textAlign: "left",
    borderBottom: "1px solid #e8eaed",
    padding: "6px 8px",
    verticalAlign: "top",
  } satisfies React.CSSProperties,
};

function Pre({ children }: { children: string }) {
  return (
    <pre style={styles.pre}>
      <code>{children}</code>
    </pre>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} style={styles.th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} style={styles.td}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function C({ children }: { children: string }) {
  return <code style={styles.code}>{children}</code>;
}

export function Docs() {
  return (
    <div style={styles.page}>
      <p style={styles.p}>
        A React spreadsheet UI component: a Canvas-rendered grid with CJK-IME-safe cell editing, per-cell/range data
        validation (including dropdown lists), rectangular range selection, autofill, and paste support for external
        Google Sheets HTML tables.
      </p>
      <p style={styles.p}>
        <strong>Out of scope by design:</strong> there is no formula/calculation engine, and no file, network, or
        clipboard-backend persistence. This is purely an input/output UI component — you own the data (
        <C>initialData</C> in, <C>getData()</C> out) and any storage or computation around it.
      </p>

      <h2 style={styles.h2}>Requirements</h2>
      <p style={styles.p}>
        React 19 (<C>react</C>, <C>react-dom</C> — declared as peer dependencies, not bundled).
      </p>

      <h2 style={styles.h2}>Installation</h2>
      <p style={styles.p}>
        This package is not published to a registry. Build it locally and consume it via a <C>file:</C> dependency or
        your package manager's workspace linking:
      </p>
      <Pre>{`pnpm install\npnpm run pack   # builds dist/index.js, dist/index.d.ts, dist/index.css via tsdown`}</Pre>
      <p style={styles.p}>Then, from a consuming project's package.json:</p>
      <Pre>{`{\n  "dependencies": {\n    "@xpadev-net/spread-sheets": "file:../path/to/spread-sheets"\n  }\n}`}</Pre>

      <h2 style={styles.h2}>Quick start</h2>
      <Pre>{`import { useRef } from "react";
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
}`}</Pre>
      <p style={styles.p}>
        The <C>&lt;Spreadsheet&gt;</C> component sizes itself to fill its parent — give the parent an explicit
        width/height, a flex/grid layout, or similar.
      </p>

      <h2 style={styles.h2}>{"<Spreadsheet> props"}</h2>
      <Table
        head={["Prop", "Type", "Description"]}
        rows={[
          [<C key="a">rows</C>, <C key="b">number</C>, "Row count. Fixed for the component's lifetime."],
          [<C key="a">cols</C>, <C key="b">number</C>, "Column count. Fixed for the component's lifetime."],
          [
            <C key="a">columns?</C>,
            <C key="b">ColumnDef[]</C>,
            "Per-column config, indexed by column. See ColumnDef below.",
          ],
          [
            <C key="a">initialData?</C>,
            <C key="b">CellValue[][]</C>,
            <>
              Initial cell values, <C>rows</C> × <C>cols</C>. <C>null</C> entries are empty cells.
            </>,
          ],
          [
            <C key="a">validations?</C>,
            <C key="b">{"{ range: CellRange; rule: ValidationRule }[]"}</C>,
            "Validation rules applied at mount. Later setValidation calls (via the ref) can add/change/remove rules at runtime.",
          ],
          [
            <C key="a">onChange?</C>,
            <C key="b">(e: CellChangeEvent) =&gt; void</C>,
            "Fires on every committed cell write, from any source.",
          ],
          [
            <C key="a">onValidationError?</C>,
            <C key="b">(e: ValidationErrorEvent) =&gt; void</C>,
            "Fires when a written value fails its cell's validation rule — including warn-mode failures, which still commit.",
          ],
          [
            <C key="a">onSelectionChange?</C>,
            <C key="b">(range: CellRange) =&gt; void</C>,
            "Fires whenever the selected range changes.",
          ],
        ]}
      />

      <h2 style={styles.h2}>Imperative API (SpreadsheetHandle)</h2>
      <p style={styles.p}>
        Obtained via <C>ref</C>. Every value-mutating method funnels through the same validation pipeline as user
        edits — an imperative <C>setValue</C> on a cell with a <C>reject</C>-mode rule can fail exactly like a
        rejected keystroke would.
      </p>
      <Table
        head={["Method", "Description"]}
        rows={[
          [<C key="a">getValue(row, col): CellValue</C>, "Reads a single cell. Throws RangeError if out of bounds."],
          [
            <C key="a">setValue(row, col, value): boolean</C>,
            "Writes a single cell. Returns false only if a reject-mode rule blocked the write.",
          ],
          [<C key="a">getRangeValues(range): CellValue[][]</C>, "Reads a rectangular range as a 2D array."],
          [
            <C key="a">setRangeValues(range, values)</C>,
            "Writes a rectangular range; returns { applied, rejected } cell address lists.",
          ],
          [<C key="a">getData(): CellValue[][]</C>, "Snapshot of the entire sheet, always rows × cols."],
          [
            <C key="a">setData(data)</C>,
            "Replaces the entire sheet. data must be exactly rows × cols (throws RangeError otherwise).",
          ],
          [
            <C key="a">setValidation(range, rule | null)</C>,
            "Sets (or clears, with null) the validation rule for every cell in range. Overlapping cells: the most recent call wins.",
          ],
          [<C key="a">getValidation(row, col)</C>, "Reads the active rule for a cell."],
          [<C key="a">getSelection(): CellRange</C>, "Reads the current selection."],
          [<C key="a">setSelection(range)</C>, "Sets the current selection."],
          [
            <C key="a">getColumnWidth / setColumnWidth</C>,
            "Reads/sets a column's width in pixels. setColumnWidth pins the column like a manual drag-resize.",
          ],
          [
            <C key="a">getRowHeight / setRowHeight</C>,
            "Reads/sets a row's height in pixels. setRowHeight pins the row against automatic wrap-height growth.",
          ],
          [
            <C key="a">getColumnOverflow / setColumnOverflow</C>,
            "Reads/sets a column's text overflow behavior at runtime.",
          ],
        ]}
      />

      <h2 style={styles.h2}>Types</h2>

      <h3 style={styles.h3}>CellValue</h3>
      <Pre>{`type CellValue = string | number | boolean | null; // null = empty cell`}</Pre>

      <h3 style={styles.h3}>CellAddress / CellRange</h3>
      <Pre>{`type CellAddress = { row: number; col: number }; // 0-based
type CellRange = { start: CellAddress; end: CellAddress }; // inclusive`}</Pre>

      <h3 style={styles.h3}>ColumnDef</h3>
      <Pre>{`type ColumnDef = {
  width?: number;              // pixels; default 100
  header?: string;             // shown instead of the A/B/C… label; ellipsized if it overflows
  overflow?: "ellipsis" | "wrap"; // default "ellipsis"
};`}</Pre>
      <p style={styles.p}>
        <C>columns</C> is indexed by column position — <C>columns[2]</C> configures column C regardless of its{" "}
        <C>header</C> text. Omit an index (or pass <C>{"{}"}</C>) to use the defaults for that column.
      </p>

      <h3 style={styles.h3}>TextOverflowMode</h3>
      <Pre>{`type TextOverflowMode = "ellipsis" | "wrap";`}</Pre>
      <p style={styles.p}>
        <strong>ellipsis</strong> (default): text wider than the column is truncated with "…". While editing, the
        edit box grows horizontally to show the full value (overlapping later columns), independent of the column's
        own width.
      </p>
      <p style={styles.p}>
        <strong>wrap</strong>: text wraps within the column's width across multiple lines. Wrapping is{" "}
        <strong>character-based</strong>, not word-based — deliberate, so CJK text (no spaces to break on) wraps
        correctly, at the cost of breaking mid-word for Latin text. A row still in "auto" height (never explicitly
        resized — see <C>setRowHeight</C>) grows automatically to fit the tallest wrapped cell in it, both for the
        committed display and the edit box while editing that cell.
      </p>

      <h3 style={styles.h3}>ValidationRule</h3>
      <p style={styles.p}>
        A discriminated union on <C>type</C>. Every variant accepts an optional{" "}
        <C>mode?: "reject" | "warn"</C> (default <C>"warn"</C>):
      </p>
      <ul style={styles.p}>
        <li>
          <strong>"reject"</strong>: an invalid value is not written; the cell keeps its previous value.
        </li>
        <li>
          <strong>"warn"</strong>: an invalid value is written, and the cell shows a small red warning indicator.
          Hovering the cell, or selecting it (when not being edited), shows the validation message in a tooltip.
        </li>
      </ul>
      <Pre>{`type ListValidationRule = {
  type: "list";
  values: string[] | ((ctx: CellAddress) => string[]);
  strict?: boolean; // when true, only listed values are valid; also enables dropdown-only entry
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
// Calendar-date validation only — plain 'YYYY-MM-DD' strings.
// No Date object, no timezone conversion, no ISO datetime.

type CustomValidationRule = {
  type: "custom";
  validate: (value: CellValue, address: CellAddress) => true | string; // return an error message to fail
  mode?: "reject" | "warn";
};`}</Pre>
      <p style={styles.p}>
        A <C>list</C> rule makes its cells dropdown-enabled: entering edit mode opens a popup of the options,
        filtered live by whatever's been typed (case-insensitive substring match) — the popup hides itself entirely
        if nothing matches. With <C>strict: true</C>, free text that doesn't match an option is invalid per{" "}
        <C>mode</C> above; without <C>strict</C>, any text is accepted and the list is offered purely as a typing
        aid.
      </p>

      <h3 style={styles.h3}>CellChangeEvent</h3>
      <Pre>{`type CellChangeEvent = {
  address: CellAddress;
  oldValue: CellValue;
  newValue: CellValue;
  source: "edit" | "dropdown" | "fill" | "api" | "paste";
};`}</Pre>

      <h3 style={styles.h3}>ValidationErrorEvent</h3>
      <Pre>{`type ValidationErrorEvent = {
  address: CellAddress;
  value: CellValue;
  rule: ValidationRule;
  message: string;
  source: CellChangeEvent["source"];
};`}</Pre>

      <h2 style={styles.h2}>Interaction reference</h2>
      <Table
        head={["Action", "Behavior"]}
        rows={[
          ["Click a cell", "Selects it."],
          ["Click + drag", "Selects a rectangular range."],
          ["Shift + click / Shift + Arrow", "Extends the selection."],
          ["Click a column header", "Selects the entire column."],
          ["Click a row header", "Selects the entire row."],
          ["Drag across column/row headers", "Extends a multi-column/row selection."],
          [
            "Drag a column/row header's edge",
            "Resizes that column/row (pins it against wrap-mode auto-height, for rows).",
          ],
          ["Double-click a cell / Enter / F2", "Opens the cell for editing with its existing value pre-filled."],
          [
            "Type directly on a selected cell",
            "Opens the cell for editing, replacing its value — IME composition (Japanese, Chinese, Korean input, etc.) is fully supported, including mid-composition edge cases like the box losing focus.",
          ],
          ["Enter / Tab (editing)", "Commits and moves to the next row/column (Shift reverses direction)."],
          ["Escape (editing)", "Discards the edit."],
          ["Delete / Backspace (not editing)", "Clears every cell in the current selection."],
          ["Cmd/Ctrl + C", "Copies the selection (also mirrors to the OS clipboard as TSV, best-effort)."],
          [
            "Cmd/Ctrl + V",
            "Pastes into the selection. Prefers an HTML <table> clipboard flavor (what copying from the actual Google Sheets web page produces) over plain text; plain text falls back to comma/tab-delimited parsing.",
          ],
          [
            "Drag the small handle at the selection's bottom-right corner",
            "Autofill: a single numeric cell increments by 1 per step; any other selection tiles its pattern into the dragged-over cells. This library's own simple rule, not a reimplementation of Excel/Sheets' pattern-detection autofill.",
          ],
        ]}
      />

      <h2 style={styles.h2}>What this library intentionally does not do</h2>
      <ul style={styles.p}>
        <li>
          <strong>No formulas or calculations.</strong> Cells hold literal values only.
        </li>
        <li>
          <strong>No persistence.</strong> No file I/O, no network calls, no localStorage. Get the data out with{" "}
          <C>getData()</C>/<C>getRangeValues()</C> and store it however you like; put it back in with{" "}
          <C>initialData</C> or <C>setData()</C>.
        </li>
        <li>
          <strong>No autofill pattern detection.</strong> See the autofill row above.
        </li>
      </ul>
    </div>
  );
}
