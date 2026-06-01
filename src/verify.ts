import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDb } from "./db/client.js";
import { initializeDatabase } from "./db/schema.js";
import { MockPriceProvider } from "./prices/mockPriceProvider.js";
import { WatchlistTools } from "./tools/watchlistTools.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "invest-watchlist-"));
const dbPath = path.join(tempDir, "verify.sqlite");
const db = createDb(dbPath);
initializeDatabase(db);
const tools = new WatchlistTools(db, new MockPriceProvider());

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
assert(tools.exportWatchlistMarkdown().markdown.includes("| TEST |"), "Markdown export should include TEST.");
assert(tools.exportWatchlistCsv().csv.includes('"TEST"'), "CSV export should include TEST.");
const deleted = tools.deleteAsset({ ticker: "TEST" });
assert(deleted.deleted, "Expected delete confirmation.");
assert(tools.showLeapsCandidates().assets.length === 2, "Expected two LEAPS candidates.");
assert(tools.listReviewDue({ beforeDate: "2026-06-01" }).assets.length >= 4, "Expected review due result.");

db.close();
console.log("Verification passed.");
