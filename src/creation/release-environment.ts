import 'server-only';
import { databaseUrl, developmentDatabaseUrl } from '../participants/database-config.ts';

type Environment = Record<string, string | undefined>;
export type CreationEnvironment = 'development' | 'preview-testnet' | 'production-testnet';
const endpoint = (value: string | undefined) => !!value && /^ep-[a-z0-9-]+$/.test(value);
const developmentEndpoint = 'ep-twilight-voice-aorpfrbm';

/** Explicit release opt-in; NODE_ENV=production alone never opens Creation. */
export function creationEnvironment(env: Environment = process.env): CreationEnvironment | null {
  if (env.NODE_ENV === 'development' && (!env.VERCEL_ENV || env.VERCEL_ENV === 'development')) return 'development';
  if (env.NODE_ENV !== 'production' || env.YAWRD_ENABLE_CREATION_TESTNET_BETA !== '1') return null;
  const mode = env.YAWRD_CREATION_ENVIRONMENT;
  if (mode !== 'preview-testnet' && mode !== 'production-testnet') return null;
  if (env.VERCEL_ENV !== (mode === 'preview-testnet' ? 'preview' : 'production')) return null;
  try {
    const origin = new URL(env.YAWRD_APP_ORIGIN ?? '');
    if (origin.origin !== env.YAWRD_APP_ORIGIN || origin.protocol !== 'https:' || origin.username || origin.password) return null;
    if (mode === 'production-testnet' ? origin.origin !== 'https://yawrd.keelbase.io' : !origin.hostname.endsWith('.vercel.app')) return null;
    return mode;
  } catch { return null; }
}

/** Separate endpoint pins prevent a Preview from borrowing Production or Development. */
export function creationDatabaseUrl(env: Environment = process.env): string {
  const mode = creationEnvironment(env);
  if (mode === 'development') return developmentDatabaseUrl(env);
  if (!mode) throw Error('creation_environment_not_authorized');
  const url = new URL(databaseUrl(env));
  const actual = url.hostname.split('.')[0].replace(/-pooler$/, '');
  const target = env.YAWRD_CREATION_DATABASE_ENDPOINT, production = env.YAWRD_CREATION_PRODUCTION_ENDPOINT;
  if (!endpoint(target) || !endpoint(production) || actual !== target || actual === developmentEndpoint ||
      (mode === 'preview-testnet' ? actual === production : actual !== production) ||
      !['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') ||
      !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '') || url.hash ||
      decodeURIComponent(url.username) !== 'yawrd_07b_runtime' || url.pathname !== '/neondb')
    throw Error('creation_database_target_unconfirmed');
  return url.toString();
}
export type CreationAction = 'deployment' | 'hardening' | 'fee' | 'generation' | 'publication';
const flags: Record<CreationAction, string> = {
  deployment: 'YAWRD_ENABLE_CREATION_DEPLOYMENT', hardening: 'YAWRD_ENABLE_CREATION_HARDENING',
  fee: 'YAWRD_ENABLE_CREATION_PLATFORM_FEE_PAYMENT', generation: 'YAWRD_ENABLE_CREATION_PREPARATION',
  publication: 'YAWRD_ENABLE_CREATION_PUBLICATION',
};
export function creationActionEnabled(action: CreationAction, env: Environment = process.env): boolean {
  const mode = creationEnvironment(env);
  if (mode === 'development' && (action === 'publication' || action === 'hardening')) return true;
  return !!mode && env[flags[action]] === '1';
}
