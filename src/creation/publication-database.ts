import 'server-only';
import type { Query } from '../participants/database.ts';
import { databaseUrl } from '../participants/database-config.ts';

/** A separate login in the SAME database. Never fall back to the shared SQL role. */
export function publicationDatabaseUrl(env: Record<string, string | undefined> = process.env) {
  const runtime = new URL(databaseUrl(env));
  const value = env.YAWRD_PUBLICATION_DATABASE_URL;
  if (!value) throw new Error('publication_storage_required');
  const url = new URL(value);
  const endpoint = url.hostname.split('.')[0].replace(/-pooler$/, '');
  if (!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') ||
      !['require','verify-full'].includes(url.searchParams.get('sslmode') ?? '') || !/^ep-[a-z0-9-]+$/.test(endpoint) ||
      endpoint !== env.YAWRD_PUBLICATION_DATABASE_ENDPOINT || url.hash)
    throw new Error('publication_database_target_unconfirmed');
  if (url.hostname.replace('-pooler.', '.') !== runtime.hostname.replace('-pooler.', '.') || url.pathname !== runtime.pathname ||
      decodeURIComponent(url.username) !== 'yawrd_publication_writer' || url.username === runtime.username)
    throw new Error('publication_database_boundary_required');
  return value;
}
export const publicationDatabase: Query = async (sql, values = []) => {
  const url = publicationDatabaseUrl();
  const { neon } = await import('@neondatabase/serverless');
  return neon(url).query(sql, values, { fetchOptions: { signal: AbortSignal.timeout(10000), cache: 'no-store' } });
};
