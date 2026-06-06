import type { AssetType, PriceResult } from "../types.js";
import type { PriceProvider } from "./priceProvider.js";

type SupportedStockApiProvider = "finnhub";

function getStockApiProvider(rawProvider = process.env.STOCK_API_PROVIDER ?? "finnhub"): SupportedStockApiProvider {
  const provider = rawProvider.trim().toLowerCase();
  if (provider === "finnhub") {
    return provider;
  }

  throw new Error(`Unsupported STOCK_API_PROVIDER="${rawProvider}". Use "finnhub".`);
}

interface FinnhubQuoteResponse {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
}

export class StockProvider implements PriceProvider {
  async getPrice(ticker: string, assetType: AssetType): Promise<PriceResult> {
    if (!["stock", "etf"].includes(assetType)) {
      throw new Error("StockProvider only supports stock and ETF assets.");
    }

    const apiProvider = getStockApiProvider();
    const apiKey = process.env.STOCK_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(`Live stock price for ${ticker} requires STOCK_API_KEY.`);
    }

    switch (apiProvider) {
      case "finnhub":
        return this.getFinnhubQuote(ticker, apiKey);
    }
  }

  private async getFinnhubQuote(ticker: string, apiKey: string): Promise<PriceResult> {
    const normalizedTicker = ticker.toUpperCase();
    const url = new URL("https://api.finnhub.io/api/v1/quote");
    url.searchParams.set("symbol", normalizedTicker);
    url.searchParams.set("token", apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Finnhub request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as FinnhubQuoteResponse;
    if (!data.c || data.c <= 0) {
      throw new Error(`Finnhub response missing current price for ${normalizedTicker}.`);
    }

    return {
      ticker: normalizedTicker,
      price: data.c,
      currency: "USD",
      source: "finnhub",
      priceChange1d: data.dp,
      timestamp: data.t ? new Date(data.t * 1000).toISOString() : new Date().toISOString(),
    };
  }
}
