import {
  foldEffect,
  foldState,
  foldedRanges,
  foldService,
  unfoldEffect,
} from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  RangeSet,
  RangeSetBuilder,
  type Extension,
  type SelectionRange,
} from "@codemirror/state";
import {
  EditorView,
  GutterMarker,
  ViewPlugin,
  gutter,
  type BlockInfo,
  type Command,
  type ViewUpdate,
} from "@codemirror/view";

interface SQLStatementRange {
  start: number;
  end: number;
}

interface SQLFoldTarget {
  statement: SQLStatementRange;
  foldRange: { from: number; to: number };
}

type SQLScanContext =
  | { type: "code" }
  | { type: "singleQuote" }
  | { type: "doubleQuote" }
  | { type: "backtick" }
  | { type: "bracket" }
  | { type: "lineComment" }
  | { type: "blockComment"; depth: number }
  | { type: "dollarQuote"; delimiter: string };

const foldedSQLPreviewLimit = 160;

export const sqlStatementFolding: Extension = foldService.of(
  sqlStatementFoldRange
);

export const sqlFoldAtomicRanges: Extension = EditorView.atomicRanges.of(
  (view) => foldedRanges(view.state)
);

export const sqlFoldSelectionGuard: Extension = EditorState.transactionFilter.of(
  (transaction) => {
    if (
      !transaction.selection ||
      transaction.docChanged ||
      transaction.effects.some((effect) => effect.is(unfoldEffect))
    ) {
      return transaction;
    }

    const selection = snapSelectionAroundFolds(
      transaction.startState,
      transaction.newSelection
    );
    if (selection.eq(transaction.newSelection, true)) return transaction;

    return {
      changes: transaction.changes,
      effects: transaction.effects,
      filter: false,
      scrollIntoView: transaction.scrollIntoView,
      selection,
    };
  }
);

export function sqlStatementFoldRange(
  state: EditorState,
  lineStart: number,
  lineEnd: number
) {
  return (
    sqlStatementFoldTarget(state, lineStart, lineEnd, true)?.foldRange ?? null
  );
}

export const foldSQLStatement: Command = (view) => {
  for (const selection of view.state.selection.ranges) {
    const line = view.state.doc.lineAt(selection.head);
    const target = sqlStatementFoldTarget(
      view.state,
      line.from,
      line.to,
      false
    );
    if (!target || hasFoldedRange(view.state, target.foldRange)) continue;

    view.dispatch({
      effects: foldEffect.of(target.foldRange),
      selection: { anchor: target.statement.start },
      scrollIntoView: true,
    });
    return true;
  }
  return false;
};

export const unfoldSQLStatement: Command = (view) => {
  for (const selection of view.state.selection.ranges) {
    const line = view.state.doc.lineAt(selection.head);
    const foldedRange = foldedRangeStartingOnLine(
      view.state,
      line.from,
      line.to
    );
    if (!foldedRange) continue;

    view.dispatch({
      effects: unfoldEffect.of(foldedRange),
    });
    return true;
  }
  return false;
};

export const toggleSQLStatementFold: Command = (view) => {
  return unfoldSQLStatement(view) || foldSQLStatement(view);
};

export function sqlStatementFoldGutter(): Extension {
  const canFold = new SQLFoldMarker(true);
  const canUnfold = new SQLFoldMarker(false);

  const markers = ViewPlugin.fromClass(
    class {
      markers: RangeSet<GutterMarker>;

      constructor(view: EditorView) {
        this.markers = this.buildMarkers(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.startState.field(foldState, false) !==
            update.state.field(foldState, false)
        ) {
          this.markers = this.buildMarkers(update.view);
        }
      }

      buildMarkers(view: EditorView) {
        const builder = new RangeSetBuilder<GutterMarker>();
        for (const line of view.viewportLineBlocks) {
          const foldedRange = foldedRangeStartingOnLine(
            view.state,
            line.from,
            line.to
          );
          const foldRange = foldedRange
            ? null
            : sqlStatementFoldRange(view.state, line.from, line.to);
          const marker = foldedRange ? canUnfold : foldRange ? canFold : null;
          if (marker) builder.add(line.from, line.from, marker);
        }
        return builder.finish();
      }
    }
  );

  return [
    markers,
    gutter({
      class: "cm-foldGutter cm-sqlFoldGutter",
      markers(view) {
        return view.plugin(markers)?.markers || RangeSet.empty;
      },
      domEventHandlers: {
        click(view, line, event) {
          toggleFoldAtGutterLine(view, line);
          event.preventDefault();
          return true;
        },
      },
    }),
  ];
}

