import type { AssetType, PriceResult } from "../types.js";

export interface PriceProvider {
  getPrice(ticker: string, assetType: AssetType): Promise<PriceResult>;
}
