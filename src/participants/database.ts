import 'server-only';
import { databaseUrl } from './database-config.ts';

export type Row = Record<string, unknown>;
export type Query = (text: string, values?: unknown[]) => Promise<Row[]>;

// Lazy initialization: builds and the public fixture need no database connection.
export const database: Query = async (text, values = []) => {
  const url = databaseUrl();
  const { neon } = await import('@neondatabase/serverless');
  return neon(url).query(text, values, { fetchOptions: { signal: AbortSignal.timeout(10000), cache: 'no-store' } });
};