function sqlStatementFoldTarget(
  state: EditorState,
  lineStart: number,
  lineEnd: number,
  firstLineOnly: boolean
): SQLFoldTarget | null {
  const statement = sqlStatementRangeAt(
    state.doc.toString(),
    lineStart,
    lineEnd
  );
  if (!statement) return null;

  if (firstLineOnly) {
    const firstLine = state.doc.lineAt(statement.start);
    if (!lineIntersectsRange(lineStart, lineEnd, {
      start: statement.start,
      end: firstLine.to,
    })) {
      return null;
    }
  }

  const foldRange = foldRangeForStatement(state, statement);
  return foldRange ? { statement, foldRange } : null;
}

function foldRangeForStatement(
  state: EditorState,
  statement: SQLStatementRange
) {
  const firstLine = state.doc.lineAt(statement.start);
  const lastLine = state.doc.lineAt(statement.end);
  if (firstLine.number === lastLine.number) return null;

  const from = firstLine.to;
  if (from >= statement.end) return null;

  return { from, to: statement.end };
}

function hasFoldedRange(
  state: EditorState,
  range: { from: number; to: number }
) {
  let hasRange = false;
  foldedRanges(state).between(range.from, range.to, (from, to) => {
    if (from === range.from && to === range.to) hasRange = true;
  });
  return hasRange;
}

function foldedRangeStartingOnLine(
  state: EditorState,
  lineStart: number,
  lineEnd: number
) {
  let foldedRange: { from: number; to: number } | null = null;
  foldedRanges(state).between(lineStart, Math.min(lineEnd + 1, state.doc.length), (from, to) => {
    if (!foldedRange || from < foldedRange.from) {
      foldedRange = { from, to };
    }
  });
  return foldedRange;
}

function toggleFoldAtGutterLine(view: EditorView, line: BlockInfo) {
  const foldedRange = foldedRangeStartingOnLine(view.state, line.from, line.to);
  if (foldedRange) {
    view.dispatch({
      effects: unfoldEffect.of(foldedRange),
    });
    return;
  }

  const foldRange = sqlStatementFoldRange(view.state, line.from, line.to);
  if (foldRange) {
    const statement = sqlStatementRangeAt(
      view.state.doc.toString(),
      line.from,
      line.to
    );
    view.dispatch({
      effects: foldEffect.of(foldRange),
      selection: { anchor: statement?.start ?? line.from },
      scrollIntoView: true,
    });
    view.focus();
  }
}

export function prepareSQLFoldPlaceholder(
  state: EditorState,
  range: { from: number; to: number }
) {
  const preview = compactSQLPreview(state.sliceDoc(range.from, range.to));
  return preview ? ` ${preview} ...` : " ...";
}

export function sqlFoldPlaceholderDOM(
  _view: unknown,
  _onclick: (event: Event) => void,
  preview: string | null
) {
  const placeholder = document.createElement("span");
  placeholder.className = "cm-foldPlaceholder cm-sqlFoldPlaceholder";
  placeholder.textContent = preview || " ...";
  placeholder.setAttribute("aria-label", "Folded SQL statement");
  placeholder.title = "Folded SQL statement";
  return placeholder;
}

