export type DropdownOverlayProps = {
  rect: { x: number; y: number; width: number };
  options: string[];
  highlightedIndex: number;
  onSelect: (value: string) => void;
  /** When true, renders a checkbox per option and selecting one doesn't close the dropdown. */
  multiple?: boolean;
  /** Currently-selected values, only used when `multiple` is true. */
  selectedValues?: string[];
};

/**
 * List-validation dropdown popup. Ordinary conditional render is fine here
 * — it is not the IME composition owner (EditorOverlay is), it just must
 * never take DOM focus away from the editor input, which is why options are
 * selected via `pointerdown` + `preventDefault` rather than a focusable
 * `<button>`.
 */
export function DropdownOverlay(props: DropdownOverlayProps) {
  const { rect, options, highlightedIndex, onSelect, multiple, selectedValues } = props;

  return (
    <div
      className="ss-dropdown-overlay"
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        minWidth: rect.width,
        maxHeight: 220,
        overflowY: "auto",
        background: "#fff",
        border: "1px solid #dadce0",
        borderRadius: 4,
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        zIndex: 20,
      }}
    >
      {options.map((option, index) => {
        const checked = multiple ? (selectedValues?.includes(option) ?? false) : false;
        return (
          <div
            key={option}
            className="ss-dropdown-option"
            style={{
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: "system-ui, sans-serif",
              cursor: "pointer",
              display: multiple ? "flex" : undefined,
              alignItems: multiple ? "center" : undefined,
              gap: multiple ? 8 : undefined,
              background: index === highlightedIndex ? "#e8f0fe" : "transparent",
              whiteSpace: "nowrap",
            }}
            // pointerdown + preventDefault (not a focusable button's click) so
            // focus never leaves the persistent editor input.
            onPointerDown={(e) => {
              e.preventDefault();
              onSelect(option);
            }}
          >
            {multiple && (
              <span
                style={{
                  width: 14,
                  height: 14,
                  flexShrink: 0,
                  border: `1.5px solid ${checked ? "#1a73e8" : "#5f6368"}`,
                  borderRadius: 3,
                  background: checked ? "#1a73e8" : "#fff",
                  display: "inline-block",
                }}
              />
            )}
            {option}
          </div>
        );
      })}
    </div>
  );
}
