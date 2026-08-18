import type React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { DataModel } from "./DataModel.ts";
import { ValidationStore } from "./ValidationStore.ts";
import { SelectionManager } from "./SelectionManager.ts";
import { GridRenderer, HEADER_HEIGHT, HEADER_WIDTH } from "./GridRenderer.ts";
import { commitCellValue } from "./commitCellValue.ts";
import { coerceValue } from "./coerceValue.ts";
import { fillRange } from "./fillRange.ts";
import { HistoryManager, type HistoryBatch } from "./HistoryManager.ts";
import { parseClipboardData } from "./parseClipboard.ts";
import { EditorOverlay, type EditorOverlayHandle } from "./EditorOverlay.tsx";
import { DropdownOverlay } from "./DropdownOverlay.tsx";
import { FillHandle } from "./FillHandle.tsx";
import { WarningTooltip } from "./WarningTooltip.tsx";
import {
  type CellAddress,
  type CellChangeEvent,
  type CellChangeSource,
  type CellRange,
  type CellValue,
  type ColumnDef,
  type TextOverflowMode,
  type ValidationErrorEvent,
  type ValidationRule,
  normalizeRange,
} from "./types.ts";

export type SpreadsheetProps = {
  rows: number;
  cols: number;
  columns?: ColumnDef[];
  initialData?: CellValue[][];
  validations?: { range: CellRange; rule: ValidationRule }[];
  onChange?: (e: CellChangeEvent) => void;
  onValidationError?: (e: ValidationErrorEvent) => void;
  onSelectionChange?: (range: CellRange) => void;
};

export type SpreadsheetHandle = {
  getValue: (row: number, col: number) => CellValue;
  setValue: (row: number, col: number, value: CellValue) => boolean;
  getRangeValues: (range: CellRange) => CellValue[][];
  setRangeValues: (
    range: CellRange,
    values: CellValue[][],
  ) => { applied: CellAddress[]; rejected: CellAddress[] };
  getData: () => CellValue[][];
  setData: (data: CellValue[][]) => void;
  setValidation: (range: CellRange, rule: ValidationRule | null) => void;
  getValidation: (row: number, col: number) => ValidationRule | null;
  getSelection: () => CellRange;
  setSelection: (range: CellRange) => void;
  getColumnWidth: (col: number) => number;
  setColumnWidth: (col: number, width: number) => void;
  getRowHeight: (row: number) => number;
  setRowHeight: (row: number, height: number) => void;
  getColumnOverflow: (col: number) => TextOverflowMode;
  setColumnOverflow: (col: number, mode: TextOverflowMode) => void;
};

/** TSV is the lingua franca for spreadsheet clipboard interop (Excel/Sheets both read/write it). */
function toTSV(values: CellValue[][]): string {
  return values.map((row) => row.map((v) => (v === null ? "" : String(v))).join("\t")).join("\n");
}

/**
 * Splits a multi-select editor's raw text into the already-committed
 * comma-separated picks and the trailing, still-being-typed token — e.g.
 * "Urgent, Ba" -> confirmed ["Urgent"], currentToken "Ba". Used to filter
 * the dropdown by what's actively being typed (not the whole string) and
 * to know what a dropdown pick should splice into.
 */
function splitMultiSelectInput(text: string): { confirmed: string[]; currentToken: string } {
  const rawParts = text.split(",");
  const currentToken = (rawParts[rawParts.length - 1] ?? "").trim();
  const confirmed = rawParts
    .slice(0, -1)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return { confirmed, currentToken };
}

