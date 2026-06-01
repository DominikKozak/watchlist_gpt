import type Database from "better-sqlite3";
import { z } from "zod";
import type { PriceProvider } from "../prices/priceProvider.js";
import {
  allowedAssetTypes,
  allowedCategories,
  allowedStatuses,
  type AddAssetInput,
  type Asset,
  type AssetIdentifier,
  type ListWatchlistInput,
  type Note,
  type PriceHistory,
  type UpdateAssetFields,
} from "../types.js";

const categorySchema = z.enum(allowedCategories);
const assetTypeSchema = z.enum(allowedAssetTypes);
const statusSchema = z.enum(allowedStatuses);

export const listWatchlistSchema = z.object({
  category: categorySchema.optional(),
  broker: z.string().min(1).optional(),
  status: statusSchema.optional(),
  assetType: assetTypeSchema.optional(),
  sortBy: z.enum(["ticker", "category", "status", "conviction", "nextReviewDate", "updatedAt"]).optional(),
});

const identifierBaseSchema = z.object({
  id: z.number().int().positive().optional(),
  ticker: z.string().min(1).optional(),
});

export const identifierSchema = identifierBaseSchema.refine(
  (value) => value.id !== undefined || value.ticker !== undefined,
  "Provide ticker or id.",
);

export const addAssetSchema = z.object({
  ticker: z.string().trim().min(1),
  name: z.string().optional(),
  assetType: assetTypeSchema,
  category: categorySchema,
  broker: z.string().optional(),
  status: statusSchema.optional(),
  conviction: z.string().optional(),
  thesis: z.string().optional(),
  mainRisk: z.string().optional(),
  buyZone: z.string().optional(),
  currency: z.string().optional(),
});

export const updateAssetSchema = identifierBaseSchema
  .extend({
  fields: z
    .object({
      ticker: z.string().trim().min(1).optional(),
      name: z.string().nullable().optional(),
      assetType: assetTypeSchema.optional(),
      category: categorySchema.optional(),
      broker: z.string().nullable().optional(),
      status: statusSchema.optional(),
      conviction: z.string().nullable().optional(),
      thesis: z.string().nullable().optional(),
      mainRisk: z.string().nullable().optional(),
      buyZone: z.string().nullable().optional(),
      currency: z.string().nullable().optional(),
      currentPrice: z.number().nullable().optional(),
      priceChange1d: z.number().nullable().optional(),
      priceChange7d: z.number().nullable().optional(),
      priceChange30d: z.number().nullable().optional(),
      lastPriceUpdate: z.string().nullable().optional(),
      lastReviewDate: z.string().nullable().optional(),
      nextReviewDate: z.string().nullable().optional(),
    })
    .strict(),
  })
  .refine((value) => value.id !== undefined || value.ticker !== undefined, "Provide ticker or id.");

export const addNoteSchema = identifierBaseSchema
  .extend({
    note: z.string().trim().min(1),
  })
  .refine((value) => value.id !== undefined || value.ticker !== undefined, "Provide ticker or id.");

export const refreshPricesSchema = z.object({
  ticker: z.string().trim().min(1).optional(),
  category: categorySchema.optional(),
});

export const listReviewDueSchema = z.object({
  beforeDate: z.string().optional(),
});

