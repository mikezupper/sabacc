// `node src/server/backup.ts`: copy the database to DATA_DIR/backups (a consistent
// snapshot, safe while the server runs) and keep the newest KEEP_BACKUPS (14).
import { mkdirSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

const dataDir = process.env["DATA_DIR"] ?? ".data"
const keep = Number(process.env["KEEP_BACKUPS"] ?? 14)
const dir = join(dataDir, "backups")
mkdirSync(dir, { recursive: true })

const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const target = join(dir, `sabacc-${stamp}.db`)
const db = new DatabaseSync(join(dataDir, "sabacc.db"))
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`)
db.close()

const old = readdirSync(dir).filter((f) => f.startsWith("sabacc-") && f.endsWith(".db")).sort().reverse().slice(keep)
for (const f of old) rmSync(join(dir, f))
console.log(JSON.stringify({ message: "backup written", file: target, removed: old.length }))
