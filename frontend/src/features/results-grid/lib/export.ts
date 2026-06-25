import { toast } from "sonner";
import { fileExportService } from "../../../lib/backend";
import type { QueryResult } from "../../../lib/types";

export async function exportJSON(result: QueryResult) {
  const columns = result.columns.map((column) => column.name);
  const objects = result.rows.map((row) =>
    Object.fromEntries(
      columns.map((column, index) => [column, row[index] ?? null]),
    ),
  );
  await saveExport("json", JSON.stringify(objects, null, 2), "application/json");
}

export async function exportCSV(result: QueryResult) {
  const headers = result.columns.map((column) => column.name);
  const rows = result.rows.map((row) => row.map(csvCell).join(","));
  await saveExport(
    "csv",
    [headers.map(csvCell).join(","), ...rows].join("\n"),
    "text/csv;charset=utf-8",
  );
}

export function serializeRowsAsTSV(result: QueryResult) {
  return result.rows.map((row) => row.map(tsvCell).join("\t")).join("\n");
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tsvCell(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

async function saveExport(
  extension: "csv" | "json",
  contents: string,
  type: string,
) {
  const filename = `datapanel-results-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
  try {
    const saved = await fileExportService.save({ filename, contents });
    if (saved?.path) {
      toast("Export saved", {
        description: saved.path,
      });
      return;
    }
  } catch (error) {
    toast.error("Export failed", {
      description:
        error instanceof Error ? error.message : "Could not save export file.",
    });
    return;
  }

  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  toast("Browser export started", {
    description: `${filename}. Your browser controls where this file is saved.`,
  });
}
