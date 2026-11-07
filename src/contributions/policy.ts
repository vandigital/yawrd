import 'server-only';
import { createHash } from 'node:crypto';
import { databaseUrl, developmentDatabaseUrl } from '../participants/database-config.ts';
import type { Query } from '../participants/database.ts';
import type { TaskRef } from './types.ts';
// Private submission identity; this does not grant profile publication permission.
export const TASK_B_PARTICIPANT = 'keelbase1.testnet';
export const TASK_B_RECIPIENT = 'keelbase1.testnet';

// Trusted server manifest. No GitHub author/agent credit establishes wallet ownership.
export const CONTRIBUTION_TASKS = Object.freeze({
  'task-a': Object.freeze({ title: 'Task A · Project Progress', prUrl: 'https://github.com/vandigital/yawrd-build-progress/pull/2', head: 'a97c28df2c86b80a7ff161ab82cc13fc6fcdd6c8', merge: 'aede263a82da7514f9eac9e4436ba3113a1eebd3', historicalNote: 'Previously founder-approved work. The historical acceptance date is unconfirmed; merge time is separate.' }),
  'task-b': Object.freeze({ title: 'Task B · Crew & Contributions', prUrl: 'https://github.com/vandigital/yawrd-build-progress/pull/4', head: 'c0c4277839e9c5d8b563970306a9dbde782babe1', merge: '26d2d5e8b087749f47696ee27732a42f32929da7', historicalNote: 'The preserved PR reports full Task B acceptance on November 6, 2026. No exact acceptance instant is established.' }),
});
export type ContributionActivation = {
  enabled: boolean; migrationVerified: boolean; permissionsVerified: boolean;
  databaseTestsVerified: boolean; recipientPolicyApproved: boolean; taskMappingVerified: boolean;
  submissionSignatureVerified: boolean;
  owners: Readonly<Record<TaskRef, string | null>>;
};
// Accepted M08 migration/permission/database verification, fixed recipient and
// approved membership, and reviewed/tested signed submission implementation.
// Development uses these decisions after its unchanged local boundary/identity
// check. Production additionally requires its own role, ledger and schema proof.
const DEVELOPMENT_READINESS = Object.freeze({ migrationVerified: true, permissionsVerified: true, databaseTestsVerified: true, recipientPolicyApproved: true, taskMappingVerified: true, submissionSignatureVerified: true });
const INACTIVE_READINESS = Object.freeze({ migrationVerified: false, permissionsVerified: false, databaseTestsVerified: false, recipientPolicyApproved: false, taskMappingVerified: false, submissionSignatureVerified: false });
const OWNERS = Object.freeze({ 'task-a': null, 'task-b': TASK_B_PARTICIPANT });
const DEVELOPMENT_ENDPOINT = 'ep-twilight-voice-aorpfrbm';
const RUNTIME_ROLE = 'yawrd_07b_runtime';
const PRODUCTION_ENDPOINT = 'ep-restless-frost-aoun3ads';
const MIGRATION_006 = '006_yaw001_contribution_events.sql';
const MIGRATION_006_CHECKSUM = 'b555fc6271ab9635fd30dd9737207175bee0ba397443b0a55c7e3c92f6129c30';
// Function-body fingerprints from the unchanged, reviewed 006 and 001 sources.
const INSERT_GUARD_CHECKSUM = 'e4329a297172b41847f4d478868fe849da34a4c9da79f52bb4fe6b8021dd0b88';
const IMMUTABILITY_CHECKSUM = '54c42f93df0dc06f95bef95babfc14e1360c2957fec239ca76a4cbe7a319c0c2';
const EVENT_COLUMNS = ['network', 'project_id', 'task_ref', 'event_kind', 'pr_url', 'pr_head_sha', 'merge_commit_sha',
  'actor_account_id', 'application_id', 'description', 'recipient_account_id', 'consent_version',
  'historical_accepted_on', 'historical_accepted_at', 'historical_acceptance_evidence', 'recorded_at', 'request_event_kind'];
const EVENT_TYPES = EVENT_COLUMNS.map(name => name === 'application_id' ? 'uuid' : name === 'historical_accepted_on' ? 'date'
  : name === 'historical_accepted_at' || name === 'recorded_at' ? 'timestamp with time zone' : 'text');
type Environment = Record<string, string | undefined>;

