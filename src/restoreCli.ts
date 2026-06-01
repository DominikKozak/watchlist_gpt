import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { importWatchlistBackup } from "./backup/importBackup.js";
import { validateRestoreMode } from "./backup/backupFormat.js";
import { createDb } from "./db/client.js";
import { initializeDatabase } from "./db/schema.js";

dotenv.config();

const backupPath = process.argv[2];
if (!backupPath) {
  throw new Error("Usage: npm run restore -- path/to/backup.json");
}

const restoreMode = validateRestoreMode(process.env.RESTORE_MODE ?? "upsert");
if (restoreMode === "replace_all" && process.env.RESTORE_MODE !== "replace_all") {
  throw new Error("replace_all restore requires RESTORE_MODE=replace_all.");
}

const resolvedBackupPath = path.resolve(backupPath);
const backup = JSON.parse(fs.readFileSync(resolvedBackupPath, "utf8")) as unknown;
const db = createDb();
initializeDatabase(db);

try {
  const summary = importWatchlistBackup(db, backup, { mode: restoreMode });
  console.log(JSON.stringify({ restoredFrom: resolvedBackupPath, summary }, null, 2));
} finally {
  db.close();
}
