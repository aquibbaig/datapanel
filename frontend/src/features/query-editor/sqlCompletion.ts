import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import {
  MySQL,
  PostgreSQL,
  schemaCompletionSource,
  StandardSQL,
  type SQLDialect,
  type SQLNamespace,
} from "@codemirror/lang-sql";
import type { CaretPosition } from "dt-sql-parser/dist/parser/common/types";
import type { ErrorListener } from "dt-sql-parser/dist/parser/common/parseErrorListener";
import type {
  CommonEntityContext,
  EntityContext,
} from "dt-sql-parser/dist/parser/common/entityCollector";
import type { TableDetails, TableSummary } from "../../lib/types";

interface SQLParser {
  createParser(sql: string, errorListener?: ErrorListener): unknown;
  getAllEntities(sql: string, position?: CaretPosition): EntityContext[] | null;
}

interface SQLCompletionConfig {
  driver?: string;
  tablesBySchema: Record<string, TableSummary[]>;
  loadTableDetails(table: TableSummary): Promise<TableDetails | null>;
}

interface ReferencedTable {
  table: TableSummary;
  aliases: string[];
}

const parserPromises = new Map<string, Promise<SQLParser>>();

export function sqlColumnCompletion({
  driver,
  tablesBySchema,
  loadTableDetails,
}: SQLCompletionConfig): CompletionSource {
  return async (context) => {
    const sql = context.state.doc.toString();
    const position = caretPosition(context);
    const parser = await parserFor(driver);
    const entities = entitiesAt(parser, sql, position);
    const tables = referencedTables(
      entities,
      tablesBySchema,
    );
    const details = (
      await Promise.all(
        tables.map(async ({ table, aliases }) => ({
          table,
          aliases,
          details: await loadTableDetails(table).catch(() => null),
        })),
      )
    ).filter(
      (entry): entry is ReferencedTable & { details: TableDetails } =>
        Boolean(entry.details),
    );
    if (details.length === 0) return null;

    const dialect = dialectFor(driver);
    const schema = completionSchema(details);
    const results = await Promise.all(
      details.map(({ table }) =>
        schemaCompletionSource({
          dialect,
          schema,
          defaultSchema: table.schema,
          defaultTable: table.name,
        })(context),
      ),
    );
    return mergeResults(results);
  };
}

function entitiesAt(parser: SQLParser, sql: string, position: CaretPosition) {
  try {
    return parser.getAllEntities(sql, position) ?? [];
  } catch {
    return parser.getAllEntities(sql) ?? [];
  }
}

function referencedTables(
  entities: EntityContext[],
  tablesBySchema: Record<string, TableSummary[]>,
) {
  const tables = Object.values(tablesBySchema).flat();
  const found = new Map<string, ReferencedTable>();
  for (const entity of entities
    .filter(
      (entity): entity is CommonEntityContext =>
        entity.entityContextType === "table" && entity.isAccessible !== false,
    )) {
    const parts = entity.text
      .split(".")
      .map((part) => part.replace(/^["`\[]|["`\]]$/g, "").toLowerCase());
    const name = parts[parts.length - 1];
    const schema = parts.length > 1 ? parts[parts.length - 2] : undefined;
    const table = tables.find(
      (candidate) =>
        candidate.name.toLowerCase() === name &&
        (!schema || candidate.schema.toLowerCase() === schema),
    );
    if (!table) continue;
    const key = `${table.schema}.${table.name}`.toLowerCase();
    const entry = found.get(key) ?? { table, aliases: [] };
    const alias = entity._alias?.text;
    if (alias && !entry.aliases.includes(alias)) entry.aliases.push(alias);
    found.set(key, entry);
  }
  return [...found.values()];
}

function completionSchema(
  entries: Array<ReferencedTable & { details: TableDetails }>,
) {
  const schema: Record<string, SQLNamespace> = {};
  for (const { table, aliases, details } of entries) {
    const columns = details.columns.map(({ name }) => name);
    const schemaTables = (schema[table.schema] ??= {}) as Record<
      string,
      SQLNamespace
    >;
    schemaTables[table.name] = columns;
    for (const alias of aliases) schema[alias] = columns;
  }
  return schema;
}

function mergeResults(results: Array<CompletionResult | null>) {
  const available = results.filter(
    (result): result is CompletionResult => Boolean(result),
  );
  if (available.length === 0) return null;
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const result of available) {
    for (const option of result.options) {
      const key = `${option.label}:${String(option.apply)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(option);
    }
  }
  return { ...available[0], options };
}

function caretPosition(context: CompletionContext): CaretPosition {
  const line = context.state.doc.lineAt(context.pos);
  return { lineNumber: line.number, column: context.pos - line.from + 1 };
}

function dialectFor(driver: string | undefined): SQLDialect {
  return driver === "mysql"
    ? MySQL
    : driver === "postgres"
      ? PostgreSQL
      : StandardSQL;
}

function parserFor(driver: string | undefined) {
  const name = driver ?? "generic";
  const cached = parserPromises.get(name);
  if (cached) return cached;
  const parser =
    name === "mysql"
      ? import("dt-sql-parser/dist/parser/mysql/index.js").then(
          ({ MySQL }) => quietParser(new MySQL()),
        )
      : name === "postgres"
        ? import("dt-sql-parser/dist/parser/postgresql/index.js").then(
            ({ PostgreSQL }) => quietParser(new PostgreSQL()),
          )
        : import("dt-sql-parser/dist/parser/generic/index.js").then(
            ({ GenericSQL }) => quietParser(new GenericSQL()),
          );
  parserPromises.set(name, parser);
  return parser;
}

function quietParser(parser: SQLParser) {
  const createParser = parser.createParser.bind(parser);
  parser.createParser = (sql) => createParser(sql, () => {});
  return parser;
}
