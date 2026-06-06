import { z } from "zod";
import type { RestoreMode } from "../backup/backupFormat.js";
import { exportWatchlistBackup } from "../backup/exportBackup.js";
import { importWatchlistBackup } from "../backup/importBackup.js";
import type { AppDb } from "../db/client.js";
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
  targetBuyPrice: z.number().nullable().optional(),
  targetSellPrice: z.number().nullable().optional(),
  reviewFrequencyDays: z.number().int().positive().nullable().optional(),
  thesisScore: z.number().int().min(1).max(10).nullable().optional(),
  riskScore: z.number().int().min(1).max(10).nullable().optional(),
  lastDecision: z.string().nullable().optional(),
  decisionReason: z.string().nullable().optional(),
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
      targetBuyPrice: z.number().nullable().optional(),
      targetSellPrice: z.number().nullable().optional(),
      reviewFrequencyDays: z.number().int().positive().nullable().optional(),
      thesisScore: z.number().int().min(1).max(10).nullable().optional(),
      riskScore: z.number().int().min(1).max(10).nullable().optional(),
      lastDecision: z.string().nullable().optional(),
      decisionReason: z.string().nullable().optional(),
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

export const searchAssetsSchema = z.object({
  query: z.string().trim().min(1),
});

export const setAssetDecisionSchema = identifierBaseSchema
  .extend({
    lastDecision: z.string().trim().min(1),
    decisionReason: z.string().trim().min(1).optional(),
    conviction: z.string().trim().min(1).optional(),
    status: statusSchema.optional(),
    reviewNote: z.string().trim().min(1).optional(),
    nextReviewDate: z.string().optional(),
  })
  .refine((value) => value.id !== undefined || value.ticker !== undefined, "Provide ticker or id.");

export const importWatchlistJsonSchema = z.object({
  backup: z.unknown(),
  dryRun: z.boolean().optional(),
  mode: z.enum(["upsert", "skip_existing", "replace_all"]).optional(),
});

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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(startDate: string, days: number): string {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce(
    (counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    },
    {} as Record<T, number>,
  );
}