export const markReviewDoneSchema = identifierBaseSchema
  .extend({
    reviewNote: z.string().trim().min(1).optional(),
    nextReviewDate: z.string().optional(),
  })
  .refine((value) => value.id !== undefined || value.ticker !== undefined, "Provide ticker or id.");

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function summarize(value: string | null, maxLength = 120): string | null {
  if (!value) return null;
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function rowToAsset(row: unknown): Asset {
  return row as Asset;
}

function findAsset(db: Database.Database, identifier: AssetIdentifier): Asset {
  const row =
    identifier.id !== undefined
      ? db.prepare("SELECT * FROM assets WHERE id = ?").get(identifier.id)
      : db.prepare("SELECT * FROM assets WHERE ticker = ? COLLATE NOCASE").get(identifier.ticker);

  if (!row) {
    throw new Error("Asset not found.");
  }

  return rowToAsset(row);
}

export class WatchlistTools {
  constructor(
    private readonly db: Database.Database,
    private readonly priceProvider: PriceProvider,
  ) {}

  listWatchlist(input: ListWatchlistInput = {}) {
    const parsed = listWatchlistSchema.parse(input);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (parsed.category) {
      conditions.push("category = ?");
      params.push(parsed.category);
    }
    if (parsed.broker) {
      conditions.push("broker = ?");
      params.push(parsed.broker);
    }
    if (parsed.status) {
      conditions.push("status = ?");
      params.push(parsed.status);
    }
    if (parsed.assetType) {
      conditions.push("assetType = ?");
      params.push(parsed.assetType);
    }

    const sortBy = parsed.sortBy ?? "ticker";
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT * FROM assets ${where} ORDER BY ${sortBy} COLLATE NOCASE`).all(...params) as Asset[];

    return {
      assets: rows.map((asset) => ({
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        category: asset.category,
        broker: asset.broker,
        status: asset.status,
        conviction: asset.conviction,
        currentPrice: asset.currentPrice,
        currency: asset.currency,
        priceChange1d: asset.priceChange1d,
        priceChange7d: asset.priceChange7d,
        priceChange30d: asset.priceChange30d,
        nextReviewDate: asset.nextReviewDate,
        thesisSummary: summarize(asset.thesis),
      })),
    };
  }

  getAsset(input: AssetIdentifier) {
    const parsed = identifierSchema.parse(input);
    const asset = findAsset(this.db, parsed);
    const notes = this.db
      .prepare("SELECT * FROM notes WHERE assetId = ? ORDER BY createdAt DESC LIMIT 10")
      .all(asset.id) as Note[];
    const priceHistory = this.db
      .prepare("SELECT * FROM price_history WHERE assetId = ? ORDER BY timestamp DESC LIMIT 20")
      .all(asset.id) as PriceHistory[];

    return { asset, notes, priceHistory };
  }

  addAsset(input: AddAssetInput) {
    const parsed = addAssetSchema.parse(input);
    const timestamp = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO assets (
          ticker, name, assetType, category, broker, status, conviction, thesis, mainRisk, buyZone,
          currentPrice, currency, priceChange1d, priceChange7d, priceChange30d, lastPriceUpdate,
          lastReviewDate, nextReviewDate, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        normalizeTicker(parsed.ticker),
        parsed.name ?? null,
        parsed.assetType,
        parsed.category,
        parsed.broker ?? null,
        parsed.status ?? "watching",
        parsed.conviction ?? null,
        parsed.thesis ?? null,
        parsed.mainRisk ?? null,
        parsed.buyZone ?? null,
        parsed.currency ?? null,
        timestamp,
        timestamp,
      );

    return { asset: findAsset(this.db, { id: Number(result.lastInsertRowid) }) };
  }

  updateAsset(input: AssetIdentifier & { fields: UpdateAssetFields }) {
    const parsed = updateAssetSchema.parse(input);
    const asset = findAsset(this.db, parsed);
    const entries = Object.entries(parsed.fields).filter(([, value]) => value !== undefined);

    if (!entries.length) {
      return { asset };
    }

    const assignments = entries.map(([key]) => `${key} = ?`);
    const values = entries.map(([key, value]) => (key === "ticker" && typeof value === "string" ? normalizeTicker(value) : value));
    assignments.push("updatedAt = ?");
    values.push(nowIso(), asset.id);

    this.db.prepare(`UPDATE assets SET ${assignments.join(", ")} WHERE id = ?`).run(...values);
    return { asset: findAsset(this.db, { id: asset.id }) };
  }

  deleteAsset(input: AssetIdentifier) {
    const parsed = identifierSchema.parse(input);
    const asset = findAsset(this.db, parsed);
    this.db.prepare("DELETE FROM assets WHERE id = ?").run(asset.id);
    return {
      deleted: true,
      id: asset.id,
      ticker: asset.ticker,
      message: `Deleted ${asset.ticker} from the watchlist. No trades or broker actions were performed.`,
    };
  }

  addNote(input: AssetIdentifier & { note: string }) {
    const parsed = addNoteSchema.parse(input);
    const asset = findAsset(this.db, parsed);
    const createdAt = nowIso();
    const result = this.db
      .prepare("INSERT INTO notes (assetId, note, createdAt) VALUES (?, ?, ?)")
      .run(asset.id, parsed.note, createdAt);
    const note = this.db.prepare("SELECT * FROM notes WHERE id = ?").get(result.lastInsertRowid) as Note;
    return { note };
  }

  async refreshPrices(input: { ticker?: string; category?: string } = {}) {
    const parsed = refreshPricesSchema.parse(input);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (parsed.ticker) {
      conditions.push("ticker = ? COLLATE NOCASE");
      params.push(parsed.ticker);
    }
    if (parsed.category) {
      conditions.push("category = ?");
      params.push(parsed.category);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const assets = this.db.prepare(`SELECT * FROM assets ${where} ORDER BY ticker`).all(...params) as Asset[];
    const updated = [];
    const failed = [];

    for (const asset of assets) {
      try {
        const price = await this.priceProvider.getPrice(asset.ticker, asset.assetType);
        const timestamp = price.timestamp ?? nowIso();
        this.db
          .prepare(
            `UPDATE assets
             SET currentPrice = ?, currency = ?, priceChange1d = ?, priceChange7d = ?,
                 priceChange30d = ?, lastPriceUpdate = ?, updatedAt = ?
             WHERE id = ?`,
          )
          .run(
            price.price,
            price.currency,
            price.priceChange1d ?? null,
            price.priceChange7d ?? null,
            price.priceChange30d ?? null,
            timestamp,
            nowIso(),
            asset.id,
          );
        this.db
          .prepare("INSERT INTO price_history (assetId, price, currency, source, timestamp) VALUES (?, ?, ?, ?, ?)")
          .run(asset.id, price.price, price.currency, price.source, timestamp);
        updated.push({ ticker: asset.ticker, price: price.price, currency: price.currency, source: price.source });
      } catch (error) {
        failed.push({ ticker: asset.ticker, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { updated, failed };
  }

  listReviewDue(input: { beforeDate?: string } = {}) {
    const parsed = listReviewDueSchema.parse(input);
    const beforeDate = parsed.beforeDate ?? new Date().toISOString().slice(0, 10);
    const assets = this.db
      .prepare(
        `SELECT * FROM assets
         WHERE nextReviewDate IS NULL OR date(nextReviewDate) <= date(?)
         ORDER BY nextReviewDate IS NULL DESC, nextReviewDate ASC, ticker ASC`,
      )
      .all(beforeDate) as Asset[];
    return { beforeDate, assets };
  }

  markReviewDone(input: AssetIdentifier & { reviewNote?: string; nextReviewDate?: string }) {
    const parsed = markReviewDoneSchema.parse(input);
    const asset = findAsset(this.db, parsed);
    const reviewedAt = nowIso();
    const nextReviewDate = parsed.nextReviewDate ?? null;
    this.db
      .prepare("UPDATE assets SET lastReviewDate = ?, nextReviewDate = ?, updatedAt = ? WHERE id = ?")
      .run(reviewedAt, nextReviewDate, reviewedAt, asset.id);

    let note: Note | null = null;
    if (parsed.reviewNote) {
      note = this.addNote({ id: asset.id, note: `Review: ${parsed.reviewNote}` }).note;
    }

    return { asset: findAsset(this.db, { id: asset.id }), note };
  }

  showBuyZone() {
    const assets = this.db
      .prepare("SELECT * FROM assets WHERE status = 'buy_zone' OR buyZone IS NOT NULL ORDER BY ticker")
      .all() as Asset[];
    return { assets };
  }

  showLeapsCandidates() {
    return this.listWatchlist({ category: "LEAPS candidates" });
  }

  exportWatchlistMarkdown() {
    const rows = this.listWatchlist({ sortBy: "ticker" }).assets;
    const header = "| Ticker | Name | Category | Status | Conviction | Price | Next Review | Thesis |";
    const separator = "|---|---|---|---|---:|---:|---|---|";
    const body = rows.map((asset) =>
      [
        asset.ticker,
        asset.name ?? "",
        asset.category,
        asset.status,
        asset.conviction ?? "",
        asset.currentPrice == null ? "" : `${asset.currentPrice} ${asset.currency ?? ""}`.trim(),
        asset.nextReviewDate ?? "",
        (asset.thesisSummary ?? "").replaceAll("|", "\\|"),
      ].join(" | "),
    );
    return { markdown: [header, separator, ...body.map((row) => `| ${row} |`)].join("\n") };
  }

  exportWatchlistCsv() {
    const rows = this.listWatchlist({ sortBy: "ticker" }).assets;
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const header = ["ticker", "name", "category", "broker", "status", "conviction", "currentPrice", "currency", "nextReviewDate"];
    const csvRows = rows.map((asset) =>
      [
        asset.ticker,
        asset.name,
        asset.category,
        asset.broker,
        asset.status,
        asset.conviction,
        asset.currentPrice,
        asset.currency,
        asset.nextReviewDate,
      ]
        .map(escape)
        .join(","),
    );
    return { csv: [header.join(","), ...csvRows].join("\n") };
  }
}