function developmentConnection(env: Environment): string | null {
  if (env.NODE_ENV !== 'development' || env.YAWRD_ENABLE_YAW001_CONTRIBUTIONS !== '1') return null;
  try {
    const origin = new URL(env.YAWRD_APP_ORIGIN ?? '');
    if (origin.origin !== env.YAWRD_APP_ORIGIN || origin.hostname !== 'localhost' || origin.username || origin.password
      || !(origin.protocol === 'https:' || (origin.protocol === 'http:' && env.YAWRD_ALLOW_HTTP_LOCALHOST === '1'))) return null;
    // The caller cannot redirect this boundary by supplying another endpoint pin.
    if (env.YAWRD_DEV_DATABASE_ENDPOINT && env.YAWRD_DEV_DATABASE_ENDPOINT !== DEVELOPMENT_ENDPOINT) return null;
    const connection = developmentDatabaseUrl({ ...env, YAWRD_DEV_DATABASE_ENDPOINT: DEVELOPMENT_ENDPOINT });
    const url = new URL(connection);
    const options = [...url.searchParams.keys()];
    if (decodeURIComponent(url.pathname) !== '/neondb' || decodeURIComponent(url.username) !== RUNTIME_ROLE
      || !url.password || (url.port && url.port !== '5432') || url.hash
      || options.some(key => key !== 'sslmode' && key !== 'channel_binding')
      || new Set(options).size !== options.length) return null;
    return connection;
  } catch { return null; }
}

function productionConnection(env: Environment): { connection: string; role: string } | null {
  if (env.NODE_ENV !== 'production' || env.YAWRD_ENABLE_YAW001_CONTRIBUTIONS !== '1'
    || env.YAWRD_APP_ORIGIN !== 'https://yawrd.keelbase.io') return null;
  try {
    const connection = databaseUrl(env);
    const url = new URL(connection);
    const role = decodeURIComponent(url.username);
    const options = [...url.searchParams.keys()];
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech')
      || url.hostname.split('.')[0].replace(/-pooler$/, '') !== PRODUCTION_ENDPOINT
      || decodeURIComponent(url.pathname) !== '/neondb' || (url.port && url.port !== '5432')
      || !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')
      || !role || ['neondb_owner', 'postgres', 'neon_superuser'].includes(role) || !url.password || url.hash
      || options.some(key => key !== 'sslmode' && key !== 'channel_binding')
      || new Set(options).size !== options.length) return null;
    // No Production role name is inferred from Development. The configured
    // login must prove its actual identity, attributes and effective grants.
    return { connection, role };
  } catch { return null; }
}

