import {
  ChevronDown,
  Download,
  FileJson,
  FileSpreadsheet,
  KeyRound,
  TableProperties,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import type { QueryResult } from "../../lib/types";

interface Props {
  result: QueryResult | null;
  primaryKeyColumns?: string[];
}

export function ResultsGrid({ primaryKeyColumns = [], result }: Props) {
  const primaryKeyColumnSet = new Set(
    primaryKeyColumns.map((column) => column.toLowerCase()),
  );

  if (!result) {
    return (
      <section className="grid min-h-0 place-items-center gap-2 bg-surface-900 text-muted">
        <div className="flex flex-col items-center justify-center gap-4">
          <TableProperties size={24} />
          <p>Run a query to see results.</p>
        </div>
      </section>
    );
  }

  if (result.error === "confirmation_required") {
    return (
      <section className="grid min-h-0 place-items-center bg-surface-900 text-yellow-100">
        <p>Destructive query confirmation is required before execution.</p>
      </section>
    );
  }

  return (
    <section className="min-h-0 overflow-hidden bg-surface-900">
      <div className="flex h-8 items-center justify-between gap-4 border-b border-line px-2 text-xs text-zinc-300">
        <div className="flex min-w-0 items-center gap-4">
          <span>{result.rows.length} rows</span>
          <span>{result.affectedRows} affected</span>
          <span>{result.durationMs}ms</span>
          {result.truncated ? (
            <span className="text-yellow-200">truncated</span>
          ) : null}
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="inline-flex h-6 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-zinc-500 transition hover:bg-surface-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-65 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0"
              disabled={result.columns.length === 0}
              title="Export results"
            >
              <Download size={13} />
              Export as
              <ChevronDown size={12} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-[1000] min-w-36 overflow-hidden rounded-ui border border-line bg-surface-800 py-1 shadow-xl"
              sideOffset={6}
            >
              <DropdownMenu.Item
                className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 outline-none hover:bg-surface-700 hover:text-zinc-100 data-[highlighted]:bg-surface-700 data-[highlighted]:text-zinc-100"
                onSelect={() => exportCSV(result)}
              >
                <FileSpreadsheet size={13} />
                CSV
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 outline-none hover:bg-surface-700 hover:text-zinc-100 data-[highlighted]:bg-surface-700 data-[highlighted]:text-zinc-100"
                onSelect={() => exportJSON(result)}
              >
                <FileJson size={13} />
                JSON
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <div className="h-[calc(100%-32px)] overflow-auto">
        <table className="text-xs">
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th
                  className="sticky top-0 bg-surface-800 px-3 py-2 text-left font-medium text-zinc-300"
                  key={column.name}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {primaryKeyColumnSet.has(column.name.toLowerCase()) ? (
                      <KeyRound
                        aria-label="Primary key"
                        className="text-yellow-200"
                        size={10}
                      />
                    ) : null}
                    <span className="truncate">{column.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td className="px-3 py-2 text-zinc-300" key={cellIndex}>
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function exportJSON(result: QueryResult) {
  const columns = result.columns.map((column) => column.name);
  const objects = result.rows.map((row) =>
    Object.fromEntries(
      columns.map((column, index) => [column, row[index] ?? null]),
    ),
  );
  downloadFile("json", JSON.stringify(objects, null, 2), "application/json");
}

function exportCSV(result: QueryResult) {
  const headers = result.columns.map((column) => column.name);
  const rows = result.rows.map((row) => row.map(csvCell).join(","));
  downloadFile(
    "csv",
    [headers.map(csvCell).join(","), ...rows].join("\n"),
    "text/csv;charset=utf-8",
  );
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadFile(
  extension: "csv" | "json",
  contents: string,
  type: string,
) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `datapanel-results-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  toast("Export ready", {
    description: `${extension.toUpperCase()} downloaded`,
  });
}
