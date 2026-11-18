import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(path.join(webRoot, ".env.local"));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  const userA = `test-lc-a-${crypto.randomUUID()}`;
  const userB = `test-lc-b-${crypto.randomUUID()}`;

  await client.query("BEGIN");
  try {
    // Seed wallet + category for userA
    const wA = (
      await client.query(
        "INSERT INTO public.kc_wallets(user_id, name, opening_balance_cents, opening_at) VALUES($1, 'Conta A', 100000, now()) RETURNING id",
        [userA]
      )
    ).rows[0].id;
    const catA = (
      await client.query(
        "INSERT INTO public.kc_categories(user_id, name, direction, canonical_key) VALUES($1, 'Alimentacao', 'expense', 'expense.alimentacao') RETURNING id",
        [userA]
      )
    ).rows[0].id;

    // 1. Create spending plan (LC-02, LC-19 idempotency)
    const idemPlan = crypto.randomUUID();
    const p1 = (
      await client.query(
        "SELECT public.kc_create_spending_plan($1, 'Mercado', $2::uuid, NULL, 30000, '2026-12-01'::date, '2026-12', NULL, $3::uuid) AS info",
        [userA, catA, idemPlan]
      )
    ).rows[0].info;
    const p1Retry = (
      await client.query(
        "SELECT public.kc_create_spending_plan($1, 'Mercado', $2::uuid, NULL, 30000, '2026-12-01'::date, '2026-12', NULL, $3::uuid) AS info",
        [userA, catA, idemPlan]
      )
    ).rows[0].info;
    assert.equal(p1.plan_id, p1Retry.plan_id);
    assert.equal(p1Retry.idempotent, true);

    // 2. Partial purchase R$ 100 (LC-04) keeping remaining R$ 200
    const ev1 = (
      await client.query(
        "SELECT public.kc_create_financial_event($1, $2::uuid, 'expense', 'Mercado 1', $3::uuid, NULL, 'Alimentacao', NULL, 10000, '2026-11-17'::date, '2026-11-17'::date, 'single', 1, 1, 'total', 'paid', '2026-11-17'::date, $4::uuid) AS info",
        [userA, wA, catA, crypto.randomUUID()]
      )
    ).rows[0].info;
    const rec1 = (
      await client.query(
        "SELECT public.kc_apply_event_to_spending_plan($1, $2::uuid, $3::uuid, NULL, false, $4::uuid) AS info",
        [userA, p1.plan_id, ev1.event_id, crypto.randomUUID()]
      )
    ).rows[0].info;
    assert.equal(rec1.status, "partially_fulfilled");
    assert.equal(Number(rec1.remaining_cents), 20000);

    // 3. Cross-user isolation (LC-18): userB cannot reconcile userA's plan
    let crossUserRejected = false;
    try {
      await client.query("SAVEPOINT sp_iso");
      await client.query(
        "SELECT public.kc_apply_event_to_spending_plan($1, $2::uuid, $3::uuid, NULL, true, $4::uuid)",
        [userB, p1.plan_id, ev1.event_id, crypto.randomUUID()]
      );
    } catch {
      crossUserRejected = true;
      await client.query("ROLLBACK TO SAVEPOINT sp_iso");
    }
    assert.equal(crossUserRejected, true);

    // 4. Second purchase R$ 250 (total 350 > 300 estimate — LC-05) closes plan without extra expense
    const ev2 = (
      await client.query(
        "SELECT public.kc_create_financial_event($1, $2::uuid, 'expense', 'Mercado 2', $3::uuid, NULL, 'Alimentacao', NULL, 25000, '2026-11-17'::date, '2026-11-17'::date, 'single', 1, 1, 'total', 'paid', '2026-11-17'::date, $4::uuid) AS info",
        [userA, wA, catA, crypto.randomUUID()]
      )
    ).rows[0].info;
    const rec2 = (
      await client.query(
        "SELECT public.kc_apply_event_to_spending_plan($1, $2::uuid, $3::uuid, NULL, false, $4::uuid) AS info",
        [userA, p1.plan_id, ev2.event_id, crypto.randomUUID()]
      )
    ).rows[0].info;
    assert.equal(rec2.status, "fulfilled");
    assert.equal(Number(rec2.remaining_cents), 0);

    const eventsCount = (
      await client.query("SELECT COUNT(*)::int AS c FROM public.kc_economic_events WHERE user_id = $1", [userA])
    ).rows[0].c;
    assert.equal(eventsCount, 2);

    console.log("DB integration verification (LC-02, LC-04, LC-05, LC-18, LC-19): PASSED (rolled back cleanly).");
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("DB integration test FAILED:", err);
  process.exit(1);
});
