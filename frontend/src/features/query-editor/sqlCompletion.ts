import {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { schemaService } from "../../lib/backend";
import type {
  ConnectionProfile,
  SchemaSummary,
  TableDetails,
  TableSummary,
} from "../../lib/types";

const sqlKeywords = [
  "SELECT",
  "FROM",
  "WHERE",
  "JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "GROUP BY",
  "ORDER BY",
  "LIMIT",
  "OFFSET",
  "INSERT INTO",
  "UPDATE",
  "DELETE FROM",
  "CREATE TABLE",
  "ALTER TABLE",
  "DROP TABLE",
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "AND",
  "OR",
  "NOT",
  "IN",
  "BETWEEN",
  "LIKE",
  "ILIKE",
  "EXISTS",
  "TRUE",
  "FALSE",
  "NULL",
  "IS NULL",
  "IS NOT NULL",
  "DISTINCT",
  "HAVING",
  "RETURNING",
  "EXPLAIN",
  "BEGIN",
  "COMMIT",
  "ROLLBACK"
];

interface SQLCompletionConfig {
  activeConnectionId: string;
  activeProfile: ConnectionProfile | null;
  schemas: SchemaSummary[];
  schemaCompletions: CompletionOption[];
  tablesBySchema: Record<string, TableSummary[]>;
}

export function sqlCompletion({
  activeConnectionId,
  activeProfile,
  schemas,
  schemaCompletions,
  tablesBySchema,
}: SQLCompletionConfig) {
  return async function completeSQL(
    context: CompletionContext,
  ): Promise<CompletionResult | null> {
    if (isCompletionSuppressedAtCursor(context)) {
      return null;
    }

    const token = completionTokenBefore(context);
    const from = token.from;
    const fragment = normalizeCompletionFragment(token.text);
    const completionContext = inferCompletionContext(context, from, token.text);

    if (completionContext === "none") {
      return null;
    }

    if (!token.text && !context.explicit && completionContext === "keyword") {
      return null;
    }

    if (completionContext === "expression") {
      const options = (
        await expressionCompletionOptions(
          context,
          from,
          token.text,
          activeConnectionId,
          activeProfile,
          tablesBySchema,
        )
      ).slice(0, 80);

      if (options.length > 0) {
        return {
          from,
          options,
          validFor: completionValidFor
        };
      }
    }

    if (completionContext === "table") {
      const options = tableCompletionOptions(
        activeProfile,
        schemas,
        tablesBySchema,
        fragment,
      ).slice(0, 80);

      if (options.length === 0) {
        return null;
      }

      return {
        from,
        options,
        validFor: completionValidFor
      };
    }

    const keywordOptions = sqlKeywords
      .filter((keyword) => keyword.toLowerCase().startsWith(fragment))
      .map((keyword) => ({
        label: keyword,
        type: "keyword",
        apply: keyword,
        detail: "keyword",
        matchText: keyword.toLowerCase(),
        boost: keywordBoost(keyword, context, from),
      }));

    const schemaOptions = schemaCompletions.filter((option) =>
      matchesCompletion(option, fragment)
    );
    const options = [...keywordOptions, ...schemaOptions].slice(0, 80);

    if (options.length === 0) {
      return null;
    }

    return {
      from,
      options,
      validFor: completionValidFor
    };
  };
}

const completionValidFor = /^[A-Za-z0-9_$."`\[\]]*$/;

function completionTokenBefore(context: CompletionContext) {
  const tokenCharacters = /[A-Za-z0-9_$."`\[\]]/;
  let from = context.pos;
  while (from > 0 && tokenCharacters.test(context.state.sliceDoc(from - 1, from))) {
    from -= 1;
  }
  return {
    from,
    text: context.state.sliceDoc(from, context.pos),
  };
}

function normalizeCompletionFragment(fragment: string) {
  return fragment
    .replace(/["`\[\]]/g, "")
    .trim()
    .toLowerCase();
}

type SQLCompletionContext = "keyword" | "table" | "expression" | "none";

function inferCompletionContext(
  context: CompletionContext,
  fragmentFrom: number,
  fragment: string,
): SQLCompletionContext {
  const maskedStatementBefore = currentMaskedStatementBefore(
    context,
    fragmentFrom,
  ).toLowerCase();

  if (isTableReferenceCompletionContext(maskedStatementBefore)) return "table";
  if (
    !context.explicit &&
    isPredicateValueCompletionContext(maskedStatementBefore)
  ) {
    return "none";
  }
  if (isExpressionCompletionContext(maskedStatementBefore, fragment)) {
    return "expression";
  }
  return "keyword";
}

function isTableReferenceCompletionContext(statementBefore: string) {
  const beforeFragment = statementBefore.slice(-200);
  return (
    /\b(from|join|using|update|into)\s+$/.test(beforeFragment) ||
    /\b(?:alter|drop|truncate)\s+table\s+$/.test(beforeFragment) ||
    /\b(?:describe|desc)\s+$/.test(beforeFragment)
  );
}

function isExpressionCompletionContext(
  statement: string,
  fragment: string,
) {
  if (qualifiedCompletionTarget(fragment)) return true;

  const expressionIndex = Math.max(
    lastKeywordIndex(statement, "select"),
    lastKeywordIndex(statement, "set"),
    lastKeywordIndex(statement, "where"),
    lastKeywordIndex(statement, "having"),
    lastKeywordIndex(statement, "on"),
    lastKeywordIndex(statement, "group by"),
    lastKeywordIndex(statement, "order by"),
    lastKeywordIndex(statement, "returning"),
  );
  if (expressionIndex < 0) return false;

  const terminatorIndex = Math.max(
    lastKeywordIndex(statement, "from"),
    lastKeywordIndex(statement, "join"),
    lastKeywordIndex(statement, "where"),
    lastKeywordIndex(statement, "group by"),
    lastKeywordIndex(statement, "order by"),
    lastKeywordIndex(statement, "having"),
    lastKeywordIndex(statement, "limit"),
    lastKeywordIndex(statement, "offset"),
    lastKeywordIndex(statement, "fetch"),
    lastKeywordIndex(statement, "for"),
  );
  if (lastKeywordIndex(statement, "select") === expressionIndex) {
    return terminatorIndex < expressionIndex;
  }

  return true;
}

function isPredicateValueCompletionContext(statementBefore: string) {
  const predicateTail = statementBefore.slice(
    lastPredicateBoundaryEnd(statementBefore),
  );
  if (!predicateValuePatterns.some((pattern) => pattern.test(predicateTail))) {
    return false;
  }

  return lastPredicateClause(statementBefore) !== "on";
}

const predicateValuePatterns = [
  /(?:=|<>|!=|<=|>=|<|>)[\s\S]*$/,
  /\b(?:not\s+)?(?:like|ilike)\s+[\s\S]*$/,
  /\b(?:not\s+)?in\s*\([\s\S]*$/,
  /\bis\s+(?:not\s+)?[\s\S]*$/,
  /\bbetween\s+[\s\S]*$/,
];

function lastPredicateBoundaryEnd(statement: string) {
  let boundaryEnd = 0;
  for (const pattern of predicateBoundaryPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(statement))) {
      boundaryEnd = Math.max(boundaryEnd, match.index + match[0].length);
    }
  }

  return Math.max(boundaryEnd, statement.lastIndexOf(",") + 1);
}

function lastPredicateClause(statement: string) {
  let clause: PredicateClause | null = null;
  let clauseIndex = -1;

  for (const { keyword, pattern } of predicateClausePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(statement))) {
      if (match.index > clauseIndex) {
        clause = keyword;
        clauseIndex = match.index;
      }
    }
  }

  return clause;
}

const predicateBoundaryKeywords = [
  "where",
  "having",
  "on",
  "set",
  "and",
  "or",
  "when",
  "then",
  "else",
  "group by",
  "order by",
  "limit",
  "offset",
  "fetch",
  "returning",
  "values",
];

const predicateBoundaryPatterns = predicateBoundaryKeywords.map(
  (keyword) => new RegExp(`\\b${keyword}\\b`, "gi"),
);

type PredicateClause = "where" | "having" | "on" | "set";

const predicateClausePatterns: Array<{
  keyword: PredicateClause;
  pattern: RegExp;
}> = (["where", "having", "on", "set"] as const).map((keyword) => ({
  keyword,
  pattern: new RegExp(`\\b${keyword}\\b`, "gi"),
}));

async function expressionCompletionOptions(
  context: CompletionContext,
  fragmentFrom: number,
  rawFragment: string,
  activeConnectionId: string,
  activeProfile: ConnectionProfile | null,
  tablesBySchema: Record<string, TableSummary[]>,
) {
  const memberTarget = qualifiedCompletionTarget(rawFragment);
  const fragment = memberTarget?.memberFragment ?? normalizeCompletionFragment(rawFragment);
  const tableRefs = parseTableReferences(
    currentStatementAround(context, fragmentFrom),
    tablesBySchema,
  );
  const candidateRefs = memberTarget
    ? tableRefs.filter((tableRef) => matchesTableQualifier(tableRef, memberTarget.qualifierParts))
    : tableRefs;
  const tableDetails = await Promise.all(
    candidateRefs.map((tableRef) =>
      loadTableDetails(activeConnectionId, tableRef.table).then((details) => ({
        ...tableRef,
        details,
      })),
    ),
  );
  const validDetails = tableDetails.filter(
    (tableRef): tableRef is TableReference & { details: TableDetails } =>
      Boolean(tableRef.details),
  );
  const quote =
    activeProfile?.driver === "mysql" || activeProfile?.driver === "bigquery"
      ? quoteBacktick
      : quotePostgres;
  const includeQualifier = validDetails.length > 1;
  const options: CompletionOption[] = [];
  const optionKeys = new Set<string>();
  const columnOccurrences = columnNameCounts(validDetails);

  function addOption(option: CompletionOption) {
    const key = `${option.apply}:${option.label}`;
    if (optionKeys.has(key)) return;
    optionKeys.add(key);
    options.push(option);
  }

  for (const tableRef of validDetails) {
    const qualifier = tableRef.alias || tableRef.table.name;
    const qualifiedApply = memberTarget
      ? [...memberTarget.qualifierParts, ""]
      : [qualifier, ""];
    for (const column of tableRef.details.columns) {
      if (memberTarget) {
        const applyParts = [...qualifiedApply.slice(0, -1), column.name];
        addOption({
          label: `${memberTarget.qualifier}.${column.name}`,
          type: "property",
          apply: applyParts.map(quote).join("."),
          detail: `${tableRef.table.schema}.${tableRef.table.name} ${column.dataType}`,
          matchText: column.name.toLowerCase(),
          boost: column.isPrimary ? 110 : 105,
        });
        continue;
      }

      const columnDetail = `${tableRef.table.schema}.${tableRef.table.name} ${column.dataType}`;
      if (includeQualifier) {
        addOption({
          label: `${qualifier}.${column.name}`,
          type: "property",
          apply: `${quote(qualifier)}.${quote(column.name)}`,
          detail: columnDetail,
          matchText: `${qualifier}.${column.name}`.toLowerCase(),
          boost: column.isPrimary ? 100 : 95,
        });
        if (columnOccurrences.get(column.name.toLowerCase()) === 1) {
          addOption({
            label: column.name,
            type: "property",
            apply: quote(column.name),
            detail: columnDetail,
            matchText: column.name.toLowerCase(),
            boost: column.isPrimary ? 86 : 82,
          });
        }
        continue;
      }

      addOption({
        label: column.name,
        type: "property",
        apply: quote(column.name),
        detail: columnDetail,
        matchText: column.name.toLowerCase(),
        boost: column.isPrimary ? 100 : 95,
      });

      if (tableRef.alias) {
        addOption({
          label: `${qualifier}.${column.name}`,
          type: "property",
          apply: `${quote(qualifier)}.${quote(column.name)}`,
          detail: columnDetail,
          matchText: `${qualifier}.${column.name}`.toLowerCase(),
          boost: column.isPrimary ? 84 : 80,
        });
      }
    }
  }

  return options.filter((option) => matchesCompletion(option, fragment));
}

function tableCompletionOptions(
  activeProfile: ConnectionProfile | null,
  schemas: SchemaSummary[],
  tablesBySchema: Record<string, TableSummary[]>,
  fragment: string,
) {
  const quote =
    activeProfile?.driver === "mysql" || activeProfile?.driver === "bigquery"
      ? quoteBacktick
      : quotePostgres;
  const memberTarget = qualifiedCompletionTarget(fragment);
  const options: CompletionOption[] = [];

  if (memberTarget) {
    const schema = memberTarget.qualifierParts[memberTarget.qualifierParts.length - 1];
    const schemaTables = tablesForSchema(schema, tablesBySchema);
    for (const table of schemaTables) {
      const qualified = `${table.schema}.${table.name}`;
      options.push({
        label: qualified,
        type: "variable",
        apply: `${quote(table.schema)}.${quote(table.name)}`,
        detail: table.type.replace("BASE ", ""),
        matchText: table.name.toLowerCase(),
        boost: 95,
      });
    }
    return options.filter((option) =>
      matchesCompletion(option, memberTarget.memberFragment)
    );
  }

  for (const schema of schemas) {
    const schemaTables = tablesBySchema[schema.name] || [];
    options.push({
      label: schema.name,
      type: "namespace",
      apply: `${quote(schema.name)}.`,
      detail: "schema",
      matchText: schema.name.toLowerCase(),
      boost: 75,
    });

    for (const table of schemaTables) {
      const qualified = `${schema.name}.${table.name}`;
      const tableType = table.type.replace("BASE ", "");
      options.push({
        label: table.name,
        type: "variable",
        apply: quote(table.name),
        detail: `${schema.name} ${tableType}`,
        matchText: table.name.toLowerCase(),
        boost: 100,
      });
      options.push({
        label: qualified,
        type: "variable",
        apply: `${quote(schema.name)}.${quote(table.name)}`,
        detail: tableType,
        matchText: qualified.toLowerCase(),
        boost: 90,
      });
    }
  }

  return options.filter((option) => matchesCompletion(option, fragment));
}

function columnNameCounts(
  tableRefs: Array<TableReference & { details: TableDetails }>,
) {
  const counts = new Map<string, number>();
  for (const tableRef of tableRefs) {
    for (const column of tableRef.details.columns) {
      const key = column.name.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

function keywordBoost(
  keyword: string,
  context: CompletionContext,
  fragmentFrom: number,
) {
  const before = currentStatementBefore(context, fragmentFrom).toLowerCase();
  const normalizedKeyword = keyword.toLowerCase();

  if (/\b(from|join|update|into)\s+\S+\s+$/.test(before)) {
    const nextClauseKeywords = [
      "where",
      "join",
      "left join",
      "inner join",
      "group by",
      "order by",
      "limit",
    ];
    if (nextClauseKeywords.includes(normalizedKeyword)) return 90;
  }

  if (/\b(where|having|on)\b/.test(before)) {
    const predicateKeywords = [
      "and",
      "or",
      "is null",
      "is not null",
      "in",
      "between",
    ];
    if (predicateKeywords.includes(normalizedKeyword)) return 90;
  }

  if (/^\s*$/.test(before)) {
    const statementKeywords = [
      "select",
      "insert into",
      "update",
      "delete from",
      "explain",
    ];
    if (statementKeywords.includes(normalizedKeyword)) return 90;
  }

  return 0;
}

interface TableReference {
  table: TableSummary;
  alias?: string;
}

interface QualifiedCompletionTarget {
  qualifier: string;
  qualifierParts: string[];
  memberFragment: string;
}

function qualifiedCompletionTarget(fragment: string): QualifiedCompletionTarget | null {
  const parts = splitSQLIdentifierPath(fragment);
  if (parts.length < 2) return null;

  const memberFragment = parts[parts.length - 1] || "";
  const qualifierParts = parts.slice(0, -1).filter(Boolean);
  if (qualifierParts.length === 0) return null;

  return {
    qualifier: qualifierParts.join("."),
    qualifierParts,
    memberFragment: memberFragment.toLowerCase(),
  };
}

function matchesTableQualifier(
  tableRef: TableReference,
  qualifierParts: string[],
) {
  const normalizedParts = qualifierParts.map((part) => part.toLowerCase());
  const qualifier = normalizedParts.join(".");
  const alias = tableRef.alias?.toLowerCase();
  const schema = tableRef.table.schema.toLowerCase();
  const table = tableRef.table.name.toLowerCase();

  return (
    qualifier === alias ||
    qualifier === table ||
    qualifier === `${schema}.${table}` ||
    (normalizedParts.length === 1 && normalizedParts[0] === schema)
  );
}

function parseTableReferences(
  statement: string,
  tablesBySchema: Record<string, TableSummary[]>,
): TableReference[] {
  const refs: TableReference[] = [];
  const seen = new Set<string>();
  const tablePattern =
    /\b(?:from|join|update|into|using)\s+((?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*))?)(?:\s+(?:as\s+)?("[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*))?/gi;
  let match: RegExpExecArray | null;

  while ((match = tablePattern.exec(statement))) {
    const identifier = parseSQLIdentifierPath(match[1]);
    if (!identifier) continue;

    const table = findTable(identifier, tablesBySchema);
    if (!table) continue;

    const alias = normalizeAlias(match[2]);
    const key = `${table.schema}.${table.name}:${alias || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ table, alias });
  }

  return refs;
}

function parseSQLIdentifierPath(raw: string) {
  const parts = splitSQLIdentifierPath(raw).filter(Boolean);
  if (parts.length === 1) {
    return { table: parts[0] };
  }
  if (parts.length === 2) {
    return { schema: parts[0], table: parts[1] };
  }
  return null;
}

function splitSQLIdentifierPath(raw: string) {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "`" | "]" | null = null;

  for (const character of raw.trim()) {
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }

    if (character === '"') {
      quote = '"';
      current += character;
      continue;
    }
    if (character === "`") {
      quote = "`";
      current += character;
      continue;
    }
    if (character === "[") {
      quote = "]";
      current += character;
      continue;
    }
    if (character === ".") {
      parts.push(unquoteSQLIdentifier(current.trim()));
      current = "";
      continue;
    }
    current += character;
  }

  parts.push(unquoteSQLIdentifier(current.trim()));
  return parts;
}

function normalizeAlias(raw: string | undefined) {
  if (!raw) return undefined;
  const alias = unquoteSQLIdentifier(raw.trim());
  if (!alias || reservedAliasWords.has(alias.toLowerCase())) return undefined;
  return alias;
}

const reservedAliasWords = new Set([
  "where",
  "join",
  "using",
  "left",
  "right",
  "inner",
  "outer",
  "full",
  "cross",
  "on",
  "group",
  "by",
  "order",
  "having",
  "limit",
  "offset",
  "returning",
  "set",
  "values",
  "as",
]);

function unquoteSQLIdentifier(identifier: string) {
  if (
    (identifier.startsWith('"') && identifier.endsWith('"')) ||
    (identifier.startsWith("`") && identifier.endsWith("`")) ||
    (identifier.startsWith("[") && identifier.endsWith("]"))
  ) {
    return identifier.slice(1, -1);
  }
  return identifier;
}

function findTable(
  identifier: { schema?: string; table: string },
  tablesBySchema: Record<string, TableSummary[]>,
) {
  const schema = identifier.schema?.toLowerCase();
  const table = identifier.table.toLowerCase();

  if (schema) {
    return (tablesBySchema[identifier.schema || ""] || []).find(
      (candidate) => candidate.name.toLowerCase() === table,
    ) || tablesForSchema(schema, tablesBySchema).find(
      (candidate) => candidate.name.toLowerCase() === table,
    ) || null;
  }

  const matches = Object.values(tablesBySchema)
    .flat()
    .filter((candidate) => candidate.name.toLowerCase() === table);
  return matches[0] || null;
}

function tablesForSchema(
  schema: string,
  tablesBySchema: Record<string, TableSummary[]>,
) {
  const normalizedSchema = schema.toLowerCase();
  return Object.entries(tablesBySchema)
    .filter(([schemaName]) => schemaName.toLowerCase() === normalizedSchema)
    .flatMap(([, tables]) => tables);
}

function isCompletionSuppressedAtCursor(context: CompletionContext) {
  const beforeCursor = context.state.doc.sliceString(0, context.pos);
  const lexicalContext = sqlLexicalContextAt(beforeCursor);
  return (
    lexicalContext === "singleQuotedString" ||
    lexicalContext === "lineComment" ||
    lexicalContext === "blockComment"
  );
}

type SQLLexicalContext =
  | "code"
  | "singleQuotedString"
  | "doubleQuotedIdentifier"
  | "backtickIdentifier"
  | "bracketIdentifier"
  | "lineComment"
  | "blockComment";

function sqlLexicalContextAt(sql: string): SQLLexicalContext {
  let context: SQLLexicalContext = "code";

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const nextCharacter = sql[index + 1];

    if (context === "code") {
      if (character === "'") {
        context = "singleQuotedString";
        continue;
      }
      if (character === '"') {
        context = "doubleQuotedIdentifier";
        continue;
      }
      if (character === "`") {
        context = "backtickIdentifier";
        continue;
      }
      if (character === "[") {
        context = "bracketIdentifier";
        continue;
      }
      if (character === "-" && nextCharacter === "-") {
        context = "lineComment";
        index += 1;
        continue;
      }
      if (character === "/" && nextCharacter === "*") {
        context = "blockComment";
        index += 1;
      }
      continue;
    }

    if (context === "singleQuotedString") {
      if (character === "'" && nextCharacter === "'") {
        index += 1;
        continue;
      }
      if (character === "'") {
        context = "code";
      }
      continue;
    }

    if (context === "doubleQuotedIdentifier") {
      if (character === '"' && nextCharacter === '"') {
        index += 1;
        continue;
      }
      if (character === '"') {
        context = "code";
      }
      continue;
    }

    if (context === "backtickIdentifier") {
      if (character === "`" && nextCharacter === "`") {
        index += 1;
        continue;
      }
      if (character === "`") {
        context = "code";
      }
      continue;
    }

    if (context === "bracketIdentifier") {
      if (character === "]" && nextCharacter === "]") {
        index += 1;
        continue;
      }
      if (character === "]") {
        context = "code";
      }
      continue;
    }

    if (context === "lineComment") {
      if (character === "\n" || character === "\r") {
        context = "code";
      }
      continue;
    }

    if (character === "*" && nextCharacter === "/") {
      context = "code";
      index += 1;
    }
  }

  return context;
}

function maskSQLValueLiteralsAndComments(sql: string) {
  const masked: string[] = [];
  let context: SQLLexicalContext = "code";

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const nextCharacter = sql[index + 1];

    if (context === "code") {
      if (character === "'") {
        masked.push(" ");
        context = "singleQuotedString";
        continue;
      }
      if (character === '"') {
        masked.push(character);
        context = "doubleQuotedIdentifier";
        continue;
      }
      if (character === "`") {
        masked.push(character);
        context = "backtickIdentifier";
        continue;
      }
      if (character === "[") {
        masked.push(character);
        context = "bracketIdentifier";
        continue;
      }
      if (character === "-" && nextCharacter === "-") {
        masked.push(" ", " ");
        context = "lineComment";
        index += 1;
        continue;
      }
      if (character === "/" && nextCharacter === "*") {
        masked.push(" ", " ");
        context = "blockComment";
        index += 1;
        continue;
      }

      masked.push(character);
      continue;
    }

    if (context === "singleQuotedString") {
      masked.push(character === "\n" || character === "\r" ? character : " ");
      if (character === "'" && nextCharacter === "'") {
        masked.push(" ");
        index += 1;
        continue;
      }
      if (character === "'") {
        context = "code";
      }
      continue;
    }

    if (context === "doubleQuotedIdentifier") {
      masked.push(character);
      if (character === '"' && nextCharacter === '"') {
        masked.push(nextCharacter);
        index += 1;
        continue;
      }
      if (character === '"') {
        context = "code";
      }
      continue;
    }

    if (context === "backtickIdentifier") {
      masked.push(character);
      if (character === "`" && nextCharacter === "`") {
        masked.push(nextCharacter);
        index += 1;
        continue;
      }
      if (character === "`") {
        context = "code";
      }
      continue;
    }

    if (context === "bracketIdentifier") {
      masked.push(character);
      if (character === "]" && nextCharacter === "]") {
        masked.push(nextCharacter);
        index += 1;
        continue;
      }
      if (character === "]") {
        context = "code";
      }
      continue;
    }

    if (context === "lineComment") {
      masked.push(character === "\n" || character === "\r" ? character : " ");
      if (character === "\n" || character === "\r") {
        context = "code";
      }
      continue;
    }

    masked.push(character === "\n" || character === "\r" ? character : " ");
    if (character === "*" && nextCharacter === "/") {
      masked.push(" ");
      context = "code";
      index += 1;
    }
  }

  return masked.join("");
}

function currentStatementBefore(
  context: CompletionContext,
  fragmentFrom: number,
) {
  const beforeCursor = context.state.doc.sliceString(0, fragmentFrom);
  const statementStart =
    maskSQLValueLiteralsAndComments(beforeCursor).lastIndexOf(";") + 1;
  return beforeCursor.slice(statementStart);
}

function currentMaskedStatementBefore(
  context: CompletionContext,
  fragmentFrom: number,
) {
  const beforeCursor = context.state.doc.sliceString(0, fragmentFrom);
  const maskedBeforeCursor = maskSQLValueLiteralsAndComments(beforeCursor);
  const statementStart = maskedBeforeCursor.lastIndexOf(";") + 1;
  return maskedBeforeCursor.slice(statementStart);
}

function currentStatementAround(
  context: CompletionContext,
  fragmentFrom: number,
) {
  const doc = context.state.doc.toString();
  const maskedDoc = maskSQLValueLiteralsAndComments(doc);
  const statementStart = maskedDoc.lastIndexOf(";", fragmentFrom - 1) + 1;
  const nextStatementEnd = maskedDoc.indexOf(";", fragmentFrom);
  const statementEnd = nextStatementEnd === -1 ? doc.length : nextStatementEnd;
  return doc.slice(statementStart, statementEnd);
}

function lastKeywordIndex(text: string, keyword: string) {
  const pattern = new RegExp(`\\b${keyword}\\b`, "gi");
  let index = -1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    index = match.index;
  }
  return index;
}

const tableDetailsCache = new Map<string, Promise<TableDetails | null>>();

async function loadTableDetails(connectionId: string, table: TableSummary) {
  if (!connectionId) return null;
  const key = `${connectionId}:${table.schema}.${table.name}`;
  const cached = tableDetailsCache.get(key);
  if (cached) return cached;

  const promise = schemaService
    .describe(connectionId, table.schema, table.name)
    .catch(() => null);
  tableDetailsCache.set(key, promise);
  return promise;
}

interface CompletionOption {
  label: string;
  type: string;
  apply: string;
  detail?: string;
  matchText: string;
  boost?: number;
}

export function buildSchemaCompletions(
  activeProfile: ConnectionProfile | null,
  schemas: SchemaSummary[],
  tablesBySchema: Record<string, TableSummary[]>,
): CompletionOption[] {
  const quote =
    activeProfile?.driver === "mysql" || activeProfile?.driver === "bigquery"
      ? quoteBacktick
      : quotePostgres;
  const options: CompletionOption[] = [];

  for (const schema of schemas) {
    const schemaTables = tablesBySchema[schema.name] || [];
    for (const table of schemaTables) {
      const qualified = `${schema.name}.${table.name}`;
      options.push({
        label: table.name,
        type: "variable",
        apply: quote(table.name),
        detail: `${schema.name} ${table.type.replace("BASE ", "")}`,
        matchText: table.name.toLowerCase(),
        boost: 80,
      });
      options.push({
        label: qualified,
        type: "variable",
        apply: `${quote(schema.name)}.${quote(table.name)}`,
        detail: table.type.replace("BASE ", ""),
        matchText: qualified.toLowerCase(),
        boost: 60,
      });
    }
  }

  return options;
}

function matchesCompletion(option: CompletionOption, fragment: string) {
  if (!fragment) return true;
  if (option.matchText.startsWith(fragment)) return true;
  if (
    option.label
      .toLowerCase()
      .split(".")
      .some((part) => part.startsWith(fragment))
  ) {
    return true;
  }
  return camelCasePrefix(option.label, fragment);
}

function camelCasePrefix(label: string, fragment: string) {
  const capitals = label
    .replace(/[^A-Za-z0-9]+/g, " ")
    .split(/\s+/)
    .flatMap((part) => {
      const upperLetters = part.match(/[A-Z0-9]/g);
      return upperLetters && upperLetters.length > 0
        ? upperLetters
        : [part.charAt(0)];
    })
    .join("")
    .toLowerCase();
  return capitals.startsWith(fragment);
}

function quotePostgres(identifier: string) {
  if (/^[a-z_][a-z0-9_]*$/.test(identifier)) return identifier;
  return `"${identifier.split('"').join('""')}"`;
}

function quoteBacktick(identifier: string) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) return identifier;
  return `\`${identifier.split("`").join("``")}\``;
}
