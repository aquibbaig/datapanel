import { useState } from "react";
import { cn } from "../../../lib/cn";
import { textInputBehaviorProps } from "../../../lib/text-input";
import { isTypedNull } from "../lib/drafts";
import type { CellDraft } from "../types";

export function CellEditor({
  autoFocus = false,
  changed,
  disabled,
  draft,
  onCancel,
  onCommit,
}: {
  autoFocus?: boolean;
  changed: boolean;
  disabled: boolean;
  draft: CellDraft;
  onCancel(): void;
  onCommit(draft: CellDraft): void;
}) {
  const [localDraft, setLocalDraft] = useState(draft);

  function commit() {
    onCommit(localDraft);
  }

  return (
    <div
      className={cn(
        "flex h-7 w-full min-w-0 items-center rounded-md border border-transparent bg-transparent transition focus-within:border-accent focus-within:bg-surface-850",
        changed &&
          "border-warning/60 bg-warning/15 text-warning focus-within:border-warning focus-within:bg-warning/20",
      )}
    >
      <input
        {...textInputBehaviorProps}
        autoFocus={autoFocus}
        className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-transparent focus:shadow-none"
        disabled={disabled}
        onBlur={commit}
        onChange={(event) =>
          setLocalDraft({
            value: event.target.value,
            isNull: false,
            typedNull: isTypedNull(event.target.value),
          })
        }
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder={localDraft.isNull ? "NULL" : ""}
        value={localDraft.isNull ? "" : localDraft.value}
      />
    </div>
  );
}
