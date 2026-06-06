import { BACKUP_VERSION, type WatchlistBackup } from "./backupFormat.js";
import type { AppDb } from "../db/client.js";
import type { Asset, Note, PriceHistory } from "../types.js";

export async function exportWatchlistBackup(db: AppDb): Promise<WatchlistBackup> {
  const assets = await db.all<Asset>("SELECT * FROM assets ORDER BY ticker COLLATE NOCASE");
  const notes = await db.all<Note>("SELECT * FROM notes ORDER BY id");
  const priceHistory = await db.all<PriceHistory>("SELECT * FROM price_history ORDER BY id");

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    assets,
    notes,
    priceHistory,
  };
}
