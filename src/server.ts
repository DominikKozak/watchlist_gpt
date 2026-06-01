import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { createDb } from "./db/client.js";
import { initializeDatabase } from "./db/schema.js";
import { createInvestWatchlistMcpServer } from "./mcp/createServer.js";
import { createPriceProvider, getPriceProviderMode } from "./prices/providerFactory.js";
import { WatchlistTools } from "./tools/watchlistTools.js";

dotenv.config();

const db = createDb();
initializeDatabase(db);

const priceProviderMode = getPriceProviderMode();
const tools = new WatchlistTools(db, createPriceProvider({ mode: priceProviderMode }));
const server = createInvestWatchlistMcpServer({ tools, priceProviderMode });

const transport = new StdioServerTransport();
await server.connect(transport);