export const Spreadsheet = forwardRef<SpreadsheetHandle, SpreadsheetProps>(function Spreadsheet(
  props,
  ref,
) {
  const { rows, cols, columns, initialData, validations, onChange, onValidationError, onSelectionChange } =
    props;

  const dataModelRef = useRef<DataModel | null>(null);
  if (!dataModelRef.current) dataModelRef.current = new DataModel(rows, cols, initialData);
  const dataModel = dataModelRef.current;

  const validationStoreRef = useRef<ValidationStore | null>(null);
  if (!validationStoreRef.current) {
    const store = new ValidationStore();
    if (validations) {
      for (const v of validations) store.setValidation(v.range, v.rule);
    }
    validationStoreRef.current = store;
  }
  const validationStore = validationStoreRef.current;

  const selectionManagerRef = useRef<SelectionManager | null>(null);
  if (!selectionManagerRef.current) selectionManagerRef.current = new SelectionManager(rows, cols);
  const selectionManager = selectionManagerRef.current;

  const historyRef = useRef<HistoryManager | null>(null);
  if (!historyRef.current) historyRef.current = new HistoryManager();
  const history = historyRef.current;

  const gridRendererRef = useRef<GridRenderer | null>(null);
  if (!gridRendererRef.current) gridRendererRef.current = new GridRenderer(dataModel, columns, validationStore);
  const gridRenderer = gridRendererRef.current;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<EditorOverlayHandle>(null);

  const isComposingRef = useRef(false);
  const pendingBlurRef = useRef<"commit" | null>(null);
  // The column a Tab run started from, so a following Enter returns to it
  // (next row) instead of continuing down whatever column Tab left you on —
  // matches Excel/Sheets. null whenever the selection last changed via
  // something other than Tab (click, arrow keys, ...).
  const tabHomeColRef = useRef<number | null>(null);
  const scrollRef = useRef({ left: 0, top: 0 });
  const dprRef = useRef(1);
  const dragSelectingRef = useRef(false);
  // What a drag-select extends: a plain cell range, or a header drag that
  // extends whole columns/rows regardless of where the pointer strays.
  const dragModeRef = useRef<"cell" | "col" | "row">("cell");
  const resizingRef = useRef<{ type: "col" | "row"; index: number; startCoord: number; startSize: number } | null>(
    null,
  );
  const rafRef = useRef<number | null>(null);
  const clipboardRef = useRef<CellValue[][] | null>(null);
  // Set right before a dropdown-driven value change (a multi-select pick
  // splicing the picked value into the text) so the resulting onValueChange
  // doesn't reset the arrow/Tab-navigated highlight back to -1 — only an
  // actual user keystroke should do that.
  const preserveDropdownHighlightRef = useRef(false);

  const [, bumpVersion] = useReducer((n: number) => n + 1, 0);
  const [editing, setEditing] = useState(false);
  const [dropdownHighlight, setDropdownHighlight] = useState(-1);
  const [fillPreview, setFillPreview] = useState<CellRange | null>(null);
  const [hoveredCell, setHoveredCell] = useState<CellAddress | null>(null);
  // Drives dropdown filtering — mirrors the editor's live text without
  // making the (IME-critical, uncontrolled) editor value itself controlled.
  const [filterText, setFilterText] = useState("");

  const commitCtx = useMemo(
    () => ({
      dataModel,
      validationStore,
      onChange: (e: CellChangeEvent) => onChange?.(e),
      onValidationError: (e: ValidationErrorEvent) => onValidationError?.(e),
    }),
    [dataModel, validationStore, onChange, onValidationError],
  );

  /**
   * Wraps commitCellValue for every write site and records everything that
   * actually landed as a single undo/redo step — a whole fill, paste, or
   * delete undoes together, matching Excel/Sheets rather than undoing one
   * cell at a time.
   */
  function commitCells(
    pairs: { address: CellAddress; value: CellValue; source: CellChangeSource }[],
  ): HistoryBatch {
    const batch: HistoryBatch = [];
    for (const { address, value, source } of pairs) {
      const oldValue = dataModel.getValue(address.row, address.col);
      const ok = commitCellValue(address, value, source, commitCtx);
      if (ok) batch.push({ address, oldValue, newValue: value, source });
    }
    if (batch.length > 0) history.push(batch);
    return batch;
  }

  function applyHistoryBatch(batch: HistoryBatch, direction: "undo" | "redo") {
    for (const entry of batch) {
      const value = direction === "undo" ? entry.oldValue : entry.newValue;
      commitCellValue(entry.address, value, entry.source, commitCtx);
    }
    const rows = batch.map((e) => e.address.row);
    const cols = batch.map((e) => e.address.col);
    selectionManager.setRange({
      start: { row: Math.min(...rows), col: Math.min(...cols) },
      end: { row: Math.max(...rows), col: Math.max(...cols) },
    });
  }

  function handleUndo() {
    const batch = history.undo();
    if (batch) applyHistoryBatch(batch, "undo");
  }

  function handleRedo() {
    const batch = history.redo();
    if (batch) applyHistoryBatch(batch, "redo");
  }

  const drawNow = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gridRenderer.draw(ctx, {
      scrollLeft: scrollRef.current.left,
      scrollTop: scrollRef.current.top,
      viewportWidth: container.clientWidth,
      viewportHeight: container.clientHeight,
      selection: selectionManager.getRange(),
      activeCell: selectionManager.focus,
    });
    bumpVersion();
  }, [gridRenderer, selectionManager]);

  const requestRedraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawNow();
    });
  }, [drawNow]);

  useEffect(() => {
    const offData = dataModel.onChange(() => requestRedraw());
    const offSel = selectionManager.onChange((range) => {
      requestRedraw();
      onSelectionChange?.(range);
    });
    return () => {
      offData();
      offSel();
    };
  }, [dataModel, selectionManager, requestRedraw, onSelectionChange]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    function applySize() {
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      const width = container!.clientWidth;
      const height = container!.clientHeight;
      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.max(1, Math.round(height * dpr));
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      requestRedraw();
    }

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [requestRedraw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function handleScroll() {
      scrollRef.current = { left: container!.scrollLeft, top: container!.scrollTop };
      requestRedraw();
    }
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [requestRedraw]);

  useEffect(() => {
    editorRef.current?.focusCatcher();
  }, []);

  const toCanvasLocal = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return { x: clientX - bounds.left, y: clientY - bounds.top };
  }, []);

  const toCellAddress = useCallback(
    (clientX: number, clientY: number): CellAddress | null => {
      const local = toCanvasLocal(clientX, clientY);
      if (!local) return null;
      return gridRenderer.hitTest(local.x, local.y, scrollRef.current.left, scrollRef.current.top);
    },
    [gridRenderer, toCanvasLocal],
  );

  function beginExistingEdit(address: CellAddress) {
    const value = dataModel.getValue(address.row, address.col);
    editorRef.current?.beginExisting(value === null ? "" : String(value));
    setEditing(true);
    setDropdownHighlight(-1);
  }

  /**
   * coerceValue plus, for a multi-select cell, collapsing the raw typed
   * text down to a clean comma-list — drops the trailing ", " a dropdown
   * pick leaves for the next token, stray blank entries, and extra
   * whitespace, so what lands in the cell always matches what a dropdown
   * pick alone would have produced.
   */
  function coerceEditValue(address: CellAddress, raw: string): CellValue {
    const rule = validationStore.getValidation(address.row, address.col);
    if (rule?.type === "list" && rule.multiple) {
      const { confirmed, currentToken } = splitMultiSelectInput(raw);
      const parts = currentToken !== "" ? [...confirmed, currentToken] : confirmed;
      return parts.length > 0 ? parts.join(", ") : null;
    }
    return coerceValue(raw);
  }

  function commitEditIfAny() {
    if (!editing) return;
    const value = editorRef.current?.getValue() ?? "";
    const address = selectionManager.focus;
    commitCells([{ address, value: coerceEditValue(address, value), source: "edit" }]);
    setEditing(false);
  }

  function toggleCheckbox(address: CellAddress) {
    const current = dataModel.getValue(address.row, address.col);
    commitCells([{ address, value: current !== true, source: "edit" }]);
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    // preventDefault() first, always — even when frozen, this stops the
    // browser's native mousedown-blur from stealing focus off the editor
    // input and interrupting an in-progress composition.
    e.preventDefault();
    if (isComposingRef.current) return; // composition freeze invariant
    setHoveredCell(null);
    tabHomeColRef.current = null;

    const local = toCanvasLocal(e.clientX, e.clientY);
    if (!local) return;

    const colBoundary = gridRenderer.hitTestColumnBoundary(local.x, local.y, scrollRef.current.left);
    if (colBoundary !== null) {
      commitEditIfAny();
      resizingRef.current = {
        type: "col",
        index: colBoundary,
        startCoord: e.clientX,
        startSize: gridRenderer.getColWidth(colBoundary),
      };
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    const rowBoundary = gridRenderer.hitTestRowBoundary(local.x, local.y, scrollRef.current.top);
    if (rowBoundary !== null) {
      commitEditIfAny();
      resizingRef.current = {
        type: "row",
        index: rowBoundary,
        startCoord: e.clientY,
        startSize: gridRenderer.getRowHeight(rowBoundary),
      };
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    const headerHit = gridRenderer.hitTestHeader(local.x, local.y, scrollRef.current.left, scrollRef.current.top);
    if (headerHit) {
      commitEditIfAny();
      canvasRef.current?.setPointerCapture(e.pointerId);
      dragSelectingRef.current = true;
      dragModeRef.current = headerHit.type;
      if (headerHit.type === "col") {
        const anchorCol = e.shiftKey ? selectionManager.anchor.col : headerHit.index;
        selectionManager.setRange({
          start: { row: 0, col: anchorCol },
          end: { row: dataModel.rows - 1, col: headerHit.index },
        });
      } else {
        const anchorRow = e.shiftKey ? selectionManager.anchor.row : headerHit.index;
        selectionManager.setRange({
          start: { row: anchorRow, col: 0 },
          end: { row: headerHit.index, col: dataModel.cols - 1 },
        });
      }
      editorRef.current?.focusCatcher();
      return;
    }

    const address = toCellAddress(e.clientX, e.clientY);
    if (!address) return;

    commitEditIfAny();

    canvasRef.current?.setPointerCapture(e.pointerId);
    dragSelectingRef.current = true;
    dragModeRef.current = "cell";
    selectionManager.moveTo(address, e.shiftKey);
    if (!e.shiftKey && validationStore.getValidation(address.row, address.col)?.type === "checkbox") {
      toggleCheckbox(address);
    }
    editorRef.current?.focusCatcher();
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const resize = resizingRef.current;
    if (resize) {
      if (resize.type === "col") {
        gridRenderer.setColWidth(resize.index, resize.startSize + (e.clientX - resize.startCoord));
      } else {
        gridRenderer.setRowHeight(resize.index, resize.startSize + (e.clientY - resize.startCoord));
      }
      requestRedraw();
      return;
    }

    if (dragSelectingRef.current) {
      if (isComposingRef.current) return;
      const local = toCanvasLocal(e.clientX, e.clientY);
      if (!local) return;
      if (dragModeRef.current === "col") {
        const col = gridRenderer.columnAtCanvasX(local.x, scrollRef.current.left);
        selectionManager.setRange({
          start: { row: 0, col: selectionManager.anchor.col },
          end: { row: dataModel.rows - 1, col },
        });
        return;
      }
      if (dragModeRef.current === "row") {
        const row = gridRenderer.rowAtCanvasY(local.y, scrollRef.current.top);
        selectionManager.setRange({
          start: { row: selectionManager.anchor.row, col: 0 },
          end: { row, col: dataModel.cols - 1 },
        });
        return;
      }
      const address = toCellAddress(e.clientX, e.clientY);
      if (!address) return;
      selectionManager.moveTo(address, true);
      return;
    }

    // Not dragging anything: just update the resize-affordance cursor and
    // the hovered cell (used to show a warning tooltip on hover).
    const canvas = canvasRef.current;
    const local = toCanvasLocal(e.clientX, e.clientY);
    if (!canvas || !local) return;
    const overCol = gridRenderer.hitTestColumnBoundary(local.x, local.y, scrollRef.current.left) !== null;
    const overRow = !overCol && gridRenderer.hitTestRowBoundary(local.x, local.y, scrollRef.current.top) !== null;
    canvas.style.cursor = overCol ? "col-resize" : overRow ? "row-resize" : "default";

    const address = toCellAddress(e.clientX, e.clientY);
    setHoveredCell((prev) =>
      prev === address || (prev && address && prev.row === address.row && prev.col === address.col)
        ? prev
        : address,
    );
  }

  function handleCanvasPointerLeave() {
    setHoveredCell(null);
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (resizingRef.current) {
      resizingRef.current = null;
      canvasRef.current?.releasePointerCapture(e.pointerId);
      return;
    }
    dragSelectingRef.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  }

  function handleCanvasDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isComposingRef.current) return;
    const address = toCellAddress(e.clientX, e.clientY);
    if (!address) return;
    selectionManager.moveTo(address, false);
    // Checkbox cells toggle via the click(s) that made up the double-click
    // (handleCanvasPointerDown, twice) — no text editor to open.
    if (validationStore.getValidation(address.row, address.col)?.type === "checkbox") return;
    beginExistingEdit(address);
  }

  function handleDropdownSelect(value: string) {
    if (isComposingRef.current) return;
    const address = selectionManager.focus;
    const rule = validationStore.getValidation(address.row, address.col);
    if (rule?.type === "list" && rule.multiple) {
      // Multi-select: splice the picked value in for whatever token was
      // being typed (or toggle it back out if it was already confirmed),
      // and keep editing open — the dropdown only commits+closes on
      // Enter/Tab/blur/Escape. A trailing ", " is left so the dropdown's
      // filter resets to the full list, ready for the next pick.
      const { confirmed } = splitMultiSelectInput(filterText);
      const idx = confirmed.indexOf(value);
      const nextConfirmed = idx >= 0 ? confirmed.filter((_, i) => i !== idx) : [...confirmed, value];
      preserveDropdownHighlightRef.current = true;
      editorRef.current?.beginExisting(nextConfirmed.length > 0 ? `${nextConfirmed.join(", ")}, ` : "");
      return;
    }
    commitCells([{ address, value, source: "dropdown" }]);
    editorRef.current?.beginExisting("");
    setEditing(false);
    editorRef.current?.focusCatcher();
  }

  function handleCommitFill(sourceRange: CellRange, destRange: CellRange) {
    if (isComposingRef.current) return;
    const cells = fillRange(sourceRange, destRange, dataModel);
    commitCells(cells.map(({ address, value }) => ({ address, value, source: "fill" as const })));
    selectionManager.setRange(
      normalizeRange({
        start: {
          row: Math.min(sourceRange.start.row, destRange.start.row),
          col: Math.min(sourceRange.start.col, destRange.start.col),
        },
        end: {
          row: Math.max(sourceRange.end.row, destRange.end.row),
          col: Math.max(sourceRange.end.col, destRange.end.col),
        },
      }),
    );
  }

  function handleDeleteSelection() {
    if (isComposingRef.current) return;
    const range = selectionManager.getRange();
    const pairs: { address: CellAddress; value: CellValue; source: CellChangeSource }[] = [];
    for (let r = range.start.row; r <= range.end.row; r++) {
      for (let c = range.start.col; c <= range.end.col; c++) {
        pairs.push({ address: { row: r, col: c }, value: null, source: "edit" });
      }
    }
    commitCells(pairs);
  }

  function handleCopy() {
    if (isComposingRef.current) return;
    const range = selectionManager.getRange();
    const values = dataModel.getRangeValues(range);
    clipboardRef.current = values;
    // Best-effort mirror to the OS clipboard (TSV — what Excel/Sheets read
    // and write) so a copied range can also be pasted outside the app.
    // Failures (denied permission, insecure context) are silent: the
    // in-app clipboardRef above is what in-app paste actually relies on.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(toTSV(values)).catch(() => {});
    }
  }

  function handlePaste(clipboardData: DataTransfer) {
    if (isComposingRef.current) return;
    // Prefer the pasted ClipboardEvent's own data (which can include the
    // text/html <table> flavor an external Google Sheets copy provides)
    // over the in-app clipboard; fall back to the in-app clipboard when the
    // OS clipboard has nothing usable (e.g. writeText was denied on copy).
    let values: CellValue[][] | null = parseClipboardData(clipboardData);
    if (!values?.length || !values[0]?.length) values = clipboardRef.current;
    if (!values?.length || !values[0]?.length) return;

    const srcRows = values.length;
    const srcCols = values[0].length;
    const selection = selectionManager.getRange();
    const selRows = selection.end.row - selection.start.row + 1;
    const selCols = selection.end.col - selection.start.col + 1;
    const destRows = Math.max(selRows, srcRows);
    const destCols = Math.max(selCols, srcCols);
    const destEndRow = Math.min(dataModel.rows - 1, selection.start.row + destRows - 1);
    const destEndCol = Math.min(dataModel.cols - 1, selection.start.col + destCols - 1);

    const pairs: { address: CellAddress; value: CellValue; source: CellChangeSource }[] = [];
    for (let r = selection.start.row; r <= destEndRow; r++) {
      for (let c = selection.start.col; c <= destEndCol; c++) {
        const value = values[(r - selection.start.row) % srcRows][(c - selection.start.col) % srcCols];
        pairs.push({ address: { row: r, col: c }, value, source: "paste" });
      }
    }
    commitCells(pairs);

    selectionManager.setRange({ start: selection.start, end: { row: destEndRow, col: destEndCol } });
  }

  const activeRule = validationStore.getValidation(selectionManager.focus.row, selectionManager.focus.col);
  const isListEditing = editing && activeRule?.type === "list";
  const isMultiListEditing = isListEditing && activeRule.multiple === true;
  const allListOptions = isListEditing ? (validationStore.getListOptions(selectionManager.focus, activeRule) ?? []) : [];
  // Multi-select filters by the trailing token currently being typed (not
  // the whole comma-list) so already-confirmed picks don't hide the rest
  // of the options; single-select filters by the whole typed text.
  const multiInput = isMultiListEditing ? splitMultiSelectInput(filterText) : null;
  const dropdownOptions = isListEditing
    ? multiInput
      ? allListOptions.filter(
          (option) => multiInput.currentToken === "" || option.toLowerCase().includes(multiInput.currentToken.toLowerCase()),
        )
      : allListOptions.filter((option) => filterText === "" || option.toLowerCase().includes(filterText.toLowerCase()))
    : [];
  // No dropdown box when nothing matches what's been typed — an empty
  // floating box would just be visual noise, same as any autocomplete.
  const showDropdown = isListEditing && dropdownOptions.length > 0;
  const selectedMultiValues = multiInput?.confirmed ?? [];
  const isCheckboxCell = activeRule?.type === "checkbox";

  function handleOverlayKeyDownCapture(e: React.KeyboardEvent) {
    if (!showDropdown) return;
    if (isComposingRef.current || e.nativeEvent.isComposing) return;
    // Tab/Shift+Tab move the dropdown highlight the same as Down/Up while
    // the dropdown is open, instead of committing and moving to the next
    // cell — the dropdown's own candidates take Tab focus first.
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      setDropdownHighlight((i) => Math.min(dropdownOptions.length - 1, i + 1));
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      // -1 -> 0 so the first Up/Shift+Tab with nothing highlighted lands on
      // the first option rather than clamping to -1 forever.
      setDropdownHighlight((i) => Math.max(0, i - 1));
    } else if ((e.key === "Enter" || e.key === " ") && dropdownHighlight !== -1) {
      // Only hijack Enter/Space once the user has actually navigated the
      // list with arrow keys (or Tab) — otherwise they must commit or type
      // whatever text the user typed (validated normally), not silently
      // substitute the first option in the list.
      const value = dropdownOptions[dropdownHighlight];
      if (value !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        handleDropdownSelect(value);
      }
    }
  }

  useImperativeHandle(
    ref,
    (): SpreadsheetHandle => ({
      getValue(row, col) {
        return dataModel.getValue(row, col);
      },
      setValue(row, col, value) {
        return commitCells([{ address: { row, col }, value, source: "api" }]).length > 0;
      },
      getRangeValues(range) {
        return dataModel.getRangeValues(normalizeRange(range));
      },
      setRangeValues(range, values) {
        const norm = normalizeRange(range);
        const pairs: { address: CellAddress; value: CellValue; source: CellChangeSource }[] = [];
        for (let r = 0; r < values.length; r++) {
          const rowValues = values[r];
          for (let c = 0; c < rowValues.length; c++) {
            pairs.push({ address: { row: norm.start.row + r, col: norm.start.col + c }, value: rowValues[c], source: "api" });
          }
        }
        const batch = commitCells(pairs);
        const appliedKeys = new Set(batch.map((e) => `${e.address.row},${e.address.col}`));
        const applied: CellAddress[] = [];
        const rejected: CellAddress[] = [];
        for (const { address } of pairs) {
          (appliedKeys.has(`${address.row},${address.col}`) ? applied : rejected).push(address);
        }
        return { applied, rejected };
      },
      getData() {
        return dataModel.getSnapshot();
      },
      setData(data) {
        if (data.length !== dataModel.rows) {
          throw new RangeError(`setData expected ${dataModel.rows} rows, received ${data.length}`);
        }
        for (let r = 0; r < data.length; r++) {
          if (data[r].length !== dataModel.cols) {
            throw new RangeError(
              `setData expected ${dataModel.cols} columns on row ${r}, received ${data[r].length}`,
            );
          }
        }
        const pairs: { address: CellAddress; value: CellValue; source: CellChangeSource }[] = [];
        for (let r = 0; r < data.length; r++) {
          for (let c = 0; c < data[r].length; c++) {
            pairs.push({ address: { row: r, col: c }, value: data[r][c], source: "api" });
          }
        }
        commitCells(pairs);
      },
      setValidation(range, rule) {
        validationStore.setValidation(normalizeRange(range), rule);
        requestRedraw();
      },
      getValidation(row, col) {
        return validationStore.getValidation(row, col);
      },
      getSelection() {
        return selectionManager.getRange();
      },
      setSelection(range) {
        selectionManager.setRange(range);
      },
      getColumnWidth(col) {
        return gridRenderer.getColWidth(col);
      },
      setColumnWidth(col, width) {
        gridRenderer.setColWidth(col, width);
        requestRedraw();
      },
      getRowHeight(row) {
        return gridRenderer.getRowHeight(row);
      },
      setRowHeight(row, height) {
        gridRenderer.setRowHeight(row, height);
        requestRedraw();
      },
      getColumnOverflow(col) {
        return gridRenderer.getColumnOverflow(col);
      },
      setColumnOverflow(col, mode) {
        gridRenderer.setColumnOverflow(col, mode);
        requestRedraw();
      },
    }),
    [dataModel, validationStore, selectionManager, gridRenderer, commitCtx, requestRedraw],
  );

  const selection = selectionManager.getRange();
  const activeCell = selectionManager.focus;
  const { left: scrollLeft, top: scrollTop } = scrollRef.current;
  const activeCellRect = gridRenderer.cellRect(activeCell, scrollLeft, scrollTop);

  // Hovering a warning cell takes priority; otherwise fall back to showing
  // the active cell's own warning (but not while its edit box is covering
  // it — the user is already looking right at it).
  const warningCell =
    hoveredCell && dataModel.hasWarning(hoveredCell.row, hoveredCell.col)
      ? hoveredCell
      : !editing && dataModel.hasWarning(activeCell.row, activeCell.col)
        ? activeCell
        : null;
  const warningMessage = warningCell ? dataModel.getWarningMessage(warningCell.row, warningCell.col) : null;
  const warningRect = warningCell ? gridRenderer.cellRect(warningCell, scrollLeft, scrollTop) : null;

  const fillCorner = {
    x: HEADER_WIDTH + gridRenderer.getColX(selection.end.col) + gridRenderer.getColWidth(selection.end.col) - scrollLeft,
    y: HEADER_HEIGHT + gridRenderer.getRowY(selection.end.row) + gridRenderer.getRowHeight(selection.end.row) - scrollTop,
  };

  let fillPreviewStyle: React.CSSProperties | null = null;
  if (fillPreview) {
    const startRect = gridRenderer.cellRect(fillPreview.start, scrollLeft, scrollTop);
    const endRect = gridRenderer.cellRect(fillPreview.end, scrollLeft, scrollTop);
    fillPreviewStyle = {
      position: "absolute",
      left: startRect.x,
      top: startRect.y,
      width: endRect.x + endRect.width - startRect.x,
      height: endRect.y + endRect.height - startRect.y,
      border: "1px dashed #1a73e8",
      pointerEvents: "none",
    };
  }

  return (
    <div
      ref={containerRef}
      className="ss-viewport"
      style={{ position: "relative", overflow: "auto", width: "100%", height: "100%" }}
    >
      <div
        style={{
          position: "relative",
          width: gridRenderer.totalWidth() + HEADER_WIDTH,
          height: gridRenderer.totalHeight() + HEADER_HEIGHT,
        }}
      >
        {/*
          Both the canvas and the overlay layer are nested inside ONE sticky
          wrapper (rather than being sticky siblings) so the overlay layer's
          containing block is the wrapper itself — whose natural top-left is
          0,0 because the canvas is its only normal-flow content. If the
          overlay layer were sticky as a sibling *after* the canvas, its
          static flow position would start below the canvas's own rendered
          height, and it would only "stick" to the viewport once scrolled
          past that offset — the editor input would silently jump to the
          wrong screen position on first use.
        */}
        <div style={{ position: "sticky", top: 0, left: 0 }}>
          <canvas
            ref={canvasRef}
            className="ss-canvas"
            style={{ display: "block" }}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerLeave={handleCanvasPointerLeave}
            onDoubleClick={handleCanvasDoubleClick}
          />
          <div
            className="ss-overlay-layer"
            style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0, overflow: "visible" }}
            onKeyDownCapture={handleOverlayKeyDownCapture}
          >
            <EditorOverlay
            ref={editorRef}
            rect={activeCellRect}
            editing={editing}
            overflowMode={gridRenderer.getColumnOverflow(activeCell.col)}
            isComposingRef={isComposingRef}
            pendingBlurRef={pendingBlurRef}
            onTypingStart={() => {
              setEditing(true);
              setDropdownHighlight(-1);
            }}
            onBeginExisting={() => beginExistingEdit(activeCell)}
            isCheckboxCell={isCheckboxCell}
            onToggleCheckbox={() => toggleCheckbox(selectionManager.focus)}
            onCommit={(value, moveDelta) => {
              const address = selectionManager.focus;
              commitCells([{ address, value: coerceEditValue(address, value), source: "edit" }]);
              setEditing(false);
              if (moveDelta) {
                if (moveDelta.dCol !== 0) {
                  // Tab commit: remember the row-start column (first Tab in the run only).
                  if (tabHomeColRef.current === null) tabHomeColRef.current = address.col;
                  selectionManager.moveBy(moveDelta.dRow, moveDelta.dCol, false);
                } else if (moveDelta.dRow !== 0 && tabHomeColRef.current !== null) {
                  const homeCol = tabHomeColRef.current;
                  tabHomeColRef.current = null;
                  selectionManager.moveTo({ row: address.row + moveDelta.dRow, col: homeCol }, false);
                } else {
                  selectionManager.moveBy(moveDelta.dRow, moveDelta.dCol, false);
                }
              }
              editorRef.current?.focusCatcher();
            }}
            onCancel={() => {
              setEditing(false);
              editorRef.current?.focusCatcher();
            }}
            onNavigate={(dRow, dCol, extend, viaTab) => {
              if (viaTab) {
                if (tabHomeColRef.current === null) tabHomeColRef.current = selectionManager.focus.col;
              } else {
                tabHomeColRef.current = null;
              }
              selectionManager.moveBy(dRow, dCol, extend);
            }}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onDeleteSelection={handleDeleteSelection}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onValueChange={(value) => {
              setFilterText(value);
              if (preserveDropdownHighlightRef.current) {
                preserveDropdownHighlightRef.current = false;
              } else {
                setDropdownHighlight(-1);
              }
            }}
          />
          {!editing && (
            <FillHandle
              corner={fillCorner}
              selection={selection}
              isComposingRef={isComposingRef}
              toCellAddress={toCellAddress}
              onPreview={setFillPreview}
              onCommitFill={handleCommitFill}
            />
          )}
          {showDropdown && (
            <DropdownOverlay
              rect={{
                x: activeCellRect.x,
                y: activeCellRect.y + activeCellRect.height,
                width: activeCellRect.width,
              }}
              options={dropdownOptions}
              highlightedIndex={dropdownHighlight}
              onSelect={handleDropdownSelect}
              multiple={isMultiListEditing}
              selectedValues={selectedMultiValues}
            />
          )}
          {fillPreviewStyle && <div style={fillPreviewStyle} />}
          {warningRect && warningMessage && <WarningTooltip rect={warningRect} message={warningMessage} />}
          </div>
        </div>
      </div>
    </div>
  );
});
