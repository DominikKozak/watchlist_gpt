import { z } from "zod";
import { allowedAssetTypes, allowedCategories, allowedStatuses, type Asset, type Note, type PriceHistory } from "../types.js";

export const BACKUP_VERSION = 1;

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const backupAssetSchema = z.object({
  id: z.number().int().positive(),
  ticker: z.string().min(1),
  name: nullableString,
  assetType: z.enum(allowedAssetTypes),
  category: z.enum(allowedCategories),
  broker: nullableString,
  status: z.enum(allowedStatuses),
  conviction: nullableString,
  thesis: nullableString,
  mainRisk: nullableString,
  buyZone: nullableString,
  currentPrice: nullableNumber,
  currency: nullableString,
  priceChange1d: nullableNumber,
  priceChange7d: nullableNumber,
  priceChange30d: nullableNumber,
  lastPriceUpdate: nullableString,
  lastReviewDate: nullableString,
  nextReviewDate: nullableString,
  targetBuyPrice: nullableNumber,
  targetSellPrice: nullableNumber,
  reviewFrequencyDays: nullableNumber,
  thesisScore: nullableNumber,
  riskScore: nullableNumber,
  lastDecision: nullableString,
  decisionReason: nullableString,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const backupNoteSchema = z.object({
  id: z.number().int().positive(),
  assetId: z.number().int().positive(),
  note: z.string(),
  createdAt: z.string(),
});

export const backupPriceHistorySchema = z.object({
  id: z.number().int().positive(),
  assetId: z.number().int().positive(),
  price: z.number(),
  currency: z.string(),
  source: z.string(),
  timestamp: z.string(),
});

export const backupSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  assets: z.array(backupAssetSchema),
  notes: z.array(backupNoteSchema),
  priceHistory: z.array(backupPriceHistorySchema),
});

export type WatchlistBackup = {
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  assets: Asset[];
  notes: Note[];
  priceHistory: PriceHistory[];
};

export type RestoreMode = "upsert" | "skip_existing" | "replace_all";

export function validateBackup(input: unknown): WatchlistBackup {
  return backupSchema.parse(input) as WatchlistBackup;
}

export function validateRestoreMode(input = "upsert"): RestoreMode {
  if (input === "upsert" || input === "skip_existing" || input === "replace_all") {
    return input;
  }

  throw new Error(`Unsupported RESTORE_MODE="${input}". Use "upsert", "skip_existing", or "replace_all".`);
}
