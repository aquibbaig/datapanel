import type {
  SQLConfig,
  SQLDialect,
  SQLNamespace,
} from "@codemirror/lang-sql";
import type { TableSummary } from "../../lib/types";

export function sqlCompletionConfig(
  dialect: SQLDialect,
  tablesBySchema: Record<string, TableSummary[]>,
  preferredSchema?: string,
): SQLConfig {
  const schema: Record<string, SQLNamespace> = {};
  const schemaNames = Object.keys(tablesBySchema);

  for (const [schemaName, tables] of Object.entries(tablesBySchema)) {
    const schemaTables: Record<string, SQLNamespace> = {};
    for (const table of tables) {
      schemaTables[table.name] = [];
    }
    schema[schemaName] = schemaTables;
  }

  return {
    dialect,
    schema,
    defaultSchema:
      schemaNames.find(
        (name) => name.toLowerCase() === preferredSchema?.toLowerCase(),
      ) ??
      schemaNames.find((name) => name.toLowerCase() === "public") ??
      (schemaNames.length === 1 ? schemaNames[0] : undefined),
    upperCaseKeywords: true,
  };
}
