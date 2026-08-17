export type WarningTooltipRect = { x: number; y: number; width: number; height: number };

export type WarningTooltipProps = {
  rect: WarningTooltipRect;
  message: string;
};

/**
 * Read-only callout for a warn-mode validation message, anchored under a
 * cell. Purely presentational — never intercepts pointer/keyboard input, so
 * it has no bearing on focus, selection, or IME composition.
 */
export function WarningTooltip({ rect, message }: WarningTooltipProps) {
  return (
    <div
      className="ss-warning-tooltip"
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y + rect.height + 2,
        // Explicit max-content width, not just maxWidth: the overlay layer
        // this renders into is a `width: 0` positioning container, which
        // makes plain shrink-to-fit auto-sizing collapse to its minimum
        // content width — and with wordBreak: break-word, that minimum is
        // a single character, so every char would land on its own line.
        width: "max-content",
        maxWidth: 260,
        background: "#d93025",
        color: "#fff",
        fontSize: 12,
        lineHeight: 1.4,
        padding: "6px 10px",
        borderRadius: 4,
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {message}
    </div>
  );
}