function markdownCell(value: unknown): string {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function rowToAsset(row: unknown): Asset {
  return row as Asset;
}

async function findAsset(db: AppDb, identifier: AssetIdentifier): Promise<Asset> {
  const row =
    identifier.id !== undefined
      ? await db.get<Asset>("SELECT * FROM assets WHERE id = ?", [identifier.id])
      : await db.get<Asset>("SELECT * FROM assets WHERE ticker = ? COLLATE NOCASE", [identifier.ticker]);

  if (!row) {
    throw new Error("Asset not found.");
  }

  return rowToAsset(row);
}

function likeQuery(query: string): string {
  return `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

export class WatchlistTools {
  constructor(
    private readonly db: AppDb,
    private readonly priceProvider: PriceProvider,
    private readonly priceProviderMode = "mock",
  ) {}

  async listWatchlist(input: ListWatchlistInput = {}) {
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
    const rows = await this.db.all<Asset>(`SELECT * FROM assets ${where} ORDER BY ${sortBy} COLLATE NOCASE`, params);
    const assets = rows.map((asset) => ({
      id: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      assetType: asset.assetType,
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
      targetBuyPrice: asset.targetBuyPrice,
      targetSellPrice: asset.targetSellPrice,
      reviewFrequencyDays: asset.reviewFrequencyDays,
      thesisScore: asset.thesisScore,
      riskScore: asset.riskScore,
      lastDecision: asset.lastDecision,
      decisionReason: asset.decisionReason,
      thesisSummary: summarize(asset.thesis),
    }));
    const warnings: string[] = [];
    if (this.priceProviderMode === "mock") {
      warnings.push("PRICE_PROVIDER=mock returns deterministic test prices, not market data.");
    }
    if (this.priceProviderMode === "coingecko" || this.priceProviderMode === "hybrid") {
      warnings.push("Crypto prices may be provider-delayed; stock and ETF prices are mock or unavailable unless a stock provider is implemented.");
    }
    if (rows.some((asset) => asset.currentPrice == null)) {
      warnings.push("Some assets do not have a current price yet. Run refresh_prices or review provider coverage.");
    }

    return {
      assets,
      columns: [
        { key: "ticker", label: "Ticker", kind: "text" },
        { key: "name", label: "Name", kind: "text" },
        { key: "category", label: "Category", kind: "tag" },
        { key: "status", label: "Status", kind: "tag" },
        { key: "conviction", label: "Conviction", kind: "score" },
        { key: "currentPrice", label: "Price", kind: "currency" },
        { key: "targetBuyPrice", label: "Target Buy", kind: "currency" },
        { key: "targetSellPrice", label: "Target Sell", kind: "currency" },
        { key: "nextReviewDate", label: "Next Review", kind: "date" },
        { key: "thesisSummary", label: "Thesis", kind: "text" },
      ],
      summary: {
        total: assets.length,
        byCategory: countBy(rows.map((asset) => asset.category)),
        byStatus: countBy(rows.map((asset) => asset.status)),
      },
      generatedAt: nowIso(),
      priceProviderMode: this.priceProviderMode,
      warnings,
    };
  }

  async getAsset(input: AssetIdentifier) {
    const parsed = identifierSchema.parse(input);
    const asset = await findAsset(this.db, parsed);
    const notes = await this.db.all<Note>("SELECT * FROM notes WHERE assetId = ? ORDER BY createdAt DESC LIMIT 10", [asset.id]);
    const priceHistory = await this.db.all<PriceHistory>(
      "SELECT * FROM price_history WHERE assetId = ? ORDER BY timestamp DESC LIMIT 20",
      [asset.id],
    );
    const warnings: string[] = [];
    if (priceHistory.some((price) => price.source === "mock")) {
      warnings.push("Latest stored price history includes mock prices.");
    }
    if (!asset.currentPrice || !asset.lastPriceUpdate) {
      warnings.push("This asset has no current price. Run refresh_prices or review provider coverage.");
    } else {
      const ageMs = Date.now() - Date.parse(asset.lastPriceUpdate);
      if (Number.isFinite(ageMs) && ageMs > 7 * 24 * 60 * 60 * 1000) {
        warnings.push("Current price is older than 7 days.");
      }
    }

    return {
      asset,
      notes,
      priceHistory,
      displaySections: [
        { key: "overview", title: "Overview", fields: ["ticker", "name", "assetType", "category", "status", "conviction"] },
        { key: "analysis", title: "Analysis", fields: ["thesis", "mainRisk", "buyZone", "thesisScore", "riskScore"] },
        { key: "targets", title: "Targets", fields: ["currentPrice", "targetBuyPrice", "targetSellPrice", "currency"] },
        { key: "review", title: "Review", fields: ["lastReviewDate", "nextReviewDate", "reviewFrequencyDays", "lastDecision", "decisionReason"] },
        { key: "notes", title: "Notes", fields: ["notes"] },
        { key: "priceHistory", title: "Price History", fields: ["priceHistory"] },
      ],
      generatedAt: nowIso(),
      priceProviderMode: this.priceProviderMode,
      warnings,
    };
  }

  async addAsset(input: AddAssetInput) {
    const parsed = addAssetSchema.parse(input);
    const timestamp = nowIso();
    const result = await this.db.run(
      `INSERT INTO assets (
          ticker, name, assetType, category, broker, status, conviction, thesis, mainRisk, buyZone,
          currentPrice, currency, priceChange1d, priceChange7d, priceChange30d, lastPriceUpdate,
          lastReviewDate, nextReviewDate, targetBuyPrice, targetSellPrice, reviewFrequencyDays,
          thesisScore, riskScore, lastDecision, decisionReason, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
        parsed.targetBuyPrice ?? null,
        parsed.targetSellPrice ?? null,
        parsed.reviewFrequencyDays ?? null,
        parsed.thesisScore ?? null,
        parsed.riskScore ?? null,
        parsed.lastDecision ?? null,
        parsed.decisionReason ?? null,
        timestamp,
        timestamp,
      ],
    );

    return { asset: await findAsset(this.db, { id: Number(result.lastInsertRowid) }) };
  }

  async updateAsset(input: AssetIdentifier & { fields: UpdateAssetFields }) {
    const parsed = updateAssetSchema.parse(input);
    const asset = await findAsset(this.db, parsed);
    const entries = Object.entries(parsed.fields).filter(([, value]) => value !== undefined);

    if (!entries.length) {
      return { asset };
    }

    const assignments = entries.map(([key]) => `${key} = ?`);
    const values = entries.map(([key, value]) => (key === "ticker" && typeof value === "string" ? normalizeTicker(value) : value));
    assignments.push("updatedAt = ?");
    values.push(nowIso(), asset.id);

    await this.db.run(`UPDATE assets SET ${assignments.join(", ")} WHERE id = ?`, values);
    return { asset: await findAsset(this.db, { id: asset.id }) };
  }

  async deleteAsset(input: AssetIdentifier) {
    const parsed = identifierSchema.parse(input);
    const asset = await findAsset(this.db, parsed);
    await this.db.run("DELETE FROM assets WHERE id = ?", [asset.id]);
    return {
      deleted: true,
      id: asset.id,
      ticker: asset.ticker,
      message: `Deleted ${asset.ticker} from the watchlist. No trades or broker actions were performed.`,
    };
  }

  async addNote(input: AssetIdentifier & { note: string }) {
    const parsed = addNoteSchema.parse(input);
    const asset = await findAsset(this.db, parsed);
    const createdAt = nowIso();
    const result = await this.db.run("INSERT INTO notes (assetId, note, createdAt) VALUES (?, ?, ?)", [
      asset.id,
      parsed.note,
      createdAt,
    ]);
    const note = await this.db.get<Note>("SELECT * FROM notes WHERE id = ?", [result.lastInsertRowid]);
    if (!note) throw new Error("Failed to load inserted note.");
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
    const assets = await this.db.all<Asset>(`SELECT * FROM assets ${where} ORDER BY ticker`, params);
    const updated = [];
    const failed = [];

    for (const asset of assets) {
      try {
        const price = await this.priceProvider.getPrice(asset.ticker, asset.assetType);
        const timestamp = price.timestamp ?? nowIso();
        await this.db.run(
          `UPDATE assets
             SET currentPrice = ?, currency = ?, priceChange1d = ?, priceChange7d = ?,
                 priceChange30d = ?, lastPriceUpdate = ?, updatedAt = ?
             WHERE id = ?`,
          [
            price.price,
            price.currency,
            price.priceChange1d ?? null,
            price.priceChange7d ?? null,
            price.priceChange30d ?? null,
            timestamp,
            nowIso(),
            asset.id,
          ],
        );
        await this.db.run("INSERT INTO price_history (assetId, price, currency, source, timestamp) VALUES (?, ?, ?, ?, ?)", [
          asset.id,
          price.price,
          price.currency,
          price.source,
          timestamp,
        ]);
        updated.push({ ticker: asset.ticker, price: price.price, currency: price.currency, source: price.source });
      } catch (error) {
        failed.push({ ticker: asset.ticker, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { updated, failed };
  }

  async listReviewDue(input: { beforeDate?: string } = {}) {
    const parsed = listReviewDueSchema.parse(input);
    const beforeDate = parsed.beforeDate ?? new Date().toISOString().slice(0, 10);
    const assets = await this.db.all<Asset>(
      `SELECT * FROM assets
         WHERE nextReviewDate IS NULL OR date(nextReviewDate) <= date(?)
         ORDER BY nextReviewDate IS NULL DESC, nextReviewDate ASC, ticker ASC`,
      [beforeDate],
    );
    return { beforeDate, assets };
  }

  async portfolioSummary() {
    const assets = await this.db.all<Asset>("SELECT * FROM assets ORDER BY ticker COLLATE NOCASE");
    const due = (await this.listReviewDue()).assets;
    const mockPriceRows = await this.db.all<Asset>(
      `SELECT DISTINCT assets.*
         FROM assets
         JOIN price_history ON price_history.assetId = assets.id
         WHERE price_history.source = 'mock'
         ORDER BY assets.ticker COLLATE NOCASE`,
    );
    const warnings: string[] = [];
    const missingPrice = assets.filter((asset) => asset.currentPrice == null);
    const highRiskAssets = assets.filter(
      (asset) =>
        asset.category === "Speculative / WSB" ||
        (asset.riskScore !== null && asset.riskScore >= 8) ||
        asset.conviction === "C",
    );

    if (this.priceProviderMode === "mock") {
      warnings.push("PRICE_PROVIDER=mock returns deterministic test prices, not market data.");
    }
    if (missingPrice.length > 0) {
      warnings.push(`${missingPrice.length} assets are missing current price data.`);
    }

    return {
      totalAssets: assets.length,
      countsByCategory: countBy(assets.map((asset) => asset.category)),
      countsByStatus: countBy(assets.map((asset) => asset.status)),
      countsByAssetType: countBy(assets.map((asset) => asset.assetType)),
      assetsDueForReview: due,
      assetsMissingPrice: missingPrice,
      assetsWithMockPrices: mockPriceRows,
      leapsCandidates: assets.filter((asset) => asset.category === "LEAPS candidates"),
      speculativeHighRiskAssets: highRiskAssets,
      generatedAt: nowIso(),
      warnings,
    };
  }

  async searchAssets(input: { query: string }) {
    const parsed = searchAssetsSchema.parse(input);
    const query = likeQuery(parsed.query);
    const assets = await this.db.all<Asset>(
      `SELECT DISTINCT assets.*
         FROM assets
         LEFT JOIN notes ON notes.assetId = assets.id
         WHERE assets.ticker LIKE ? ESCAPE '\\'
            OR assets.name LIKE ? ESCAPE '\\'
            OR assets.thesis LIKE ? ESCAPE '\\'
            OR assets.mainRisk LIKE ? ESCAPE '\\'
            OR assets.decisionReason LIKE ? ESCAPE '\\'
            OR notes.note LIKE ? ESCAPE '\\'
         ORDER BY assets.ticker COLLATE NOCASE`,
      [query, query, query, query, query, query],
    );
    const notes = await this.db.all<Note>(
      `SELECT notes.*
         FROM notes
         JOIN assets ON assets.id = notes.assetId
         WHERE notes.note LIKE ? ESCAPE '\\'
            OR assets.ticker LIKE ? ESCAPE '\\'
            OR assets.name LIKE ? ESCAPE '\\'
         ORDER BY notes.createdAt DESC`,
      [query, query, query],
    );

    return {
      query: parsed.query,
      matchingAssets: assets,
      matchingNotes: notes,
      generatedAt: nowIso(),
    };
  }

  async setAssetDecision(input: AssetIdentifier & {
    lastDecision: string;
    decisionReason?: string;
    conviction?: string;
    status?: string;
    reviewNote?: string;
    nextReviewDate?: string;
  }) {
    const parsed = setAssetDecisionSchema.parse(input);
    const fields: UpdateAssetFields = {
      lastDecision: parsed.lastDecision,
    };
    if (parsed.decisionReason !== undefined) fields.decisionReason = parsed.decisionReason;
    if (parsed.conviction !== undefined) fields.conviction = parsed.conviction;
    if (parsed.status !== undefined) fields.status = parsed.status;
    if (parsed.nextReviewDate !== undefined) fields.nextReviewDate = parsed.nextReviewDate;

    const updated = (await this.updateAsset({ id: parsed.id, ticker: parsed.ticker, fields })).asset;
    let note: Note | null = null;
    if (parsed.reviewNote) {
      note = (await this.addNote({ id: updated.id, note: `Decision: ${parsed.reviewNote}` })).note;
    }

    return {
      asset: await findAsset(this.db, { id: updated.id }),
      note,
      message: "Decision updated for watchlist analysis only. No trades or broker actions were performed.",
    };
  }

  async markReviewDone(input: AssetIdentifier & { reviewNote?: string; nextReviewDate?: string }) {
    const parsed = markReviewDoneSchema.parse(input);
    const asset = await findAsset(this.db, parsed);
    const reviewedAt = nowIso();
    const nextReviewDate =
      parsed.nextReviewDate ?? (asset.reviewFrequencyDays ? addDaysIsoDate(todayIsoDate(), asset.reviewFrequencyDays) : null);
    await this.db.run("UPDATE assets SET lastReviewDate = ?, nextReviewDate = ?, updatedAt = ? WHERE id = ?", [
      reviewedAt,
      nextReviewDate,
      reviewedAt,
      asset.id,
    ]);

    let note: Note | null = null;
    if (parsed.reviewNote) {
      note = (await this.addNote({ id: asset.id, note: `Review: ${parsed.reviewNote}` })).note;
    }

    return { asset: await findAsset(this.db, { id: asset.id }), note };
  }

  async showBuyZone() {
    const assets = await this.db.all<Asset>("SELECT * FROM assets WHERE status = 'buy_zone' OR buyZone IS NOT NULL ORDER BY ticker");
    return { assets };
  }

  async showLeapsCandidates() {
    return this.listWatchlist({ category: "LEAPS candidates" });
  }

  async exportWatchlistMarkdown() {
    const rows = (await this.listWatchlist({ sortBy: "ticker" })).assets;
    const header =
      "| Ticker | Name | Category | Status | Conviction | Price | Target Buy | Target Sell | Next Review | Thesis Score | Risk Score | Last Decision | Thesis |";
    const separator = "|---|---|---|---|---:|---:|---:|---:|---|---:|---:|---|---|";
    const body = rows.map((asset) =>
      [
        asset.ticker,
        asset.name ?? "",
        asset.category,
        asset.status,
        asset.conviction ?? "",
        asset.currentPrice == null ? "" : `${asset.currentPrice} ${asset.currency ?? ""}`.trim(),
        asset.targetBuyPrice ?? "",
        asset.targetSellPrice ?? "",
        asset.nextReviewDate ?? "",
        asset.thesisScore ?? "",
        asset.riskScore ?? "",
        asset.lastDecision ?? "",
        asset.thesisSummary ?? "",
      ].map(markdownCell).join(" | "),
    );
    return { markdown: [header, separator, ...body.map((row) => `| ${row} |`)].join("\n") };
  }

  async exportWatchlistCsv() {
    const rows = (await this.listWatchlist({ sortBy: "ticker" })).assets;
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const header = [
      "ticker",
      "name",
      "category",
      "broker",
      "status",
      "conviction",
      "currentPrice",
      "currency",
      "targetBuyPrice",
      "targetSellPrice",
      "nextReviewDate",
      "reviewFrequencyDays",
      "thesisScore",
      "riskScore",
      "lastDecision",
      "decisionReason",
    ];
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
        asset.targetBuyPrice,
        asset.targetSellPrice,
        asset.nextReviewDate,
        asset.reviewFrequencyDays,
        asset.thesisScore,
        asset.riskScore,
        asset.lastDecision,
        asset.decisionReason,
      ]
        .map(escape)
        .join(","),
    );
    return { csv: [header.join(","), ...csvRows].join("\n") };
  }

  async exportWatchlistJson() {
    return { backup: await exportWatchlistBackup(this.db) };
  }

  async importWatchlistJson(input: { backup: unknown; dryRun?: boolean; mode?: RestoreMode }) {
    const parsed = importWatchlistJsonSchema.parse(input);
    const summary = await importWatchlistBackup(this.db, parsed.backup, {
      dryRun: parsed.dryRun ?? false,
      mode: parsed.mode ?? "upsert",
    });

    return {
      summary,
      warning:
        "JSON import modifies local watchlist data only. It never connects to brokers and never places trades.",
    };
  }
}
