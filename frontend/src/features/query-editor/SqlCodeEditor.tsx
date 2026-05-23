import {
  acceptCompletion,
  autocompletion,
  CompletionContext,
  CompletionResult,
  startCompletion
} from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder,
  tooltips
} from "@codemirror/view";
import { useEffect, useMemo, useRef } from "react";
import type { ConnectionProfile, SchemaSummary, TableSummary } from "../../lib/types";

interface Props {
  activeProfile: ConnectionProfile | null;
  schemas: SchemaSummary[];
  tablesBySchema: Record<string, TableSummary[]>;
  value: string;
  onChange(value: string): void;
  onRun(sql: string): void;
}

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

export function SqlCodeEditor({
  activeProfile,
  schemas,
  tablesBySchema,
  value,
  onChange,
  onRun,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const extensionCompartmentRef = useRef(new Compartment());
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  onChangeRef.current = onChange;
  onRunRef.current = onRun;

  const schemaCompletions = useMemo(
    () => buildSchemaCompletions(activeProfile, schemas, tablesBySchema),
    [activeProfile, schemas, tablesBySchema]
  );

  const extensions = useMemo<Extension[]>(
    () => [
      lineNumbers(),
      highlightActiveLine(),
      keymap.of([
        {
          key: "Mod-Enter",
          run: (view) => {
            onRunRef.current(selectedSQL(view));
            return true;
          }
        },
        {
          key: "Tab",
          run: acceptCompletion
        },
        ...defaultKeymap,
        indentWithTab,
        {
          key: "Ctrl-Space",
          run: startCompletion
        }
      ]),
      sql({ dialect: PostgreSQL }),
      tooltips({
        parent: document.body,
        tooltipSpace: () => ({
          left: 0,
          right: window.innerWidth,
          top: 0,
          bottom: window.innerHeight
        })
      }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      autocompletion({
        override: [sqlCompletion(schemaCompletions)],
        activateOnTyping: true,
        icons: false
      }),
      placeholder("Write SQL..."),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      EditorView.theme({
        "&": {
          height: "100%",
          backgroundColor: "#080808",
          color: "#ededee",
          fontSize: "14px"
        },
        ".cm-scroller": {
          fontFamily: '"SFMono-Regular", ui-monospace, Menlo, Consolas, monospace',
          lineHeight: "1.6"
        },
        ".cm-content": {
          padding: "16px 0",
          caretColor: "#ededee"
        },
        ".cm-line": {
          padding: "0 16px"
        },
        ".cm-gutters": {
          backgroundColor: "#080808",
          color: "#5f5f66",
          borderRight: "1px solid #202022"
        },
        ".cm-activeLine": {
          backgroundColor: "#101012"
        },
        ".cm-activeLineGutter": {
          backgroundColor: "#101012",
          color: "#a5a5ad"
        },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
          backgroundColor: "rgba(94, 106, 210, 0.35)"
        },
        "&.cm-focused": {
          outline: "none"
        },
        ".cm-tooltip": {
          border: "1px solid #242426",
          borderRadius: "10px",
          backgroundColor: "#1f1f23",
          color: "#ededee",
          boxShadow: "0 18px 42px rgba(0, 0, 0, 0.35)",
          overflow: "hidden"
        },
        ".cm-tooltip-autocomplete ul": {
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: "13px",
          maxHeight: "320px",
          overflowY: "auto"
        },
        ".cm-tooltip-autocomplete ul li": {
          padding: "6px 8px"
        },
        ".cm-tooltip-autocomplete ul li[aria-selected]": {
          backgroundColor: "#2a2a30",
          color: "#ffffff"
        }
      })
    ],
    [schemaCompletions]
  );

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    viewRef.current = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: extensionCompartmentRef.current.of(extensions)
      })
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: extensionCompartmentRef.current.reconfigure(extensions)
    });
  }, [extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;
    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value
      }
    });
  }, [value]);

  return <div className="min-h-0 flex-1 overflow-hidden" ref={containerRef} />;
}

function sqlCompletion(schemaCompletions: CompletionOption[]) {
  return function completeSQL(context: CompletionContext): CompletionResult | null {
    const word = context.matchBefore(/[A-Za-z_][\w."]*/);
    if (!word || (word.from === word.to && !context.explicit)) {
      return null;
    }

    const fragment = word.text.trim().toLowerCase();
    if (!fragment && !context.explicit) {
      return null;
    }

    const keywordOptions = sqlKeywords
      .filter((keyword) => keyword.toLowerCase().startsWith(fragment))
      .map((keyword) => ({
        label: keyword,
        type: "keyword",
        apply: keyword
      }));

    const schemaOptions = schemaCompletions.filter((option) =>
      matchesCompletion(option, fragment)
    );
    const options = [...keywordOptions, ...schemaOptions].slice(0, 80);

    if (options.length === 0) {
      return null;
    }

    return {
      from: word.from,
      options,
      validFor: /^[A-Za-z_][\w."]*$/
    };
  };
}

interface CompletionOption {
  label: string;
  type: string;
  apply: string;
  detail?: string;
  matchText: string;
  boost?: number;
}

function buildSchemaCompletions(
  activeProfile: ConnectionProfile | null,
  schemas: SchemaSummary[],
  tablesBySchema: Record<string, TableSummary[]>,
): CompletionOption[] {
  const quote = activeProfile?.driver === "mysql" ? quoteMySQL : quotePostgres;
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
  if (option.matchText.startsWith(fragment)) return true;
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

function selectedSQL(view: EditorView) {
  const selection = view.state.selection.main;
  const selectedText = view.state.sliceDoc(selection.from, selection.to).trim();
  return selectedText || view.state.doc.toString().trim();
}

function quotePostgres(identifier: string) {
  if (/^[a-z_][a-z0-9_]*$/.test(identifier)) return identifier;
  return `"${identifier.split('"').join('""')}"`;
}

function quoteMySQL(identifier: string) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) return identifier;
  return `\`${identifier.split("`").join("``")}\``;
}
