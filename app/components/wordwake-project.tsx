import type { PublishedWordWake } from '../../src/launch/wordwake-public';
import { WORDWAKE_PUBLIC_IDENTITY as identity } from '../../src/launch/wordwake-public-config';
import { ProjectSpaceShell, ProjectDeliverableCard } from './project-space-shell';
import { ProjectCover } from './project-presentation';
import { YawrdAvatar, YawrdBrandIcon } from './buoy-mark';
import styles from './genesis-project.module.css';

const anchors=[{href:'#overview',label:'Overview'},{href:'#blueprint',label:'Blueprint'},
  {href:'#deliverables',label:'Planned work'},{href:'#crew-title',label:'Join WordWake'}] as const;

/** The approved shared shell, with WordWake's reviewed public summaries and lifecycle. */
export function WordWakeProjectPresentation({project}:{project:PublishedWordWake}) {
  return <div data-wordwake-project>
    <nav aria-label="Project navigation" className={styles.breadcrumb}><a href="/#discover">← Discover Yawrds</a><span aria-hidden="true">/</span><span>YAW-002</span></nav>
    <ProjectSpaceShell compact eyebrow={<>YAW-002 <span>·</span> WordWake</>} title={project.name}
      tagline="An original letter-path game, built together."
      status="Published on Testnet · Join applications open"
      completion={{accepted:0,total:2,label:'deliverables accepted'}}
      artwork={<ProjectCover className={styles.cover}/>} mark={<YawrdBrandIcon/>} anchors={anchors}
      sidebar={<>
        <h2 className={styles.eyebrow}>Project identity</h2>
        <div className={styles.creator}><YawrdAvatar variant="sea" label="Founder avatar preset" size={48}/><div><p className={styles.muted}>Founded by</p>
          <a href={`https://testnet.nearblocks.io/address/${project.creatorAccountId}`}>{project.creatorAccountId} ↗</a></div></div>
        <div className={styles.participation}><p>Published · Accepting Join applications</p><p className={styles.note}>The founder reviews every application. Tasks remain unassigned and closed to claiming.</p>
          <a className={styles.follow} href="#crew-title">Join &amp; applications <span aria-hidden="true">↓</span></a></div>
        <section className={styles.reward}><h3 className={styles.muted}>Approved reward plan</h3><p className={styles.amount}>{project.rewardPlan ? `${project.rewardPlan.total} Testnet NEAR` : 'Allocation verification unavailable'}</p>{project.rewardPlan && <p className={styles.note}>{project.reviewed.tracks.length} reviewed tasks · {project.rewardPlan.T1 === project.rewardPlan.T2 ? `${project.rewardPlan.T1} Testnet NEAR each` : `T1: ${project.rewardPlan.T1} · T2: ${project.rewardPlan.T2} Testnet NEAR`}</p>}
          <details className={styles.details}><summary>Reward plan details</summary><div className={styles.detailBody}><p>{project.rewards}</p><p>Approved rewards are commitments for reviewed work. Assignment, acceptance and payout approval are separate actions. No rewards have been paid for these tasks. Current Project Funds are verified separately in the founder workspace.</p></div></details></section>
        <section className={styles.governance}><h3 className={styles.muted}>Project decisions</h3><p>Reward release needs separate approval from two distinct Stewards. Joining does not give spending or task-claiming permission.</p></section>
        <details className={styles.details}><summary>Project details &amp; review evidence</summary><div className={styles.detailBody}>
          <dl><div><dt>Project account</dt><dd>{identity.daoAccountId}</dd></div><div><dt>Network</dt><dd>NEAR Testnet · Test tokens</dd></div>
            <div><dt>Published</dt><dd>{project.publishedAt}</dd></div><div><dt>Reviewed plan</dt><dd>{project.reviewed.packageVersion}</dd></div></dl>
          <p>The reviewed Blueprint and task summaries are published here. The private Skill and detailed task package remain in the authorized founder workspace.</p></div></details>
      </>}
    >
      <section id="overview" className={styles.overview} aria-labelledby="wordwake-overview-title"><p className={styles.sectionKicker}>The WordWake project</p><h2 id="wordwake-overview-title">A few minutes of discovery</h2><p>{project.description}</p></section>
      <section id="blueprint" className={styles.overview} aria-labelledby="wordwake-blueprint-title"><p className={styles.sectionKicker}>Founder-reviewed direction</p><h2 id="wordwake-blueprint-title">The Blueprint</h2>
        <p>Three original puzzles for phones and computers. The rules engine and player experience will be developed independently, then combined for founder technical review before separately authorized integration.</p>
        <details className={styles.details}><summary>Reviewed rules and project context</summary><div className={styles.detailBody}><h3>Approved choices</h3><ul>{project.reviewed.principles.map(p=><li key={p}>{p}</li>)}</ul>
          <h3>First-version goals</h3><ul>{project.objectives.map(goal=><li key={goal}>{goal}</li>)}</ul><p>Reviewed {project.reviewed.reviewedOn}. Task activation, contributor assignment and integration remain separate decisions.</p></div></details>
      </section>
      <section id="deliverables" className={styles.deliverables} aria-labelledby="wordwake-deliverables-title"><div className={styles.sectionHeading}><div><p className={styles.sectionKicker}>Planned work</p><h2 id="wordwake-deliverables-title">What we’ll build together</h2></div><span>0 of 2 accepted · Tasks not activated</span></div>
        <div className={styles.deliverableGrid}>{project.reviewed.tracks.map(track=><ProjectDeliverableCard key={track.id} id={`wordwake-${track.id}`} label={track.id} title={track.title} summary={track.summary} status="Not activated"
          meta={<><p className={styles.muted}>Approved reward</p><p className="font-serif! text-[27px]! leading-snug! text-[#f2f7f5]!">{project.rewardPlan ? `${project.rewardPlan[track.id]} Testnet NEAR` : 'Task reward verification unavailable'}</p></>} actions={<span className={styles.note}>Unassigned · Claiming closed</span>}/>)}</div>
      </section>
      <section className={styles.overview} aria-labelledby="wordwake-participation-title"><p className={styles.sectionKicker}>People &amp; agents</p><h2 id="wordwake-participation-title">Join the Crew</h2><p>{project.participation}</p>
        <p className={styles.note}>You can read this page without a wallet or GitHub connection. Applying needs a verified Testnet wallet and your consent to share your introduction with the founder.</p></section>
      <section className={styles.overview} aria-labelledby="wordwake-progress-title"><p className={styles.sectionKicker}>Build Progress</p><h2 id="wordwake-progress-title">Ready to bring people together</h2><p>The reviewed plan is saved and Join applications are open. Contributor tasks have not started. No completed contributions, contributor roster or payouts are published.</p></section>
    </ProjectSpaceShell>
  </div>;
}
