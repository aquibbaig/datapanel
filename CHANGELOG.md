# Changelog

## 🔐 Secure Vault Storage
Release - v1.0.5

✨ New

- Replaced direct keychain access with secure vault-backed credential storage.
- Added SQL code folding to the query editor.
- Added a release-page action to the app update flow.

💎 Improvements

- Updated connection, settings, and AI credential flows to use the vault consistently.
- Improved vault initialization, migration, and recovery handling.

## 🧰 Results Table Actions
Release - v1.0.4

✨ New

- Added per-column actions for results tables.
- Added results-grid filtering and sorting controls.
- Added a result view bar for table-level actions.

💎 Improvements

- Improved results toolbar integration for table actions.

## 📊 Schema Results, Telemetry & Updates
Release - v1.0.3

✨ New

- Added opt-in telemetry with privacy-safe event metadata.
- Added app update checking and update notification UI.
- Clicking a table in the left schema browser now opens a limited results view for that table.

💎 Improvements

- Kept schema-browser table opens out of query history so history stays focused on user-written SQL.
- Cleaned up AI assistant panel behavior and button layout.

🐞 Fixes

- Fixed telemetry setup and settings persistence behavior.

## 🤖 Agentic AI Chat
Release - v1.0.2

DataPanel's AI chat is now more resilient. When the assistant needs table DDL that was not loaded yet, it can ask DataPanel to fetch that schema context and retry SQL generation automatically.

✨ New

- Added an agentic AI chat loop that can request missing table DDL and retry SQL generation with smaller models.
- Added an optional Vim navigation mode for the SQL editor.

💎 Improvements

- Improved AI chat actions with clearer copy, load, and run controls.
- Stopped auto-loading generated SQL into the editor; users now choose when to load it.
- Refined the settings panel layout for editor preferences.

🐞 Fixes

- Fixed modal spacing so settings can stay edge-to-edge while other modals keep normal padding.
- Fixed the query history header icon and alignment.

## 💎 Query Workflow Polish
Release - v1.0.1

✨ New

- Added contextual SQL completion for the query editor.
- Added expanded foreign-key relationship context for Postgres schema metadata.
- Added AGPLv3 licensing and funding information.

💎 Improvements

- Improved autocomplete relevance using the current SQL context.
- Expanded database schema adapters to expose richer relationship metadata.

🐞 Fixes

- Fixed SQL completion edge cases across query editor workflows.

## 🚀 Initial Release
Release - v1.0.0

✨ New

- Initial DataPanel desktop release.
- Added saved database connections, schema browsing, and SQL execution.
- Added AI-assisted SQL workflows with local credential storage.
