import { TableProperties } from "lucide-react";
import type { QueryResult } from "../../lib/types";

interface Props {
  result: QueryResult | null;
}

export function ResultsGrid({ result }: Props) {
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
      <div className="flex h-7 items-center gap-4 border-b border-line px-3 text-xs text-zinc-300">
        <span>{result.rows.length} rows</span>
        <span>{result.affectedRows} affected</span>
        <span>{result.durationMs}ms</span>
        {result.truncated ? (
          <span className="text-yellow-200">truncated</span>
        ) : null}
      </div>
      <div className="h-[calc(100%-28px)] overflow-auto">
        <table className="text-xs">
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th
                  className="sticky top-0 bg-surface-800 px-3 py-2 text-left font-medium text-zinc-300"
                  key={column.name}
                >
                  {column.name}
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
