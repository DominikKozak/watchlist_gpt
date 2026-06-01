import type { AssetType, PriceResult } from "../types.js";
import { CoinGeckoProvider } from "./coingeckoProvider.js";
import { MockPriceProvider } from "./mockPriceProvider.js";
import type { PriceProvider } from "./priceProvider.js";

export type PriceProviderMode = "mock" | "coingecko" | "hybrid";

interface ProviderFactoryOptions {
  mode?: string;
  mockProvider?: PriceProvider;
  coinGeckoProvider?: PriceProvider;
}

class CryptoOnlyProvider implements PriceProvider {
  constructor(private readonly cryptoProvider: PriceProvider) {}

  async getPrice(ticker: string, assetType: AssetType): Promise<PriceResult> {
    if (assetType !== "crypto") {
      throw new Error(`PRICE_PROVIDER=coingecko only supports crypto assets. ${ticker} is ${assetType}.`);
    }

    return this.cryptoProvider.getPrice(ticker, assetType);
  }
}

class HybridPriceProvider implements PriceProvider {
  constructor(
    private readonly cryptoProvider: PriceProvider,
    private readonly fallbackProvider: PriceProvider,
  ) {}

  async getPrice(ticker: string, assetType: AssetType): Promise<PriceResult> {
    if (assetType === "crypto") {
      return this.cryptoProvider.getPrice(ticker, assetType);
    }

    return this.fallbackProvider.getPrice(ticker, assetType);
  }
}

export function getPriceProviderMode(rawMode = process.env.PRICE_PROVIDER ?? "mock"): PriceProviderMode {
  const mode = rawMode.trim().toLowerCase();
  if (mode === "mock" || mode === "coingecko" || mode === "hybrid") {
    return mode;
  }

  throw new Error(`Unsupported PRICE_PROVIDER="${rawMode}". Use "mock", "coingecko", or "hybrid".`);
}

export function createPriceProvider(options: ProviderFactoryOptions = {}): PriceProvider {
  const mode = getPriceProviderMode(options.mode);
  const mockProvider = options.mockProvider ?? new MockPriceProvider();
  const coinGeckoProvider = options.coinGeckoProvider ?? new CoinGeckoProvider();

  switch (mode) {
    case "mock":
      return mockProvider;
    case "coingecko":
      return new CryptoOnlyProvider(coinGeckoProvider);
    case "hybrid":
      return new HybridPriceProvider(coinGeckoProvider, mockProvider);
  }
}
