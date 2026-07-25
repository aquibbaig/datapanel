import assert from "node:assert/strict";
import test from "node:test";
import {
  CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import {
  keywordCompletionSource,
  MySQL,
  PostgreSQL,
  schemaCompletionSource,
  sql,
  type SQLConfig,
  type SQLDialect,
} from "@codemirror/lang-sql";
import { EditorState } from "@codemirror/state";
import { sqlCompletionConfig } from "../src/features/query-editor/sqlCompletionConfig";
import { sqlColumnCompletion } from "../src/features/query-editor/sqlCompletion";
import type { TableDetails, TableSummary } from "../src/lib/types";

const tablesBySchema: Record<string, TableSummary[]> = {
  public: [
    { schema: "public", name: "authors", type: "BASE TABLE", rowEstimate: 8 },
    { schema: "public", name: "subscribers", type: "BASE TABLE", rowEstimate: 12 },
    { schema: "public", name: "organizations", type: "BASE TABLE", rowEstimate: 4 },
  ],
  analytics: [
    { schema: "analytics", name: "event_log", type: "VIEW", rowEstimate: 30 },
  ],
};

const subscribers: TableDetails = {
  schema: "public",
  name: "subscribers",
  type: "BASE TABLE",
  columns: [
    column("id", "uuid", true),
    column("user_name", "text"),
    column("organization_id", "uuid"),
    column("created_at", "timestamp with time zone"),
    column("Display Name", "text"),
  ],
  indexes: [],
  constraints: [],
};

const organizations: TableDetails = {
  schema: "public",
  name: "organizations",
  type: "BASE TABLE",
  columns: [
    column("id", "uuid", true),
    column("provider", "text"),
    column("display_name", "text"),
  ],
  indexes: [],
  constraints: [],
};

const authors: TableDetails = {
  schema: "public",
  name: "authors",
  type: "BASE TABLE",
  columns: [column("id", "uuid", true), column("name", "text")],
  indexes: [],
  constraints: [],
};

const detailsByTable = { authors, organizations, subscribers };

const postgresConfig = sqlCompletionConfig(
  PostgreSQL,
  tablesBySchema,
  "public",
);

test("builds native schema metadata for every schema and table", async () => {
  assert.deepEqual(
    await schemaLabels("select * from analytics.ev", postgresConfig),
    ["event_log"],
  );
  assert.ok(
    (await schemaLabels("select * from sub", postgresConfig)).includes(
      "subscribers",
    ),
  );
});

test("completes a query table column in SELECT", async () => {
  assertCompletion(
    await schemaResult("select use| from subscribers"),
    "user_name",
    7,
  );
});

test("completes a query table column in WHERE", async () => {
  assertCompletion(
    await schemaResult("select * from subscribers where use"),
    "user_name",
    32,
  );
});

test("completes columns after boolean predicates", async () => {
  assertCompletion(
    await schemaResult(
      "select * from subscribers where created_at is not null and use",
    ),
    "user_name",
  );
});

for (const { name, sql, expected } of [
  {
    name: "JOIN ON",
    sql: "select * from subscribers s join organizations o on s.org",
    expected: "organization_id",
  },
  {
    name: "GROUP BY",
    sql: "select organization_id, count(*) from subscribers group by org",
    expected: "organization_id",
  },
  {
    name: "ORDER BY",
    sql: "select * from subscribers order by crea",
    expected: "created_at",
  },
  {
    name: "HAVING",
    sql: "select organization_id, count(*) from subscribers group by organization_id having org",
    expected: "organization_id",
  },
  {
    name: "UPDATE SET",
    sql: "update subscribers set use",
    expected: "user_name",
  },
  {
    name: "DELETE WHERE",
    sql: "delete from subscribers where use",
    expected: "user_name",
  },
  {
    name: "INSERT column list",
    sql: "insert into subscribers (use",
    expected: "user_name",
  },
  {
    name: "RETURNING",
    sql: "update subscribers set user_name = 'x' returning use",
    expected: "user_name",
  },
] as const) {
  test(`completes columns in ${name}`, async () => {
    assertCompletion(await schemaResult(sql), expected);
  });
}

test("completes columns through an explicit table alias", async () => {
  assertCompletion(
    await schemaResult(
      "select * from public.subscribers as s where s.use",
    ),
    "user_name",
  );
});

test("completes columns through an implicit table alias", async () => {
  assertCompletion(
    await schemaResult("select s.use from public.subscribers s"),
    "user_name",
  );
});

test("resolves a query table alias in a join", async () => {
  assertCompletion(
    await schemaResult(
      "select s.use| from public.subscribers s join public.organizations o on o.id = s.organization_id",
    ),
    "user_name",
  );
});

test("keeps aliases scoped to the statement at the cursor", async () => {
  assertCompletion(
    await schemaResult(
      "select o.id from organizations o;\nselect s.use from subscribers s",
    ),
    "user_name",
  );
});

test("completes inside a CTE body", async () => {
  assertCompletion(
    await schemaResult(
      "with recent as (select s.use| from subscribers s where s.created_at is not null) select * from recent",
    ),
    "user_name",
  );
});

test("completes inside a nested subquery", async () => {
  assertCompletion(
    await schemaResult(
      "select * from (select use| from subscribers) recent",
    ),
    "user_name",
  );
});

test("completes a quoted PostgreSQL column", async () => {
  assertCompletion(
    await schemaResult('select s."Disp|" from public.subscribers s'),
    '"Display Name"',
  );
});

test("quotes a PostgreSQL completion that needs quoting", async () => {
  const result = await schemaResult("select Disp| from subscribers");
  const option = result?.options.find(({ label }) => label === "Display Name");
  assert.equal(option?.apply, '"Display Name"');
});

test("does not leak schema completion into string literals", async () => {
  assert.equal(
    await schemaResult("select * from subscribers where user_name = 'use"),
    null,
  );
});

test("still offers tables when no table details are loaded", async () => {
  const config = sqlCompletionConfig(PostgreSQL, tablesBySchema);
  assertCompletion(
    await nativeSchemaResult("SELECT COUNT(*) from au", config),
    "authors",
  );
  assert.equal(
    (await schemaLabels("select use", config)).includes("user_name"),
    false,
  );
});

test("uses the connection database as the default MySQL schema", async () => {
  const config = sqlCompletionConfig(
    MySQL,
    {
      app_db: [
        { schema: "app_db", name: "authors", type: "BASE TABLE", rowEstimate: 8 },
      ],
      archive: [],
    },
    "app_db",
  );
  assertCompletion(await nativeSchemaResult("select * from au", config), "authors");
});

test("changing the query table replaces the column set", async () => {
  const labels = (await schemaResult("select prov| from organizations"))
    ?.options.map(({ label }) => label) ?? [];
  assert.ok(labels.includes("provider"));
  assert.equal(labels.includes("user_name"), false);
});

test("query text selects columns without sidebar state", async () => {
  assertCompletion(
    await schemaResult("select nam| from authors where nam"),
    "name",
  );
});

for (const { name, sql, keyword } of [
  {
    name: "LIMIT after WHERE",
    sql: "select * from subscribers where user_name ilike '%konrad%' lim",
    keyword: "LIMIT",
  },
  {
    name: "ORDER after WHERE",
    sql: "select * from subscribers where user_name is not null ord",
    keyword: "ORDER",
  },
  {
    name: "BY after ORDER",
    sql: "select * from subscribers where user_name is not null order b",
    keyword: "BY",
  },
  {
    name: "GROUP after WHERE",
    sql: "select organization_id, count(*) from subscribers where user_name is not null gro",
    keyword: "GROUP",
  },
  {
    name: "BY after GROUP",
    sql: "select organization_id, count(*) from subscribers group b",
    keyword: "BY",
  },
  {
    name: "HAVING after GROUP BY",
    sql: "select organization_id, count(*) from subscribers group by organization_id hav",
    keyword: "HAVING",
  },
  {
    name: "OFFSET after LIMIT",
    sql: "select * from subscribers limit 10 off",
    keyword: "OFFSET",
  },
  {
    name: "RETURNING after UPDATE",
    sql: "update subscribers set user_name = 'x' ret",
    keyword: "RETURNING",
  },
  {
    name: "JOIN after a completed predicate",
    sql: "select * from subscribers s where s.user_name is not null joi",
    keyword: "JOIN",
  },
  {
    name: "UNION after WHERE",
    sql: "select * from subscribers where user_name is not null uni",
    keyword: "UNION",
  },
  {
    name: "FETCH after OFFSET",
    sql: "select * from subscribers offset 10 fet",
    keyword: "FETCH",
  },
  {
    name: "FOR after LIMIT",
    sql: "select * from subscribers limit 10 fo",
    keyword: "FOR",
  },
] as const) {
  test(`completes ${name}`, async () => {
    assertCompletion(await keywordResult(sql), keyword);
  });
}

test("completes PostgreSQL functions alongside reserved words", async () => {
  assertCompletion(await keywordResult("select co"), "COUNT");
  assertCompletion(await keywordResult("select co"), "COALESCE");
});

test("does not offer keywords inside comments", async () => {
  assert.equal(await keywordResult("select * from subscribers -- lim"), null);
  assert.equal(await keywordResult("select /* lim"), null);
});

test("uses MySQL identifier quoting from the native dialect", async () => {
  const result = await schemaResult(
    "select Disp| from subscribers",
    "mysql",
  );
  const option = result?.options.find(({ label }) => label === "Display Name");
  assert.equal(option?.apply, "`Display Name`");
});

test("explicit completion at an empty token returns schema choices", async () => {
  const labels = await schemaLabels("select * from ", postgresConfig, true);
  assert.ok(labels.includes("subscribers"));
  assert.ok(labels.includes("analytics"));
});

test("sql(config) registers working schema and keyword sources", async () => {
  assert.ok(
    (await integratedLabels("select * from subscribers where use")).includes(
      "user_name",
    ),
  );
  assert.ok(
    (
      await integratedLabels(
        "select * from subscribers where user_name ilike '%konrad%' lim",
      )
    ).includes("LIMIT"),
  );
});

function column(name: string, dataType: string, isPrimary = false) {
  return {
    name,
    dataType,
    nullable: !isPrimary,
    default: "",
    position: 0,
    isPrimary,
  };
}

async function schemaResult(
  sql: string,
  driver = "postgres",
  loadTableDetails = loadDetails,
) {
  const sqlDialect = driver === "mysql" ? MySQL : PostgreSQL;
  return runSource(
    sql,
    sqlDialect,
    sqlColumnCompletion({ driver, tablesBySchema, loadTableDetails }),
    false,
  );
}

async function nativeSchemaResult(
  sql: string,
  config: SQLConfig,
  explicit = false,
) {
  return runSource(sql, dialect(config), schemaCompletionSource(config), explicit);
}

async function schemaLabels(
  sql: string,
  config: SQLConfig,
  explicit = false,
) {
  return (await nativeSchemaResult(sql, config, explicit))?.options.map(
    ({ label }) => label,
  ) ?? [];
}

async function keywordResult(sql: string, dialect = PostgreSQL) {
  return runSource(
    sql,
    dialect,
    keywordCompletionSource(dialect, true),
    false,
  );
}

async function integratedLabels(source: string) {
  const cursor = source.indexOf("|");
  const doc = cursor === -1
    ? source
    : `${source.slice(0, cursor)}${source.slice(cursor + 1)}`;
  const position = cursor === -1 ? doc.length : cursor;
  const state = EditorState.create({
    doc,
    extensions: [
      sql(postgresConfig),
      PostgreSQL.language.data.of({
        autocomplete: sqlColumnCompletion({
          driver: "postgres",
          tablesBySchema,
          loadTableDetails: loadDetails,
        }),
      }),
    ],
  });
  const context = new CompletionContext(state, position, false);
  const sources = state.languageDataAt<CompletionSource>(
    "autocomplete",
    position,
  );
  const results = await Promise.all(
    sources.map((completionSource) => Promise.resolve(completionSource(context))),
  );
  return results.flatMap((result) =>
    result?.options.map(({ label }) => label) ?? [],
  );
}

async function runSource(
  sql: string,
  dialect: SQLDialect,
  source: CompletionSource,
  explicit: boolean,
): Promise<CompletionResult | null> {
  const cursor = sql.indexOf("|");
  const doc = cursor === -1 ? sql : `${sql.slice(0, cursor)}${sql.slice(cursor + 1)}`;
  const state = EditorState.create({
    doc,
    extensions: [dialect.extension],
  });
  return Promise.resolve(
    source(
      new CompletionContext(
        state,
        cursor === -1 ? state.doc.length : cursor,
        explicit,
      ),
    ),
  );
}

function dialect(config: SQLConfig) {
  return config.dialect ?? PostgreSQL;
}

async function loadDetails(table: TableSummary) {
  return detailsByTable[table.name as keyof typeof detailsByTable] ?? null;
}

function assertCompletion(
  result: CompletionResult | null,
  label: string,
  from?: number,
) {
  assert.ok(
    result?.options.some((option) => option.label === label),
    `expected ${label}, received ${result?.options.map(({ label }) => label).join(", ") ?? "nothing"}`,
  );
  if (from !== undefined) assert.equal(result?.from, from);
}
