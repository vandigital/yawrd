import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function migrate(sql) {
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(f => /^\d{3}_[a-z_]+\.sql$/.test(f)).sort()) {
    const source = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(source).digest('hex');
    // Only repository-controlled migration names, checksums and SQL enter DDL.
    if (source.includes('$yawrd_migration$')) throw new Error('Reserved migration delimiter');
    await sql.transaction([
      sql.query('SELECT pg_advisory_xact_lock(707071)'),
      sql.query('CREATE TABLE IF NOT EXISTS public.yawrd_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())'),
      sql.query(`DO $yawrd_migration$ BEGIN
        IF EXISTS (SELECT 1 FROM public.yawrd_migrations WHERE version = '${file}' AND checksum <> '${checksum}') THEN
          RAISE EXCEPTION 'Migration checksum changed';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.yawrd_migrations WHERE version = '${file}') THEN
          ${source}
          INSERT INTO public.yawrd_migrations(version, checksum) VALUES ('${file}', '${checksum}');
        END IF;
      END $yawrd_migration$`),
    ]);
  }
}