async function productionReady(query: Query, role: string): Promise<boolean> {
  const identity = await query(`SELECT current_database() AS database_name,
    current_user AS current_role, session_user AS login_role,
    r.rolcanlogin AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR r.rolinherit)
      AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) AS restricted,
    NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner = r.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner = r.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = r.oid)
      AND NOT has_database_privilege(current_user, current_database(), 'CREATE,TEMP')
      AND NOT has_schema_privilege(current_user, 'yawrd', 'CREATE')
      AND NOT has_schema_privilege(current_user, 'public', 'CREATE') AS no_ownership_or_ddl,
    has_schema_privilege(current_user, 'yawrd', 'USAGE')
      AND (SELECT bool_and(has_table_privilege(current_user, name, 'SELECT')) FROM unnest($1::text[]) AS t(name))
      AND (SELECT bool_and(has_table_privilege(current_user, name, 'INSERT')) FROM unnest($2::text[]) AS t(name))
      AND has_column_privilege(current_user, 'yawrd.auth_challenges', 'consumed_at', 'UPDATE')
      AND has_column_privilege(current_user, 'yawrd.sessions', 'revoked_at', 'UPDATE')
      AND has_column_privilege(current_user, 'yawrd.auth_rate_limits', 'attempts', 'UPDATE')
      AND has_column_privilege(current_user, 'yawrd.auth_rate_limits', 'resets_at', 'UPDATE')
      AND (SELECT bool_and(NOT has_table_privilege(current_user, name, 'DELETE,TRUNCATE,REFERENCES,TRIGGER')) FROM unnest($2::text[]) AS t(name))
      AND NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class t ON t.oid = a.attrelid JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'yawrd' AND t.relname IN ('auth_challenges', 'sessions', 'auth_rate_limits')
          AND a.attnum > 0 AND NOT a.attisdropped AND has_column_privilege(current_user, t.oid, a.attname, 'UPDATE') IS DISTINCT FROM
          ((t.relname = 'auth_challenges' AND a.attname = 'consumed_at') OR (t.relname = 'sessions' AND a.attname = 'revoked_at')
            OR (t.relname = 'auth_rate_limits' AND a.attname IN ('attempts', 'resets_at')))) AS auth_permissions,
    NOT has_any_column_privilege(current_user, 'public.yawrd_migrations', 'INSERT')
      AND NOT has_any_column_privilege(current_user, 'public.yawrd_migrations', 'UPDATE')
      AND NOT has_table_privilege(current_user, 'public.yawrd_migrations', 'DELETE,TRUNCATE,REFERENCES,TRIGGER') AS ledger_read_only
    FROM pg_roles r WHERE r.rolname = current_user`,
  [['yawrd.projects', 'yawrd.applications', 'yawrd.review_decisions', 'yawrd.sessions', 'yawrd.auth_challenges', 'yawrd.auth_rate_limits'],
    ['yawrd.auth_challenges', 'yawrd.sessions', 'yawrd.auth_rate_limits']]);
  const runtime = identity[0];
  if (identity.length !== 1 || runtime.database_name !== 'neondb' || runtime.current_role !== role || runtime.login_role !== role
    || !['restricted', 'no_ownership_or_ddl', 'auth_permissions', 'ledger_read_only'].every(key => runtime[key] === true)) return false;
  // This existing metadata table requires SELECT(version, checksum) only, never
  // an owner connection, role switch, ledger write or caller-supplied attestation.
  const ledger = await query('SELECT version, checksum FROM public.yawrd_migrations WHERE version = $1', [MIGRATION_006]);
  if (ledger.length !== 1 || ledger[0].version !== MIGRATION_006 || ledger[0].checksum !== MIGRATION_006_CHECKSUM) return false;
  const rows = await query(`SELECT c.relkind = 'r' AND c.relpersistence = 'p' AND NOT c.relrowsecurity AS durable_table,
    ARRAY(SELECT attname::text FROM pg_attribute WHERE attrelid = c.oid AND attnum > 0 AND NOT attisdropped ORDER BY attnum) AS columns,
    ARRAY(SELECT format_type(atttypid, atttypmod) FROM pg_attribute WHERE attrelid = c.oid AND attnum > 0 AND NOT attisdropped ORDER BY attnum) AS types,
    NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = c.oid AND attnum > 0 AND NOT attisdropped
      AND attnotnull IS DISTINCT FROM (attnum = ANY(ARRAY[1,2,3,4,5,6,7,8,12,16]))) AS nullability,
    (SELECT pg_get_expr(d.adbin, d.adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
      WHERE d.adrelid = c.oid AND a.attname = 'request_event_kind' AND a.attgenerated = 's') AS generated_link,
    (SELECT count(*) FILTER (WHERE contype <> 'n') = 13
      AND bool_and(convalidated AND COALESCE((to_jsonb(k)->>'conenforced')::boolean, true))
      FROM pg_constraint k WHERE conrelid = c.oid) AS validated_constraints,
    (SELECT count(*) = 3 FROM pg_constraint WHERE conrelid = c.oid AND contype = 'c'
      AND conname IN ('yaw001_canonical_pr', 'yaw001_event_payload', 'yaw001_historical_time')) AS payload_constraints,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = c.oid AND contype = 'p' AND conkey = ARRAY[1,2,3,4]::smallint[]) AS event_key,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = c.oid AND contype = 'u' AND conkey = ARRAY[1,2,5,4]::smallint[]) AS evidence_key,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = c.oid AND contype = 'f' AND conkey = ARRAY[1,2]::smallint[]
      AND confrelid = to_regclass('yawrd.projects') AND confkey = ARRAY[1,2]::smallint[]) AS project_fk,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = c.oid AND contype = 'f' AND conkey = ARRAY[9,1,2]::smallint[]
      AND confrelid = to_regclass('yawrd.applications') AND confkey = ARRAY[1,2,3]::smallint[]) AS application_fk,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = c.oid AND conname = 'yaw001_acknowledgement_request_fk'
      AND contype = 'f' AND confrelid = c.oid AND NOT condeferrable AND confmatchtype = 's'
      AND confupdtype = 'a' AND confdeltype = 'a'
      AND conkey = ARRAY[1,2,3,17]::smallint[] AND confkey = ARRAY[1,2,3,4]::smallint[]) AS matching_request_fk,
    (SELECT count(*) = 2 AND bool_and(indisvalid AND indisready AND indisunique) FROM pg_index WHERE indrelid = c.oid) AS indexes_ready,
    (SELECT count(*) = 2 AND bool_and(tgenabled = 'O') AND bool_and(
      (tgname = 'check_yaw001_contribution_event' AND tgtype = 7 AND tgfoid = to_regprocedure('yawrd.check_yaw001_contribution_event()')) OR
      (tgname = 'immutable_yaw001_contribution_events' AND tgtype = 27 AND tgfoid = to_regprocedure('yawrd.prevent_mutation()')))
      FROM pg_trigger WHERE tgrelid = c.oid AND NOT tgisinternal) AS enabled_guards,
    (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('yawrd.check_yaw001_contribution_event()') AND NOT prosecdef
      AND proconfig = ARRAY['search_path=pg_catalog, yawrd']) AS insert_guard,
    (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('yawrd.prevent_mutation()') AND NOT prosecdef) AS immutability_guard,
    has_table_privilege(current_user, c.oid, 'SELECT')
      AND (SELECT bool_and(has_column_privilege(current_user, c.oid, name, 'INSERT')) FROM unnest($1::text[]) AS t(name))
      AND NOT has_column_privilege(current_user, c.oid, 'recorded_at', 'INSERT')
      AND NOT has_column_privilege(current_user, c.oid, 'request_event_kind', 'INSERT')
      AND NOT has_any_column_privilege(current_user, c.oid, 'UPDATE')
      AND NOT has_function_privilege(current_user, to_regprocedure('yawrd.check_yaw001_contribution_event()'), 'EXECUTE')
      AND NOT has_table_privilege(current_user, c.oid, 'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS event_permissions
    FROM pg_class c WHERE c.oid = to_regclass('yawrd.yaw001_contribution_events')`, [EVENT_COLUMNS.slice(0, 15)]);
  if (rows.length !== 1) return false;
  const schema = rows[0];
  const checks = ['durable_table', 'nullability', 'validated_constraints', 'payload_constraints', 'event_key', 'evidence_key',
    'project_fk', 'application_fk', 'matching_request_fk', 'indexes_ready', 'enabled_guards', 'event_permissions'];
  const hash = (value: unknown) => typeof value === 'string' ? createHash('sha256').update(value).digest('hex') : null;
  return checks.every(key => schema[key] === true)
    && JSON.stringify(schema.columns) === JSON.stringify(EVENT_COLUMNS) && JSON.stringify(schema.types) === JSON.stringify(EVENT_TYPES)
    && typeof schema.generated_link === 'string'
    && schema.generated_link.replace(/\s+|::text|\(|\)/g, '') === "CASEWHENevent_kind='acknowledgement'THEN'request'ELSENULLEND"
    && hash(schema.insert_guard) === INSERT_GUARD_CHECKSUM && hash(schema.immutability_guard) === IMMUTABILITY_CHECKSUM;
}

