import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationTargets, verifyPublication } from '../scripts/verify-genesis-publication-postgres.mjs';

// Synthetic URL strings only. Importing the runner does not load environment
// files, import the database driver, or execute SQL.
const endpoint = 'ep-unit1d-disposable';
function settings() {
  return {
    YAWRD_PG_VERIFY_BRANCH: 'yaw-001-publication-verification',
    YAWRD_PG_VERIFY_PARENT: 'development',
    YAWRD_PG_VERIFY_ENDPOINT: endpoint,
    YAWRD_MIGRATION_DATABASE_URL: `postgresql://neondb_owner:FAKE_SECRET@${endpoint}.example.neon.tech/neondb?sslmode=require`,
    DATABASE_URL: `postgresql://yawrd_07b_runtime:FAKE_SECRET@${endpoint}-pooler.example.neon.tech/neondb?sslmode=verify-full`,
  };
}

test('disposable publication targets accept distinct owner/runtime roles on the independently pinned endpoint', () => {
  const targets = publicationTargets(settings());
  assert.equal(targets.endpoint, endpoint);
  assert.notEqual(targets.ownerUrl, targets.runtimeUrl);
});

for (const [name, change] of [
  ['missing owner', env => { delete env.YAWRD_MIGRATION_DATABASE_URL; }],
  ['missing runtime', env => { delete env.DATABASE_URL; }],
  ['unconfirmed parent', env => { env.YAWRD_PG_VERIFY_PARENT = 'production'; }],
  ['historical branch', env => { env.YAWRD_PG_VERIFY_BRANCH = 'yaw-001-pg-verification'; }],
  ['missing pin', env => { delete env.YAWRD_PG_VERIFY_ENDPOINT; }],
  ['development pin', env => { env.YAWRD_PG_VERIFY_ENDPOINT = 'ep-twilight-voice-aorpfrbm'; }],
  ['historical pin', env => { env.YAWRD_PG_VERIFY_ENDPOINT = 'ep-red-haze-ao88m4zr'; }],
  ['different runtime endpoint', env => { env.DATABASE_URL = env.DATABASE_URL.replace(endpoint, 'ep-unrelated'); }],
  ['owner reused as runtime', env => { env.DATABASE_URL = env.YAWRD_MIGRATION_DATABASE_URL; }],
  ['wrong database', env => { env.DATABASE_URL = env.DATABASE_URL.replace('/neondb?', '/other?'); }],
  ['wrong port', env => { env.DATABASE_URL = env.DATABASE_URL.replace('/neondb?', ':9999/neondb?'); }],
  ['missing TLS', env => { env.DATABASE_URL = env.DATABASE_URL.replace('verify-full', 'disable'); }],
  ['connection override', env => { env.DATABASE_URL += '&options=-csearch_path%3Dpublic'; }],
  ['duplicate TLS', env => { env.DATABASE_URL += '&sslmode=disable'; }],
]) {
  test(`publication guard rejects ${name} without connecting`, () => {
    const env = settings(); change(env);
    assert.throws(() => publicationTargets(env));
  });
}

test('verification rejects missing or invalid targets before driver loading with sanitized guard errors', async () => {
  for (const env of [{}, { ...settings(), YAWRD_PG_VERIFY_ENDPOINT: 'ep-twilight-voice-aorpfrbm' }]) {
    await assert.rejects(verifyPublication('--apply-and-test', env), error => {
      assert.match(error.code, /fresh_branch_and_parent_confirmation_required|development_or_historical_endpoint_forbidden/);
      assert.doesNotMatch(error.message, /FAKE_SECRET|postgresql:\/\//);
      return true;
    });
  }
});
