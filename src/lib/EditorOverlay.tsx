import type React from "react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { CELL_PADDING_X, LINE_HEIGHT, WRAP_VERTICAL_PADDING } from "./textLayout.ts";
import type { TextOverflowMode } from "./types.ts";

export type EditorRect = { x: number; y: number; width: number; height: number };

// Extra room beyond the raw text width for the box's own padding/border and
// a bit of caret breathing room, so it doesn't clip the last character as
// it grows (ellipsis-mode/single-line only — wrap mode grows in height,
// not width, so it never needs this).
const EDITOR_WIDTH_ALLOWANCE = 20;
const BORDER_WIDTH = 2;

// Lazily-created, module-shared canvas 2D context used only to measure text
// width — never touches the DOM tree, so it's safe to share across
// instances and doesn't risk interfering with focus/composition.
let measureCtx: CanvasRenderingContext2D | null | undefined;
function measureTextWidth(text: string): number {
  if (measureCtx === undefined) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) return 0;
  measureCtx.font = "13px system-ui, sans-serif";
  return measureCtx.measureText(text).width;
}

// Lazily-created, module-shared hidden <textarea> used only to measure how
// tall wrapped content needs to be at a given width. Styled identically to
// the real editor's wrap-mode CSS so the browser's own layout — not a
// reimplementation of it — decides the line count. It never receives focus
// and isn't the persistent editor node, so it has no IME implications.
let measureWrapEl: HTMLTextAreaElement | null | undefined;
function measureWrapHeight(text: string, width: number): number {
  if (measureWrapEl === undefined) {
    const el = document.createElement("textarea");
    const s = el.style;
    s.position = "fixed";
    s.left = "-9999px";
    s.top = "0";
    s.visibility = "hidden";
    s.whiteSpace = "pre-wrap";
    s.wordBreak = "break-all";
    s.boxSizing = "border-box";
    s.font = "13px system-ui, sans-serif";
    s.padding = `0 ${CELL_PADDING_X - 1}px`;
    s.border = `${BORDER_WIDTH}px solid transparent`;
    s.margin = "0";
    document.body.appendChild(el);
    measureWrapEl = el;
  }
  if (!measureWrapEl) return 0;
  measureWrapEl.style.width = `${width}px`;
  measureWrapEl.value = text;
  return measureWrapEl.scrollHeight;
}

export type MoveDelta = { dRow: number; dCol: number } | null;

export type EditorOverlayHandle = {
  /** Focuses the overlay if it isn't already focused and isn't mid-composition. Safe to call repeatedly. */
  focusCatcher: () => void;
  /** Sets the DOM value directly (edit-existing mode) without touching React state or calling .focus(). */
  beginExisting: (value: string) => void;
  getValue: () => string;
};

export type EditorOverlayProps = {
  rect: EditorRect;
  editing: boolean;
  /** The active cell's column overflow mode — wrap grows the box in height (at a fixed width); ellipsis grows it in width (single line). */
  overflowMode: TextOverflowMode;
  isComposingRef: React.MutableRefObject<boolean>;
  pendingBlurRef: React.MutableRefObject<"commit" | null>;
  /** compositionstart or first input event while not editing — parent should switch to editing mode in place. */
  onTypingStart: () => void;
  /** Enter/F2 pressed while not editing — parent should read the cell's existing value and call beginExisting(). */
  onBeginExisting: () => void;
  /** Enter/Tab/outside commit while editing. moveDelta is null for outside-commit (stay put). */
  onCommit: (value: string, moveDelta: MoveDelta) => void;
  /** Escape while editing — discard without writing. */
  onCancel: () => void;
  /** Arrow keys / Tab while not editing — move the selection instead of the caret. */
  onNavigate: (dRow: number, dCol: number, extend: boolean) => void;
  /** Ctrl/Cmd+C while not editing — copy the selected range. */
  onCopy: () => void;
  /** Delete/Backspace while not editing — clear every cell in the selected range. */
  onDeleteSelection: () => void;
  /**
   * Native paste while not editing — paste into the selected range. Takes
   * the ClipboardEvent's DataTransfer directly (not read via the async
   * Clipboard API) so a text/html <table> flavor — what an external
   * Google Sheets copy puts on the clipboard — is available, not just
   * text/plain.
   */
  onPaste: (clipboardData: DataTransfer) => void;
  /**
   * Fires with the box's current text on every value change (typing, IME
   * composition update, edit-existing, and the reset back to empty on
   * commit/cancel). Presentation-only signal (e.g. driving dropdown
   * filtering) — the DOM node stays the actual source of truth, so this is
   * safe to update mid-composition under the IME-freeze invariant.
   */
  onValueChange: (value: string) => void;
};

