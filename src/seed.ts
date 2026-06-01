import { createDb } from "./db/client.js";
import { initializeDatabase } from "./db/schema.js";
import { MockPriceProvider } from "./prices/mockPriceProvider.js";
import { WatchlistTools } from "./tools/watchlistTools.js";

const db = createDb();
initializeDatabase(db);
const tools = new WatchlistTools(db, new MockPriceProvider());

const seedAssets = [
  {
    ticker: "MSFT",
    name: "Microsoft",
    category: "LEAPS candidates" as const,
    broker: "XTB",
    assetType: "stock" as const,
    conviction: "B+",
    thesis: "High-quality software and cloud compounder to watch for long-dated options analysis.",
  },
  {
    ticker: "META",
    name: "Meta Platforms",
    category: "LEAPS candidates" as const,
    broker: "XTB",
    assetType: "stock" as const,
    conviction: "A-",
    thesis: "Advertising cash flow plus AI optionality; review valuation and regulatory risk.",
  },
  {
    ticker: "BTC",
    name: "Bitcoin",
    category: "BTC / Crypto" as const,
    assetType: "crypto" as const,
    conviction: "A",
    thesis: "Long-term crypto watch item; monitor cycle risk, custody assumptions, and macro liquidity.",
  },
  {
    ticker: "SPCE",
    name: "Virgin Galactic",
    category: "Speculative / WSB" as const,
    assetType: "stock" as const,
    conviction: "C",
    mainRisk: "high dilution / hype risk",
    thesis: "Speculative sentiment watch only; no execution functionality in this app.",
  },
];

for (const asset of seedAssets) {
  const existing = db.prepare("SELECT id FROM assets WHERE ticker = ? COLLATE NOCASE").get(asset.ticker);
  if (existing) {
    tools.updateAsset({ ticker: asset.ticker, fields: asset });
  } else {
    tools.addAsset(asset);
  }
}

await tools.refreshPrices();
db.close();
console.log(`Seeded ${seedAssets.length} assets.`);
