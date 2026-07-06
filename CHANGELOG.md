# Changelog

## 📊 Schema Results & Telemetry
Release - v0.1.3

✨ New

- Added opt-in telemetry with privacy-safe event metadata.
- Clicking a table in the left schema browser now opens a limited results view for that table.

💎 Improvements

- Kept schema-browser table opens out of query history so history stays focused on user-written SQL.

## 🤖 Agentic AI Chat
Release - v1.0.2

DataPanel's AI chat is now more resilient. When the assistant needs table DDL that was not loaded yet, it can ask DataPanel to fetch that schema context and retry SQL generation automatically.

✨ New

- Added an agentic AI chat loop that can request missing table DDL and retry SQL generation with smaller models.

💎 Improvements

- Improved AI chat actions with clearer copy, load, and run controls.
- Stopped auto-loading generated SQL into the editor; users now choose when to load it.

🐞 Fixes

- Fixed modal spacing so settings can stay edge-to-edge while other modals keep normal padding.
- Fixed the query history header icon and alignment.

## 💎 Query Workflow Polish
Release - v1.0.1

💎 Improvements

- Improved app stability and query workflow polish.
- Refined schema browsing and query history behavior.

🐞 Fixes

- Fixed small UI issues across the desktop app.

## 🚀 Initial Release
Release - v1.0.0

✨ New

- Initial DataPanel desktop release.
- Added saved database connections, schema browsing, and SQL execution.
- Added AI-assisted SQL workflows with local credential storage.
