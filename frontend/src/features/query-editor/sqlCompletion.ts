import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import type {
  CaretPosition,
  Suggestions,
} from "dt-sql-parser/dist/parser/common/types";
import type {
  CommonEntityContext,
  EntityContext,
} from "dt-sql-parser/dist/parser/common/entityCollector";
import { schemaService } from "../../lib/backend";
import type {
  ConnectionProfile,
  SchemaSummary,
  TableDetails,
  TableSummary,
} from "../../lib/types";

interface SQLCompletionConfig {
  activeConnectionId: string;
  activeProfile: ConnectionProfile | null;
  schemas: SchemaSummary[];
  tablesBySchema: Record<string, TableSummary[]>;
}

interface SQLParser {
  getSuggestionAtCaretPosition(
    sql: string,
    position: CaretPosition,
  ): Suggestions | null;
  getAllEntities(sql: string, position?: CaretPosition): EntityContext[] | null;
}

const parserPromises = new Map<string, Promise<SQLParser>>();

export function sqlCompletion({
  activeConnectionId,
  activeProfile,
  schemas,
  tablesBySchema,
}: SQLCompletionConfig) {
  return async function completeSQL(
    context: CompletionContext,
  ): Promise<CompletionResult | null> {
    const sql = context.state.doc.toString();
    const position = caretPosition(context);
    const parser = await parserFor(activeProfile);
    const suggestions = parser.getSuggestionAtCaretPosition(sql, position);
    if (!suggestions) return null;

    const token = context.matchBefore(/[A-Za-z0-9_$\."`\[\]]*/);
    const from = token?.from ?? context.pos;
    const rawFragment = token?.text ?? "";
    const fragment = completionFragment(rawFragment);
    const syntax = new Set<string>(
      suggestions.syntax.map((suggestion) => suggestion.syntaxContextType),
    );
    let options: Completion[] = [];

    if (syntax.has("column")) {
      options = await columnOptions(
        parser.getAllEntities(sql, position) ?? [],
        rawFragment,
        activeConnectionId,
        activeProfile,
        tablesBySchema,
      );
    }

    if (
      syntax.has("table") ||
      syntax.has("view") ||
      syntax.has("database")
    ) {
      options.push(
        ...tableOptions(activeProfile, schemas, tablesBySchema, rawFragment),
      );
    }

    const semanticOptionCount = options.length;
    options.push(
      ...suggestions.keywords
        .filter((keyword) => keyword.toLowerCase().startsWith(fragment))
        .map((keyword) => ({
          label: keyword,
          type: "keyword",
          apply: keyword,
          detail: "keyword",
          boost: 0,
        })),
    );

    const unique = dedupeOptions(options).slice(0, 80);
    if (
      unique.length === 0 ||
      (!rawFragment && !context.explicit && semanticOptionCount === 0)
    ) {
      return null;
    }
    return { from, options: unique, validFor: /^[A-Za-z0-9_$\."`\[\]]*$/ };
  };
}

function parserFor(profile: ConnectionProfile | null) {
  const driver = profile?.driver ?? "generic";
  const cached = parserPromises.get(driver);
  if (cached) return cached;
  const parser =
    driver === "mysql"
      ? import("dt-sql-parser/dist/parser/mysql/index.js").then(
          ({ MySQL }) => new MySQL(),
        )
      : driver === "postgres"
        ? import("dt-sql-parser/dist/parser/postgresql/index.js").then(
            ({ PostgreSQL }) => new PostgreSQL(),
          )
        : import("dt-sql-parser/dist/parser/generic/index.js").then(
            ({ GenericSQL }) => new GenericSQL(),
          );
  parserPromises.set(driver, parser);
  return parser;
}

function caretPosition(context: CompletionContext): CaretPosition {
  const line = context.state.doc.lineAt(context.pos);
  return { lineNumber: line.number, column: context.pos - line.from + 1 };
}

async function columnOptions(
  entities: EntityContext[],
  rawFragment: string,
  connectionId: string,
  profile: ConnectionProfile | null,
  tablesBySchema: Record<string, TableSummary[]>,
) {
  const target = qualifiedTarget(rawFragment);
  const refs = entities
    .filter(
      (entity): entity is CommonEntityContext =>
        entity.entityContextType === "table" &&
        entity.isAccessible === true,
    )
    .flatMap((entity): TableReference[] => {
      const table = findTable(entity.text, tablesBySchema);
      const alias = entity._alias?.text;
      return table ? [{ table, alias }] : [];
    })
    .filter((ref) => !target || matchesQualifier(ref, target.qualifier));
  const details = (
    await Promise.all(
      refs.map(async (ref) => ({
        ...ref,
        details: await loadTableDetails(connectionId, ref.table),
      })),
    )
  ).filter(
    (ref): ref is TableReference & { details: TableDetails } =>
      Boolean(ref.details),
  );
  const quote = quoteFor(profile);
  const includeQualifier = details.length > 1;
  const fragment = target?.fragment ?? completionFragment(rawFragment);
  const columnCounts = new Map<string, number>();

  for (const ref of details) {
    for (const column of ref.details.columns) {
      const name = column.name.toLowerCase();
      columnCounts.set(name, (columnCounts.get(name) ?? 0) + 1);
    }
  }

  const options: Completion[] = [];
  for (const ref of details) {
    const qualifier = ref.alias ?? ref.table.name;
    for (const column of ref.details.columns) {
      if (!matches(column.name, fragment)) continue;
      const detail = `${ref.table.schema}.${ref.table.name} ${column.dataType}`;
      const baseBoost = column.isPrimary ? 110 : 100;

      if (target) {
        options.push({
          label: `${target.qualifier}.${column.name}`,
          type: "property",
          apply: `${target.qualifier.split(".").map(quote).join(".")}.${quote(column.name)}`,
          detail,
          boost: baseBoost,
        });
      } else if (includeQualifier) {
        options.push({
          label: `${qualifier}.${column.name}`,
          type: "property",
          apply: `${quote(qualifier)}.${quote(column.name)}`,
          detail,
          boost: baseBoost,
        });
        if (columnCounts.get(column.name.toLowerCase()) === 1) {
          options.push({
            label: column.name,
            type: "property",
            apply: quote(column.name),
            detail,
            boost: baseBoost - 10,
          });
        }
      } else {
        options.push({
          label: column.name,
          type: "property",
          apply: quote(column.name),
          detail,
          boost: baseBoost + Math.max(0, 30 - column.name.length),
        });
      }
    }
  }
  return options;
}

function tableOptions(
  profile: ConnectionProfile | null,
  schemas: SchemaSummary[],
  tablesBySchema: Record<string, TableSummary[]>,
  rawFragment: string,
) {
  const quote = quoteFor(profile);
  const target = qualifiedTarget(rawFragment);
  const fragment = target?.fragment ?? completionFragment(rawFragment);
  const selectedSchemas = target
    ? schemas.filter(
        (schema) => schema.name.toLowerCase() === target.qualifier.toLowerCase(),
      )
    : schemas;
  const options: Completion[] = [];

  for (const schema of selectedSchemas) {
    if (!target && matches(schema.name, fragment)) {
      options.push({
        label: schema.name,
        type: "namespace",
        apply: `${quote(schema.name)}.`,
        detail: "schema",
        boost: 75,
      });
    }
    for (const table of tablesForSchema(schema.name, tablesBySchema)) {
      if (!matches(table.name, fragment)) continue;
      const qualified = `${schema.name}.${table.name}`;
      options.push({
        label: target ? qualified : table.name,
        type: "variable",
        apply: target
          ? `${quote(schema.name)}.${quote(table.name)}`
          : quote(table.name),
        detail: target ? table.type.replace("BASE ", "") : `${schema.name} ${table.type.replace("BASE ", "")}`,
        boost: 100,
      });
      if (!target) {
        options.push({
          label: qualified,
          type: "variable",
          apply: `${quote(schema.name)}.${quote(table.name)}`,
          detail: table.type.replace("BASE ", ""),
          boost: 90,
        });
      }
    }
  }
  return options;
}

interface TableReference {
  table: TableSummary;
  alias?: string;
}

function findTable(
  identifier: string,
  tablesBySchema: Record<string, TableSummary[]>,
) {
  const parts = identifier
    .split(".")
    .map((part) => part.replace(/^["`\[]|["`\]]$/g, "").toLowerCase());
  const tableName = parts[parts.length - 1];
  const schemaName = parts.length > 1 ? parts[parts.length - 2] : undefined;
  return (
    Object.values(tablesBySchema)
      .flat()
      .find(
        (table) =>
          table.name.toLowerCase() === tableName &&
          (!schemaName || table.schema.toLowerCase() === schemaName),
      ) ?? null
  );
}

function matchesQualifier(ref: TableReference, qualifier: string) {
  const normalized = qualifier.toLowerCase();
  return (
    ref.alias?.toLowerCase() === normalized ||
    ref.table.name.toLowerCase() === normalized ||
    `${ref.table.schema}.${ref.table.name}`.toLowerCase() === normalized
  );
}

function qualifiedTarget(fragment: string) {
  const clean = fragment.replace(/["`\[\]]/g, "");
  const dot = clean.lastIndexOf(".");
  return dot === -1
    ? null
    : {
        qualifier: clean.slice(0, dot),
        fragment: clean.slice(dot + 1).toLowerCase(),
      };
}

function completionFragment(fragment: string) {
  return fragment.replace(/["`\[\]]/g, "").toLowerCase();
}

function matches(candidate: string, fragment: string) {
  return !fragment || candidate.toLowerCase().startsWith(fragment);
}

function tablesForSchema(
  schema: string,
  tablesBySchema: Record<string, TableSummary[]>,
) {
  return (
    Object.entries(tablesBySchema).find(
      ([name]) => name.toLowerCase() === schema.toLowerCase(),
    )?.[1] ?? []
  );
}

function dedupeOptions(options: Completion[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.label}:${String(option.apply)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const tableDetailsCache = new Map<string, Promise<TableDetails | null>>();

async function loadTableDetails(connectionId: string, table: TableSummary) {
  if (!connectionId) return null;
  const key = `${connectionId}:${table.schema}.${table.name}`;
  const cached = tableDetailsCache.get(key);
  if (cached) return cached;
  const details = schemaService
    .describe(connectionId, table.schema, table.name)
    .catch(() => null);
  tableDetailsCache.set(key, details);
  return details;
}

function quoteFor(profile: ConnectionProfile | null) {
  return profile?.driver === "mysql" || profile?.driver === "bigquery"
    ? quoteBacktick
    : quotePostgres;
}

function quotePostgres(identifier: string) {
  return /^[a-z_][a-z0-9_]*$/.test(identifier)
    ? identifier
    : `"${identifier.split('"').join('""')}"`;
}

function quoteBacktick(identifier: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)
    ? identifier
    : `\`${identifier.split("`").join("``")}\``;
}
