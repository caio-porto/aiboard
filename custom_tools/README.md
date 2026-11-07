# Custom & Private Tools (`custom_tools/`)

This directory is dedicated to **organization-specific, regional, or proprietary tools** for **AI Board (`aiboard`)**.

By design, `.gitignore` excludes all `.py` modules inside `custom_tools/` except:
- `__init__.py`
- `example_custom_tool.py`
- `README.md`

This allows you to pull upstream updates from the public repository without merge conflicts or accidentally leaking internal APIs, ERPs, or business rules.

---

## How It Works

1. **Public Universal Tools (`tools/`)**:
   - `google_workspace_tools.py` — Gmail, Google Drive, Docs, Sheets
   - `microservices_tools.py` — Chatwoot, FreeScout, Evolution API / WhatsApp, Meta Ads
   - `telegram_tools.py` — Telegram Bot alerts & document delivery
   - `notion_workspace_tools.py` — Notion Workspace search & page reader
   - `marketing_tools.py` — Meta Ads & Google Ads analytics
   - `agent_workspace_tools.py` — Autonomous Python Script Forge, local SQLite & Learned Rules Memory
   - `business_report_tools.py` — Business Analytics & Generic MCP SSE/STDIO connector

2. **Private / Regional Plugins (`custom_tools/`)**:
   - Drop your custom tool modules here (start from `example_custom_tool.py`).
   - The backend (`crews/operational_crew.py` and `api/tool_diagnostics.py`) dynamically detects installed modules in `custom_tools/` and exposes them to the visual Canvas catalog (`GET /api/settings -> installed_tools / installed_triggers`).
   - When a custom tool module is absent, the platform runs cleanly using only the universal public tools.