export function sqlFoldMarkerDOM(open: boolean) {
  const marker = document.createElement("span");
  marker.className = open
    ? "cm-sqlFoldMarker cm-sqlFoldMarker-open"
    : "cm-sqlFoldMarker";
  marker.setAttribute(
    "aria-label",
    open ? "Fold SQL statement" : "Unfold SQL statement"
  );
  marker.title = open ? "Fold SQL statement" : "Unfold SQL statement";
  return marker;
}

class SQLFoldMarker extends GutterMarker {
  constructor(readonly open: boolean) {
    super();
  }

  eq(other: GutterMarker) {
    return other instanceof SQLFoldMarker && other.open === this.open;
  }

  toDOM() {
    return sqlFoldMarkerDOM(this.open);
  }
}

function sqlStatementRangeAt(
  sqlText: string,
  lineStart: number,
  lineEnd: number
): SQLStatementRange | null {
  let segmentStart = 0;

  for (const delimiter of topLevelSemicolons(sqlText)) {
    const range = normalizeSQLStatementRange(sqlText, segmentStart, delimiter + 1);
    if (range && lineIntersectsRange(lineStart, lineEnd, range)) {
      return range;
    }
    segmentStart = delimiter + 1;
  }

  const range = normalizeSQLStatementRange(
    sqlText,
    segmentStart,
    sqlText.length
  );
  return range && lineIntersectsRange(lineStart, lineEnd, range) ? range : null;
}

function topLevelSemicolons(sqlText: string) {
  const semicolons: number[] = [];
  let context: SQLScanContext = { type: "code" };

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const next = sqlText[index + 1];

    if (context.type === "lineComment") {
      if (char === "\n" || char === "\r") context = { type: "code" };
      continue;
    }

    if (context.type === "blockComment") {
      if (char === "/" && next === "*") {
        context.depth += 1;
        index += 1;
      } else if (char === "*" && next === "/") {
        context.depth -= 1;
        index += 1;
        if (context.depth === 0) context = { type: "code" };
      }
      continue;
    }

    if (context.type === "singleQuote") {
      if (char === "'" && next === "'") {
        index += 1;
      } else if (char === "\\") {
        index += 1;
      } else if (char === "'") {
        context = { type: "code" };
      }
      continue;
    }

    if (context.type === "doubleQuote") {
      if (char === "\"" && next === "\"") {
        index += 1;
      } else if (char === "\"") {
        context = { type: "code" };
      }
      continue;
    }

    if (context.type === "backtick") {
      if (char === "`" && next === "`") {
        index += 1;
      } else if (char === "`") {
        context = { type: "code" };
      }
      continue;
    }

    if (context.type === "bracket") {
      if (char === "]" && next === "]") {
        index += 1;
      } else if (char === "]") {
        context = { type: "code" };
      }
      continue;
    }

    if (context.type === "dollarQuote") {
      if (sqlText.startsWith(context.delimiter, index)) {
        index += context.delimiter.length - 1;
        context = { type: "code" };
      }
      continue;
    }

    if (char === "-" && next === "-") {
      context = { type: "lineComment" };
      index += 1;
    } else if (char === "#") {
      context = { type: "lineComment" };
    } else if (char === "/" && next === "*") {
      context = { type: "blockComment", depth: 1 };
      index += 1;
    } else if (char === "'") {
      context = { type: "singleQuote" };
    } else if (char === "\"") {
      context = { type: "doubleQuote" };
    } else if (char === "`") {
      context = { type: "backtick" };
    } else if (char === "[") {
      context = { type: "bracket" };
    } else if (char === "$") {
      const delimiter = dollarQuoteDelimiterAt(sqlText, index);
      if (delimiter) {
        context = { type: "dollarQuote", delimiter };
        index += delimiter.length - 1;
      }
    } else if (char === ";") {
      semicolons.push(index);
    }
  }

  return semicolons;
}

