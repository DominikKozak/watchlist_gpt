import { createDb } from "./db/client.js";
import { initializeDatabase } from "./db/schema.js";
import { MockPriceProvider } from "./prices/mockPriceProvider.js";
import { WatchlistTools } from "./tools/watchlistTools.js";

const db = createDb();
await initializeDatabase(db);
const tools = new WatchlistTools(db, new MockPriceProvider(), "mock");

const seedAssets = [
  {
    ticker: "MSFT",
    name: "Microsoft",
    category: "LEAPS candidates" as const,
    broker: "XTB",
    assetType: "stock" as const,
    conviction: "B+",
    targetBuyPrice: 380,
    reviewFrequencyDays: 30,
    thesisScore: 8,
    riskScore: 4,
    lastDecision: "watch",
    thesis: "High-quality software and cloud compounder to watch for long-dated options analysis.",
  },
  {
    ticker: "META",
    name: "Meta Platforms",
    category: "LEAPS candidates" as const,
    broker: "XTB",
    assetType: "stock" as const,
    conviction: "A-",
    targetBuyPrice: 440,
    reviewFrequencyDays: 30,
    thesisScore: 8,
    riskScore: 5,
    lastDecision: "watch",
    thesis: "Advertising cash flow plus AI optionality; review valuation and regulatory risk.",
  },
  {
    ticker: "BTC",
    name: "Bitcoin",
    category: "BTC / Crypto" as const,
    assetType: "crypto" as const,
    conviction: "A",
    reviewFrequencyDays: 14,
    thesisScore: 9,
    riskScore: 7,
    lastDecision: "hold thesis",
    thesis: "Long-term crypto watch item; monitor cycle risk, custody assumptions, and macro liquidity.",
  },
  {
    ticker: "SPCE",
    name: "Virgin Galactic",
    category: "Speculative / WSB" as const,
    assetType: "stock" as const,
    conviction: "C",
    reviewFrequencyDays: 14,
    thesisScore: 3,
    riskScore: 10,
    lastDecision: "avoid",
    decisionReason: "Speculative watch item only.",
    mainRisk: "high dilution / hype risk",
    thesis: "Speculative sentiment watch only; no execution functionality in this app.",
  },
];

for (const asset of seedAssets) {
  const existing = await db.get("SELECT id FROM assets WHERE ticker = ? COLLATE NOCASE", [asset.ticker]);
  if (existing) {
    await tools.updateAsset({ ticker: asset.ticker, fields: asset });
  } else {
    await tools.addAsset(asset);
  }
}

await tools.refreshPrices();
await db.close();
console.log(`Seeded ${seedAssets.length} assets.`);
