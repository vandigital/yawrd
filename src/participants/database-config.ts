type DatabaseEnvironment = { [key: string]: string | undefined };

// DATABASE_URL is the owner-configured server-only setting. Keep the original
// name compatible, but fail closed if two different targets are configured.
export function databaseUrl(env: DatabaseEnvironment = process.env): string {
  if (env.DATABASE_URL && env.YAWRD_DATABASE_URL && env.DATABASE_URL !== env.YAWRD_DATABASE_URL) throw new Error('database_configuration_conflict');
  const url = env.DATABASE_URL || env.YAWRD_DATABASE_URL;
  if (!url) throw new Error('database_unavailable');
  return url;
}

// An endpoint is not a branch name. The owner must independently confirm its
// development-branch mapping in Neon before configuring this non-secret pin.
export function developmentDatabaseUrl(env: DatabaseEnvironment = process.env): string {
  const value = databaseUrl(env);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('invalid_development_database'); }
  const endpoint = url.hostname.split('.')[0].replace(/-pooler$/, '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') ||
      !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '') ||
      !/^ep-[a-z0-9-]+$/.test(endpoint) || endpoint !== env.YAWRD_DEV_DATABASE_ENDPOINT) {
    throw new Error('development_database_target_unconfirmed');
  }
  return value;
}

// Administrative commands never fall back to the application's runtime login.
export function developmentMigrationDatabaseUrl(env: DatabaseEnvironment = process.env): string {
  if (!env.YAWRD_MIGRATION_DATABASE_URL) throw new Error('migration_database_unavailable');
  return developmentDatabaseUrl({ DATABASE_URL: env.YAWRD_MIGRATION_DATABASE_URL, YAWRD_DEV_DATABASE_ENDPOINT: env.YAWRD_DEV_DATABASE_ENDPOINT });
}

// Test writes require an explicit opt-in as well as the independently confirmed
// development endpoint. No URL is copied to another setting to bypass a guard.
export function integrationDatabaseUrl(env: DatabaseEnvironment = process.env): string | null {
  const development = env.YAWRD_TEST_DATABASE_DEVELOPMENT === '1';
  const disposable = env.YAWRD_TEST_DATABASE_DISPOSABLE === '1';
  if (!development && !disposable) return null;
  if (development && disposable) throw new Error('conflicting_integration_database_modes');
  if (development) return developmentDatabaseUrl(env);
  if (!env.YAWRD_TEST_DATABASE_URL) throw new Error('test_database_unavailable');
  const testUrl = developmentDatabaseUrl({ DATABASE_URL: env.YAWRD_TEST_DATABASE_URL, YAWRD_DEV_DATABASE_ENDPOINT: env.YAWRD_DEV_DATABASE_ENDPOINT });
  const target = new URL(testUrl);
  for (const value of [env.DATABASE_URL, env.YAWRD_DATABASE_URL]) {
    if (!value) continue;
    let app: URL;
    try { app = new URL(value); } catch { throw new Error('invalid_application_database'); }
    if (app.hostname.replace('-pooler.', '.') === target.hostname.replace('-pooler.', '.') && app.pathname === target.pathname) throw new Error('disposable_database_matches_application');
  }
  return testUrl;
}
