import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fetch(url, { method: "GET" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`HTTP server did not start at ${url}.`);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "invest-watchlist-http-"));
const dbPath = path.join(tempDir, "verify-http.sqlite");
const port = "3137";
const apiKey = "verify-http-key";
const url = `http://127.0.0.1:${port}/mcp`;
const server = spawn(process.execPath, [path.join("dist", "httpServer.js")], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_PATH: dbPath,
    HTTP_HOST: "127.0.0.1",
    HTTP_PORT: port,
    CONNECTOR_API_KEY: apiKey,
    PRICE_PROVIDER: "mock",
  },
  stdio: "ignore",
});

try {
  await waitForServer(url);

  const health = await fetch(`http://127.0.0.1:${port}/health`);
  const healthBody = (await health.json()) as { status?: string; app?: string; version?: string; timestamp?: string };
  assert(health.status === 200, "Expected /health to return 200 without auth.");
  assert(healthBody.status === "ok", "Expected /health status ok.");
  assert(healthBody.app === "Invest Watchlist", "Expected /health app name.");
  assert(Boolean(healthBody.version), "Expected /health version.");
  assert(Boolean(healthBody.timestamp), "Expected /health timestamp.");

  const version = await fetch(`http://127.0.0.1:${port}/version`);
  const versionText = await version.text();
  const versionBody = JSON.parse(versionText) as { authEnabled?: boolean; database?: string };
  assert(version.status === 200, "Expected /version to return 200 without auth.");
  assert(versionBody.authEnabled === true, "Expected /version to report auth enabled.");
  assert(versionBody.database === path.basename(dbPath), "Expected /version to expose only database basename.");
  assert(!versionText.includes(dbPath), "Expected /version not to expose full database path.");
  assert(!versionText.includes(apiKey), "Expected /version not to expose bearer token.");

  const unauthorizedUi = await fetch(`http://127.0.0.1:${port}/`);
  assert(unauthorizedUi.status === 401, "Expected / to require auth when CONNECTOR_API_KEY is set.");

  const authorizedUi = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const authorizedUiBody = await authorizedUi.text();
  assert(authorizedUi.status === 200, "Expected authorized / to return 200.");
  assert(authorizedUiBody.includes("<h1>Watchlist</h1>"), "Expected authorized / to render the watchlist UI.");
  assert(authorizedUiBody.includes("Watchlist je zatim prazdny."), "Expected empty UI state for a fresh database.");

  const unauthorizedApi = await fetch(`http://127.0.0.1:${port}/api/watchlist`);
  assert(unauthorizedApi.status === 401, "Expected /api/watchlist to require auth when CONNECTOR_API_KEY is set.");

  const authorizedApi = await fetch(`http://127.0.0.1:${port}/api/watchlist`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const authorizedApiBody = (await authorizedApi.json()) as { summary?: { total?: number }; assets?: unknown[] };
  assert(authorizedApi.status === 200, "Expected authorized /api/watchlist to return 200.");
  assert(authorizedApiBody.summary?.total === 0, "Expected fresh API watchlist to report zero assets.");
  assert(Array.isArray(authorizedApiBody.assets), "Expected API watchlist to include an assets array.");

  const unauthorized = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "verify-http", version: "0.0.0" },
      },
    }),
  });
  assert(unauthorized.status === 401, "Expected missing bearer token to return 401.");

  const authorized = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "verify-http", version: "0.0.0" },
      },
    }),
  });
  const body = await authorized.text();
  assert(authorized.status === 200, `Expected authorized initialize to return 200, got ${authorized.status}.`);
  assert(body.includes("Invest Watchlist"), "Expected initialize response to include server name.");

  console.log("HTTP verification passed.");
} finally {
  server.kill();
}