function normalizeSQLStatementRange(
  sqlText: string,
  from: number,
  to: number
): SQLStatementRange | null {
  const start = firstSignificantSQLIndex(sqlText, from, to);
  if (start === null) return null;

  const end = lastNonWhitespaceIndex(sqlText, start, to) + 1;
  return start < end ? { start, end } : null;
}

function firstSignificantSQLIndex(sqlText: string, from: number, to: number) {
  let index = from;
  while (index < to) {
    const char = sqlText[index];
    const next = sqlText[index + 1];

    if (isSQLWhitespace(char)) {
      index += 1;
    } else if (char === "-" && next === "-") {
      index = lineCommentEnd(sqlText, index + 2, to);
    } else if (char === "#") {
      index = lineCommentEnd(sqlText, index + 1, to);
    } else if (char === "/" && next === "*") {
      index = blockCommentEnd(sqlText, index + 2, to);
    } else {
      return index;
    }
  }
  return null;
}

function lineCommentEnd(sqlText: string, from: number, to: number) {
  let index = from;
  while (index < to && sqlText[index] !== "\n" && sqlText[index] !== "\r") {
    index += 1;
  }
  return index;
}

function blockCommentEnd(sqlText: string, from: number, to: number) {
  let index = from;
  let depth = 1;
  while (index < to && depth > 0) {
    const char = sqlText[index];
    const next = sqlText[index + 1];
    if (char === "/" && next === "*") {
      depth += 1;
      index += 2;
    } else if (char === "*" && next === "/") {
      depth -= 1;
      index += 2;
    } else {
      index += 1;
    }
  }
  return index;
}

function lastNonWhitespaceIndex(sqlText: string, from: number, to: number) {
  let index = Math.min(to, sqlText.length) - 1;
  while (index >= from && isSQLWhitespace(sqlText[index])) {
    index -= 1;
  }
  return index;
}

function dollarQuoteDelimiterAt(sqlText: string, index: number) {
  let end = index + 1;
  while (end < sqlText.length && /[A-Za-z0-9_]/.test(sqlText[end])) {
    end += 1;
  }
  if (sqlText[end] !== "$") return null;
  return sqlText.slice(index, end + 1);
}

function lineIntersectsRange(
  lineStart: number,
  lineEnd: number,
  range: SQLStatementRange
) {
  return lineStart <= range.end && lineEnd >= range.start;
}

function compactSQLPreview(sqlText: string) {
  const compact = sqlText.replace(/\s+/g, " ").trim();
  if (compact.length <= foldedSQLPreviewLimit) return compact;
  return `${compact.slice(0, foldedSQLPreviewLimit).trimEnd()}...`;
}

function snapSelectionAroundFolds(
  state: EditorState,
  selection: EditorSelection
) {
  let changed = false;
  const ranges = selection.ranges.map((range) => {
    const nextRange = snapSelectionRangeAroundFolds(state, range);
    if (!nextRange.eq(range, true)) changed = true;
    return nextRange;
  });

  return changed ? EditorSelection.create(ranges, selection.mainIndex) : selection;
}

function snapSelectionRangeAroundFolds(
  state: EditorState,
  range: SelectionRange
) {
  const anchor = snapPositionAroundFolds(state, range.anchor, range.head);
  const head = snapPositionAroundFolds(state, range.head, range.anchor);
  if (anchor === range.anchor && head === range.head) return range;
  return EditorSelection.range(anchor, head);
}

function snapPositionAroundFolds(
  state: EditorState,
  position: number,
  oppositePosition: number
) {
  let nextPosition = position;

  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    if (position > from && position < to) {
      nextPosition = oppositePosition <= from ? to : from;
    } else if (position === from && oppositePosition < from) {
      nextPosition = to;
    } else if (position === to && oppositePosition > to) {
      nextPosition = from;
    }
  });

  return nextPosition;
}

function isSQLWhitespace(char: string | undefined) {
  return char === undefined || /\s/.test(char);
}
