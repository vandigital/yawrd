import type { PersistedProject } from '../../src/participants/types';
import { GENESIS_YAW_001 as genesis } from '../../src/genesis/yaw-001';
import { genesisApplicationsClosed } from '../../src/genesis/participation';
import { TASK_B_REWARD } from '../../src/genesis/task-b-reward';
import { YAW_001_CONTRIBUTION_PROOF, YAW_001_DELIVERABLE_COMPLETION, YAW_001_PROJECT_PROGRESS } from '../../src/genesis/build-progress-publication';
import { ProjectProgress } from '../../components/ProjectProgress';
import { YawrdAvatar, YawrdBrandIcon } from './buoy-mark';
import { ProjectCover } from './project-presentation';
import { ProjectDeliverableCard, ProjectSpaceShell } from './project-space-shell';
import { RewardPayoutIdentity } from './reward-payout';
import styles from './genesis-project.module.css';

const explorer = 'https://testnet.nearblocks.io';
const anchors = [
  { href: '#overview', label: 'Overview' },
  { href: '#deliverables', label: 'Deliverables' },
  { href: '#proof-of-contribution', label: 'Proof of Contribution' },
  { href: '#project-context', label: 'Project context' },
] as const;

/** Public, server-rendered project facts only. No application or roster input. */
export function GenesisProjectPresentation({ project }: { project: PersistedProject }) {
  const closed = genesisApplicationsClosed(project.id, project.network);
  const taskSummaries = {
    'task-a': 'A portable, read-only view of public milestones, tasks and accepted activity.',
    'task-b': 'A reviewed contribution presentation with privacy and evidence boundaries preserved.',
  } as const;

  const sidebar = <>
    <h2 id="genesis-identity-title" className={styles.eyebrow}>Project identity</h2>
    <div className={styles.creator}>
      <YawrdAvatar variant="sea" label="Creator avatar preset" size={48} />
      <div><p className={styles.muted}>Created by</p>
        <a href={`${explorer}/address/${project.creatorAccountId}`}>{project.creatorAccountId} ↗</a>
        <p className={styles.verified}>Verified Genesis account</p>
      </div>
    </div>
    <section className={styles.reward} aria-labelledby="recorded-reward-title">
      <h3 id="recorded-reward-title" className={styles.muted}>Task B · Recorded reward</h3>
      <p className={styles.amount}>{TASK_B_REWARD.amountLabel}</p>
      <p className={styles.note}>Recorded for this contribution. Separate from Project Funds or future funding.</p>
      <RewardPayoutIdentity compact />
    </section>
    <section className={styles.governance} aria-labelledby="governance-title">
      <p id="governance-title" className={styles.muted}>Project governance</p>
      <p>Reward authorization requires two distinct Steward approvals. Approval does not prove settlement; successful transfer receipt verification does.</p>
    </section>
    {closed && <div className={styles.participation}>
      <p>Completed · Applications closed</p>
      <p className={styles.note}>The Genesis build is complete. Existing Crew Members and Stewards retain their workspace access.</p>
    </div>}
    {/* No public roster is authorized by the existing publication consent. */}
    <details className={styles.details}>
      <summary>Project details &amp; on-chain evidence</summary>
      <div className={styles.detailBody}>
        <p>Creator and project account identities are backed by the accepted Genesis deployment evidence. The creator avatar is a preset.</p>
        <dl>
          <div><dt>Project account</dt><dd><a href={`${explorer}/address/${genesis.daoAccountId}`}>{genesis.daoAccountId}</a></dd></div>
          <div><dt>Deployment factory</dt><dd><a href={`${explorer}/address/${genesis.factoryAccountId}`}>{genesis.factoryAccountId}</a></dd></div>
          <div><dt>Network</dt><dd>NEAR Testnet · Test tokens</dd></div>
        </dl>
        <ul>{[{ label: 'Project creation', hash: genesis.creationTransaction }, { label: 'Deployment hardening', hash: genesis.hardeningTransaction }].map(item => <li key={item.hash}>
          <a href={`${explorer}/txns/${item.hash}`}>{item.label} ↗<span className={styles.hash}>{item.hash}</span></a>
        </li>)}</ul>
        <p>Deployment evidence does not establish available Project Funds. Approval here grants no external access or role in Project Rules.</p>
      </div>
    </details>
  </>;

  return <>
    <nav aria-label="Project navigation" className={styles.breadcrumb}>
      <a href="/#discover">← Discover Yawrds</a><span aria-hidden="true">/</span><span>{genesis.reference}</span>
    </nav>
    <ProjectSpaceShell
      eyebrow={<>{genesis.reference} <span>·</span> Genesis project</>}
      title="Build Progress"
      tagline={genesis.tagline}
      status={closed ? 'Completed on Testnet' : 'Deployed on Testnet'}
      completion={{ ...YAW_001_DELIVERABLE_COMPLETION, label: 'deliverables accepted' }}
      artwork={<><ProjectCover className={styles.cover} /><div className={styles.artwork} /></>}
      mark={<YawrdBrandIcon />}
      anchors={anchors}
      sidebar={sidebar}
    >
      <section aria-labelledby="genesis-source-title" className={styles.overview} id="overview">
        <p className={styles.sectionKicker}>The Genesis build</p>
        <h2 id="genesis-source-title">A shared start for Yawrd</h2>
        <p>Our first collaborative project explores a clearer way to share milestones, recognize contributions and follow what we build together.</p>
        <a className={styles.follow} href={`https://github.com/${genesis.publicRepository}`}>Follow the public build <span aria-hidden="true">↗</span></a>
        <p className={styles.note}>Explore the accepted work and contribution guidance on GitHub.</p>
      </section>

      <section aria-labelledby="deliverables-title" className={styles.deliverables} id="deliverables">
        <div className={styles.sectionHeading}>
          <div><p className={styles.sectionKicker}>Accepted work</p><h2 id="deliverables-title">Project deliverables</h2></div>
          <span>2 of 2 complete</span>
        </div>
        <div className={styles.deliverableGrid}>
          {YAW_001_CONTRIBUTION_PROOF.map(item => <ProjectDeliverableCard
            id={`deliverable-${item.ref}`}
            key={item.ref}
            label={item.label}
            status={item.status}
            title={item.title}
            summary={taskSummaries[item.ref]}
            meta={<><p>{item.acceptance}</p><p>{item.reward}</p></>}
            actions={<><a href={item.prUrl}>Reviewed PR ↗</a><a href={item.mergeUrl}>Merged source ↗</a></>}
          />)}
        </div>
        <div className={styles.progressBlock}>
          <div className={styles.sectionHeading}><div><p className={styles.sectionKicker}>Server-published snapshot</p><h2 id="published-progress-title">Build Progress</h2></div><span>Evidence-backed</span></div>
          {/* Host adapter only: the accepted public component remains byte-for-byte unchanged. */}
          <div className={styles.progressAdapter}><ProjectProgress data={YAW_001_PROJECT_PROGRESS} /></div>
          <p className={styles.progressNote}>Task A is accepted, but its acceptance date is not published in the approved evidence. Its merge date is not used as a substitute.</p>
        </div>
      </section>

      <section aria-labelledby="proof-of-contribution-title" className={styles.contributions} id="proof-of-contribution">
        <div className={styles.sectionHeading}>
          <div><p className={styles.sectionKicker}>Public evidence</p><h2 id="proof-of-contribution-title">Proof of Contribution</h2></div>
          <span>2 accepted deliverables</span>
        </div>
        <p className={styles.provenance}>Contribution provenance is operator-attested in the reviewed public pull requests. GitHub identities and commit history do not cryptographically prove agent authorship.</p>
        <ul className={styles.evidenceList}>
          {YAW_001_CONTRIBUTION_PROOF.map(item => <li key={item.ref}>
            <div><span className={styles.task}>{item.label} · {item.status}</span><h3>{item.title}</h3></div>
            <div className={styles.evidenceFacts}><p>{item.acceptance}</p><p>{item.reward}</p></div>
            <div className={styles.proofLinks}><a href={item.prUrl}>Reviewed PR ↗</a><a href={item.mergeUrl}>Merged source ↗</a></div>
          </li>)}
        </ul>
      </section>

      <details className={`${styles.details} ${styles.context}`} id="project-context">
        <summary>Original objectives &amp; project context</summary>
        <div className={styles.detailBody}>
          <h2>{project.name}</h2>
          {project.description.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
          <h3>Original objectives</h3><ul>{project.objectives.map((objective, i) => <li key={i}>{objective}</li>)}</ul>
          <h3>Original participation context</h3><p>{project.participation}</p>
          <p>This context records the original project scope. {closed && 'New applications are now closed.'}</p>
          <p>Task B has a conditional allocation of 1 NEAR on Testnet. A Steward must propose the reward and two distinct Stewards must approve it before payment. Contribution submission or acknowledgement does not approve payment. Settlement is verified separately from transaction receipts.</p>
        </div>
      </details>
    </ProjectSpaceShell>
  </>;
}
