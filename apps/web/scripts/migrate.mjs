import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const dbDir = path.join(webRoot, "db");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(webRoot, ".env.local"));
loadEnvFile(path.join(webRoot, ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (
  !databaseUrl ||
  databaseUrl.includes("replace-me") ||
  databaseUrl.includes("USER:PASSWORD")
) {
  console.error(
    "Erro: configure DATABASE_URL real em apps/web/.env.local antes de rodar as migrations."
  );
  process.exit(1);
}

const statusOnly = process.argv.includes("--status");
const migrationFiles = readdirSync(dbDir)
  .filter((name) => /^\d{3}_.*\.sql$/.test(name))
  .sort();

const pool = new Pool({ connectionString: databaseUrl });

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.kc_schema_migrations (
      filename TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function main() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const { rows } = await client.query(
      "SELECT filename, sha256, applied_at FROM public.kc_schema_migrations ORDER BY filename"
    );
    const applied = new Map(rows.map((r) => [r.filename, r]));

    if (statusOnly) {
      console.log("Status das migrations (banco <-> repositorio):");
      for (const file of migrationFiles) {
        const sqlText = readFileSync(path.join(dbDir, file), "utf8");
        const hash = sha256(sqlText);
        const record = applied.get(file);
        if (!record) {
          console.log(`  [PENDENTE] ${file}`);
        } else if (record.sha256 !== hash) {
          console.log(`  [MODIFICADA] ${file} (checksum diferente do aplicado)`);
        } else {
          console.log(`  [APLICADA] ${file}`);
        }
      }
      return;
    }

    let appliedCount = 0;
    for (const file of migrationFiles) {
      const sqlText = readFileSync(path.join(dbDir, file), "utf8");
      const hash = sha256(sqlText);
      const record = applied.get(file);
      if (record) {
        if (record.sha256 !== hash) {
          throw new Error(
            `Migration ${file} ja foi aplicada com outro checksum. Nao edite migrations aplicadas; crie uma nova.`
          );
        }
        console.log(`[skip] ${file} (ja aplicada)`);
        continue;
      }

      console.log(`[apply] ${file}...`);
      await client.query("BEGIN");
      try {
        await client.query(sqlText);
        await client.query(
          "INSERT INTO public.kc_schema_migrations (filename, sha256) VALUES ($1, $2)",
          [file, hash]
        );
        await client.query("COMMIT");
        appliedCount++;
        console.log(`[ok] ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log(
      appliedCount === 0
        ? "Banco ja esta sincronizado com todas as migrations."
        : `Concluido: ${appliedCount} migration(s) aplicada(s) com sucesso.`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha na migration:", err?.message || err);
  process.exit(1);
});
