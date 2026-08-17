import { useRef, useState } from "react";
import { Spreadsheet, type SpreadsheetHandle, type CellChangeEvent, type ValidationErrorEvent } from "./lib/index.ts";

const ROWS = 30;
const COLS = 8;

const FRUITS = ["Apple", "Banana", "Cherry", "Durian", "Elderberry"];

const initialData: (string | number | boolean | null)[][] = Array.from({ length: ROWS }, () =>
  Array<string | number | boolean | null>(COLS).fill(null),
);
initialData[0][4] =
  "This is a deliberately long piece of text meant to overflow the column width so overflow handling can be checked";

export function Demo() {
  const sheetRef = useRef<SpreadsheetHandle>(null);
  const [log, setLog] = useState<string[]>([]);
  const [wrapColE, setWrapColE] = useState(false);

  function pushLog(line: string) {
    setLog((prev) => [line, ...prev].slice(0, 12));
  }

  function handleChange(e: CellChangeEvent) {
    pushLog(
      `change @(${e.address.row},${e.address.col}) [${e.source}] ${JSON.stringify(e.oldValue)} -> ${JSON.stringify(e.newValue)}`,
    );
  }

  function handleValidationError(e: ValidationErrorEvent) {
    pushLog(`validation @(${e.address.row},${e.address.col}) [${e.source}] ${e.message}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", boxSizing: "border-box" }}>
      <div>
        <h1 style={{ fontSize: 18, margin: 0 }}>Spreadsheet library demo</h1>
        <p style={{ margin: "4px 0", color: "#5f6368", fontSize: 13 }}>
          Column C (fruit): dropdown list validation, warn-only. Column D (score): number 0-100, warn-only. Type
          Japanese via IME to check composition handling. Drag the small blue handle at the bottom-right of the
          selection to autofill. Select a range and press Cmd/Ctrl+C to copy, then select a (optionally larger)
          range and press Cmd/Ctrl+V to paste. Drag a column/row header's edge to resize it. Column E (row 1) has
          overflowing text — toggle it between ellipsis and wrap below.
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 0, border: "1px solid #dadce0", borderRadius: 4 }}>
        <Spreadsheet
          ref={sheetRef}
          rows={ROWS}
          cols={COLS}
          initialData={initialData}
          columns={[{ header: "Name" }, {}, { header: "Fruit" }, { header: "Score" }]}
          validations={[
            {
              range: { start: { row: 0, col: 2 }, end: { row: ROWS - 1, col: 2 } },
              rule: { type: "list", values: FRUITS, strict: true, mode: "warn" },
            },
            {
              range: { start: { row: 0, col: 3 }, end: { row: ROWS - 1, col: 3 } },
              rule: { type: "number", min: 0, max: 100, mode: "warn" },
            },
          ]}
          onChange={handleChange}
          onValidationError={handleValidationError}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            const data = sheetRef.current?.getData();
            pushLog(`getData() -> ${JSON.stringify(data?.[0])} ...`);
          }}
        >
          Log row 0 via getData()
        </button>
        <button
          type="button"
          onClick={() => {
            sheetRef.current?.setValue(0, 0, "Hello");
          }}
        >
          setValue(0,0,"Hello")
        </button>
        <button
          type="button"
          onClick={() => {
            const next = !wrapColE;
            sheetRef.current?.setColumnOverflow(4, next ? "wrap" : "ellipsis");
            setWrapColE(next);
          }}
        >
          Column E overflow: {wrapColE ? "wrap" : "ellipsis"} (click to toggle)
        </button>
      </div>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          background: "#f8f9fa",
          border: "1px solid #dadce0",
          borderRadius: 4,
          padding: 8,
          height: 140,
          overflowY: "auto",
        }}
      >
        {log.length === 0 ? <div style={{ color: "#9aa0a6" }}>Events will appear here…</div> : null}
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
