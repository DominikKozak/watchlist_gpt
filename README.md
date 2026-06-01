# Invest Watchlist

Invest Watchlist is a private MCP investment watchlist connector for ChatGPT. It manages a local SQLite database with assets, notes, review dates, analysis fields, price history, exports, and UI-ready structured tool output.

Repository: `watchlist_gpt`.

It is intentionally **not** a trading system. It never places trades, never connects to brokers, never stores broker login credentials, and never exposes buy/sell order tools. Outputs are for watchlist organization and research workflow only, not financial advice.

## Implemented

- Local stdio MCP entrypoint in `src/server.ts`.
- Hosted/stateless Streamable HTTP MCP endpoint at `POST /mcp` in `src/httpServer.ts`.
- Shared MCP server and tool registration in `src/mcp/createServer.ts`.
- Optional bearer-token protection for HTTP with `CONNECTOR_API_KEY`.
- SQLite schema with safe backwards-compatible column migration.
- Watchlist tools for listing, detail, add, update, delete, notes, review workflow, price refresh, buy-zone view, LEAPS view, Markdown export, and CSV export.
- UI-ready list and detail responses for future Apps SDK rendering.
- Runtime price provider routing with `mock`, `coingecko`, and `hybrid`.
- Verification scripts for core tool behavior and HTTP bearer smoke testing.

## Not Implemented

- Broker integrations.
- Trade execution.
- Buy/sell order tools.
- Broker credential storage.
- Real stock/ETF quote provider.
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
PRICE_PROVIDER=mock
COINGECKO_API_KEY=
STOCK_API_KEY=
STOCK_API_PROVIDER=
HTTP_HOST=127.0.0.1
HTTP_PORT=3000
CONNECTOR_API_KEY=
```

`CONNECTOR_API_KEY` applies only to the HTTP entrypoint. If it is set, every `/mcp` request must include:

```text
Authorization: Bearer <CONNECTOR_API_KEY>
```

If `CONNECTOR_API_KEY` is empty, HTTP is allowed for local development and the server prints a warning at startup. Do not expose an unauthenticated HTTP server beyond a trusted local environment.

No API keys or secrets are hardcoded.

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

Configure with `HTTP_HOST` and `HTTP_PORT`.

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
- `show_buy_zone`
- `show_leaps_candidates`
- `export_watchlist_markdown`
- `export_watchlist_csv`

The tool descriptions are written so ChatGPT can map phrases like:

- `/watchlist`
- `/watchlist review`
- `/watchlist leaps`
- `/watchlist buy zone`
- `add MSFT to LEAPS candidates`
- `update BTC thesis`
- `refresh prices`

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

This is enough for ChatGPT to present tables now and for a future Apps SDK component to consume later. There is no full React UI yet.

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

`PRICE_PROVIDER=mock` uses deterministic fake prices for every asset type. This is the MVP default.

`PRICE_PROVIDER=coingecko` uses `CoinGeckoProvider` for mapped crypto assets such as BTC. Non-crypto assets return a clear per-ticker failure during refresh.

`PRICE_PROVIDER=hybrid` routes crypto to CoinGecko and stocks, ETFs, options, CFDs, and note-only assets to mock prices.

`COINGECKO_API_KEY` is optional and used only when present. Prices may be delayed, estimated, missing, or mock-only depending on provider mode.

`StockProvider` remains a documented TODO for Alpha Vantage, Finnhub, or another provider using `STOCK_API_PROVIDER` and `STOCK_API_KEY`. Real stock/ETF quotes are not implemented yet.

`refresh_prices` keeps partial-failure behavior. If one ticker fails, the tool reports it in `failed` and continues refreshing the rest.

## Verify

Core verification:

```bash
npm run verify
```

It validates database initialization, MCP tool registration, seed-like asset creation, add/update/delete, notes, review auto-date behavior, mock provider mode, hybrid provider routing, Markdown/CSV export, new fields, and rejection of unknown update fields.

HTTP smoke verification:

```bash
npm run verify:http
```

It builds the project, starts the compiled HTTP server against a temporary database with `CONNECTOR_API_KEY`, verifies unauthorized requests return `401`, and verifies an authorized MCP initialize request succeeds.

## Private ChatGPT Connector Path

For private hosted connector testing:

1. Run `npm install`.
2. Run `npm run build`.
3. Set production env vars, especially `DATABASE_PATH`, `PRICE_PROVIDER`, `HTTP_HOST`, `HTTP_PORT`, and `CONNECTOR_API_KEY`.
4. Run `npm run start:http`.
5. Put the app behind HTTPS. Private ChatGPT connector flows generally require HTTPS, not a plain local HTTP URL.
6. Point the private connector configuration at `https://your-host.example/mcp`.
7. Keep bearer auth for private testing, then replace or layer it with the auth required by your connector deployment model.
8. Add an Apps SDK UI component later if you want a custom table/detail experience.

## Future TODO

- HTTPS hosting configuration.
- Production-grade auth/OAuth for the private connector flow.
- Apps SDK UI resource for compact table and detail views.
- Real stock/ETF quote provider behind `STOCK_API_PROVIDER` and `STOCK_API_KEY`.
- Optional LEAPS/options-specific fields and calculations.

## Safety Boundaries

- No broker credentials.
- No broker connections.
- No order placement.
- No buy/sell trade execution tools.
- No hardcoded secrets.
- No claim that prices are real-time.
- No claim that this is financial advice.
- Watchlist and analysis workflow only.
