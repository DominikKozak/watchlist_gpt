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
