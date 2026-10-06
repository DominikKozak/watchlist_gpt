import type { WatchlistTools } from "../tools/watchlistTools.js";

type WatchlistView = Awaited<ReturnType<WatchlistTools["listWatchlist"]>>;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("cs-CZ", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPrice(value: unknown, currency: unknown): string {
  const formatted = formatNumber(value);
  if (!formatted) return "";
  return [formatted, typeof currency === "string" ? currency : ""].filter(Boolean).join(" ");
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  return value.slice(0, 10);
}

export function renderWatchlistHtml(view: WatchlistView): string {
  const rows = view.assets
    .map(
      (asset) => `
        <tr>
          <td class="ticker">${escapeHtml(asset.ticker)}</td>
          <td>
            <div class="name">${escapeHtml(asset.name ?? "Bez nazvu")}</div>
            <div class="muted">${escapeHtml(asset.assetType)}${asset.broker ? ` / ${escapeHtml(asset.broker)}` : ""}</div>
          </td>
          <td><span class="pill">${escapeHtml(asset.category)}</span></td>
          <td><span class="pill status">${escapeHtml(asset.status)}</span></td>
          <td>${escapeHtml(asset.conviction ?? "")}</td>
          <td class="number">${escapeHtml(formatPrice(asset.currentPrice, asset.currency) || "Cena nedostupná")}
            <div class="muted">${escapeHtml(asset.priceSource ?? "Bez kotace")} · ${escapeHtml(asset.lastPriceUpdate ?? "")}</div>
            <div class="muted">${escapeHtml(asset.priceStatus)}</div>
          </td>
          <td class="number">${escapeHtml(formatPrice(asset.targetBuyPrice, asset.currency))}</td>
          <td class="number">${escapeHtml(formatPrice(asset.targetSellPrice, asset.currency))}</td>
          <td>${escapeHtml(formatDate(asset.nextReviewDate))}</td>
          <td class="thesis">${escapeHtml(asset.thesisSummary ?? "")}</td>
        </tr>`,
    )
    .join("");

  const warnings = view.warnings.length
    ? `<section class="warnings">${view.warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</section>`
    : "";

  const emptyState = view.assets.length
    ? ""
    : `<tr><td colspan="10" class="empty">Watchlist je zatim prazdny.</td></tr>`;

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7f9;
        --panel: #ffffff;
        --ink: #17202a;
        --muted: #687382;
        --line: #dfe4ea;
        --accent: #0f766e;
        --accent-soft: #d8f3ee;
        --warn: #7c4a03;
        --warn-bg: #fff3cf;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .shell {
        width: min(1440px, calc(100% - 32px));
        margin: 0 auto;
        padding: 28px 0 40px;
      }

      header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 18px;
      }

      h1 {
        margin: 0;
        font-size: clamp(24px, 4vw, 38px);
        line-height: 1.1;
        letter-spacing: 0;
      }

      .subtitle {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 14px;
      }

      .stats {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .stat {
        min-width: 108px;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      .stat strong {
        display: block;
        font-size: 22px;
      }

      .stat span {
        color: var(--muted);
        font-size: 12px;
      }

      .warnings {
        margin: 0 0 14px;
        padding: 10px 14px;
        border: 1px solid #f0d586;
        border-radius: 8px;
        background: var(--warn-bg);
        color: var(--warn);
        font-size: 13px;
      }

      .warnings p {
        margin: 4px 0;
      }

      .table-wrap {
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        box-shadow: 0 12px 30px rgba(23, 32, 42, 0.06);
      }

      table {
        width: 100%;
        min-width: 1120px;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
        font-size: 14px;
      }

      th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: #eef2f5;
        color: #344054;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }

      tr:last-child td {
        border-bottom: 0;
      }

      .ticker {
        font-weight: 800;
        letter-spacing: 0;
      }

      .name {
        font-weight: 650;
      }

      .muted {
        color: var(--muted);
        font-size: 12px;
        margin-top: 3px;
      }

      .pill {
        display: inline-flex;
        max-width: 190px;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: #eef2f5;
        color: #344054;
        font-size: 12px;
        white-space: normal;
      }

      .pill.status {
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 700;
      }

      .number {
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }

      .thesis {
        min-width: 260px;
        color: #3f4a59;
      }

      .empty {
        padding: 34px;
        text-align: center;
        color: var(--muted);
      }

      footer {
        margin-top: 14px;
        color: var(--muted);
        font-size: 12px;
      }

      @media (max-width: 720px) {
        .shell {
          width: min(100% - 20px, 1440px);
          padding-top: 18px;
        }

        header {
          align-items: stretch;
          flex-direction: column;
        }

        .stats {
          justify-content: stretch;
        }

        .stat {
          flex: 1 1 120px;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header>
        <div>
          <h1>Watchlist</h1>
          <p class="subtitle">Jednoduchy prehled vsech polozek v investicnim watchlistu.</p>
        </div>
        <div class="stats" aria-label="Souhrn watchlistu">
          <div class="stat"><strong>${escapeHtml(view.summary.total)}</strong><span>polozek</span></div>
          <div class="stat"><strong>${escapeHtml(Object.keys(view.summary.byCategory).length)}</strong><span>kategorii</span></div>
          <div class="stat"><strong>${escapeHtml(view.priceProviderMode)}</strong><span>ceny</span></div>
        </div>
      </header>
      ${warnings}
      <section class="table-wrap" aria-label="Tabulka watchlistu">
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Nazev</th>
              <th>Kategorie</th>
              <th>Status</th>
              <th>Conviction</th>
              <th>Cena</th>
              <th>Target Buy</th>
              <th>Target Sell</th>
              <th>Dalsi review</th>
              <th>Teze</th>
            </tr>
          </thead>
          <tbody>
            ${rows || emptyState}
          </tbody>
        </table>
      </section>
      <footer>Vygenerovano ${escapeHtml(formatDate(view.generatedAt))}. JSON data jsou na /api/watchlist.</footer>
    </main>
  </body>
</html>`;
}
