import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../docs/proposals/migrations/phase2_creation_publication.sql', import.meta.url), 'utf8');
const guard = sql.slice(sql.indexOf('DO $$ BEGIN'), sql.indexOf('CREATE SCHEMA'));
const compact = text => text.replace(/\s+/g, ' ').trim();
const expectedMembershipSql = `OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles writer
  ON writer.oid=m.roleid OR writer.oid=m.member
  WHERE writer.rolname='yawrd_publication_writer'
  HAVING count(*)>1 OR count(*) FILTER (WHERE NOT (
    m.roleid=writer.oid AND m.member=current_user::regrole
    AND m.admin_option IS TRUE AND m.inherit_option IS FALSE AND m.set_option IS FALSE))>0)`;

// Offline truth table for this exact catalog predicate, not PostgreSQL execution.
// The source assertion below binds these fixtures to the installed proposal text.
const writer = 101, owner = 202, runtime = 303, other = 404;
const membership = (changes = {}) => ({roleid:writer, member:owner, admin_option:true, inherit_option:false, set_option:false, ...changes});
function unsafeMembership(rows, currentOwner = owner) {
  const related = rows.filter(m => m.roleid === writer || m.member === writer);
  return related.length > 1 || related.some(m => !(m.roleid === writer && m.member === currentOwner &&
    m.admin_option === true && m.inherit_option === false && m.set_option === false));
}

test('proposal uses only the exact current-owner ADMIN exception and rejects extra writer membership rows', () => {
  assert.ok(compact(guard).includes(compact(expectedMembershipSql)));
  assert.doesNotMatch(guard, /neondb_owner|cloud_admin|\.testnet|ep-/);
  assert.match(sql, /trusted migration owner may hold the sole ADMIN-only membership in the writer/);
  assert.match(sql, /INHERIT=false and SET=false/);
});
test('a writer with no memberships remains accepted', () => {
  assert.equal(unsafeMembership([]), false);
});
test('the evidenced Neon owner ADMIN membership is accepted, regardless of provider grantor identity', () => {
  assert.equal(unsafeMembership([membership({grantor:505})]), false);
});
test('a different trusted current migration owner is accepted without a Development owner pin', () => {
  assert.equal(unsafeMembership([membership({member:606})],606), false);
  assert.equal(unsafeMembership([membership({member:606})]), true);
});

const unsafe = [
  ['owner membership inherits writer privileges', {inherit_option:true}],
  ['owner membership can SET ROLE to writer', {set_option:true}],
  ['owner membership both inherits and can SET', {inherit_option:true,set_option:true}],
  ['owner membership lacks ADMIN', {admin_option:false}],
  ['another principal holds the writer membership', {member:other}],
  ['shared runtime is a writer member even without INHERIT or SET', {member:runtime}],
  ['writer is a member of shared runtime', {roleid:runtime,member:writer}],
  ['writer is a member of the migration owner', {roleid:owner,member:writer}],
  ['writer is a member of another role', {roleid:other,member:writer}],
  ['writer is a member of itself', {roleid:writer,member:writer}],
  ['ADMIN is unknown', {admin_option:null}],
  ['INHERIT is unknown', {inherit_option:null}],
  ['SET is unknown', {set_option:null}],
];
for (const [name, changes] of unsafe) test(`rejects ${name}`, () => {
  assert.equal(unsafeMembership([membership(changes)]), true);
});
test('safe owner exception does not mask an additional unsafe membership', () => {
  for (const [,changes] of unsafe) assert.equal(unsafeMembership([membership(),membership(changes)]),true);
});
test('additional provider/grantor membership rows are rejected even for the same owner', () => {
  assert.equal(unsafeMembership([membership({grantor:505}),membership({grantor:606})]),true);
});
test('existing elevated-role and runtime-to-owner preconditions remain intact', () => {
  assert.ok(compact(guard).includes(compact(`IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='yawrd_publication_writer' AND rolcanlogin
    AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))`)));
  assert.ok(compact(guard).includes(compact(`OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='yawrd_07b_runtime'
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))`)));
  assert.ok(compact(guard).includes(`OR current_user IN ('yawrd_07b_runtime','yawrd_publication_writer')`));
  assert.ok(compact(guard).includes(`OR pg_has_role('yawrd_07b_runtime',current_user,'MEMBER') THEN`));
});
test('existing effective privilege rejection gates remain present', () => {
  for (const code of ['publication_table_privileges_unsafe','publication_runtime_execute_unsafe',
    'publication_writer_source_privileges_unsafe','publication_schema_privileges_unsafe'])
    assert.ok(sql.includes(`RAISE EXCEPTION '${code}'`));
});
