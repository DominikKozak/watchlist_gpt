# Invest Watchlist

Invest Watchlist is a private MCP investment watchlist connector for ChatGPT. It manages a local SQLite database with assets, notes, review dates, analysis fields, price history, exports, and UI-ready structured tool output.

Repository: `watchlist_gpt`.

It is intentionally **not** a trading system. It never places trades, never connects to brokers, never stores broker login credentials, and never exposes buy/sell order tools. Outputs are for watchlist organization and research workflow only, not financial advice.

## Implemented

- Local stdio MCP entrypoint in `src/server.ts`.
- Hosted/stateless Streamable HTTP MCP endpoint at `POST /mcp` in `src/httpServer.ts`.
- Simple web UI at `GET /` with a watchlist table and JSON data at `GET /api/watchlist`.
- Shared MCP server and tool registration in `src/mcp/createServer.ts`.
- Optional bearer-token protection for HTTP with `CONNECTOR_API_KEY`.
- Public unauthenticated `GET /health` and `GET /version` operational endpoints.
- JSON backup and restore for assets, notes, and price history.
- SQLite schema with safe backwards-compatible column migration.
- Watchlist tools for listing, detail, add, update, delete, notes, review workflow, portfolio summary, search, decision tracking, price refresh, buy-zone view, LEAPS view, and Markdown/CSV/JSON export.
- UI-ready list and detail responses for future Apps SDK rendering.
- ChatGPT Apps SDK watchlist table resource for in-chat UI.
- Dockerfile for hosted HTTP deployment.
- Optional Turso/libSQL database provider for free hosted deployments.
- Render blueprint for a free web service backed by Turso.
- Runtime price provider routing with `mock`, `coingecko`, and `hybrid`.
- Live stock/ETF quotes via Finnhub when `STOCK_API_KEY` is configured.
- Verification scripts for core tool behavior and HTTP bearer smoke testing.

## Not Implemented

- Broker integrations.
- Trade execution.
- Buy/sell order tools.
- Broker credential storage.
- Real live options quote provider.
- OAuth or production identity integration.
- Full Apps SDK frontend component.

## Install

```bash
npm install
```

Copy the environment template:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## Environment

```env
DATABASE_PATH=./data/watchlist.sqlite
DB_PROVIDER=sqlite
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
PRICE_PROVIDER=mock
COINGECKO_API_KEY=
STOCK_API_KEY=
STOCK_API_PROVIDER=finnhub
HTTP_HOST=127.0.0.1
HTTP_PORT=3000
CONNECTOR_API_KEY=
```

Optional restore mode:

```env
RESTORE_MODE=upsert
```

Supported restore modes are `upsert`, `skip_existing`, and `replace_all`. `replace_all` deletes current local watchlist data before import and must be set explicitly.

`CONNECTOR_API_KEY` applies only to the HTTP entrypoint. If it is set, every `/mcp` request must include:

```text
Authorization: Bearer <CONNECTOR_API_KEY>
```

If `CONNECTOR_API_KEY` is empty, HTTP is allowed for local development and the server prints a warning at startup. Do not expose an unauthenticated HTTP server beyond a trusted local environment.

No API keys or secrets are hardcoded.

`DB_PROVIDER=sqlite` is the local default and uses `DATABASE_PATH`.

`DB_PROVIDER=turso` uses `TURSO_DATABASE_URL` and optional `TURSO_AUTH_TOKEN`. Use this for Render or other stateless free hosting where local SQLite files are not persistent.

## Initialize Database

```bash
npm run db:init
```

By default, the database is created at `./data/watchlist.sqlite`. Existing databases are migrated by adding missing nullable analysis columns.

## Seed Data

```bash
npm run seed
```

Seeded assets:

- MSFT, LEAPS candidates, XTB, stock, conviction B+
- META, LEAPS candidates, XTB, stock, conviction A-
- BTC, BTC / Crypto, crypto, conviction A
- SPCE, Speculative / WSB, stock, conviction C

The seed includes a few analysis fields such as review frequency, thesis score, risk score, target price, and last decision.

## Run Local stdio MCP

Use stdio for local, process-spawned MCP clients:

```bash
npm run dev:stdio
```

For compiled JavaScript:

```bash
npm run build
npm run start:stdio
```

`npm run dev` and `npm start` are stdio aliases.

Quick start:

```bash
npm install
npm run db:init
npm run seed
npm run dev:stdio
```

## Run HTTP MCP

The hosted entrypoint uses the MCP SDK `StreamableHTTPServerTransport` in stateless mode. Each HTTP request creates a request-scoped MCP server and SQLite handle, registers the same shared tools, handles the request, then closes its resources.

Development:

```bash
npm run dev:http
```

Compiled:

```bash
npm run build
npm run start:http
```

Default URL:

```text
http://127.0.0.1:3000/mcp
```

The same HTTP server also exposes a simple browser UI for local review:

