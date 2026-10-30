// Local acceptance fixtures only. No Blueprint file is read or copied.
import './load-migration-environment.mjs';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';
import { developmentMigrationDatabaseUrl } from '../src/participants/database-config.ts';

export const acceptanceProjects = ['dev-yaw-001', 'dev-yaw-001-rejection'];
export const acceptanceContent = 'DEVELOPMENT ONLY — YAW-001 participant access check. This synthetic text confirms approved access. It contains no draft Blueprint, private source information, task assignment or reward offer.';
try {
  assert.equal(process.env.YAWRD_DEV_DATABASE_ENDPOINT, 'ep-twilight-voice-aorpfrbm');
  assert.equal(process.env.YAWRD_APP_ORIGIN, 'http://localhost:3000');
  const sql = neon(developmentMigrationDatabaseUrl());
  const [database] = await sql.query("SELECT current_database()='neondb' AS expected");
  assert.ok(database.expected);
  for (const id of acceptanceProjects) {
    const description = `Building Yawrd, together. DEVELOPMENT ONLY — local Milestone 07B ${id.endsWith('rejection') ? 'rejection companion' : 'acceptance record'}. The project concept is approved. Blueprint v1 is a draft awaiting formal approval. Project Rules have not been deployed; no Project Funds are held. This record has no production publication. Creation remains gated until November 1, 2026 or later. Intended Testnet project address: demo.factory.yawrd.testnet (not deployed).`;
    const objectives = ['DEVELOPMENT ONLY — verify separate creator and applicant identities, application persistence and protected participant access.'];
    const participation = 'DEVELOPMENT ONLY — acceptance testing. Creator: yawrd1.testnet. Use a separate applicant wallet and an introduction labeled as test content. No real project work is assigned.';
    const rewards = 'No rewards are available. This development test offers no funds or reward entitlement.';
    await sql.transaction([
      sql.query(`INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards,published_at)
        VALUES ('testnet',$1,'yawrd1.testnet','YAW-001 — Build Progress',$2,$3::jsonb,$4,$5,clock_timestamp())
        ON CONFLICT (network,id) DO NOTHING`, [id, description, JSON.stringify(objectives), participation, rewards]),
      sql.query(`INSERT INTO yawrd.restricted_content(network,project_id,content) VALUES ('testnet',$1,$2) ON CONFLICT (network,project_id) DO NOTHING`, [id, acceptanceContent]),
    ]);
    const [row] = await sql.query(`SELECT p.creator_account_id,p.name,p.description,p.objectives,p.participation,p.rewards,p.published_at IS NOT NULL AS locally_visible,r.content FROM yawrd.projects p JOIN yawrd.restricted_content r ON r.network=p.network AND r.project_id=p.id WHERE p.network='testnet' AND p.id=$1`, [id]);
    assert.equal(row.creator_account_id, 'yawrd1.testnet');
    assert.equal(row.name, 'YAW-001 — Build Progress');
    assert.equal(row.description, description);
    assert.deepEqual(row.objectives, objectives);
    assert.equal(row.participation, participation);
    assert.equal(row.rewards, rewards);
    assert.equal(row.content, acceptanceContent);
    assert.equal(row.locally_visible, true);
  }
  console.log('Development-only YAW-001 acceptance records ready: dev-yaw-001 and dev-yaw-001-rejection. Existing applications and decisions preserved. No production publication.');
} catch {
  console.error('Development acceptance preparation failed; private data and connection details suppressed.');
  process.exitCode = 1;
}
