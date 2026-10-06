import type { AssetType, PriceResult } from "../types.js";
import type { PriceProvider } from "./priceProvider.js";

const coinIds: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
};

export class CoinGeckoProvider implements PriceProvider {
  async getPrice(ticker: string, assetType: AssetType): Promise<PriceResult> {
    if (assetType !== "crypto") {
      throw new Error("CoinGeckoProvider only supports crypto assets.");
    }

    const coinId = coinIds[ticker.toUpperCase()];
    if (!coinId) {
      throw new Error(`No CoinGecko coin id mapping for ${ticker}. Add one in coingeckoProvider.ts.`);
    }

    const url = new URL("https://api.coingecko.com/api/v3/simple/price");
    url.searchParams.set("ids", coinId);
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("include_24hr_change", "true");
    url.searchParams.set("include_last_updated_at", "true");

    const headers: Record<string, string> = {};
    if (process.env.COINGECKO_API_KEY) {
      headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
    }

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
    if (!response.ok) {
      throw new Error(`CoinGecko request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, { usd?: number; usd_24h_change?: number; last_updated_at?: number }>;
    const quote = data[coinId];
    if (!quote?.usd || !Number.isFinite(quote.usd) || quote.usd <= 0 || !quote.last_updated_at) {
      throw new Error(`CoinGecko response missing valid USD price or market timestamp for ${ticker}.`);
    }

    return {
      ticker: ticker.toUpperCase(),
      price: quote.usd,
      currency: "USD",
      source: "coingecko",
      priceChange1d: quote.usd_24h_change,
      timestamp: new Date(quote.last_updated_at * 1000).toISOString(),
    };
  }
}