/**
 * The single persistent, IME-safe, UNCONTROLLED editing surface. This
 * element is never conditionally rendered/unmounted — only its geometry and
 * visibility change, driven by inline style computed from `rect`/`editing`.
 * The DOM node owns the text content; React state never round-trips it.
 * A <textarea> (not <input>) so wrap-mode columns can show real wrapped
 * lines while editing — Enter/Tab/Escape are fully intercepted below either
 * way, so this doesn't change any commit/navigation behavior.
 */
export const EditorOverlay = forwardRef<EditorOverlayHandle, EditorOverlayProps>(
  function EditorOverlay(props, ref) {
    const { rect, editing, overflowMode, isComposingRef, pendingBlurRef } = props;
    const inputRef = useRef<HTMLTextAreaElement>(null);
    // Grows the editor past the cell's own size to fit what's being typed
    // (Sheets-style overflow-while-editing) instead of clipping it. This is
    // pure presentation state — it never touches the DOM node's value, so
    // updating it mid-composition is safe under the IME-freeze invariant.
    const [contentWidth, setContentWidth] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);

    function autosize() {
      const value = inputRef.current?.value ?? "";
      if (overflowMode === "wrap") {
        setContentHeight(measureWrapHeight(value, rect.width));
      } else {
        setContentWidth(measureTextWidth(value) + EDITOR_WIDTH_ALLOWANCE);
      }
      props.onValueChange(value);
    }

    useImperativeHandle(ref, () => ({
      focusCatcher() {
        if (!isComposingRef.current && document.activeElement !== inputRef.current) {
          inputRef.current?.focus({ preventScroll: true });
        }
      },
      beginExisting(value: string) {
        if (inputRef.current) inputRef.current.value = value;
        autosize();
      },
      getValue() {
        return inputRef.current?.value ?? "";
      },
    }));

    function resetToHidden() {
      if (inputRef.current) inputRef.current.value = "";
      setContentWidth(0);
      setContentHeight(0);
      props.onValueChange("");
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      // Composition freeze invariant: Enter/Tab/Escape/Arrow are all used by
      // IMEs for candidate confirmation/navigation — never intercept them
      // while composing.
      if (e.nativeEvent.isComposing || isComposingRef.current) return;

      if (!editing) {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && (e.key === "c" || e.key === "C")) {
          e.preventDefault();
          props.onCopy();
          return;
        }
        // Ctrl/Cmd+V is deliberately NOT intercepted here: letting the
        // keydown's default action proceed is what makes the browser fire
        // a native `paste` ClipboardEvent (handled by handlePasteEvent
        // below), which is the only way to read the text/html flavor.
        switch (e.key) {
          case "Enter":
          case "F2":
            e.preventDefault();
            props.onBeginExisting();
            return;
          case "ArrowUp":
            e.preventDefault();
            props.onNavigate(-1, 0, e.shiftKey);
            return;
          case "ArrowDown":
            e.preventDefault();
            props.onNavigate(1, 0, e.shiftKey);
            return;
          case "ArrowLeft":
            e.preventDefault();
            props.onNavigate(0, -1, e.shiftKey);
            return;
          case "ArrowRight":
            e.preventDefault();
            props.onNavigate(0, 1, e.shiftKey);
            return;
          case "Tab":
            e.preventDefault();
            props.onNavigate(0, e.shiftKey ? -1 : 1, false);
            return;
          case "Delete":
          case "Backspace":
            e.preventDefault();
            props.onDeleteSelection();
            return;
          default:
            // Printable keys fall through: the browser inserts the
            // character into the (already focused) box itself, which
            // fires `onInput` below and switches to edit-replace mode.
            return;
        }
      }

      switch (e.key) {
        // A textarea's native Enter would insert a newline — this is
        // always intercepted instead, so Enter still commits+moves for
        // both ellipsis and wrap columns, consistent with a spreadsheet's
        // Enter behavior rather than a text editor's.
        case "Enter":
          e.preventDefault();
          props.onCommit(inputRef.current?.value ?? "", { dRow: e.shiftKey ? -1 : 1, dCol: 0 });
          resetToHidden();
          return;
        case "Tab":
          e.preventDefault();
          props.onCommit(inputRef.current?.value ?? "", { dRow: 0, dCol: e.shiftKey ? -1 : 1 });
          resetToHidden();
          return;
        case "Escape":
          e.preventDefault();
          props.onCancel();
          resetToHidden();
          return;
        default:
          return;
      }
    }

    function handleInput() {
      if (!editing) props.onTypingStart();
      autosize();
    }

    function handleCompositionUpdate() {
      // IME candidate text can change length (e.g. hiragana -> a longer
      // kanji conversion) without a separate 'input' event on some
      // browsers — keep the box sized to what's actually being composed.
      autosize();
    }

    function handlePasteEvent(e: React.ClipboardEvent<HTMLTextAreaElement>) {
      if (isComposingRef.current) return;
      // While actively editing a single cell, let the browser's default
      // plain-text paste into this box proceed as normal text entry.
      if (editing) return;
      e.preventDefault();
      props.onPaste(e.clipboardData);
    }

    function handleCompositionStart() {
      isComposingRef.current = true;
      if (!editing) props.onTypingStart();
    }

    function handleCompositionEnd() {
      isComposingRef.current = false;
      if (pendingBlurRef.current === "commit") {
        pendingBlurRef.current = null;
        props.onCommit(inputRef.current?.value ?? "", null);
        resetToHidden();
      }
    }

    function handleBlur() {
      if (isComposingRef.current) {
        // Deferred blur commit: never discard or retarget an in-progress
        // composition — resolve after compositionend instead.
        if (editing) pendingBlurRef.current = "commit";
        return;
      }
      if (editing) {
        props.onCommit(inputRef.current?.value ?? "", null);
        resetToHidden();
      }
    }

    const wrap = overflowMode === "wrap";
    const style: React.CSSProperties = editing
      ? {
          position: "absolute",
          left: rect.x,
          top: rect.y,
          width: wrap ? rect.width : Math.max(rect.width, contentWidth),
          height: wrap ? Math.max(rect.height, contentHeight) : rect.height,
          font: "13px system-ui, sans-serif",
          lineHeight: `${LINE_HEIGHT}px`,
          padding: `${wrap ? WRAP_VERTICAL_PADDING : 0}px ${CELL_PADDING_X - 1}px`,
          margin: 0,
          boxSizing: "border-box",
          border: `${BORDER_WIDTH}px solid #1a73e8`,
          outline: "none",
          background: "#fff",
          color: "#1f1f1f",
          resize: "none",
          overflow: "hidden",
          whiteSpace: wrap ? "pre-wrap" : "pre",
          wordBreak: wrap ? "break-all" : "normal",
          zIndex: 10,
        }
      : {
          position: "absolute",
          left: rect.x,
          top: rect.y,
          width: 1,
          height: 1,
          opacity: 0,
          border: "none",
          padding: 0,
          margin: 0,
          overflow: "hidden",
          resize: "none",
          zIndex: -1,
        };

    return (
      <textarea
        ref={inputRef}
        className="ss-editor-overlay"
        style={style}
        rows={1}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onCompositionStart={handleCompositionStart}
        onCompositionUpdate={handleCompositionUpdate}
        onCompositionEnd={handleCompositionEnd}
        onBlur={handleBlur}
        onPaste={handlePasteEvent}
      />
    );
  },
);
