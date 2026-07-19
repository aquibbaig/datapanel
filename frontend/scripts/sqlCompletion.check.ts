import { CompletionContext } from "@codemirror/autocomplete";
import { keywordCompletionSource, PostgreSQL } from "@codemirror/lang-sql";
import { EditorState } from "@codemirror/state";
import { PostgreSQL as PostgreSQLParser } from "dt-sql-parser/dist/parser/postgresql/index.js";

const sql = "select * from subscribers\n\nselect * from organizations where provi";
const parser = new PostgreSQLParser();
const entities = parser.getAllEntities(sql, { lineNumber: 3, column: 40 }) ?? [];
const accessibleTables = entities
  .filter(
    (entity) =>
      entity.entityContextType === "table" &&
      entity.isAccessible,
  )
  .map((entity) => entity.text);

if (accessibleTables.join() !== "organizations") {
  throw new Error(`expected organizations, received ${accessibleTables.join()}`);
}

const state = EditorState.create({ doc: "SELECT co" });
const keywordResult = await keywordCompletionSource(PostgreSQL, true)(
  new CompletionContext(state, state.doc.length, false),
);
if (!keywordResult?.options.some((option) => option.label === "COUNT")) {
  throw new Error("PostgreSQL completion must include COUNT");
}
