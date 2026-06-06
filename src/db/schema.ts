import { pathToFileURL } from "node:url";
import { createDb, type AppDb } from "./client.js";

const assetMigrations = [
  { name: "targetBuyPrice", definition: "REAL" },
  { name: "targetSellPrice", definition: "REAL" },
  { name: "reviewFrequencyDays", definition: "INTEGER" },
  { name: "thesisScore", definition: "INTEGER" },
  { name: "riskScore", definition: "INTEGER" },
  { name: "lastDecision", definition: "TEXT" },
  { name: "decisionReason", definition: "TEXT" },
] as const;

async function ensureColumn(db: AppDb, tableName: string, columnName: string, definition: string): Promise<void> {
  const columns = await db.all<{ name: string }>(`PRAGMA table_info(${tableName})`);
  if (!columns.some((column) => column.name === columnName)) {
    await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export async function initializeDatabase(db: AppDb): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT,
      assetType TEXT NOT NULL,
      category TEXT NOT NULL,
      broker TEXT,
      status TEXT NOT NULL DEFAULT 'watching',
      conviction TEXT,
      thesis TEXT,
      mainRisk TEXT,
      buyZone TEXT,
      currentPrice REAL,
      currency TEXT,
      priceChange1d REAL,
      priceChange7d REAL,
      priceChange30d REAL,
      lastPriceUpdate TEXT,
      lastReviewDate TEXT,
      nextReviewDate TEXT,
      targetBuyPrice REAL,
      targetSellPrice REAL,
      reviewFrequencyDays INTEGER,
      thesisScore INTEGER,
      riskScore INTEGER,
      lastDecision TEXT,
      decisionReason TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assetId INTEGER NOT NULL,
      note TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (assetId) REFERENCES assets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assetId INTEGER NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (assetId) REFERENCES assets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
    CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
    CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(assetType);
    CREATE INDEX IF NOT EXISTS idx_notes_asset ON notes(assetId);
    CREATE INDEX IF NOT EXISTS idx_price_history_asset_timestamp ON price_history(assetId, timestamp DESC);
  `);

  for (const migration of assetMigrations) {
    await ensureColumn(db, "assets", migration.name, migration.definition);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = createDb();
  await initializeDatabase(db);
  await db.close();
  console.log("Database initialized.");
}
