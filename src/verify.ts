import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDb } from "./db/client.js";
import { initializeDatabase } from "./db/schema.js";
import { createInvestWatchlistMcpServer, expectedToolNames } from "./mcp/createServer.js";
import { MockPriceProvider } from "./prices/mockPriceProvider.js";
import { createPriceProvider } from "./prices/providerFactory.js";
import type { PriceProvider } from "./prices/priceProvider.js";
import { WatchlistTools } from "./tools/watchlistTools.js";
import type { AssetType, PriceResult } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class StubCoinGeckoProvider implements PriceProvider {
  async getPrice(ticker: string, assetType: AssetType): Promise<PriceResult> {
    if (assetType !== "crypto") {
      throw new Error("StubCoinGeckoProvider only supports crypto assets.");
    }

    return {
      ticker: ticker.toUpperCase(),
      price: 123456,
      currency: "USD",
      source: "stub-coingecko",
      priceChange1d: 1.23,
      timestamp: new Date().toISOString(),
    };
  }
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "invest-watchlist-"));
const dbPath = path.join(tempDir, "verify.sqlite");
const db = createDb(dbPath);
initializeDatabase(db);
process.env.PRICE_PROVIDER = "mock";
const tools = new WatchlistTools(db, createPriceProvider());
const server = createInvestWatchlistMcpServer({ tools, priceProviderMode: "mock" });
const registeredTools = server as unknown as { _registeredTools?: Map<string, unknown> | Record<string, unknown> };
const toolRegistry = registeredTools._registeredTools;
const registeredToolNames =
  toolRegistry instanceof Map ? [...toolRegistry.keys()].sort() : Object.keys(toolRegistry ?? {}).sort();
assert(
  JSON.stringify(registeredToolNames) === JSON.stringify([...expectedToolNames].sort()),
  `Expected registered MCP tools to match: ${expectedToolNames.join(", ")}`,
);

tools.addAsset({
  ticker: "MSFT",
  name: "Microsoft",
  assetType: "stock",
  category: "LEAPS candidates",
  broker: "XTB",
  conviction: "B+",
});
tools.addAsset({
  ticker: "META",
  name: "Meta Platforms",
  assetType: "stock",
  category: "LEAPS candidates",
  broker: "XTB",
  conviction: "A-",
});
tools.addAsset({
  ticker: "BTC",
  name: "Bitcoin",
  assetType: "crypto",
  category: "BTC / Crypto",
  conviction: "A",
});
tools.addAsset({
  ticker: "SPCE",
  name: "Virgin Galactic",
  assetType: "stock",
  category: "Speculative / WSB",
  conviction: "C",
  mainRisk: "high dilution / hype risk",
});

assert(tools.listWatchlist().assets.length === 4, "Expected four seeded assets.");

tools.addAsset({
  ticker: "TEST",
  name: "Test Asset",
  assetType: "stock",
  category: "Needs review",
  status: "watching",
  currency: "USD",
});
tools.updateAsset({
  ticker: "TEST",
  fields: { status: "needs_review", thesis: "Verification asset.", nextReviewDate: "2026-06-01" },
});
tools.addNote({ ticker: "TEST", note: "Verification note." });
const refreshResult = await tools.refreshPrices({ ticker: "TEST" });
assert(refreshResult.updated.length === 1, "Expected TEST price refresh.");
assert(refreshResult.updated[0]?.source === "mock", "Expected mock provider for PRICE_PROVIDER=mock.");
assert(tools.exportWatchlistMarkdown().markdown.includes("| TEST |"), "Markdown export should include TEST.");
assert(tools.exportWatchlistCsv().csv.includes('"TEST"'), "CSV export should include TEST.");
const deleted = tools.deleteAsset({ ticker: "TEST" });
assert(deleted.deleted, "Expected delete confirmation.");
assert(tools.showLeapsCandidates().assets.length === 2, "Expected two LEAPS candidates.");
assert(tools.listReviewDue({ beforeDate: "2026-06-01" }).assets.length >= 4, "Expected review due result.");

const mockProvider = createPriceProvider({ mode: "mock" });
const mockBtc = await mockProvider.getPrice("BTC", "crypto");
assert(mockBtc.source === "mock", "Expected BTC to use mock provider in mock mode.");

const hybridProvider = createPriceProvider({
  mode: "hybrid",
  mockProvider: new MockPriceProvider(),
  coinGeckoProvider: new StubCoinGeckoProvider(),
});
const hybridBtc = await hybridProvider.getPrice("BTC", "crypto");
assert(hybridBtc.source === "stub-coingecko", "Expected BTC to use CoinGecko provider in hybrid mode.");
const hybridMsft = await hybridProvider.getPrice("MSFT", "stock");
assert(hybridMsft.source === "mock", "Expected stocks to use mock provider in hybrid mode.");

db.close();
console.log("Verification passed.");
