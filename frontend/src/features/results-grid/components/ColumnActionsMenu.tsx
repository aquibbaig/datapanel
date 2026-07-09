import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  EyeOff,
  Filter,
  RotateCcw,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { cn } from "../../../lib/cn";
import { textInputBehaviorProps } from "../../../lib/text-input";
import type { QueryResult } from "../../../lib/types";
import type { ResultFilterOperator, ResultSort } from "../types";

export function ColumnActionsMenu({
  column,
  filtered,
  open,
  sort,
  onAddFilter,
  onClearColumnFilter,
  onCopyColumnName,
  onHideColumn,
  onHideEmptyColumns,
  onOpenChange,
  onResetView,
  onSort,
}: {
  column: QueryResult["columns"][number];
  filtered: boolean;
  open: boolean;
  sort: ResultSort | null;
  onAddFilter(
    columnName: string,
    operator: ResultFilterOperator,
    value: string,
  ): void;
  onClearColumnFilter(columnName: string): void;
  onCopyColumnName(columnName: string): void;
  onHideColumn(columnName: string): void;
  onHideEmptyColumns(): void;
  onOpenChange(open: boolean): void;
  onResetView(): void;
  onSort(sort: ResultSort | null): void;
}) {
  const [filterValue, setFilterValue] = useState("");
  const filterInputId = useId();

  useEffect(() => {
    if (open) setFilterValue("");
  }, [open]);

  function applyFilter(operator: ResultFilterOperator) {
    if (
      (operator === "contains" ||
        operator === "equals" ||
        operator === "notEquals") &&
      filterValue.trim() === ""
    ) {
      return;
    }
    onAddFilter(column.name, operator, filterValue);
    onOpenChange(false);
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`Open actions for ${column.name}`}
          className={cn(
            "ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-transparent text-zinc-500 transition hover:bg-control/[0.08] hover:text-zinc-100 data-[state=open]:text-zinc-100",
            (filtered || sort?.columnName === column.name) &&
              "text-accent",
          )}
          title={`Column actions for ${column.name}`}
          type="button"
        >
          <ChevronDown size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          className="z-[1000] min-w-64 overflow-hidden rounded-ui border border-line bg-surface-800 py-1 text-xs text-zinc-300 shadow-xl"
          sideOffset={4}
        >
          <MenuItem onSelect={() => onCopyColumnName(column.name)}>
            <Copy size={13} />
            Copy column name
          </MenuItem>

          <DropdownMenu.Separator className="my-1 h-px bg-line" />

          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={menuItemClassName}>
              <Filter size={13} />
              Filter
              <ChevronRight className="ml-auto" size={13} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className="z-[1001] w-72 rounded-ui border border-line bg-surface-800 p-2 text-xs text-zinc-300 shadow-xl"
                sideOffset={6}
              >
                <div
                  className="space-y-2"
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <div className="block">
                    <label
                      className="mb-1 block text-[11px] text-muted"
                      htmlFor={filterInputId}
                    >
                      {column.name}
                    </label>
                    <input
                      {...textInputBehaviorProps}
                      aria-label={`Filter ${column.name}`}
                      className="h-7 w-full rounded-md border-line bg-background px-2 text-xs"
                      id={filterInputId}
                      placeholder="Type value..."
                      value={filterValue}
                      onChange={(event) => setFilterValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyFilter("contains");
                        }
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <FilterButton
                      disabled={filterValue.trim() === ""}
                      onClick={() => applyFilter("contains")}
                    >
                      Contains
                    </FilterButton>
                    <FilterButton
                      disabled={filterValue.trim() === ""}
                      onClick={() => applyFilter("equals")}
                    >
                      Equals
                    </FilterButton>
                    <FilterButton
                      disabled={filterValue.trim() === ""}
                      onClick={() => applyFilter("notEquals")}
                    >
                      Exclude
                    </FilterButton>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <FilterButton onClick={() => applyFilter("empty")}>
                      Empty
                    </FilterButton>
                    <FilterButton onClick={() => applyFilter("notEmpty")}>
                      Not empty
                    </FilterButton>
                  </div>
                  {filtered ? (
                    <button
                      className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-control/[0.06] hover:text-zinc-100"
                      type="button"
                      onClick={() => {
                        onClearColumnFilter(column.name);
                        onOpenChange(false);
                      }}
                    >
                      Clear filter for this column
                    </button>
                  ) : null}
                </div>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={menuItemClassName}>
              <ArrowUp size={13} />
              Order
              <ChevronRight className="ml-auto" size={13} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className="z-[1001] min-w-44 rounded-ui border border-line bg-surface-800 py-1 text-xs text-zinc-300 shadow-xl"
                sideOffset={6}
              >
                <MenuItem
                  onSelect={() =>
                    onSort({ columnName: column.name, direction: "asc" })
                  }
                >
                  <ArrowUp size={13} />
                  Sort ascending
                </MenuItem>
                <MenuItem
                  onSelect={() =>
                    onSort({ columnName: column.name, direction: "desc" })
                  }
                >
                  <ArrowDown size={13} />
                  Sort descending
                </MenuItem>
                {sort?.columnName === column.name ? (
                  <MenuItem onSelect={() => onSort(null)}>
                    <RotateCcw size={13} />
                    Clear order
                  </MenuItem>
                ) : null}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Separator className="my-1 h-px bg-line" />

          <MenuItem onSelect={() => onHideColumn(column.name)}>
            <EyeOff size={13} />
            Hide column "{column.name}"
          </MenuItem>
          <MenuItem onSelect={onHideEmptyColumns}>
            <EyeOff size={13} />
            Hide columns with no data
          </MenuItem>
          <MenuItem onSelect={onResetView}>
            <RotateCcw size={13} />
            Reset column view
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const menuItemClassName =
  "flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 outline-none hover:bg-surface-700 hover:text-zinc-100 data-[highlighted]:bg-surface-700 data-[highlighted]:text-zinc-100";

function MenuItem({
  children,
  onSelect,
}: {
  children: ReactNode;
  onSelect(): void;
}) {
  return (
    <DropdownMenu.Item className={menuItemClassName} onSelect={onSelect}>
      {children}
    </DropdownMenu.Item>
  );
}

function FilterButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      className="rounded-md border border-line bg-control/[0.04] px-2 py-1.5 text-xs text-zinc-300 transition hover:bg-control/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
