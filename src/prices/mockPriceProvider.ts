import type { AssetType, PriceResult } from "../types.js";
import type { PriceProvider } from "./priceProvider.js";

const fixedPrices: Record<string, { price: number; currency: string }> = {
  MSFT: { price: 431.25, currency: "USD" },
  META: { price: 592.4, currency: "USD" },
  BTC: { price: 104250, currency: "USD" },
  SPCE: { price: 3.35, currency: "USD" },
};

function hashTicker(ticker: string): number {
  return [...ticker.toUpperCase()].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export class MockPriceProvider implements PriceProvider {
  async getPrice(ticker: string, _assetType: AssetType): Promise<PriceResult> {
    const normalized = ticker.toUpperCase();
    const fixed = fixedPrices[normalized];
    const hash = hashTicker(normalized);
    const base = fixed?.price ?? Math.max(1, (hash % 500) + (hash % 17) / 10);
    const drift = ((hash % 23) - 11) / 100;
    const price = Number((base * (1 + drift / 10)).toFixed(2));

    return {
      ticker: normalized,
      price,
      currency: fixed?.currency ?? "USD",
      source: "mock",
      priceChange1d: Number((((hash % 9) - 4) * 0.35).toFixed(2)),
      priceChange7d: Number((((hash % 17) - 8) * 0.55).toFixed(2)),
      priceChange30d: Number((((hash % 31) - 15) * 0.75).toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }
}
