import { Search, X } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "../../../components/ui/Button";
import { textInputBehaviorProps } from "../../../lib/text-input";

export function FinderBar({
  activeIndex,
  inputRef,
  matchCount,
  query,
  onChange,
  onClose,
  onMoveMatch,
}: {
  activeIndex: number;
  inputRef: RefObject<HTMLInputElement>;
  matchCount: number;
  query: string;
  onChange(query: string): void;
  onClose(): void;
  onMoveMatch(direction: 1 | -1): void;
}) {
  return (
    <div className="grid grid-cols-[minmax(180px,360px)_auto_auto] items-center gap-2 border-b border-line bg-surface-950 px-2 py-1.5 text-xs">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500"
          size={13}
        />
        <input
          {...textInputBehaviorProps}
          ref={inputRef}
          className="h-7 rounded-md border-line bg-background pl-7 pr-2 text-xs"
          placeholder="Find text..."
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              onMoveMatch(event.shiftKey ? -1 : 1);
            }
          }}
        />
      </label>
      <span className="min-w-20 text-muted">
        {query.trim()
          ? `${matchCount === 0 ? 0 : activeIndex + 1}/${matchCount}`
          : "0/0"}
      </span>
      <div className="flex justify-end gap-1">
        <Button
          aria-label="Close finder"
          onClick={onClose}
          size="icon"
          className="!h-6 !w-6"
          type="button"
        >
          <X size={13} />
        </Button>
      </div>
    </div>
  );
}
