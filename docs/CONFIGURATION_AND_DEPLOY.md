# ⚙️ AI Board — Configuration, FinOps & Production Deployment Guide

[**⬅️ Back to Main README (`README.md`)**](../README.md) · [**🛠️ Tools & Triggers Guide (`docs/TOOLS_AND_TRIGGERS_GUIDE.md`)**](TOOLS_AND_TRIGGERS_GUIDE.md) · [**🇧🇷 Português (`docs/README.pt-BR.md`)**](README.pt-BR.md) · [**🇪🇸 Español (`docs/README.es.md`)**](README.es.md)

---

## 📖 Table of Contents

1. [Production Deployment Architecture](#-production-deployment-architecture)
2. [Docker & Docker Compose Configuration](#-docker--docker-compose-configuration)
3. [Google OAuth 2.0 & Workspace Setup](#-google-oauth-20--workspace-setup)
4. [FinOps Cost Guardrails & Model Routing](#-finops-cost-guardrails--model-routing)
5. [Chatwoot Human Takeover & Anti-Collision Guard](#-chatwoot-human-takeover--anti-collision-guard)
6. [Automated Google Drive Backups (`rclone`)](#-automated-google-drive-backups-rclone)
7. [Zero-Downtime Updates Preserving `custom_tools/`](#-zero-downtime-updates-preserving-custom_tools)

---

## 🏗️ Production Deployment Architecture

In production, **AI Board (`aiboard`)** runs three coordinated processes (via Docker Compose) behind an Nginx or Caddy HTTPS reverse proxy:

- **`crewai-api` (`python -m api.main` — Port `8001`)**: FastAPI server handling REST endpoints, Google OAuth 2.0, reactive webhooks, SQLite persistence (`data/tasks.db`), concurrent microservice health probes, and the autonomous Cron scheduler (`_cron_scheduler_loop`).
- **`crewai-web` (`streamlit run web/app.py` — Port `8501`)**: Optional auxiliary web interface.
- **`crewai-bot` (`python -m bot.telegram_bot`)**: Background worker connected to Telegram for executive commands, voice notes, and 1-click Human-in-the-Loop action approvals.
- **Static SPA (`frontend/dist`)**: Built with React 19, Vite 6, Tailwind CSS v4, and `@xyflow/react`, served directly by Nginx with `/api/*` proxied to `127.0.0.1:8001`.

---

## 🐳 Docker & Docker Compose Configuration

The [`Dockerfile`](../Dockerfile) uses `python:3.11-slim`, installs `build-essential`, `curl`, `git`, `libpq-dev`, all packages from [`requirements.txt`](../requirements.txt), and headless Chromium (`playwright install --with-deps chromium`).

Key bind mounts in [`docker-compose.yml`](../docker-compose.yml):
- `./data:/app/data` — Persists `tasks.db`, `REGRAS_APRENDIDAS_E_FEEDBACKS.md`, OAuth tokens, and agent local workspaces across container restarts.
- `./custom_tools:/app/custom_tools` — Mounts your organization's private plugins without baking proprietary secrets into the Docker image.
- `extra_hosts: ["host.docker.internal:host-gateway"]` — Allows containers to reach host-level microservices (Chatwoot on `:3050`, FreeScout on `:18080`, Evolution API on `:8085`).

---

## 🔐 Google OAuth 2.0 & Workspace Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create an OAuth 2.0 Web Client ID.
2. Add your production domain to **Authorized JavaScript origins** and **Authorized redirect URIs** (e.g., `https://aiboard.yourdomain.com`).
3. Set in `.env`:
   ```env
   GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_REDIRECT_URI=https://aiboard.yourdomain.com
   ALLOWED_GOOGLE_DOMAINS=yourdomain.com
   ADMIN_EMAIL=founder@yourdomain.com
   ```
4. The first user to sign in (or the user matching `ADMIN_EMAIL`) is automatically assigned `role = 'admin'` in the `users` SQLite table.

---

## 💰 FinOps Cost Guardrails & Model Routing

AI Board includes built-in FinOps controls configurable via the UI (**Settings & Diagnostics**) or `POST /api/settings`:

| Setting Key | Default | Description |
| :--- | :--- | :--- |
| `max_daily_budget_brl` | `5.00` | Daily spending ceiling in BRL. When exceeded (`is_daily_budget_exceeded()`), non-critical runs are blocked. |
| `kill_switch_active` | `false` | Emergency master switch that immediately halts all outbound Gemini LLM calls. |
| `usd_brl_exchange_rate` | *Auto (Live)* | Fetched live from `ExchangeRate-API` / `AwesomeAPI` / `Frankfurter` (`GET /api/currency/usd-brl`) or overridden manually. |
| `task_timeout_seconds` | `300` | Hard execution timeout per task to prevent runaway agent loops. |
| `semantic_cache_active` | `true` | Caches normalized prompt responses in `semantic_prompt_cache` (`tasks.db`) for zero-token instant hits. |
| `tech_radar_complexity_router` | `true` | Automatically routes short operational queries to `Gemini 3.1 Flash-Lite` ($0.25/1M in) while reserving `Gemini 3.8 Flash` / `Gemini 3.1 Pro` for C-Level synthesis. |

---

## 🛡️ Chatwoot Human Takeover & Anti-Collision Guard

When using AI Board with **Chatwoot / WhatsApp**, the platform prevents AI agents from colliding with human customer support operators (`api/event_triggers.py`):

- **`initial_wait_seconds` (Default: `180s`)**: Debounce window that batches rapid customer messages and gives human operators priority to reply first.
- **`human_takeover_mode` (`pause` or `extended_wait`)**: When a human operator sends an outgoing message in a Chatwoot conversation, AI Board records the conversation in `chatwoot_human_takeover`, automatically cancels any pending AI approval cards (`supersede_pending_chatwoot_actions`), and pauses AI intervention for `human_takeover_ttl_seconds` (default `14400s` / 4 hours).
- Configure live via `GET / POST /api/settings/approval-mode`.

---

## 💾 Automated Google Drive Backups (`rclone`)

AI Board tracks automated server backups via:
- `GET /api/backup/status`: Returns the last backup timestamp, database size, `gdrive_path`, `retention_days`, and `cron_time`.
- `POST /api/backup/run` (Admin only): Triggers an immediate backup via `/opt/crewai/backup-to-gdrive.sh` or the host systemd path unit (`data/backup.trigger`).

---

## 🔄 Zero-Downtime Updates Preserving `custom_tools/`

```bash
git pull origin main
cd frontend && npm install && npm run build && cd ..
docker compose up -d --build
```
All SQLite tables in `data/tasks.db` run automatic defensive schema migrations (`init_db()` in `api/tasks_queue.py` and `init_events_db()` in `api/event_triggers.py`) on startup.
