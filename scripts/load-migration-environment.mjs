// Explicit operator/test processes only. Next.js does not load this file.
import './load-environment.mjs';
import { readFile } from 'node:fs/promises';
if (!process.env.YAWRD_MIGRATION_DATABASE_URL) {
  try {
    const settings = JSON.parse(await readFile(new URL('../.env.migrations.local', import.meta.url), 'utf8'));
    if (typeof settings.YAWRD_MIGRATION_DATABASE_URL !== 'string') throw new Error();
    process.env.YAWRD_MIGRATION_DATABASE_URL = settings.YAWRD_MIGRATION_DATABASE_URL;
  } catch {
    // The guarded caller supplies a sanitized configuration error.
  }
}
