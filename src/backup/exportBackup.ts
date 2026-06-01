import type Database from "better-sqlite3";
import { BACKUP_VERSION, type WatchlistBackup } from "./backupFormat.js";
import type { Asset, Note, PriceHistory } from "../types.js";

export function exportWatchlistBackup(db: Database.Database): WatchlistBackup {
  const assets = db.prepare("SELECT * FROM assets ORDER BY ticker COLLATE NOCASE").all() as Asset[];
  const notes = db.prepare("SELECT * FROM notes ORDER BY id").all() as Note[];
  const priceHistory = db.prepare("SELECT * FROM price_history ORDER BY id").all() as PriceHistory[];

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    assets,
    notes,
    priceHistory,
  };
}
