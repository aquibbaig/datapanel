import { PostgreSQL } from "dt-sql-parser/dist/parser/postgresql/index.js";

const sql = "select * from subscribers\n\nselect * from organizations where provi";
const parser = new PostgreSQL();
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
