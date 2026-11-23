import { ProjectSpaceShell, ProjectDeliverableAccordion } from './project-space-shell';
import { YawrdAvatar } from './buoy-mark';
import { ProjectCover } from './project-presentation';
import type { ProposedYawrdPreview } from '../../src/creation/yawrd-preview';
import template from './genesis-project.module.css';
import styles from './yawrd-identity-presentation.module.css';

const anchors = [{href:'#overview',label:'Overview'},{href:'#deliverables',label:'Planned work'},
  {href:'#resources',label:'Resources'},{href:'#build-progress',label:'Build Progress'},
  {href:'#participation',label:'Participation'}] as const;
const allocationLabel = (allocation: ProposedYawrdPreview['tasks'][number]['allocation']) => allocation==='unallocated' ? '0 NEAR allocated' : 'Not set';
const termLabel = (terms: ProposedYawrdPreview['tasks'][number]['rewardTerms']) => terms==='undecided' ? 'Reward terms undecided' : 'Participation terms need public review';

/** Visitor-facing generalized page. Founder-only preview chrome/authorization live in the caller.
 * Reuses the accepted public shell/sections/sidebar, with the same proposed projection for a future public caller.
 */
export function YawrdIdentityPresentation({ project, creatorAccountId }: { project: ProposedYawrdPreview; creatorAccountId: string }) {
  return <div className={styles.page}><ProjectSpaceShell compact eyebrow="Project space" title={project.name} tagline={project.description}
    status="Testnet · Planned work" artwork={<ProjectCover className={template.cover}/>} mark={null} anchors={anchors}
    completion={{accepted:project.progress.accepted,total:project.progress.planned,label:'Accepted deliverables'}}
    sidebar={<>
      <h2 className={`${template.eyebrow} ${styles.seaGreen}`}>Project Identity</h2>
      <div className={styles.creator}><YawrdAvatar variant="sea" label="Generic creator avatar" size={40} className={styles.avatar}/>
        <div><p className={styles.creatorLabel}>Created by</p><p className={styles.creatorAccount}>{creatorAccountId}</p></div>
      </div>
      <p className={template.note}>Verified Creation founder. Steward membership and contribution-review permissions are separate.</p>
      <dl className={styles.identity}><div><dt>Public Yawrd name</dt><dd>{project.name}</dd></div><div><dt>Network</dt><dd>Testnet</dd></div></dl>
      <section className={template.reward} id="rewards"><h3 className={template.muted}>Total reward allocation</h3>
        <p className={template.amount}>{project.fundingPlan==='none-planned' ? '0 NEAR allocated' : 'Not set'}</p>
        <p className={template.note}>{project.fundingPlan==='none-planned' ? 'No contributor payouts planned.' : 'Funding and payout terms remain unresolved.'}</p>
        <details className={template.details}><summary>Reward allocation details</summary><div className={template.detailBody}>
          <p>No approved contributor reward allocation is connected. Account balance and setup fees are not reward allocations.</p>
          <p>Zero allocated does not establish a zero-value reward, unpaid-work agreement or claimable bounty. Participation terms remain separate.</p>
        </div></details>
      </section>
      <section className={template.governance}><h3 className={template.muted}>Work review</h3><p>The founder reviews completed work against the Blueprint, subject to verified permissions. Acceptance does not authorize payment.</p></section>
      <div className={template.participation}><p>Applications closed</p><p className={template.note}>Task participation and claiming are not active. No contributor access or payment entitlement is offered.</p></div>
    </>}>
    <section id="overview" className={template.overview} aria-labelledby="yawrd-overview-title">
      <p className={`${template.sectionKicker} ${styles.seaGreen}`}>Project overview</p><h2 id="yawrd-overview-title">About this Yawrd</h2>
      <p className={styles.empty}>The saved plan includes {project.tasks.length} proposed {project.tasks.length===1?'task':'tasks'}. Work has not started.</p>
      <details className={template.details}><summary>Public project description</summary><div className={template.detailBody}><p>{project.description}</p></div></details>
    </section>
    <section id="deliverables" className={template.deliverables} aria-labelledby="yawrd-deliverables-title">
      <div className={template.sectionHeading}><div><p className={`${template.sectionKicker} ${styles.seaGreen}`}>Planned work</p><h2 id="yawrd-deliverables-title">What we’ll build together</h2></div><span>{project.tasks.length} planned · Not active</span></div>
      {project.tasks.length ? project.tasks.map((task,index)=><ProjectDeliverableAccordion key={task.id} number={index+1} title={task.title} status="Planned · Not active"
        allocation={<><strong className={styles.allocation}>{allocationLabel(task.allocation)}</strong><span className={styles.terms}>{termLabel(task.rewardTerms)}</span></>}>
        <div className={styles.content}><p>{task.summary}</p><h3>Deliverables</h3><ul>{task.deliverables.map((d,i)=><li key={i}>{d}</li>)}</ul>
          {!!task.dependencies.length && <><h3>Dependencies</h3><ul>{task.dependencies.map((d,i)=><li key={i}>{d.included ? d.title : 'Excluded prerequisite — resolve before work starts'}</li>)}</ul></>}
          <p className={template.note}>Acceptance criteria are not published here.</p>
        </div>
      </ProjectDeliverableAccordion>) : <p className={styles.empty}>No tasks are included in the saved plan.</p>}
    </section>
    <section id="resources" className={template.overview} aria-labelledby="yawrd-resources-title"><p className={`${template.sectionKicker} ${styles.seaGreen}`}>Project Resources</p><h2 id="yawrd-resources-title">Public resources</h2><p className={styles.empty}>No public resources have been approved.</p></section>
    <section id="build-progress" className={template.overview} aria-labelledby="yawrd-progress-title"><p className={`${template.sectionKicker} ${styles.seaGreen}`}>Build Progress</p><h2 id="yawrd-progress-title">Not started</h2><p className={styles.empty}>{project.progress.planned} planned {project.progress.planned===1?'task':'tasks'} · No verified accepted-work records connected.</p></section>
    <section id="participation" className={template.overview} aria-labelledby="yawrd-participation-title"><p className={`${template.sectionKicker} ${styles.seaGreen}`}>People &amp; agents</p><h2 id="yawrd-participation-title">Participation</h2><p className={styles.empty}>The founder intends to review contributions. Applications and task participation remain closed.</p><p className={template.note}>No crew members, completed contributions or reward commitments are published. Unpaid work requires its own explicit agreement.</p></section>
  </ProjectSpaceShell></div>;
}
