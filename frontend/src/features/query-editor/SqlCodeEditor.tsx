import {
  acceptCompletion,
  autocompletion,
  moveCompletionSelection,
  startCompletion
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { codeFolding } from "@codemirror/language";
import {
  keywordCompletionSource,
  MySQL,
  PostgreSQL,
  sql,
  StandardSQL,
} from "@codemirror/lang-sql";
import { Compartment, EditorState, Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder,
  tooltips
} from "@codemirror/view";
import { Vim, vim } from "@replit/codemirror-vim";
import shiki from "codemirror-shiki";
import { useEffect, useMemo, useRef } from "react";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import type {
  ConnectionProfile,
  SchemaSummary,
  TableSummary,
} from "../../lib/types";
import { sqlCompletion } from "./sqlCompletion";
import {
  sqlFoldAtomicRanges,
  sqlFoldSelectionGuard,
  foldSQLStatement,
  prepareSQLFoldPlaceholder,
  sqlFoldPlaceholderDOM,
  sqlStatementFoldGutter,
  sqlStatementFolding,
  toggleSQLStatementFold,
} from "./sqlFolding";

interface Props {
  activeConnectionId: string;
  activeProfile: ConnectionProfile | null;
  schemas: SchemaSummary[];
  tablesBySchema: Record<string, TableSummary[]>;
  theme: "dark" | "light";
  value: string;
  vimNavigationEnabled: boolean;
  onChange(value: string): void;
  onRun(sql: string): void;
  onSelectedSQLChange(sql: string): void;
}

const shikiHighlighter = createHighlighterCore({
  langs: [import("@shikijs/langs/sql")],
  themes: [
    import("@shikijs/themes/github-dark-high-contrast"),
    import("@shikijs/themes/github-light"),
  ],
  engine: createOnigurumaEngine(import("shiki/wasm")),
});

Vim.map("jk", "<Esc>", "insert");

const vimFoldingGlobal = globalThis as typeof globalThis & {
  __datapanelSQLVimFoldingLeaderSafe?: boolean;
};

if (!vimFoldingGlobal.__datapanelSQLVimFoldingLeaderSafe) {
  const unmapVimKey = Vim.unmap as (lhs: string, ctx?: string) => unknown;
  unmapVimKey("zo", "normal");
  unmapVimKey("za", "normal");
  unmapVimKey("zc", "normal");
  unmapVimKey("<Space>zc", "normal");
  unmapVimKey("<Space>");
  Vim.defineAction("datapanelFoldSQLStatement", (cm) => {
    foldSQLStatement(cm.cm6);
  });
  Vim.defineAction("datapanelToggleSQLStatementFold", (cm) => {
    toggleSQLStatementFold(cm.cm6);
  });
  Vim.mapCommand("zc", "action", "datapanelFoldSQLStatement", {}, {
    context: "normal",
  });
  Vim.mapCommand("<Space>zc", "action", "datapanelToggleSQLStatementFold", {}, {
    context: "normal",
  });
  vimFoldingGlobal.__datapanelSQLVimFoldingLeaderSafe = true;
}

export function SqlCodeEditor({
  activeConnectionId,
  activeProfile,
  schemas,
  tablesBySchema,
  theme,
  value,
  vimNavigationEnabled,
  onChange,
  onRun,
  onSelectedSQLChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const extensionCompartmentRef = useRef(new Compartment());
  const initialValueRef = useRef(value);
  const themeRef = useRef(theme);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const onSelectedSQLChangeRef = useRef(onSelectedSQLChange);
  onChangeRef.current = onChange;
  onRunRef.current = onRun;
  onSelectedSQLChangeRef.current = onSelectedSQLChange;
  const sqlDialect =
    activeProfile?.driver === "mysql"
      ? MySQL
      : activeProfile?.driver === "postgres"
        ? PostgreSQL
        : StandardSQL;

  const extensions = useMemo<Extension[]>(
    () => [
      ...(vimNavigationEnabled ? [vim(), drawSelection()] : []),
      sqlStatementFolding,
      codeFolding({
        preparePlaceholder: prepareSQLFoldPlaceholder,
        placeholderDOM: sqlFoldPlaceholderDOM,
      }),
      sqlFoldAtomicRanges,
      sqlFoldSelectionGuard,
      sqlStatementFoldGutter(),
      lineNumbers(),
      highlightActiveLine(),
      history(),
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
        {
          key: "Ctrl-n",
          run: moveCompletionSelection(true)
        },
        {
          key: "Ctrl-p",
          run: moveCompletionSelection(false)
        },
        {
          key: "Ctrl-Shift-[",
          mac: "Cmd-Alt-[",
          run: foldSQLStatement
        },
        ...historyKeymap,
        ...defaultKeymap,
        indentWithTab,
        {
          key: "Ctrl-Space",
          run: startCompletion
        }
      ]),
      sql({ dialect: sqlDialect }),
      tooltips({
        parent: document.body,
        tooltipSpace: () => ({
          left: 0,
          right: window.innerWidth,
          top: 0,
          bottom: window.innerHeight
        })
      }),
      shiki({
        highlighter: shikiHighlighter,
        language: "sql",
        theme: theme === "light" ? "github-light" : "github-dark-high-contrast",
      }),
      autocompletion({
        override: [
          sqlCompletion({
            activeConnectionId,
            activeProfile,
            schemas,
            tablesBySchema,
          }),
          keywordCompletionSource(sqlDialect, true),
        ],
        activateOnTyping: true,
        icons: false
      }),
      placeholder("Write SQL..."),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
        if (update.docChanged || update.selectionSet) {
          onSelectedSQLChangeRef.current(explicitlySelectedSQL(update.view));
        }
      }),
      EditorView.theme({
        "&": {
          height: "100%",
          backgroundColor: "rgb(var(--color-surface-950))",
          color: "rgb(var(--color-foreground))",
          fontSize: "14px"
        },
        ".cm-scroller": {
          fontFamily: '"SFMono-Regular", ui-monospace, Menlo, Consolas, monospace',
          height: "100%",
          lineHeight: "1.6",
          overflow: "auto"
        },
        ".cm-content": {
          padding: "16px 0",
          caretColor: "rgb(var(--color-foreground))"
        },
        ".cm-cursor, .cm-dropCursor": {
          borderLeftColor: "rgb(var(--color-foreground))"
        },
        ".cm-vimCursorLayer .cm-fat-cursor": {
          backgroundColor: "rgb(var(--color-foreground))",
          color: "rgb(var(--color-surface-950)) !important"
        },
        "&:not(.cm-focused) .cm-vimCursorLayer .cm-fat-cursor": {
          backgroundColor: "transparent",
          outline: "solid 1px rgb(var(--color-foreground))"
        },
        ".cm-line": {
          padding: "0 16px"
        },
        ".cm-gutters": {
          backgroundColor: "rgb(var(--color-surface-950))",
          color: "rgb(var(--color-muted))",
          borderRight: "1px solid rgb(var(--color-line))"
        },
        ".cm-foldGutter": {
          minWidth: "22px"
        },
        ".cm-foldGutter .cm-gutterElement": {
          alignItems: "center",
          display: "flex",
          justifyContent: "center",
          padding: "0 4px"
        },
        ".cm-sqlFoldMarker": {
          borderBottom: "4px solid transparent",
          borderLeft: "6px solid rgb(var(--color-zinc-600))",
          borderTop: "4px solid transparent",
          cursor: "pointer",
          height: "0",
          transition: "border-left-color 0.15s ease, transform 0.15s ease",
          userSelect: "none"
        },
        ".cm-sqlFoldMarker:hover": {
          borderLeftColor: "rgb(var(--color-foreground))"
        },
        ".cm-sqlFoldMarker-open": {
          transform: "rotate(90deg)"
        },
        ".cm-foldPlaceholder.cm-sqlFoldPlaceholder": {
          backgroundColor: "rgb(var(--color-surface-800))",
          border: "1px solid rgb(var(--color-line))",
          borderRadius: "4px",
          color: "rgb(var(--color-muted))",
          cursor: "text",
          margin: "0 2px",
          padding: "0 4px"
        },
        ".cm-activeLine": {
          backgroundColor: "rgb(var(--color-surface-850))"
        },
        ".cm-activeLineGutter": {
          backgroundColor: "rgb(var(--color-surface-850))",
          color: "rgb(var(--color-zinc-400))"
        },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
          backgroundColor: "rgb(var(--color-accent) / 0.35) !important"
        },
        ".cm-line::selection, .cm-line ::selection": {
          backgroundColor: "rgb(var(--color-accent) / 0.35)"
        },
        ".cm-selectionLayer": {
          pointerEvents: "none",
          zIndex: "20 !important"
        },
        "&.cm-focused > .cm-scroller.cm-vimMode > .cm-selectionLayer .cm-selectionBackground": {
          backgroundColor: "rgb(var(--color-accent) / 0.45) !important"
        },
        "&.cm-focused": {
          outline: "none"
        },
        ".cm-tooltip": {
          border: "1px solid rgb(var(--color-line))",
          borderRadius: "10px",
          backgroundColor: "rgb(var(--color-surface-700))",
          color: "rgb(var(--color-foreground))",
          boxShadow: "0 18px 42px rgb(var(--color-overlay) / 0.35)",
          overflow: "hidden",
          zIndex: "40"
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
          backgroundColor: "rgb(var(--color-accent))",
          color: "rgb(var(--color-accent-foreground))"
        },
        ".cm-panels": {
          backgroundColor: "rgb(var(--color-surface-950))",
          color: "rgb(var(--color-foreground))",
          zIndex: "30"
        },
        ".cm-panels-bottom": {
          borderTop: "1px solid rgb(var(--color-line))"
        },
        ".cm-vim-panel": {
          backgroundColor: "rgb(var(--color-surface-950))",
          color: "rgb(var(--color-foreground))"
        },
        ".cm-vim-panel input": {
          backgroundColor: "rgb(var(--color-surface-950))",
          caretColor: "rgb(var(--color-foreground))",
          color: "rgb(var(--color-foreground))"
        }
      })
    ],
    [activeConnectionId, activeProfile, schemas, sqlDialect, tablesBySchema, theme, vimNavigationEnabled]
  );

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: extensionCompartmentRef.current.of(extensions)
      })
    });
    viewRef.current = view;
    const focusFrame = window.requestAnimationFrame(() => view.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (themeRef.current !== theme) return;
    view.dispatch({
      effects: extensionCompartmentRef.current.reconfigure(extensions)
    });
  }, [extensions]);

  useEffect(() => {
    const container = containerRef.current;
    const view = viewRef.current;
    if (!container || !view || themeRef.current === theme) return;

    const doc = view.state.doc.toString();
    const selection = view.state.selection;
    const scrollDOM = view.scrollDOM;
    const scrollTop = scrollDOM.scrollTop;
    const scrollLeft = scrollDOM.scrollLeft;

    themeRef.current = theme;
    view.destroy();

    const nextView = new EditorView({
      parent: container,
      state: EditorState.create({
        doc,
        selection,
        extensions: extensionCompartmentRef.current.of(extensions),
      }),
    });
    viewRef.current = nextView;
    window.requestAnimationFrame(() => {
      nextView.scrollDOM.scrollTop = scrollTop;
      nextView.scrollDOM.scrollLeft = scrollLeft;
    });
  }, [extensions, theme]);

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

  return <div className="h-full min-h-0 w-full overflow-hidden" ref={containerRef} />;
}

function selectedSQL(view: EditorView) {
  const selection = view.state.selection.main;
  const selectedText = view.state.sliceDoc(selection.from, selection.to).trim();
  return selectedText || view.state.doc.toString().trim();
}

function explicitlySelectedSQL(view: EditorView) {
  const selection = view.state.selection.main;
  if (selection.empty) return "";
  return view.state.sliceDoc(selection.from, selection.to).trim();
}
