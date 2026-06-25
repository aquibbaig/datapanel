---
name: datapanel-frontend-components
description: Use for changes to DataPanel's React/Vite frontend components under frontend/src, especially component refactors, UI/UX fixes, results-grid/table editing work, virtualization, keyboard interactions, and shared frontend helpers.
---

# DataPanel Frontend Components

Follow these rules whenever modifying DataPanel frontend components.

## Component Strategy

- Keep components small and focused. Split large UI files into colocated `components/`, `hooks/`, and `lib/` files before adding more behavior.
- Keep render components responsible for markup and interaction wiring. Put pure logic, SQL/string helpers, clipboard parsing, formatting, and row-state utilities in colocated helper files.
- Prefer file boundaries that match the user-facing surface: toolbar, finder, viewport, cell editor, cell value, change review, and inspector should be separate components when they grow beyond trivial markup.
- Avoid inline component definitions inside large files. If a component needs local state or more than a few props, move it to a named file.
- Export shared types from a colocated `types.ts` instead of repeating interface definitions across components.

## Data Grid UX Rules

- Treat database results as WYSIWYG table data. Do not render synthetic row-number columns or other fake table fields inside the grid.
- Use virtualization for large result sets, but keep headers outside the vertical scroll coordinate system so row content cannot disappear behind sticky headers.
- Hide visual scrollbars for the results grid unless the design explicitly calls for them; scrolling should still work with trackpads, wheels, and keyboard navigation.
- Keep sticky or fixed surfaces opaque. Never rely on inherited transparent row backgrounds for headers or pinned areas.
- Render exact data semantics clearly: `NULL` for null/undefined and the app's null-equivalent display, not explanatory labels like `(empty)`.
- Editing is staged locally until Save. Database permissions are enforced by executing generated SQL through the active connection user.

## Interaction Rules

- Support `Cmd/Ctrl+F` with one simple text-search control. It should search column names and cell text together; avoid mode-heavy controls unless there is a real product need.
- Support row/cell selection without adding fake visible columns.
- Double-click should edit a writable cell. Commit edits at action boundaries, not on every keystroke, so undo history stays useful.
- Keep keyboard shortcuts scoped to the grid and avoid stealing shortcuts from active inputs, textareas, CodeMirror, or other editable targets.
- Use clear staged states: selected, inserted, updated, and deleted rows/cells must be visually distinct in light and dark themes.

## Styling And Components

- Use existing UI primitives from `frontend/src/components/ui` and local helpers such as `cn` and `textInputBehaviorProps`.
- Use `lucide-react` icons already present in the app; prefer icon-only buttons with accessible labels for compact tools.
- Use theme tokens for light/dark safety. Prefer semantic tokens such as `background`, `foreground`, `muted`, `accent`, `key`, `control`, `selection`, `line`, and this repo's CSS-variable-backed `zinc` scale. Do not use raw Tailwind palette colors like `text-yellow-200`, `text-sky-200`, or hardcoded hex/rgb values in components unless a new token is added first.
- Use `text-key` for primary-key/key glyphs. Do not substitute `text-accent` for key glyphs; key indicators should stay yellow through the `key` theme token in both light and dark themes.
- Avoid nested cards and decorative wrappers in operational UI. Results/editing surfaces should be dense, direct, and table-like.
- Text must fit within cells, buttons, and controls without overlapping adjacent UI.

## Verification

- Run `npm run typecheck` from `frontend` after frontend component changes.
- Run `npm run build` from `frontend` for significant UI, bundling, or import-graph changes.
- Run `go test ./...` from the repo root when frontend work changes Wails-facing models or backend query behavior.
- For local visual checks, use the in-app browser against the Vite dev server and verify the specific interaction that changed.

## Safety

- Do not commit secrets, connection strings, tokens, private URLs, or local `.env` values.
- Keep generated skill content generic to this repository. Do not encode personal machine paths, credentials, or private deployment details.