```text
http://127.0.0.1:3000/
```

The backing JSON payload is available at:

```text
http://127.0.0.1:3000/api/watchlist
```

When `CONNECTOR_API_KEY` is set, both UI endpoints require the same `Authorization: Bearer <CONNECTOR_API_KEY>` header as `/mcp`.

Configure with `HTTP_HOST` and `HTTP_PORT`.

Quick start:

```bash
npm install
npm run db:init
npm run seed
npm run dev:http
```

### Health and Version

These endpoints never require `CONNECTOR_API_KEY`:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/version
```

`GET /health` returns status, app name, version, and timestamp.

`GET /version` returns app name, package version, node environment, price provider mode, auth enabled status, and safe database configuration. It exposes only the database basename or a safe configured value, never secrets or bearer tokens.

### Manual HTTP Test

Without `CONNECTOR_API_KEY`:

```bash
curl -i http://127.0.0.1:3000/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.0"}}}'
```

With `CONNECTOR_API_KEY`:

```bash
curl -i http://127.0.0.1:3000/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-private-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.0"}}}'
```

## Tools

Both stdio and HTTP register the same tools:

- `list_watchlist`
- `get_asset`
- `add_asset`
- `update_asset`
- `delete_asset`
- `add_note`
- `refresh_prices`
- `list_review_due`
- `mark_review_done`
- `portfolio_summary`
- `search_assets`
- `set_asset_decision`
- `show_buy_zone`
- `show_leaps_candidates`
- `export_watchlist_markdown`
- `export_watchlist_csv`
- `export_watchlist_json`
- `import_watchlist_json`

The tool descriptions are written so ChatGPT can map phrases like:

- `/watchlist`
- `/watchlist review`
- `/watchlist leaps`
- `/watchlist buy zone`
- `add MSFT to LEAPS candidates`
- `update BTC thesis`
- `refresh prices`
- `portfolio summary`
- `search assets containing AI`
- `set MSFT decision to keep watching`

`portfolio_summary` is read-only and returns counts by category, status, and asset type plus review-due assets, missing-price assets, mock-price assets, LEAPS candidates, speculative/high-risk assets, warnings, and `generatedAt`.

`search_assets` is read-only and searches ticker, name, thesis, main risk, decision reason, and notes.

`set_asset_decision` updates local analysis fields such as `lastDecision`, optional `decisionReason`, `conviction`, `status`, `nextReviewDate`, and optional review note. It never places trades and never implies execution.

`export_watchlist_json` returns the versioned JSON backup object.

`import_watchlist_json` validates and imports a versioned JSON backup with `dryRun` and `mode: upsert | skip_existing | replace_all`.

## UI-Ready Output

`list_watchlist` returns:

- `assets`
- `columns` metadata
- `summary.total`
- `summary.byCategory`
- `summary.byStatus`
- `generatedAt`
- `priceProviderMode`
- `warnings`

`get_asset` returns:

- `asset`
- `notes`
- `priceHistory`
- `displaySections`
- `generatedAt`
- `priceProviderMode`
- `warnings`

This is enough for ChatGPT to present tables now, and the repo also exposes a ChatGPT Apps SDK watchlist table resource for an in-chat UI. The local HTTP preview page still exists for debugging, but it is no longer the primary UI path.

## Analysis Fields

Assets support these optional nullable analysis fields:

- `targetBuyPrice`
- `targetSellPrice`
- `reviewFrequencyDays`
- `thesisScore`
- `riskScore`
- `lastDecision`
- `decisionReason`

They are accepted by `add_asset` and `update_asset`, included in list/detail output, and exported in Markdown/CSV.

## Review Workflow

`mark_review_done` sets `lastReviewDate` to the current timestamp.

If `nextReviewDate` is provided, that value is used. If it is not provided and the asset has `reviewFrequencyDays`, the tool sets `nextReviewDate` to today's UTC date plus that many days. If neither value is available, `nextReviewDate` stays null.

If `reviewNote` is provided, the tool also adds a note prefixed with `Review:`.

## Price Providers

`PRICE_PROVIDER=mock` uses deterministic fake prices for every asset type. This is the local MVP default.

`PRICE_PROVIDER=coingecko` uses `CoinGeckoProvider` for mapped crypto assets such as BTC. Non-crypto assets return a clear per-ticker failure during refresh.

`PRICE_PROVIDER=hybrid` routes:

- crypto to CoinGecko
- stock and ETF assets to `StockProvider`
- option, CFD, and note-only assets to mock fallback

`COINGECKO_API_KEY` is optional and used only when present. Prices may be delayed, estimated, missing, or mock-only depending on provider mode.

`StockProvider` now supports `STOCK_API_PROVIDER=finnhub`. When `STOCK_API_KEY` is configured, stock and ETF assets can refresh with live Finnhub quotes. If `STOCK_API_KEY` is missing, hybrid mode falls back to mock prices for stock and ETF assets so local development still works.

Important limitation: live options pricing is still not implemented. Option candidates in the watchlist are still analysis items, not broker-backed live option quotes.

`refresh_prices` keeps partial-failure behavior. If one ticker fails, the tool reports it in `failed` and continues refreshing the rest.

## Backup and Restore

Create a timestamped JSON backup in `./backups`:

```bash
npm run backup
```

The backup includes:

- `version`
- `exportedAt`
- `assets`
- `notes`
- `priceHistory`

It does not include API keys, bearer tokens, `.env` values, or broker credentials.

Restore from a backup:

```bash
npm run restore -- backups/watchlist-example.json
```

Default restore mode is `upsert`.

Use `skip_existing`:

```bash
RESTORE_MODE=skip_existing npm run restore -- backups/watchlist-example.json
```

Use `replace_all` only when you intentionally want to delete current local watchlist data first:

```bash
RESTORE_MODE=replace_all npm run restore -- backups/watchlist-example.json
```

The MCP tools `export_watchlist_json` and `import_watchlist_json` use the same versioned backup format.

## Docker

Build:

```bash
npm run docker:build
```

Run:

```bash
npm run docker:run
```

The Docker image defaults to the HTTP server with `HTTP_HOST=0.0.0.0` and `HTTP_PORT=3000`. The `.env`, `data`, `backups`, `dist`, and `node_modules` directories are excluded by `.dockerignore`.

## Free Hosted Test: Render + Turso

This project can run as:

```text
ChatGPT -> Render Free HTTPS service -> Turso Free libSQL database
```

Why this works better than SQLite on Render Free:

- Render Free web services do not provide reliable local persistent disk for SQLite state.
- Turso keeps the watchlist data in a hosted libSQL database.
- The Node MCP server stays stateless and can sleep/wake on Render.

Expected tradeoffs:

- First request after inactivity can be slow because Render Free may spin down.
- Turso free databases may also have cold-start behavior.
- This is suitable for private testing, not critical production use.

Render deployment files:

- `Dockerfile`
- `render.yaml`

Required Render env vars:

```env
DB_PROVIDER=turso
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
CONNECTOR_API_KEY=long-random-private-token
HTTP_HOST=0.0.0.0
HTTP_PORT=3000
PRICE_PROVIDER=hybrid
STOCK_API_PROVIDER=finnhub
```

After deploy, verify:

```bash
curl https://your-render-service.onrender.com/health
curl https://your-render-service.onrender.com/version
```

Then verify `/mcp` auth with the same initialize request shown above, adding:

```text
Authorization: Bearer <CONNECTOR_API_KEY>
```

## Verify

Core verification:

```bash
npm run verify
```

It validates database initialization, MCP tool registration, seed-like asset creation, add/update/delete, notes, review auto-date behavior, mock provider mode, hybrid provider routing, Markdown/CSV export, new fields, and rejection of unknown update fields.
It also validates `portfolio_summary`, `search_assets`, `set_asset_decision`, `export_watchlist_json`, `import_watchlist_json` dry-run/upsert behavior, and backup/restore helper functions.

HTTP smoke verification:

```bash
npm run verify:http
```

It builds the project, starts the compiled HTTP server against a temporary database with `CONNECTOR_API_KEY`, verifies `/health` and `/version` return `200` without auth, verifies `/version` does not expose secrets or the full database path, verifies unauthorized `/mcp` requests return `401`, and verifies an authorized MCP initialize request succeeds.

## Private ChatGPT Connector Path

For private hosted connector testing:

1. Run `npm install`.
2. Run `npm run build`.
3. Set production env vars, especially `DATABASE_PATH`, `PRICE_PROVIDER`, `HTTP_HOST`, `HTTP_PORT`, and `CONNECTOR_API_KEY`.
4. For Render/Turso, set `DB_PROVIDER=turso`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` instead of relying on local `DATABASE_PATH`.
5. Run `npm run start:http`.
6. Put the app behind HTTPS. Private ChatGPT connector flows generally require HTTPS, not a plain local HTTP URL.
7. Point the private connector configuration at `https://your-host.example/mcp`.
8. Keep bearer auth for private testing, then replace or layer it with the auth required by your connector deployment model.
9. The Apps SDK watchlist table resource is already wired in; use it as the custom table experience in ChatGPT.

## Future TODO

- HTTPS hosting configuration.
- Production-grade auth/OAuth for the private connector flow.
- Real options pricing provider.
- Optional LEAPS/options-specific fields and calculations.
- Hosted volume/backup retention policy.

## Safety Boundaries

- No broker credentials.
- No broker connections.
- No order placement.
- No buy/sell trade execution tools.
- No hardcoded secrets.
- No claim that prices are real-time.
- No claim that this is financial advice.
- Watchlist and analysis workflow only.
