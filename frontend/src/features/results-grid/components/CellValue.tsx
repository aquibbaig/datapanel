import { Maximize2 } from "lucide-react";
import { formatCellDisplay } from "../lib/value-format";

export function CellValue({
  value,
  onInspect,
}: {
  value: unknown;
  onInspect?: () => void;
}) {
  const display = formatCellDisplay(value);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <span
        className="block min-w-0 flex-1 truncate leading-7"
        title={display.text}
      >
        {display.text}
      </span>
      {onInspect ? (
        <button
          aria-label="Inspect cell value"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line bg-surface-850 text-zinc-400 opacity-70 transition hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onInspect();
          }}
          type="button"
        >
          <Maximize2 size={11} />
        </button>
      ) : null}
    </div>
  );
}
