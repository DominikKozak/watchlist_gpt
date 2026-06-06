import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportWatchlistBackup } from "./backup/exportBackup.js";
import { importWatchlistBackup } from "./backup/importBackup.js";
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

function todayPlusDays(days: number): string {
  const date = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
await initializeDatabase(db);
const columns = await db.all<{ name: string }>("PRAGMA table_info(assets)");
for (const column of [
  "targetBuyPrice",
  "targetSellPrice",
  "reviewFrequencyDays",
  "thesisScore",
  "riskScore",
  "lastDecision",
  "decisionReason",
]) {
  assert(columns.some((entry) => entry.name === column), `Expected assets.${column} column to exist.`);
}
process.env.PRICE_PROVIDER = "mock";
const tools = new WatchlistTools(db, createPriceProvider(), "mock");
const server = createInvestWatchlistMcpServer({ tools, priceProviderMode: "mock" });
const registeredTools = server as unknown as { _registeredTools?: Map<string, unknown> | Record<string, unknown> };
const toolRegistry = registeredTools._registeredTools;
const registeredToolNames =
  toolRegistry instanceof Map ? [...toolRegistry.keys()].sort() : Object.keys(toolRegistry ?? {}).sort();
assert(
  JSON.stringify(registeredToolNames) === JSON.stringify([...expectedToolNames].sort()),
  `Expected registered MCP tools to match: ${expectedToolNames.join(", ")}`,
);

await tools.addAsset({
  ticker: "MSFT",
  name: "Microsoft",
  assetType: "stock",
  category: "LEAPS candidates",
  broker: "XTB",
  conviction: "B+",
  targetBuyPrice: 380,
  reviewFrequencyDays: 30,
  thesisScore: 8,
  riskScore: 4,
});
await tools.addAsset({
  ticker: "META",
  name: "Meta Platforms",
  assetType: "stock",
  category: "LEAPS candidates",
  broker: "XTB",
  conviction: "A-",
});
await tools.addAsset({
  ticker: "BTC",
  name: "Bitcoin",
  assetType: "crypto",
  category: "BTC / Crypto",
  conviction: "A",
  reviewFrequencyDays: 14,
  thesisScore: 9,
  riskScore: 7,
});
await tools.addAsset({
  ticker: "SPCE",
  name: "Virgin Galactic",
  assetType: "stock",
  category: "Speculative / WSB",
  conviction: "C",
  mainRisk: "high dilution / hype risk",
});

const seededList = await tools.listWatchlist();
assert(seededList.assets.length === 4, "Expected four seeded assets.");
assert(seededList.columns.some((column) => column.key === "targetBuyPrice"), "Expected UI columns metadata.");
assert(seededList.summary.byCategory["LEAPS candidates"] === 2, "Expected category summary counts.");
assert(seededList.summary.byStatus.watching === 4, "Expected status summary counts.");
assert(seededList.priceProviderMode === "mock", "Expected list response to expose price provider mode.");
assert(seededList.generatedAt, "Expected list response to include generatedAt.");

await tools.addAsset({
  ticker: "TEST",
  name: 'Test "Asset"',
  assetType: "stock",
  category: "Needs review",
  status: "watching",
  currency: "USD",
  targetBuyPrice: 10,
  targetSellPrice: 20,
  reviewFrequencyDays: 21,
  thesisScore: 6,
  riskScore: 5,
  lastDecision: "watch",
  decisionReason: "Verification path.",
});
await tools.updateAsset({
  ticker: "TEST",
  fields: { status: "needs_review", thesis: "Verification asset with | pipe.", targetBuyPrice: 11, lastDecision: "reviewed" },
});
await tools.addNote({ ticker: "TEST", note: "Verification note." });
const reviewed = await tools.markReviewDone({ ticker: "TEST", reviewNote: "Looks fine." });
assert(reviewed.asset.nextReviewDate === todayPlusDays(21), "Expected automatic nextReviewDate from reviewFrequencyDays.");
assert(reviewed.note?.note === "Review: Looks fine.", "Expected review note to be added.");
const decision = await tools.setAssetDecision({
  ticker: "TEST",
  lastDecision: "keep watching",
  decisionReason: "Verification decision.",
  conviction: "B",
  status: "watching",
  reviewNote: "Decision helper note.",
});
assert(decision.asset.lastDecision === "keep watching", "Expected set_asset_decision to update lastDecision.");
assert(decision.asset.decisionReason === "Verification decision.", "Expected set_asset_decision to update decisionReason.");
assert(decision.note?.note === "Decision: Decision helper note.", "Expected set_asset_decision to add optional note.");
const detail = await tools.getAsset({ ticker: "TEST" });
assert(detail.displaySections.some((section) => section.key === "analysis"), "Expected detail display section metadata.");
assert(detail.asset.targetBuyPrice === 11, "Expected updated targetBuyPrice.");
assert(detail.asset.lastDecision === "keep watching", "Expected updated lastDecision.");
let rejectedUnknownField = false;
try {
  await tools.updateAsset({ ticker: "TEST", fields: { unknownField: "nope" } as never });
} catch {
  rejectedUnknownField = true;
}
assert(rejectedUnknownField, "Expected unknown update fields to be rejected.");
const refreshResult = await tools.refreshPrices({ ticker: "TEST" });
assert(refreshResult.updated.length === 1, "Expected TEST price refresh.");
assert(refreshResult.updated[0]?.source === "mock", "Expected mock provider for PRICE_PROVIDER=mock.");
const summary = await tools.portfolioSummary();
assert(summary.totalAssets === 5, "Expected portfolio summary to include five assets before delete.");
assert(summary.countsByAssetType.stock >= 4, "Expected portfolio summary counts by asset type.");
assert(summary.assetsWithMockPrices.some((asset) => asset.ticker === "TEST"), "Expected portfolio summary mock price assets.");
const searchResult = await tools.searchAssets({ query: "Verification" });
assert(searchResult.matchingAssets.some((asset) => asset.ticker === "TEST"), "Expected search_assets to find TEST asset.");
assert(searchResult.matchingNotes.some((note) => note.note.includes("Verification")), "Expected search_assets to find matching notes.");
const markdown = (await tools.exportWatchlistMarkdown()).markdown;
assert(markdown.includes("| TEST |"), "Markdown export should include TEST.");
assert(markdown.includes("Verification asset with \\| pipe."), "Markdown export should escape pipe characters.");
const csv = (await tools.exportWatchlistCsv()).csv;
assert(csv.includes('"TEST"'), "CSV export should include TEST.");
assert(csv.includes('"Test ""Asset"""'), "CSV export should escape quotes.");
const exportedBackup = (await tools.exportWatchlistJson()).backup;
assert(exportedBackup.version === 1, "Expected export_watchlist_json backup version.");
assert(exportedBackup.assets.some((asset) => asset.ticker === "TEST"), "Expected exported backup to include TEST.");
const dryRunImport = await tools.importWatchlistJson({ backup: exportedBackup, dryRun: true, mode: "upsert" });
assert(dryRunImport.summary.dryRun, "Expected import_watchlist_json dryRun summary.");
const helperBackup = await exportWatchlistBackup(db);
assert(helperBackup.assets.length >= 5, "Expected helper backup to export assets.");

const restoreDbPath = path.join(tempDir, "restore.sqlite");
const restoreDb = createDb(restoreDbPath);
await initializeDatabase(restoreDb);
const dryRunHelper = await importWatchlistBackup(restoreDb, helperBackup, { dryRun: true, mode: "upsert" });
assert(dryRunHelper.assetsCreated >= 5, "Expected helper dryRun to plan asset creation.");
const importedHelper = await importWatchlistBackup(restoreDb, helperBackup, { mode: "upsert" });
assert(importedHelper.assetsCreated >= 5, "Expected helper upsert to create assets.");
const restoredTools = new WatchlistTools(restoreDb, createPriceProvider({ mode: "mock" }), "mock");
assert((await restoredTools.getAsset({ ticker: "TEST" })).asset.ticker === "TEST", "Expected restored DB to contain TEST.");
const toolImport = await restoredTools.importWatchlistJson({ backup: exportedBackup, mode: "upsert" });
assert(toolImport.summary.assetsUpdated >= 5, "Expected import_watchlist_json upsert to update existing assets.");
await restoreDb.close();
const deleted = await tools.deleteAsset({ ticker: "TEST" });
assert(deleted.deleted, "Expected delete confirmation.");
assert((await tools.showLeapsCandidates()).assets.length === 2, "Expected two LEAPS candidates.");
assert((await tools.listReviewDue({ beforeDate: "2026-06-01" })).assets.length >= 4, "Expected review due result.");

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

await db.close();
console.log("Verification passed.");