export function contributionActivation(env: Record<string, string | undefined> = process.env): ContributionActivation {
  // Synchronous callers never receive accepted readiness without a DB check.
  return { ...INACTIVE_READINESS, owners: OWNERS, enabled: developmentConnection(env) !== null || productionConnection(env) !== null };
}
export async function verifiedContributionActivation(query: Query, env: Environment = process.env): Promise<ContributionActivation> {
  const inactive = contributionActivation(env);
  const production = productionConnection(env);
  if (production) {
    try {
      if (!await productionReady(query, production.role)
        || productionConnection(env)?.connection !== production.connection) return inactive;
      // Reuse the accepted lifecycle/signing decisions only after Production's
      // own migration, actual schema and restricted connection pass all checks.
      return { ...DEVELOPMENT_READINESS, owners: OWNERS, enabled: true };
    } catch { return inactive; }
  }
  const connection = developmentConnection(env);
  if (!connection) return inactive;
  try {
    // Use the same adapter as the contribution repository. No cache, owner
    // fallback, role switching, schema probes or writes are involved.
    const rows = await query(`SELECT current_database() AS database_name,
      current_user AS current_role, session_user AS login_role`);
    if (rows.length !== 1 || rows[0].database_name !== 'neondb'
      || rows[0].current_role !== RUNTIME_ROLE || rows[0].login_role !== RUNTIME_ROLE
      || developmentConnection(env) !== connection) return inactive;
    return { ...DEVELOPMENT_READINESS, owners: OWNERS, enabled: true };
  } catch {
    // Retain contributions_inactive/no-store responses; never expose DB errors.
    return inactive;
  }
}
export function contributionsActive(policy: ContributionActivation): boolean {
  return policy.enabled && policy.migrationVerified && policy.permissionsVerified
    && policy.databaseTestsVerified && policy.recipientPolicyApproved && policy.taskMappingVerified
    && policy.submissionSignatureVerified;
}
export function contributionPreviewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === 'development' && env.YAWRD_ENABLE_CONTRIBUTION_PREVIEW === '1';
}
