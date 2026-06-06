import { validateBackup, validateRestoreMode, type RestoreMode, type WatchlistBackup } from "./backupFormat.js";
import type { AppDb } from "../db/client.js";
import type { Asset, Note, PriceHistory } from "../types.js";

export interface ImportBackupOptions {
  dryRun?: boolean;
  mode?: RestoreMode;
}

export interface ImportBackupSummary {
  mode: RestoreMode;
  dryRun: boolean;
  assetsCreated: number;
  assetsUpdated: number;
  assetsSkipped: number;
  notesImported: number;
  priceHistoryImported: number;
  replacedAll: boolean;
}

async function existingAssetByTicker(db: AppDb, ticker: string): Promise<Asset | undefined> {
  return db.get<Asset>("SELECT * FROM assets WHERE ticker = ? COLLATE NOCASE", [ticker]);
}

async function insertAsset(db: AppDb, asset: Asset): Promise<number> {
  const result = await db.run(
    `INSERT INTO assets (
        ticker, name, assetType, category, broker, status, conviction, thesis, mainRisk, buyZone,
        currentPrice, currency, priceChange1d, priceChange7d, priceChange30d, lastPriceUpdate,
        lastReviewDate, nextReviewDate, targetBuyPrice, targetSellPrice, reviewFrequencyDays,
        thesisScore, riskScore, lastDecision, decisionReason, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      asset.ticker.toUpperCase(),
      asset.name,
      asset.assetType,
      asset.category,
      asset.broker,
      asset.status,
      asset.conviction,
      asset.thesis,
      asset.mainRisk,
      asset.buyZone,
      asset.currentPrice,
      asset.currency,
      asset.priceChange1d,
      asset.priceChange7d,
      asset.priceChange30d,
      asset.lastPriceUpdate,
      asset.lastReviewDate,
      asset.nextReviewDate,
      asset.targetBuyPrice,
      asset.targetSellPrice,
      asset.reviewFrequencyDays,
      asset.thesisScore,
      asset.riskScore,
      asset.lastDecision,
      asset.decisionReason,
      asset.createdAt,
      asset.updatedAt,
    ],
  );
  return Number(result.lastInsertRowid);
}

async function updateAsset(db: AppDb, asset: Asset, id: number): Promise<void> {
  await db.run(
    `UPDATE assets SET
      ticker = ?, name = ?, assetType = ?, category = ?, broker = ?, status = ?, conviction = ?,
      thesis = ?, mainRisk = ?, buyZone = ?, currentPrice = ?, currency = ?, priceChange1d = ?,
      priceChange7d = ?, priceChange30d = ?, lastPriceUpdate = ?, lastReviewDate = ?,
      nextReviewDate = ?, targetBuyPrice = ?, targetSellPrice = ?, reviewFrequencyDays = ?,
      thesisScore = ?, riskScore = ?, lastDecision = ?, decisionReason = ?, updatedAt = ?
     WHERE id = ?`,
    [
    asset.ticker.toUpperCase(),
    asset.name,
    asset.assetType,
    asset.category,
    asset.broker,
    asset.status,
    asset.conviction,
    asset.thesis,
    asset.mainRisk,
    asset.buyZone,
    asset.currentPrice,
    asset.currency,
    asset.priceChange1d,
    asset.priceChange7d,
    asset.priceChange30d,
    asset.lastPriceUpdate,
    asset.lastReviewDate,
    asset.nextReviewDate,
    asset.targetBuyPrice,
    asset.targetSellPrice,
    asset.reviewFrequencyDays,
    asset.thesisScore,
    asset.riskScore,
    asset.lastDecision,
    asset.decisionReason,
    asset.updatedAt,
    id,
    ],
  );
}

async function insertNote(db: AppDb, note: Note, assetId: number): Promise<void> {
  await db.run("INSERT INTO notes (assetId, note, createdAt) VALUES (?, ?, ?)", [assetId, note.note, note.createdAt]);
}

async function insertPriceHistory(db: AppDb, price: PriceHistory, assetId: number): Promise<void> {
  await db.run("INSERT INTO price_history (assetId, price, currency, source, timestamp) VALUES (?, ?, ?, ?, ?)", [
    assetId,
    price.price,
    price.currency,
    price.source,
    price.timestamp,
  ]);
}

async function buildDryRunSummary(db: AppDb, backup: WatchlistBackup, mode: RestoreMode): Promise<ImportBackupSummary> {
  let assetsCreated = 0;
  let assetsUpdated = 0;
  let assetsSkipped = 0;

  for (const asset of backup.assets) {
    const existing = await existingAssetByTicker(db, asset.ticker);
    if (mode === "skip_existing" && existing) {
      assetsSkipped += 1;
    } else if (existing && mode !== "replace_all") {
      assetsUpdated += 1;
    } else {
      assetsCreated += 1;
    }
  }

  return {
    mode,
    dryRun: true,
    assetsCreated,
    assetsUpdated,
    assetsSkipped,
    notesImported: mode === "skip_existing" ? 0 : backup.notes.length,
    priceHistoryImported: mode === "skip_existing" ? 0 : backup.priceHistory.length,
    replacedAll: mode === "replace_all",
  };
}

export function importWatchlistBackup(
  db: AppDb,
  input: unknown,
  options: ImportBackupOptions = {},
): Promise<ImportBackupSummary> {
  const backup = validateBackup(input);
  const mode = validateRestoreMode(options.mode);

  if (options.dryRun) {
    return buildDryRunSummary(db, backup, mode);
  }

  return (async () => {
    const summary: ImportBackupSummary = {
      mode,
      dryRun: false,
      assetsCreated: 0,
      assetsUpdated: 0,
      assetsSkipped: 0,
      notesImported: 0,
      priceHistoryImported: 0,
      replacedAll: mode === "replace_all",
    };
    const assetIdMap = new Map<number, number>();

    if (mode === "replace_all") {
      await db.run("DELETE FROM price_history");
      await db.run("DELETE FROM notes");
      await db.run("DELETE FROM assets");
    }

    for (const asset of backup.assets) {
      const existing = await existingAssetByTicker(db, asset.ticker);
      if (mode === "skip_existing" && existing) {
        summary.assetsSkipped += 1;
        continue;
      }

      if (existing && mode !== "replace_all") {
        await updateAsset(db, asset, existing.id);
        assetIdMap.set(asset.id, existing.id);
        summary.assetsUpdated += 1;
      } else {
        const newId = await insertAsset(db, asset);
        assetIdMap.set(asset.id, newId);
        summary.assetsCreated += 1;
      }
    }

    for (const note of backup.notes) {
      const assetId = assetIdMap.get(note.assetId);
      if (!assetId) continue;
      await insertNote(db, note, assetId);
      summary.notesImported += 1;
    }

    for (const price of backup.priceHistory) {
      const assetId = assetIdMap.get(price.assetId);
      if (!assetId) continue;
      await insertPriceHistory(db, price, assetId);
      summary.priceHistoryImported += 1;
    }

    return summary;
  })();
}
