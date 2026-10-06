import type { AssetType, PriceResult } from "../types.js";
import type { PriceProvider } from "./priceProvider.js";

interface YahooChart {
  chart?: {
    error?: { description?: string } | null;
    result?: Array<{
      meta: {
        symbol: string;
        currency: string;
        exchangeTimezoneName: string;
        regularMarketPrice: number;
        regularMarketTime: number;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }> | null;
  };
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function marketDate(timestamp: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000));
  return ["year", "month", "day"].map((type) => parts.find((p) => p.type === type)!.value).join("-");
}

function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Public, best-effort Yahoo daily chart. Quotes can be exchange-delayed; no API key is needed. */
export class StockProvider implements PriceProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async getPrice(ticker: string, assetType: AssetType): Promise<PriceResult> {
    if (assetType !== "stock" && assetType !== "etf") {
      throw new Error("StockProvider only supports stock and ETF assets; option premiums need their own quote.");
    }
    const provider = (process.env.STOCK_API_PROVIDER ?? "yahoo").trim().toLowerCase();
    if (!["yahoo", "auto", "finnhub"].includes(provider)) {
      throw new Error(`Unsupported STOCK_API_PROVIDER="${provider}". Use yahoo, auto, or finnhub.`);
    }
    const symbol = ticker.toUpperCase();
    const apiKey = process.env.STOCK_API_KEY?.trim();
    // Existing Finnhub deployments without a key also get the free source. Foreign
    // exchange symbols use Yahoo to preserve their native currency and price unit.
    if (provider === "finnhub" && apiKey && !symbol.includes(".")) {
      return this.getFinnhubQuote(symbol, apiKey);
    }
    return this.getYahooQuote(symbol);
  }

  private async getYahooQuote(ticker: string): Promise<PriceResult> {
    const symbol = ticker === "BRK.B" ? "BRK-B" : ticker;
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.searchParams.set("range", "3mo");
    url.searchParams.set("interval", "1d");
    url.searchParams.set("includePrePost", "false");
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Yahoo quote for ${ticker} failed: HTTP ${response.status}.`);
    const data = (await response.json()) as YahooChart;
    const chart = data.chart?.result?.[0];
    if (data.chart?.error || !chart) {
      throw new Error(`Yahoo quote for ${ticker} unavailable: ${data.chart?.error?.description ?? "empty chart"}.`);
    }
    const meta = chart.meta;
    if (meta.symbol?.toUpperCase() !== symbol || !positive(meta.regularMarketPrice) ||
        !positive(meta.regularMarketTime) || !meta.currency || !meta.exchangeTimezoneName) {
      throw new Error(`Yahoo quote for ${ticker} is missing a valid price, currency, symbol, or market timestamp.`);
    }
    const quoteDate = marketDate(meta.regularMarketTime, meta.exchangeTimezoneName);
    const closes = chart.indicators?.quote?.[0]?.close ?? [];
    const history = (chart.timestamp ?? []).flatMap((timestamp, index) => {
      const close = closes[index];
      if (!positive(close) || timestamp > meta.regularMarketTime) return [];
      return [{ day: marketDate(timestamp, meta.exchangeTimezoneName), close }];
    }).sort((a, b) => a.day.localeCompare(b.day));
    const change = (days: number): number | undefined => {
      const targetDate = daysBefore(quoteDate, days);
      const baseline = history.filter((entry) => entry.day <= targetDate).at(-1);
      if (!baseline) return undefined;
      return Number(((meta.regularMarketPrice / baseline.close - 1) * 100).toFixed(4));
    };
    return {
      ticker, price: meta.regularMarketPrice,
      // GBp means British pence, not GBP. Do not uppercase currency units.
      currency: meta.currency, source: "yahoo-chart",
      timestamp: new Date(meta.regularMarketTime * 1000).toISOString(),
      priceChange1d: change(1), priceChange7d: change(7), priceChange30d: change(30),
    };
  }

  private async getFinnhubQuote(ticker: string, apiKey: string): Promise<PriceResult> {
    const url = new URL("https://api.finnhub.io/api/v1/quote");
    url.searchParams.set("symbol", ticker);
    url.searchParams.set("token", apiKey);
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Finnhub quote for ${ticker} failed: HTTP ${response.status}.`);
    const data = (await response.json()) as { c?: number; dp?: number; t?: number };
    if (!positive(data.c) || !positive(data.t)) throw new Error(`Finnhub quote for ${ticker} has no valid price or market timestamp.`);
    return {
      ticker, price: data.c, currency: "USD", source: "finnhub",
      priceChange1d: Number.isFinite(data.dp) ? data.dp : undefined,
      timestamp: new Date(data.t * 1000).toISOString(),
    };
  }
}
