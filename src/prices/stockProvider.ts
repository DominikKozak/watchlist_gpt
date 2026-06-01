import type { AssetType, PriceResult } from "../types.js";
import type { PriceProvider } from "./priceProvider.js";

export class StockProvider implements PriceProvider {
  async getPrice(ticker: string, assetType: AssetType): Promise<PriceResult> {
    if (!["stock", "etf"].includes(assetType)) {
      throw new Error("StockProvider only supports stock and ETF assets.");
    }

    throw new Error(
      `StockProvider is a placeholder for ${ticker}. Configure STOCK_API_KEY and implement Alpha Vantage or Finnhub fetch logic.`,
    );
  }
}
