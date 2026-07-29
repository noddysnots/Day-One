/**
 * Applies supabase/schema.sql over a real Postgres connection.
 *
 * The direct db.<ref>.supabase.co host no longer resolves, so this discovers which regional
 * pooler actually accepts the project's credentials and caches the answer as DATABASE_URL in
 * .env.local (gitignored). The password is passed as a discrete config field, never
 * interpolated into a shell command or a URL, because it contains a $.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFile, appendFile } from 'node:fs/promises';
import { Client, type ClientConfig } from 'pg';

const REGIONS = [
  'ap-south-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'ap-southeast-1',
  'ap-northeast-1',
  'ap-southeast-2',
  'sa-east-1',
  'ca-central-1',
];

function candidates(ref: string, password: string): { label: string; config: ClientConfig }[] {
  const list: { label: string; config: ClientConfig }[] = [
    {
      label: `db.${ref}.supabase.co:5432 (direct)`,
      config: { host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password, database: 'postgres' },
    },
  ];
  for (const region of REGIONS) {
    for (const prefix of ['aws-0', 'aws-1']) {
      list.push({
        label: `${prefix}-${region}.pooler.supabase.com:5432 (session)`,
        config: {
          host: `${prefix}-${region}.pooler.supabase.com`,
          port: 5432,
          user: `postgres.${ref}`,
          password,
          database: 'postgres',
        },
      });
    }
  }
  return list;
}

async function connect(ref: string, password: string) {
  for (const candidate of candidates(ref, password)) {
    const client = new Client({
      ...candidate.config,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
      statement_timeout: 120_000,
    });
    try {
      await client.connect();
      const { rows } = await client.query('select current_database() db, version() v');
      console.log(`connected: ${candidate.label}`);
      console.log(`  ${rows[0].db} — ${String(rows[0].v).split(' ').slice(0, 2).join(' ')}\n`);
      return { client, label: candidate.label, config: candidate.config };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const brief = /ENOTFOUND|EAI_AGAIN/.test(msg) ? 'no DNS' : msg.slice(0, 80);
      console.log(`  ${candidate.label.padEnd(58)} ${brief}`);
      await client.end().catch(() => {});
    }
  }
  throw new Error('No Supabase Postgres endpoint accepted these credentials.');
}

async function main() {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) throw new Error('SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD must be in .env.local');
  console.log(`password loaded: ${password.length} chars, contains $: ${password.includes('$')}\n`);

  const { client, config: chosen } = await connect(ref, password);

  try {
    const sql = await readFile('supabase/schema.sql', 'utf8');
    console.log(`applying supabase/schema.sql (${sql.length} chars)`);
    await client.query(sql);
    console.log('schema applied\n');

    const { rows: tables } = await client.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`,
    );
    console.log(`public tables (${tables.length}): ${tables.map((t) => t.table_name).join(', ')}`);

    const { rows: cols } = await client.query(
      `select table_name, column_name from information_schema.columns
       where table_schema='public' and column_name in ('po_date','case_no','transcript')
       order by table_name, column_name`,
    );
    console.log('added columns: ' + cols.map((c) => `${c.table_name}.${c.column_name}`).join(', '));

    if (!process.env.DATABASE_URL) {
      const url = `postgresql://${chosen.user}:${encodeURIComponent(password)}@${chosen.host}:${chosen.port}/postgres`;
      await appendFile('.env.local', `\n# Discovered working endpoint. Password is URL-encoded here.\nDATABASE_URL='${url}'\n`);
      console.log('\ncached DATABASE_URL in .env.local');
    }
  } finally {
    await client.end();
  }
}

void main().catch((e) => {
  console.error('\napply-schema failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
