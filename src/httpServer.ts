import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";
import { createDb } from "./db/client.js";
import { initializeDatabase } from "./db/schema.js";
import { createInvestWatchlistMcpServer } from "./mcp/createServer.js";
import { createPriceProvider, getPriceProviderMode } from "./prices/providerFactory.js";
import { WatchlistTools } from "./tools/watchlistTools.js";

dotenv.config();

type HttpRequest = Parameters<StreamableHTTPServerTransport["handleRequest"]>[0] & { body?: unknown };
type HttpResponse = Parameters<StreamableHTTPServerTransport["handleRequest"]>[1] & {
  status(code: number): { json(body: unknown): void };
};

function createRequestScopedServer(): { server: McpServer; close: () => void } {
  const db = createDb();
  initializeDatabase(db);
  const priceProviderMode = getPriceProviderMode();
  const tools = new WatchlistTools(db, createPriceProvider({ mode: priceProviderMode }));
  const server = createInvestWatchlistMcpServer({ tools, priceProviderMode });

  return {
    server,
    close: () => db.close(),
  };
}

const host = process.env.HTTP_HOST ?? "127.0.0.1";
const port = Number(process.env.HTTP_PORT ?? 3000);
const app = createMcpExpressApp({ host });

app.post("/mcp", async (req: HttpRequest, res: HttpResponse) => {
  const { server, close } = createRequestScopedServer();
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
    close();
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
});
