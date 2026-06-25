import { X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { formatInspectableValue } from "../lib/value-format";

export function ValueInspector({
  columnName,
  value,
  onClose,
}: {
  columnName: string;
  value: unknown;
  onClose(): void;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[900] flex items-end justify-end p-4">
      <div className="pointer-events-auto grid max-h-[48vh] w-[min(620px,calc(100vw-2rem))] grid-rows-[36px_minmax(0,1fr)] overflow-hidden rounded-ui border border-line bg-surface-950 shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3">
          <div className="min-w-0 truncate text-sm font-medium text-zinc-200">
            {columnName}
          </div>
          <Button
            aria-label="Close value inspector"
            onClick={onClose}
            size="icon"
            className="!h-6 !w-6"
            type="button"
          >
            <X size={13} />
          </Button>
        </div>
        <pre className="min-h-0 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-zinc-200">
          {formatInspectableValue(value)}
        </pre>
      </div>
    </div>
  );
}
