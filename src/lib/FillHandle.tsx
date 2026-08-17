import type React from "react";
import { useRef } from "react";
import type { CellAddress, CellRange } from "./types.ts";

const HANDLE_SIZE = 7;

export type FillHandleProps = {
  /** Bottom-right corner of the selection's bounding box, in viewport-local pixels. */
  corner: { x: number; y: number };
  selection: CellRange;
  isComposingRef: React.MutableRefObject<boolean>;
  toCellAddress: (clientX: number, clientY: number) => CellAddress | null;
  onPreview: (destRange: CellRange | null) => void;
  onCommitFill: (sourceRange: CellRange, destRange: CellRange) => void;
};

function computeDestRange(selection: CellRange, target: CellAddress): CellRange | null {
  const rowsBelow = target.row - selection.end.row;
  const colsRight = target.col - selection.end.col;
  if (rowsBelow <= 0 && colsRight <= 0) return null;

  if (rowsBelow >= colsRight) {
    return {
      start: { row: selection.end.row + 1, col: selection.start.col },
      end: { row: target.row, col: selection.end.col },
    };
  }
  return {
    start: { row: selection.start.row, col: selection.end.col + 1 },
    end: { row: selection.end.row, col: target.col },
  };
}

/**
 * Drag handle at the bottom-right corner of the selection. Not the IME
 * composition owner, so ordinary conditional rendering is fine — it only
 * needs to no-op its own drag *initiation* while composing (composition
 * freeze invariant) and use pointer capture so the drag tracks correctly
 * even when the pointer leaves the handle's small hit target.
 */
export function FillHandle(props: FillHandleProps) {
  const { corner, selection, isComposingRef, toCellAddress, onPreview, onCommitFill } = props;
  const draggingRef = useRef(false);
  const lastDestRef = useRef<CellRange | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (isComposingRef.current) return; // composition freeze invariant
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    lastDestRef.current = null;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const target = toCellAddress(e.clientX, e.clientY);
    if (!target) return;
    const dest = computeDestRange(selection, target);
    lastDestRef.current = dest;
    onPreview(dest);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const dest = lastDestRef.current;
    lastDestRef.current = null;
    onPreview(null);
    if (dest) onCommitFill(selection, dest);
  }

  return (
    <div
      className="ss-fill-handle"
      style={{
        position: "absolute",
        left: corner.x - HANDLE_SIZE / 2,
        top: corner.y - HANDLE_SIZE / 2,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        background: "#1a73e8",
        border: "1px solid #fff",
        borderRadius: 1,
        cursor: "crosshair",
        zIndex: 11,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
