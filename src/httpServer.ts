import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createDb, getDatabasePath, getDbProvider } from "./db/client.js";
import { initializeDatabase } from "./db/schema.js";
import { createInvestWatchlistMcpServer } from "./mcp/createServer.js";
import { createPriceProvider, getPriceProviderMode } from "./prices/providerFactory.js";
import { WatchlistTools } from "./tools/watchlistTools.js";
import { renderWatchlistHtml } from "./ui/watchlistHtml.js";

dotenv.config();

type HttpRequest = Parameters<StreamableHTTPServerTransport["handleRequest"]>[0] & { body?: unknown };
type HttpResponse = Parameters<StreamableHTTPServerTransport["handleRequest"]>[1] & {
  json(body: unknown): void;
  status(code: number): { json(body: unknown): void };
};
type NextFunction = () => void;

function readPackageVersion(): string {
  const packageJsonPath = path.resolve("package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { name?: string; version?: string };
  return packageJson.version ?? "0.0.0";
}

function safeDatabaseConfig(): string {
  if (getDbProvider() === "turso") {
    return process.env.TURSO_DATABASE_URL ? "turso configured" : "turso missing url";
  }

  const configuredPath = getDatabasePath();
  if (!configuredPath) return "default";
  return path.basename(configuredPath) || "configured";
}

async function createRequestScopedServer(): Promise<{ server: McpServer; close: () => Promise<void> }> {
  const db = createDb();
  await initializeDatabase(db);
  const priceProviderMode = getPriceProviderMode();
  const tools = new WatchlistTools(db, createPriceProvider({ mode: priceProviderMode }), priceProviderMode);
  const server = createInvestWatchlistMcpServer({ tools, priceProviderMode });

  return {
    server,
    close: () => db.close(),
  };
}

async function createRequestScopedTools(): Promise<{ tools: WatchlistTools; close: () => Promise<void> }> {
  const db = createDb();
  await initializeDatabase(db);
  const priceProviderMode = getPriceProviderMode();
  return {
    tools: new WatchlistTools(db, createPriceProvider({ mode: priceProviderMode }), priceProviderMode),
    close: () => db.close(),
  };
}

function readBearer(req: HttpRequest): string | null {
  const authorization = req.headers.authorization;
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

function rejectUnauthorized(res: HttpResponse): void {
  res.status(401).json({
    error: "Unauthorized. Provide Authorization: Bearer <CONNECTOR_API_KEY>.",
  });
}

function requireConnectorAuth(req: HttpRequest, res: HttpResponse, next: NextFunction): void {
  if (!connectorApiKey || readBearer(req) === connectorApiKey) {
    next();
    return;
  }

  rejectUnauthorized(res);
}

const host = process.env.HTTP_HOST ?? "127.0.0.1";
const port = Number(process.env.HTTP_PORT ?? 3000);
const connectorApiKey = process.env.CONNECTOR_API_KEY?.trim();
const appName = "Invest Watchlist";
const appVersion = readPackageVersion();
const app = createMcpExpressApp({ host });

app.get("/", requireConnectorAuth, async (_req: HttpRequest, res: HttpResponse) => {
  const { tools, close } = await createRequestScopedTools();
  try {
    const view = await tools.listWatchlist({ sortBy: "ticker" });
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(renderWatchlistHtml(view));
  } catch (error) {
    console.error("Error rendering watchlist UI:", error);
    res.status(500).json({ error: "Failed to render watchlist UI." });
  } finally {
    await close();
  }
});

app.get("/api/watchlist", requireConnectorAuth, async (_req: HttpRequest, res: HttpResponse) => {
  const { tools, close } = await createRequestScopedTools();
  try {
    res.json(await tools.listWatchlist({ sortBy: "ticker" }));
  } catch (error) {
    console.error("Error loading watchlist API:", error);
    res.status(500).json({ error: "Failed to load watchlist." });
  } finally {
    await close();
  }
});

app.get("/health", (_req: HttpRequest, res: HttpResponse) => {
  res.json({
    status: "ok",
    app: appName,
    version: appVersion,
    timestamp: new Date().toISOString(),
  });
});

app.get("/version", (_req: HttpRequest, res: HttpResponse) => {
  res.json({
    app: appName,
    version: appVersion,
    nodeEnv: process.env.NODE_ENV ?? "development",
    priceProviderMode: getPriceProviderMode(),
    authEnabled: Boolean(connectorApiKey),
    dbProvider: getDbProvider(),
    database: safeDatabaseConfig(),
  });
});

app.use("/mcp", (req: HttpRequest, res: HttpResponse, next: NextFunction) => {
  if (!connectorApiKey) {
    next();
    return;
  }

  if (readBearer(req) === connectorApiKey) {
    next();
    return;
  }

  res.status(401).json({
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Unauthorized. Provide Authorization: Bearer <CONNECTOR_API_KEY>.",
    },
    id: null,
  });
});

app.post("/mcp", async (req: HttpRequest, res: HttpResponse) => {
  const { server, close } = await createRequestScopedServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP HTTP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  } finally {
    await transport.close().catch((error) => console.error("Error closing MCP transport:", error));
    await server.close().catch((error) => console.error("Error closing MCP server:", error));
    await close();
  }
});

app.get("/mcp", (_req: HttpRequest, res: HttpResponse) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use POST /mcp for stateless Streamable HTTP.",
      },
      id: null,
    }),
  );
});

app.delete("/mcp", (_req: HttpRequest, res: HttpResponse) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    }),
  );
});

app.listen(port, host, (error?: Error) => {
  if (error) {
    console.error("Failed to start MCP HTTP server:", error);
    process.exit(1);
  }

  console.log(`Invest Watchlist MCP HTTP server listening at http://${host}:${port}/mcp`);
  if (!connectorApiKey) {
    console.warn("CONNECTOR_API_KEY is not set. HTTP /mcp is open for local development; set it before private hosted use.");
  }
});
