export const allowedCategories = [
  "Long-term holdings",
  "Core ETF",
  "BTC / Crypto",
  "LEAPS candidates",
  "Options learning",
  "CFD ideas",
  "Speculative / WSB",
  "Rejected",
  "Needs review",
] as const;

export const allowedAssetTypes = [
  "stock",
  "etf",
  "crypto",
  "option",
  "cfd",
  "note_only",
] as const;

export const allowedStatuses = [
  "watching",
  "hold",
  "buy_zone",
  "needs_review",
  "rejected",
  "closed",
] as const;

export type AssetCategory = (typeof allowedCategories)[number];
export type AssetType = (typeof allowedAssetTypes)[number];
export type AssetStatus = (typeof allowedStatuses)[number];

export interface Asset {
  id: number;
  ticker: string;
  name: string | null;
  assetType: AssetType;
  category: AssetCategory;
  broker: string | null;
  status: AssetStatus;
  conviction: string | null;
  thesis: string | null;
  mainRisk: string | null;
  buyZone: string | null;
  currentPrice: number | null;
  currency: string | null;
  priceChange1d: number | null;
  priceChange7d: number | null;
  priceChange30d: number | null;
  lastPriceUpdate: string | null;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  targetBuyPrice: number | null;
  targetSellPrice: number | null;
  reviewFrequencyDays: number | null;
  thesisScore: number | null;
  riskScore: number | null;
  lastDecision: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: number;
  assetId: number;
  note: string;
  createdAt: string;
}

export interface PriceHistory {
  id: number;
  assetId: number;
  price: number;
  currency: string;
  source: string;
  timestamp: string;
}

export interface PriceResult {
  ticker: string;
  price: number;
  currency: string;
  source: string;
  priceChange1d?: number;
  priceChange7d?: number;
  priceChange30d?: number;
  timestamp?: string;
}

export type AssetIdentifier = { id?: number; ticker?: string };

export interface ListWatchlistInput {
  category?: AssetCategory;
  broker?: string;
  status?: AssetStatus;
  assetType?: AssetType;
  sortBy?: "ticker" | "category" | "status" | "conviction" | "nextReviewDate" | "updatedAt";
}

export interface AddAssetInput {
  ticker: string;
  name?: string;
  assetType: AssetType;
  category: AssetCategory;
  broker?: string;
  status?: AssetStatus;
  conviction?: string;
  thesis?: string;
  mainRisk?: string;
  buyZone?: string;
  currency?: string;
  targetBuyPrice?: number;
  targetSellPrice?: number;
  reviewFrequencyDays?: number;
  thesisScore?: number;
  riskScore?: number;
  lastDecision?: string;
  decisionReason?: string;
}

export type UpdateAssetFields = Partial<Omit<AddAssetInput, "ticker">> & {
  ticker?: string;
  currentPrice?: number | null;
  priceChange1d?: number | null;
  priceChange7d?: number | null;
  priceChange30d?: number | null;
  lastPriceUpdate?: string | null;
  lastReviewDate?: string | null;
  nextReviewDate?: string | null;
  targetBuyPrice?: number | null;
  targetSellPrice?: number | null;
  reviewFrequencyDays?: number | null;
  thesisScore?: number | null;
  riskScore?: number | null;
  lastDecision?: string | null;
  decisionReason?: string | null;
};
