import {
  AlertTriangle,
  Database,
  Filter,
  GitBranch,
  Info,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ConnectionProfile, QueryResult } from "../../lib/types";
import { cn } from "../../lib/cn";

interface Props {
  driver: ConnectionProfile["driver"] | undefined;
  result: QueryResult | null;
}

interface PlanStep {
  id: string;
  operation: string;
  relation?: string;
  access?: string;
  costStart?: number;
  costEnd?: number;
  estimatedRows?: number;
  width?: number;
  keyName?: string;
  description: string;
  conditions: Array<{ label: string; value: string }>;
  notes: string[];
  children: PlanStep[];
  tone: "neutral" | "warning" | "danger";
}

interface ParsedPlan {
  driver: string;
  rootSteps: PlanStep[];
  nodeCount: number;
  estimatedCost?: number;
  estimatedRows?: number;
  explanation: string[];
  rawLines: string[];
  unsupportedReason?: string;
}

export function QueryPlanView({ driver, result }: Props) {
  const plan = useMemo(() => parseQueryPlan(result, driver), [driver, result]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedStep = selectedId ? findStep(plan.rootSteps, selectedId) : null;

  if (!result) {
    return (
      <section className="grid min-h-0 place-items-center bg-surface-900 text-muted">
        <div className="flex flex-col items-center justify-center gap-4">
          <GitBranch size={24} />
          <p>Run Explain to see a query plan.</p>
        </div>
      </section>
    );
  }

  if (result.error) {
    return (
      <section className="grid min-h-0 place-items-center bg-surface-900 text-red-100">
        <p>{result.error}</p>
      </section>
    );
  }

  if (plan.rootSteps.length === 0) {
    return (
      <section className="grid min-h-0 place-items-center bg-surface-900 text-muted">
        <div className="flex max-w-md flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="text-yellow-200" size={24} />
          <p className="text-sm text-zinc-300">No visual plan is available.</p>
          <p className="text-xs leading-5">
            {plan.unsupportedReason ||
              "The current driver returned explain output that Datapanel cannot graph yet."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px] overflow-hidden bg-surface-900">
      <div className="min-h-0 overflow-auto p-4">
        <div className="mb-4 flex min-w-max items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-850 px-2 py-1 text-zinc-300">
            <Database size={13} />
            {driverLabel(plan.driver)}
          </span>
          <span>{plan.nodeCount} plan nodes</span>
          {plan.estimatedCost !== undefined ? (
            <span>cost {formatNumber(plan.estimatedCost)}</span>
          ) : null}
          {plan.estimatedRows !== undefined ? (
            <span>{formatNumber(plan.estimatedRows)} estimated rows</span>
          ) : null}
        </div>
        <div className="flex min-w-max items-start justify-center gap-8 pb-8">
          {plan.rootSteps.map((step) => (
            <PlanNode
              key={step.id}
              selectedId={selectedId}
              step={step}
              onSelect={setSelectedId}
            />
          ))}
        </div>
      </div>

      <aside className="min-h-0 border-l border-line bg-surface-950 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
          <Info size={14} />
          Explanation
          {selectedStep ? (
            <button
              className="ml-auto grid h-6 w-6 place-items-center rounded-md text-zinc-500 hover:bg-surface-700 hover:text-zinc-200"
              onClick={() => setSelectedId(null)}
              title="Clear selected node"
              type="button"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
        {selectedStep ? (
          <PlanStepDetails step={selectedStep} />
        ) : (
          <div className="space-y-3 text-xs leading-5 text-zinc-300">
            {plan.explanation.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        )}
      </aside>
    </section>
  );
}

function PlanNode({
  selectedId,
  step,
  onSelect,
}: {
  selectedId: string | null;
  step: PlanStep;
  onSelect(id: string): void;
}) {
  return (
    <div className="flex flex-col items-center">
      <button
        className={cn(
          "w-[230px] rounded-md border bg-surface-850 text-left shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition hover:border-accent focus:border-accent focus:outline-none",
          selectedId === step.id && "border-accent ring-2 ring-accent/20",
          selectedId !== step.id &&
            step.tone === "danger" &&
            "border-red-400/40",
          selectedId !== step.id &&
            step.tone === "warning" &&
            "border-yellow-400/35",
          step.tone === "neutral" && selectedId !== step.id && "border-line",
        )}
        onClick={() => onSelect(step.id)}
        type="button"
      >
        <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-100">
              {step.operation}
            </p>
            {step.relation ? (
              <p className="mt-0.5 truncate text-xs text-muted">
                {step.relation}
              </p>
            ) : null}
          </div>
          <span
            className={cn(
              "mt-0.5 h-2 w-2 shrink-0 rounded-full",
              step.tone === "danger" && "bg-red-300",
              step.tone === "warning" && "bg-yellow-300",
              step.tone === "neutral" && "bg-emerald-300",
            )}
          />
        </div>
        <div className="space-y-2 px-3 py-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-zinc-300">
            {step.costEnd !== undefined ? (
              <Metric label="Cost" value={formatNumber(step.costEnd)} />
            ) : null}
            {step.estimatedRows !== undefined ? (
              <Metric label="Rows" value={formatNumber(step.estimatedRows)} />
            ) : null}
            {step.access ? <Metric label="Access" value={step.access} /> : null}
            {step.keyName ? <Metric label="Key" value={step.keyName} /> : null}
          </div>
          {step.conditions.length > 0 ? (
            <div className="space-y-1">
              {step.conditions.map((condition) => (
                <div
                  className="rounded-md border border-line bg-surface-900 px-2 py-1.5 text-zinc-300"
                  key={`${condition.label}-${condition.value}`}
                >
                  <span className="mb-0.5 flex items-center gap-1 text-[11px] uppercase text-muted">
                    <Filter size={10} />
                    {condition.label}
                  </span>
                  <span className="font-mono text-[11px] leading-4">
                    {condition.value}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {step.notes.length > 0 ? (
            <div className="space-y-1 text-[11px] leading-4 text-zinc-400">
              {step.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          ) : null}
        </div>
      </button>

      {step.children.length > 0 ? (
        <>
          <div className="h-5 border-l border-line" />
          <div className="relative flex items-start gap-6 pt-5">
            <div className="absolute left-[115px] right-[115px] top-0 border-t border-line" />
            {step.children.map((child) => (
              <div className="relative" key={child.id}>
                <div className="absolute left-1/2 top-[-20px] h-5 border-l border-line" />
                <PlanNode
                  selectedId={selectedId}
                  step={child}
                  onSelect={onSelect}
                />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function PlanStepDetails({ step }: { step: PlanStep }) {
  return (
    <div className="space-y-4 text-xs leading-5 text-zinc-300">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-md border border-line bg-surface-900 px-2 py-0.5 text-[11px] uppercase text-muted">
            {step.operation}
          </span>
          {step.relation ? (
            <span className="truncate text-zinc-200">{step.relation}</span>
          ) : null}
        </div>
        <p>{step.description}</p>
      </div>

      <dl className="space-y-2">
        {step.costStart !== undefined || step.costEnd !== undefined ? (
          <DetailRow
            label="Cost"
            value={`${formatNumber(step.costStart ?? 0)}..${formatNumber(step.costEnd ?? 0)}`}
            description="Planner estimate of work. Use it to compare plan alternatives inside the same database engine."
          />
        ) : null}
        {step.estimatedRows !== undefined ? (
          <DetailRow
            label="Rows"
            value={formatNumber(step.estimatedRows)}
            description="Estimated rows this node returns to its parent. Large misses against real row counts usually point to stale statistics."
          />
        ) : null}
        {step.width !== undefined ? (
          <DetailRow
            label="Width"
            value={`${formatNumber(step.width)} bytes`}
            description="Estimated average bytes per row. Wider rows make sorts, hashes, and transfers more expensive."
          />
        ) : null}
        {step.keyName ? (
          <DetailRow
            label="Key"
            value={step.keyName}
            description="Index or key selected by the optimizer for this access."
          />
        ) : null}
        {step.access ? (
          <DetailRow
            label="Access"
            value={step.access}
            description="How the table is read. Full scans are usually worth checking first on large tables."
          />
        ) : null}
        {step.conditions.map((condition) => (
          <DetailRow
            key={`${condition.label}-${condition.value}`}
            label={condition.label}
            value={condition.value}
            description={conditionDescription(condition.label)}
          />
        ))}
        {step.notes.map((note) => (
          <DetailRow key={note} label="Detail" value={note} />
        ))}
      </dl>
    </div>
  );
}

function DetailRow({
  description,
  label,
  value,
}: {
  description?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="border-t border-line pt-2">
      <dt className="text-[11px] uppercase text-muted">{label}</dt>
      <dd>
        <div className="break-words font-mono text-[11px] text-zinc-200">
          {value}
        </div>
        {description ? (
          <div className="mt-1 text-[11px] leading-4 text-zinc-500">
            {description}
          </div>
        ) : null}
      </dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-surface-900 px-2 py-1">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="truncate font-mono text-[11px] text-zinc-200">{value}</p>
    </div>
  );
}

function parseQueryPlan(
  result: QueryResult | null,
  driver: string | undefined,
): ParsedPlan {
  const normalizedDriver = (driver || "").toLowerCase();
  if (!result) {
    return emptyPlan(normalizedDriver);
  }
  if (normalizedDriver === "mysql") {
    return parseMySQLPlan(result, normalizedDriver);
  }
  if (normalizedDriver === "postgres" || normalizedDriver === "postgresql") {
    return parsePostgresPlan(result, normalizedDriver);
  }
  return {
    ...emptyPlan(normalizedDriver),
    rawLines: resultRowsAsLines(result),
    unsupportedReason: `${driverLabel(normalizedDriver)} explain output is not supported yet.`,
  };
}

function parsePostgresPlan(result: QueryResult, driver: string): ParsedPlan {
  const rawLines = resultRowsAsLines(result).filter((line) => line.trim() !== "");
  const rootSteps: PlanStep[] = [];
  const stack: Array<{ indent: number; step: PlanStep }> = [];
  let nodeCount = 0;

  rawLines.forEach((line) => {
    const parsedLine = parsePostgresLine(line);
    if (!parsedLine) return;

    if (isPostgresNodeLine(parsedLine.text)) {
      const step = createPostgresStep(
        `pg-${nodeCount}`,
        parsedLine.text,
      );
      nodeCount += 1;

      while (
        stack.length > 0 &&
        stack[stack.length - 1].indent >= parsedLine.indent
      ) {
        stack.pop();
      }

      const parent = stack[stack.length - 1]?.step;
      if (parent) {
        parent.children.push(step);
      } else {
        rootSteps.push(step);
      }
      stack.push({ indent: parsedLine.indent, step });
      return;
    }

    const parent = nearestPostgresParent(stack, parsedLine.indent);
    if (parent) {
      attachPostgresDetail(parent, parsedLine.text);
    }
  });

  const root = rootSteps[0];
  return {
    driver,
    rootSteps,
    nodeCount,
    estimatedCost: root?.costEnd,
    estimatedRows: root?.estimatedRows,
    explanation: buildPostgresExplanation(rootSteps),
    rawLines,
    unsupportedReason:
      rootSteps.length === 0
        ? "Postgres returned explain text, but no costed plan nodes were detected."
        : undefined,
  };
}

function parsePostgresLine(line: string) {
  const match = line.match(/^(\s*)(->\s*)?(.*)$/);
  if (!match) return null;
  const indent = match[1].length;
  const hasArrow = Boolean(match[2]);
  return {
    indent: hasArrow && indent === 0 ? 2 : indent,
    text: match[3].trim(),
  };
}

function isPostgresNodeLine(text: string) {
  return /\((?:cost=|actual time=)/.test(text);
}

function createPostgresStep(id: string, text: string): PlanStep {
  const metricsMatch = text.match(/\((.*)\)$/);
  const metrics = metricsMatch?.[1] || "";
  const title = text.replace(/\s+\(.*\)$/, "");
  const usingMatch = title.match(/^(.*?)\s+using\s+(.+?)\s+on\s+(.+)$/);
  const onMatch = title.match(/^(.*?)\s+on\s+(.+)$/);
  const operation = usingMatch?.[1]?.trim() || onMatch?.[1]?.trim() || title;
  const relation = usingMatch?.[3]?.trim() || onMatch?.[2]?.trim();
  const keyName = usingMatch?.[2]?.trim();
  const costMatch = metrics.match(/cost=([\d.]+)\.\.([\d.]+)/);
  const rowsMatch = metrics.match(/rows=([\d.]+)/);
  const widthMatch = metrics.match(/width=(\d+)/);
  const estimatedRows = rowsMatch ? Number(rowsMatch[1]) : undefined;
  const costEnd = costMatch ? Number(costMatch[2]) : undefined;

  return {
    id,
    operation,
    relation,
    keyName,
    costStart: costMatch ? Number(costMatch[1]) : undefined,
    costEnd,
    estimatedRows,
    width: widthMatch ? Number(widthMatch[1]) : undefined,
    description: postgresOperationDescription(operation),
    conditions: [],
    notes: [],
    children: [],
    tone: postgresStepTone(operation, estimatedRows, costEnd),
  };
}

function nearestPostgresParent(
  stack: Array<{ indent: number; step: PlanStep }>,
  indent: number,
) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].indent < indent || index === 0) {
      return stack[index].step;
    }
  }
  return null;
}

function attachPostgresDetail(step: PlanStep, text: string) {
  const detailMatch = text.match(/^([A-Za-z][A-Za-z ]+):\s*(.*)$/);
  if (!detailMatch) {
    step.notes.push(text);
    return;
  }
  const label = detailMatch[1].trim();
  const value = detailMatch[2].trim();
  if (/filter|cond|check/i.test(label)) {
    step.conditions.push({ label, value });
    return;
  }
  step.notes.push(`${label}: ${value}`);
}

function postgresStepTone(
  operation: string,
  estimatedRows: number | undefined,
  costEnd: number | undefined,
): PlanStep["tone"] {
  if (/Seq Scan/i.test(operation) && (estimatedRows ?? 0) > 1000) {
    return "danger";
  }
  if (/Seq Scan/i.test(operation) || /Nested Loop/i.test(operation)) {
    return "warning";
  }
  if ((costEnd ?? 0) > 10000) {
    return "warning";
  }
  return "neutral";
}

function buildPostgresExplanation(rootSteps: PlanStep[]) {
  if (rootSteps.length === 0) {
    return ["Run Explain to generate a visual query plan."];
  }

  const flattened = flattenSteps(rootSteps);
  const root = rootSteps[0];
  const explanation = [
    `Postgres plans this query around ${root.operation.toLowerCase()}${root.estimatedRows !== undefined ? ` with about ${formatNumber(root.estimatedRows)} estimated output rows` : ""}.`,
  ];

  const scans = flattened.filter((step) => /scan/i.test(step.operation));
  if (scans.length > 0) {
    explanation.push(
      `Base reads: ${scans
        .map((step) => `${step.operation}${step.relation ? ` on ${step.relation}` : ""}`)
        .join(", ")}.`,
    );
  }

  const joins = flattened.filter((step) => /join/i.test(step.operation));
  if (joins.length > 0) {
    explanation.push(
      `Join strategy: ${joins.map((step) => step.operation).join(", ")}. Conditions shown on each node explain how rows are matched or filtered.`,
    );
  }

  const warningSteps = flattened.filter((step) => step.tone !== "neutral");
  if (warningSteps.length > 0) {
    explanation.push(
      `Review highlighted nodes first, especially sequential scans and high-row operations; these are common places to add or tune indexes.`,
    );
  }

  return explanation;
}

function parseMySQLPlan(result: QueryResult, driver: string): ParsedPlan {
  const columns = result.columns.map((column) => column.name.toLowerCase());
  const columnIndex = new Map(columns.map((column, index) => [column, index]));
  const tableIndex = columnIndex.get("table");
  const typeIndex = columnIndex.get("type");

  if (tableIndex === undefined || typeIndex === undefined) {
    return {
      ...emptyPlan(driver),
      rawLines: resultRowsAsLines(result),
      unsupportedReason:
        "MySQL explain output did not include the expected table/type columns.",
    };
  }

  const rootSteps = result.rows.map((row, index) =>
    createMySQLStep(`mysql-${index}`, row, columnIndex),
  );
  const root = rootSteps[0];

  return {
    driver,
    rootSteps,
    nodeCount: rootSteps.length,
    estimatedRows: rootSteps.reduce(
      (total, step) => total + (step.estimatedRows ?? 0),
      0,
    ),
    explanation: buildMySQLExplanation(rootSteps),
    rawLines: [
      result.columns.map((column) => column.name).join("\t"),
      ...result.rows.map((row) => row.map((cell) => String(cell ?? "")).join("\t")),
    ],
    unsupportedReason:
      rootSteps.length === 0 ? "MySQL returned no explain rows." : undefined,
    estimatedCost: root?.costEnd,
  };
}

function createMySQLStep(
  id: string,
  row: unknown[],
  columnIndex: Map<string, number>,
): PlanStep {
  const table = valueAt(row, columnIndex, "table");
  const accessType = valueAt(row, columnIndex, "type");
  const keyName = valueAt(row, columnIndex, "key");
  const possibleKeys = valueAt(row, columnIndex, "possible_keys");
  const rows = Number(valueAt(row, columnIndex, "rows"));
  const filtered = valueAt(row, columnIndex, "filtered");
  const extra = valueAt(row, columnIndex, "extra");
  const selectType = valueAt(row, columnIndex, "select_type");

  const conditions: PlanStep["conditions"] = [];
  if (possibleKeys) {
    conditions.push({ label: "Possible keys", value: possibleKeys });
  }
  if (extra) {
    conditions.push({ label: "Extra", value: extra });
  }

  return {
    id,
    operation: mysqlAccessLabel(accessType),
    relation: table || undefined,
    access: accessType || undefined,
    keyName: keyName || undefined,
    estimatedRows: Number.isFinite(rows) ? rows : undefined,
    description: mysqlOperationDescription(accessType),
    conditions,
    notes: [
      selectType ? `Select type: ${selectType}` : "",
      filtered ? `Filtered: ${filtered}%` : "",
    ].filter(Boolean),
    children: [],
    tone: mysqlStepTone(accessType, Number.isFinite(rows) ? rows : undefined),
  };
}

function buildMySQLExplanation(rootSteps: PlanStep[]) {
  if (rootSteps.length === 0) {
    return ["Run Explain to generate a visual query plan."];
  }

  const explanation = [
    "MySQL EXPLAIN reports one row per table access. The graph shows the join/access order returned by the driver.",
  ];
  const fullScans = rootSteps.filter((step) => step.access?.toUpperCase() === "ALL");
  if (fullScans.length > 0) {
    explanation.push(
      `Full table scans: ${fullScans
        .map((step) => step.relation || "unknown table")
        .join(", ")}. Check filters and available indexes for these tables first.`,
    );
  }
  const keyed = rootSteps.filter((step) => step.keyName);
  if (keyed.length > 0) {
    explanation.push(
      `Using indexes: ${keyed
        .map((step) => `${step.relation || "table"} via ${step.keyName}`)
        .join(", ")}.`,
    );
  }
  return explanation;
}

function valueAt(
  row: unknown[],
  columnIndex: Map<string, number>,
  column: string,
) {
  const index = columnIndex.get(column);
  if (index === undefined) return "";
  const value = row[index];
  return value === null || value === undefined ? "" : String(value);
}

function mysqlAccessLabel(accessType: string) {
  switch (accessType.toUpperCase()) {
    case "ALL":
      return "Full table scan";
    case "INDEX":
      return "Full index scan";
    case "RANGE":
      return "Index range scan";
    case "REF":
      return "Index lookup";
    case "EQ_REF":
      return "Unique index lookup";
    case "CONST":
    case "SYSTEM":
      return "Constant lookup";
    default:
      return accessType ? `${accessType} access` : "Table access";
  }
}

function mysqlStepTone(
  accessType: string,
  estimatedRows: number | undefined,
): PlanStep["tone"] {
  if (accessType.toUpperCase() === "ALL" && (estimatedRows ?? 0) > 1000) {
    return "danger";
  }
  if (accessType.toUpperCase() === "ALL" || accessType.toUpperCase() === "INDEX") {
    return "warning";
  }
  return "neutral";
}

function flattenSteps(steps: PlanStep[]): PlanStep[] {
  return steps.flatMap((step) => [step, ...flattenSteps(step.children)]);
}

function findStep(steps: PlanStep[], id: string): PlanStep | null {
  for (const step of steps) {
    if (step.id === id) return step;
    const child = findStep(step.children, id);
    if (child) return child;
  }
  return null;
}

function postgresOperationDescription(operation: string) {
  const normalized = operation.replace(/\s+\w+$/, "");
  return (
    postgresDescriptions[operation] ||
    postgresDescriptions[normalized] ||
    "Executes this stage of the database plan and passes rows to its parent node."
  );
}

function mysqlOperationDescription(accessType: string) {
  return (
    mysqlDescriptions[accessType.toUpperCase()] ||
    mysqlDescriptions[accessType.toLowerCase()] ||
    "Reads rows for this step and passes them to the next stage of the MySQL plan."
  );
}

function conditionDescription(label: string) {
  if (/hash cond/i.test(label)) {
    return "Equality predicate used to match rows in a hash join.";
  }
  if (/merge cond/i.test(label)) {
    return "Predicate used while walking two sorted inputs in a merge join.";
  }
  if (/index cond/i.test(label)) {
    return "Predicate evaluated by the index access method.";
  }
  if (/filter/i.test(label)) {
    return "Predicate evaluated after rows are fetched. Many rejected rows can indicate a missing or weak index.";
  }
  if (/possible keys/i.test(label)) {
    return "Indexes the optimizer considered for this table access.";
  }
  if (/extra/i.test(label)) {
    return "Additional MySQL optimizer notes for this access.";
  }
  return "Condition or attribute reported by the database planner.";
}

function resultRowsAsLines(result: QueryResult) {
  return result.rows.map((row) => row.map((cell) => String(cell ?? "")).join(" "));
}

function emptyPlan(driver: string): ParsedPlan {
  return {
    driver,
    rootSteps: [],
    nodeCount: 0,
    explanation: ["Run Explain to generate a visual query plan."],
    rawLines: [],
  };
}

function driverLabel(driver: string) {
  if (driver === "postgres" || driver === "postgresql") return "Postgres";
  if (driver === "mysql") return "MySQL";
  return driver || "Unknown driver";
}

const postgresDescriptions: Record<string, string> = {
  "Seq Scan":
    "Reads every row of the table in physical order. It is cheap for tiny tables or broad filters, but suspicious on large tables when only a few rows are needed.",
  "Index Scan":
    "Walks an index and fetches matching table rows. This is usually good for selective filters and ordered access.",
  "Index Only Scan":
    "Reads directly from an index when it contains every column needed by the query. Heap fetches may still happen if visibility data is stale.",
  "Bitmap Index Scan":
    "Uses an index to build a bitmap of matching row locations. It normally feeds a Bitmap Heap Scan.",
  "Bitmap Heap Scan":
    "Reads heap pages selected by one or more bitmap index scans. Useful when many rows match but an index still narrows the search.",
  "Hash Join":
    "Builds a hash table from one input and probes it with the other. Good for equality joins over larger inputs when no useful ordered access exists.",
  Hash:
    "Builds the in-memory hash table used by a Hash Join. If this grows too large it can pressure memory.",
  "Nested Loop":
    "Runs the inner side once for each row from the outer side. Fast with a small outer input and indexed inner lookups; risky when both sides are large.",
  "Merge Join":
    "Joins two inputs that are already sorted on the join key. It can be efficient when indexes provide the ordering.",
  Sort:
    "Orders rows by one or more keys. Large sorts can spill to disk if they exceed memory.",
  Aggregate:
    "Computes grouped or scalar aggregate results.",
  HashAggregate:
    "Aggregates with an in-memory hash table keyed by the group columns.",
  GroupAggregate:
    "Aggregates rows that arrive sorted by the group key, allowing streaming group processing.",
  Limit:
    "Stops reading once enough rows have been returned. It often favors plans with low startup cost.",
  Append:
    "Concatenates rows from multiple child plans, commonly from UNION ALL or partitioned tables.",
  Materialize:
    "Caches child rows so another node can read them again without re-running the child each time.",
  Result:
    "Evaluates a simple expression or projects rows from its child.",
};

const mysqlDescriptions: Record<string, string> = {
  system: "Reads a constant one-row table. This is the cheapest MySQL access type.",
  const:
    "Finds exactly one row using a primary or unique key with constant values.",
  eq_ref:
    "Uses a unique index lookup for each row from the previous table. This is one of the best join access patterns.",
  ref: "Uses a non-unique index lookup. Multiple rows may match each key value.",
  range:
    "Uses an index range for predicates such as BETWEEN, IN, less-than, or greater-than.",
  index:
    "Scans the full index. Usually cheaper than a full table scan only when the index is much smaller or covering.",
  ALL: "Scans the full table. On large tables, check predicates and indexes first.",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}
