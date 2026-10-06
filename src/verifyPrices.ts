import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StockProvider } from "./prices/stockProvider.js";
import { createPriceProvider } from "./prices/providerFactory.js";
import { createDb } from "./db/client.js";
import { initializeDatabase } from "./db/schema.js";
import { WatchlistTools } from "./tools/watchlistTools.js";

process.env.STOCK_API_PROVIDER = "finnhub";
delete process.env.STOCK_API_KEY;
const epoch = (day: string) => Date.parse(`${day}T20:00:00Z`) / 1000;
const fixture = (symbol: string, currency: string) => ({ chart: { error: null, result: [{
  meta: { symbol, currency, exchangeTimezoneName: "America/New_York", regularMarketPrice: 120, regularMarketTime: epoch("2026-10-05") },
  timestamp: ["2026-09-04", "2026-09-28", "2026-10-02", "2026-10-05"].map(epoch),
  indicators: { quote: [{ close: [80, 100, 110, null] }] },
}] } });
let requestedSymbol = "";
const fakeFetch = (async (url: URL | RequestInfo) => {
  requestedSymbol = decodeURIComponent(new URL(String(url)).pathname.split("/").at(-1)!);
  return new Response(JSON.stringify(fixture(requestedSymbol, requestedSymbol === "RR.L" ? "GBp" : "EUR")));
}) as typeof fetch;
const provider = new StockProvider(fakeFetch);
const quote = await provider.getPrice("REN.AS", "stock");
assert.equal(quote.source, "yahoo-chart", "Existing Finnhub config without key must use the free real source");
assert.equal(quote.currency, "EUR");
assert.equal(quote.timestamp, "2026-10-05T20:00:00.000Z");
assert.equal(quote.priceChange1d, 9.0909, "Monday must compare Friday, ignoring null current candle");
assert.equal(quote.priceChange7d, 20);
assert.equal(quote.priceChange30d, 50, "Weekend target must use the prior available close");
await provider.getPrice("BRK.B", "stock");
assert.equal(requestedSymbol, "BRK-B");
assert.equal((await provider.getPrice("RR.L", "stock")).currency, "GBp", "Pence must not become pounds");
await assert.rejects(() => provider.getPrice("MSFT460C20270115", "option"));
const badProvider = new StockProvider((async () => new Response("{}", {status: 429})) as typeof fetch);
await assert.rejects(() => badProvider.getPrice("MSFT", "stock"), /HTTP 429/);
const hybrid = createPriceProvider({ mode: "hybrid", stockProvider: badProvider });
await assert.rejects(() => hybrid.getPrice("MSFT", "stock"), /HTTP 429/, "Do not substitute mock data on outage");
await assert.rejects(() => hybrid.getPrice("NOTE", "note_only"), /No free quote provider/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "watchlist-prices-"));
const db = createDb(path.join(dir, "test.sqlite"));
await initializeDatabase(db);
const mockTools = new WatchlistTools(db, createPriceProvider({mode: "mock"}), "mock");
await mockTools.addAsset({ticker:"TEST",assetType:"stock",category:"SaaS apocalypse"});
await mockTools.refreshPrices({ticker:"TEST"});
assert.equal((await mockTools.portfolioSummary()).assetsWithMockPrices.length, 1);
const failingTools = new WatchlistTools(db, hybrid, "hybrid");
await failingTools.refreshPrices({ticker:"TEST"});
assert.equal((await failingTools.getAsset({ticker:"TEST"})).asset.currentPrice, null, "Failed refresh must clear the old mock snapshot");
const liveTools = new WatchlistTools(db, provider, "hybrid");
await liveTools.refreshPrices({ticker:"TEST"});
assert.equal((await liveTools.portfolioSummary()).assetsWithMockPrices.length, 0, "Historical mock quotes must not taint the current real quote");
await failingTools.refreshPrices({ticker:"TEST"});
assert.equal((await failingTools.getAsset({ticker:"TEST"})).asset.currentPrice, 120, "Keep the last real quote and its old timestamp on failure");
assert.equal((await liveTools.listWatchlist({category:"SaaS apocalypse"})).assets[0].priceSource, "yahoo-chart");
await db.close();
fs.rmSync(dir,{recursive:true,force:true});
console.log("Price provider verification passed.");
