import { readFileSync } from "node:fs";
import { Client } from "pg";

const PW = process.env.SUPA_DB_PW;
const REF = "uiqugjlpkbzpujrisfgg";
const sql = readFileSync(new URL("../supabase/migrations/202608040001_initial_schema.sql", import.meta.url), "utf8");

const attempts = [
  { host: `db.${REF}.supabase.co`, port: 5432, user: "postgres" },
  { host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-1-eu-west-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-1-eu-west-2.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-1-us-east-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { host: "aws-0-eu-central-2.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
];

for (const { host, port, user } of attempts) {
  const client = new Client({
    host,
    port,
    database: "postgres",
    user,
    password: PW,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    console.log("CONNECTED via", host);
    await client.query(sql);
    console.log("MIGRATION APPLIED OK");
    const r = await client.query("select table_name from information_schema.tables where table_schema='public' order by table_name;");
    console.log("TABLES:", r.rows.map(x => x.table_name).join(", "));
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log(`FAIL ${host}: ${e.message}`);
    try { await client.end(); } catch {}
  }
}
console.error("ALL HOSTS FAILED");
process.exit(1);
