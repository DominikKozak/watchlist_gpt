# Invest Watchlist

Invest Watchlist is a private local MCP connector for personal investing analysis in ChatGPT. It manages a SQLite watchlist with assets, notes, review dates, mock prices, and export tools.

Repository: `watchlist_gpt`.

It is intentionally **not** a trading system. It never places trades, never connects to brokers, never stores broker login credentials, and never exposes buy/sell order tools. Outputs are for watchlist organization and research workflow only, not financial advice.

## Features

- Local SQLite watchlist database.
- MCP tools for listing, adding, updating, deleting, reviewing, and exporting assets.
- Runtime price provider selection with `PRICE_PROVIDER=mock`, `coingecko`, or `hybrid`.
- Provider abstraction prepared for CoinGecko and Alpha Vantage/Finnhub-style stock APIs.
- Seed data for MSFT, META, BTC, and SPCE.
- Verification script covering the basic end-to-end flow.

## Tool Shortcuts

The MCP tool descriptions are written so ChatGPT can map common phrases to tools:

- `/watchlist` -> `list_watchlist`
- `/watchlist review` -> `list_review_due`
- `/watchlist leaps` -> `show_leaps_candidates`
- `/watchlist buy zone` -> `show_buy_zone`
- `add MSFT to LEAPS candidates` -> `add_asset`
- `update BTC thesis` -> `update_asset`
- `add note to META` -> `add_note`

## Install

```bash
npm install
```

Copy the environment template if you want to customize paths or future API keys:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## Initialize Database

```bash
npm run db:init
```

By default, the database is created at `./data/watchlist.sqlite`. Override it with:

```env
DATABASE_PATH=./data/watchlist.sqlite
```

## Seed Data

```bash
npm run seed
```

Seeded assets:

- MSFT, LEAPS candidates, XTB, stock, conviction B+
- META, LEAPS candidates, XTB, stock, conviction A-
- BTC, BTC / Crypto, crypto, conviction A
- SPCE, Speculative / WSB, stock, conviction C, main risk: high dilution / hype risk

## Run Local MCP Server

### Local stdio

Use stdio for local, process-spawned MCP clients:

```bash
npm run dev:stdio
```

For compiled JavaScript:

```bash
npm run build
npm run start:stdio
```

`npm run dev` and `npm start` are kept as stdio aliases for convenience.

### Streamable HTTP

This project also includes a stateless Streamable HTTP MCP entrypoint using the current MCP SDK's `StreamableHTTPServerTransport`.

For development:

```bash
npm run dev:http
```

For compiled JavaScript:

```bash
npm run build
npm run start:http
```

By default it listens on:

```text
http://127.0.0.1:3000/mcp
```

Configure the HTTP bind with:

```env
HTTP_HOST=127.0.0.1
HTTP_PORT=3000
```

Both transports register the same MCP tools:

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

## Verify

Run:

```bash
npm run verify
```

The verification script creates a temporary SQLite database, seeds assets, lists the watchlist, adds and updates a test asset, adds a note, refreshes mock prices, exports Markdown and CSV, deletes the test asset, checks LEAPS/review queries, and verifies `mock` plus `hybrid` provider routing for BTC.

Both stdio and HTTP entrypoints use the same shared MCP server registration in `src/mcp/createServer.ts`, so all tools stay consistent across transports.

## Environment

```env
DATABASE_PATH=./data/watchlist.sqlite
PRICE_PROVIDER=mock
COINGECKO_API_KEY=
STOCK_API_KEY=
HTTP_HOST=127.0.0.1
HTTP_PORT=3000
```

`PRICE_PROVIDER=mock` is the MVP default. No API keys are hardcoded. Prices may be delayed, estimated, or mock-only depending on the configured provider.

Supported `PRICE_PROVIDER` values:

- `mock`: use `MockPriceProvider` for every asset type.
- `coingecko`: use `CoinGeckoProvider` for crypto only. Refreshing stocks, ETFs, options, CFDs, or note-only assets returns a clear per-ticker failure while the rest of the refresh continues.
- `hybrid`: use `CoinGeckoProvider` for crypto and `MockPriceProvider` for stock, ETF, option, CFD, and note-only assets until a real stock provider is implemented.

`refresh_prices` keeps partial-failure behavior in every mode. If one ticker fails, the tool reports it in `failed` and continues refreshing the remaining assets.

## Price Providers

`MockPriceProvider` returns deterministic fake prices for seed assets plus reasonable test values for other tickers.

`CoinGeckoProvider` includes a simple crypto fetch path for mapped symbols such as BTC, using `COINGECKO_API_KEY` when present.

`StockProvider` is a clean placeholder for an Alpha Vantage or Finnhub-style implementation using `STOCK_API_KEY`. Real stock and ETF prices are still not implemented; use `mock` or `hybrid` if you want stocks and ETFs to refresh in the local MVP.

## Connect To ChatGPT Later

For a private ChatGPT connector, the core requirement is an MCP server with clearly described tools over a transport supported by the connector environment. This project now provides:

- Local stdio MCP entrypoint: `src/server.ts`
- Hosted/stateless Streamable HTTP MCP entrypoint: `src/httpServer.ts`
- Shared tool registration: `src/mcp/createServer.ts`

Next connection steps depend on the current ChatGPT Apps SDK/private connector deployment flow:

1. Build the project with `npm run build`.
2. Run locally with `npm run start:http` and confirm the endpoint is available at `/mcp`.
3. Deploy the app to a private HTTPS host. ChatGPT connector flows generally require HTTPS, not a plain local HTTP URL.
4. Set production env vars: `DATABASE_PATH`, `PRICE_PROVIDER`, optional API keys, `HTTP_HOST`, and `HTTP_PORT`.
5. Point the private connector configuration at the hosted `/mcp` endpoint.
6. Add auth before exposing beyond a private trusted environment. The current HTTP MVP is transport-ready but does not implement OAuth or user auth.
7. Add an Apps SDK UI resource for a compact watchlist table and detail view.

The current MVP intentionally returns structured tool data cleanly enough for ChatGPT to render a table without a custom UI component.

Implemented for hosted connector prep:

- Stateless Streamable HTTP MCP transport at `POST /mcp`.
- Shared tool registration for stdio and HTTP.
- Environment-based price provider selection.

TODO before broader deployment:

- HTTPS hosting.
- Authentication suitable for your private connector setup.
- Optional Apps SDK UI component.
- Real stock/ETF price provider.

## UI TODO

A future Apps SDK UI component should display:

- Compact watchlist table.
- Filters by category, status, and broker.
- Asset detail panel with thesis, risks, buy zone, notes, and price history.

This is not required for the local MCP MVP because all table-ready data is already returned as structured tool output.

## Next Milestones

1. Real CoinGecko BTC and crypto prices.
2. Real stock/ETF prices through Alpha Vantage, Finnhub, or another provider.
3. ChatGPT Apps SDK UI component.
4. Hosted HTTPS deployment for private connector access.
5. Optional LEAPS/options fields and calculator.

## Safety Boundaries

- No broker credentials.
- No broker connections.
- No order placement.
- No buy/sell trade execution tools.
- No claim that this is financial advice.
- Watchlist and analysis workflow only.
