import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { exportWatchlistBackup } from "./backup/exportBackup.js";
import { createDb } from "./db/client.js";
import { initializeDatabase } from "./db/schema.js";

dotenv.config();

function timestampForFilename(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

const db = createDb();
await initializeDatabase(db);

try {
  const backup = await exportWatchlistBackup(db);
  const backupDir = path.resolve("backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `watchlist-${timestampForFilename()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup written to ${backupPath}`);
} finally {
  await db.close();
}
