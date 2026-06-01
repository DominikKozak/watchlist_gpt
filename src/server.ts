import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { z } from "zod";
import { createDb } from "./db/client.js";
import { initializeDatabase } from "./db/schema.js";
import { createPriceProvider, getPriceProviderMode } from "./prices/providerFactory.js";
import { WatchlistTools } from "./tools/watchlistTools.js";
import type { AddAssetInput, AssetIdentifier, ListWatchlistInput, UpdateAssetFields } from "./types.js";

dotenv.config();

const db = createDb();
initializeDatabase(db);
const priceProviderMode = getPriceProviderMode();
const tools = new WatchlistTools(db, createPriceProvider({ mode: priceProviderMode }));

const server = new McpServer({
  name: "Invest Watchlist",
  version: "0.1.0",
});

function asMcpResponse(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

server.registerTool(
  "list_watchlist",
  {
    title: "List investment watchlist",
    description:
      'Read-only. Call this when the user says "/watchlist" or asks to show the investment watchlist. Supports category, broker, status, asset type, and sorting filters.',
    inputSchema: {
      category: z.string().optional(),
      broker: z.string().optional(),
      status: z.string().optional(),
      assetType: z.string().optional(),
      sortBy: z.string().optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async (input) => asMcpResponse(tools.listWatchlist(input as ListWatchlistInput)),
);

server.registerTool(
  "get_asset",
  {
    title: "Get watchlist asset detail",
    description: "Read-only. Get full asset detail, latest notes, and recent price history by ticker or id.",
    inputSchema: { id: z.number().optional(), ticker: z.string().optional() },
    annotations: { readOnlyHint: true },
  },
  async (input) => asMcpResponse(tools.getAsset(input as AssetIdentifier)),
);

server.registerTool(
  "add_asset",
  {
    title: "Add watchlist asset",
    description:
      "Write tool. Add a ticker or note-only asset to the personal analysis watchlist. This never places trades and never connects to a broker.",
    inputSchema: {
      ticker: z.string(),
      name: z.string().optional(),
      assetType: z.string(),
      category: z.string(),
      broker: z.string().optional(),
      status: z.string().optional(),
      conviction: z.string().optional(),
      thesis: z.string().optional(),
      mainRisk: z.string().optional(),
      buyZone: z.string().optional(),
      currency: z.string().optional(),
    },
  },
  async (input) => asMcpResponse(tools.addAsset(input as AddAssetInput)),
);

server.registerTool(
  "update_asset",
  {
    title: "Update watchlist asset",
    description:
      "Write tool. Update fields for a watchlist asset by ticker or id. Rejects unknown fields. This is for notes and analysis metadata only.",
    inputSchema: {
      id: z.number().optional(),
      ticker: z.string().optional(),
      fields: z.record(z.unknown()),
    },
  },
  async (input) => asMcpResponse(tools.updateAsset(input as AssetIdentifier & { fields: UpdateAssetFields })),
);

server.registerTool(
  "delete_asset",
  {
    title: "Delete watchlist asset",
    description:
      "Destructive write tool. Delete an asset and its local notes/history from the watchlist only. No trades or broker actions are performed.",
    inputSchema: { id: z.number().optional(), ticker: z.string().optional() },
    annotations: { destructiveHint: true },
  },
  async (input) => asMcpResponse(tools.deleteAsset(input as AssetIdentifier)),
);

server.registerTool(
  "add_note",
  {
    title: "Add watchlist note",
    description: "Write tool. Add a research note to a watchlist asset by ticker or id.",
    inputSchema: { id: z.number().optional(), ticker: z.string().optional(), note: z.string() },
  },
  async (input) => asMcpResponse(tools.addNote(input as AssetIdentifier & { note: string })),
);

server.registerTool(
  "refresh_prices",
  {
    title: "Refresh watchlist prices",
    description:
      `Low-risk write tool. Refresh current prices with PRICE_PROVIDER=${priceProviderMode}, store price history, and continue if one ticker fails.`,
    inputSchema: { ticker: z.string().optional(), category: z.string().optional() },
  },
  async (input) => asMcpResponse(await tools.refreshPrices(input as { ticker?: string; category?: string })),
);

server.registerTool(
  "list_review_due",
  {
    title: "List assets due for review",
    description:
      'Read-only. Call this when the user says "/watchlist review" or asks for assets due for review. Returns assets with missing review date or nextReviewDate before the requested date.',
    inputSchema: { beforeDate: z.string().optional() },
    annotations: { readOnlyHint: true },
  },
  async (input) => asMcpResponse(tools.listReviewDue(input)),
);

server.registerTool(
  "mark_review_done",
  {
    title: "Mark watchlist review done",
    description: "Write tool. Mark an asset reviewed, optionally add a review note, and set the next review date.",
    inputSchema: {
      id: z.number().optional(),
      ticker: z.string().optional(),
      reviewNote: z.string().optional(),
      nextReviewDate: z.string().optional(),
    },
  },
  async (input) =>
    asMcpResponse(tools.markReviewDone(input as AssetIdentifier & { reviewNote?: string; nextReviewDate?: string })),
);

server.registerTool(
  "show_buy_zone",
  {
    title: "Show buy zone assets",
    description: 'Read-only. Call this when the user says "/watchlist buy zone" or asks for assets in a buy zone.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => asMcpResponse(tools.showBuyZone()),
);

server.registerTool(
  "show_leaps_candidates",
  {
    title: "Show LEAPS candidates",
    description: 'Read-only. Call this when the user says "/watchlist leaps" or asks to show LEAPS candidates.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => asMcpResponse(tools.showLeapsCandidates()),
);

server.registerTool(
  "export_watchlist_markdown",
  {
    title: "Export watchlist as Markdown",
    description: "Read-only. Export the watchlist as a Markdown table.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => asMcpResponse(tools.exportWatchlistMarkdown()),
);

server.registerTool(
  "export_watchlist_csv",
  {
    title: "Export watchlist as CSV",
    description: "Read-only. Export the watchlist as a CSV string.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => asMcpResponse(tools.exportWatchlistCsv()),
);

const transport = new StdioServerTransport();
await server.connect(transport);
