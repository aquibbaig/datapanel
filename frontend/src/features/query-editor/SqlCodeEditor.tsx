import { autocompletion, CompletionContext, CompletionResult, startCompletion } from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { useEffect, useMemo, useRef } from "react";

interface Props {
  value: string;
  onChange(value: string): void;
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

export function SqlCodeEditor({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo<Extension[]>(
    () => [
      lineNumbers(),
      highlightActiveLine(),
      keymap.of([
        ...defaultKeymap,
        indentWithTab,
        {
          key: "Ctrl-Space",
          run: startCompletion
        }
      ]),
      sql({ dialect: PostgreSQL }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      autocompletion({
        override: [sqlKeywordCompletion],
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
          fontSize: "13px"
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
    []
  );

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    viewRef.current = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions
      })
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
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

function sqlKeywordCompletion(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z_][\w\s]*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }

  const fragment = word.text.trim().toUpperCase();
  if (!fragment && !context.explicit) {
    return null;
  }

  const options = sqlKeywords
    .filter((keyword) => keyword.startsWith(fragment))
    .map((keyword) => ({
      label: keyword,
      type: "keyword",
      apply: keyword
    }));

  if (options.length === 0) {
    return null;
  }

  return {
    from: word.from,
    options,
    validFor: /^[A-Za-z_][\w\s]*$/
  };
}
