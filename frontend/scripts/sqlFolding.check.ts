import { codeFolding, foldEffect } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  sqlFoldSelectionGuard,
  sqlStatementFolding,
  sqlStatementFoldRange,
} from "../src/features/query-editor/sqlFolding";

const doc = "select *\nfrom users\nwhere active;\n\nselect 2;";
const extensions = [codeFolding(), sqlStatementFolding, sqlFoldSelectionGuard];
const createFoldedState = () => {
  let state = EditorState.create({ doc, extensions });
  const firstLine = state.doc.line(1);
  const fold = sqlStatementFoldRange(state, firstLine.from, firstLine.to);
  if (!fold) throw new Error("Expected a foldable SQL statement");
  state = state.update({ effects: foldEffect.of(fold) }).state;
  return { firstLine, fold, state };
};

{
  const { firstLine, state } = createFoldedState();
  const deleted = state.update({
    changes: { from: 0, to: firstLine.to + 1 },
  }).state;
  if (deleted.doc.toString() !== "\n\nselect 2;") {
    throw new Error("Deleting a selected fold left hidden SQL behind");
  }
}

{
  const { firstLine, fold, state } = createFoldedState();
  const opened = state.update({
    changes: { from: firstLine.to, insert: "\n " },
    selection: { anchor: firstLine.to + 2 },
  }).state;
  if (opened.doc.toString() !== `${doc.slice(0, fold.to)}\n${doc.slice(fold.to)}`) {
    throw new Error("Opening a line unfolded or split the SQL statement");
  }
  if (opened.selection.main.head !== fold.to + 1) {
    throw new Error("Opened line did not receive the cursor");
  }
}

console.log("SQL folding checks passed");
