import type { ParticipantView, PersistedProject } from '../../src/participants/types';
import { ProjectCover, ProjectHeading } from './project-presentation';
import { YawrdAvatar } from './buoy-mark';
import { ParticipantPanel } from './participant-panel';
import { GENESIS_YAW_001 } from '../../src/genesis/yaw-001';
import { GenesisProjectPresentation } from './genesis-project';
import { RewardPayoutProvider } from './reward-payout';

export function PersistedYawrdPresentation({ project, view, contributionsActive = false }: { project: PersistedProject; view: ParticipantView; contributionsActive?: boolean }) {
  const presentation = <ParticipantPanel projectId={project.id} initial={view} contributionsActive={contributionsActive}>
    <PersistedYawrdContent project={project} />
  </ParticipantPanel>;
  return project.id === GENESIS_YAW_001.id && project.network === 'testnet' && project.creatorAccountId === GENESIS_YAW_001.creatorAccountId
    ? <RewardPayoutProvider>{presentation}</RewardPayoutProvider> : presentation;
}

/** Shared presentation for the persisted project and focused M08 rendering checks. */
export function PersistedYawrdContent({ project }: { project: PersistedProject }) {
  const genesis = project.id === GENESIS_YAW_001.id && project.network === GENESIS_YAW_001.network && project.creatorAccountId === GENESIS_YAW_001.creatorAccountId ? GENESIS_YAW_001 : null;
  if (genesis) return <GenesisProjectPresentation project={project} />;
  return <article className="overflow-hidden rounded-[20px] border border-[#377b78] bg-[linear-gradient(130deg,#002b2b,#001e20)] shadow-[0_24px_70px_rgba(0,0,0,0.17)]">
    <ProjectCover className="h-32 sm:h-52" />
    <div className="p-5 sm:p-10 [&_h1]:font-serif [&_h1]:text-[clamp(2.5rem,4.8vw,4.25rem)] [&_h1]:font-medium [&_h1]:tracking-[-0.05em]">
      <p className="mb-5 text-xs font-semibold tracking-wide text-[#c2dedd]">Project space · Testnet</p>
      <ProjectHeading name={project.name} description={project.description} variant="public" />
      <p className="mt-6 rounded-xl border border-[#5b918c]/40 bg-[#3d8c8a]/10 p-4 text-sm leading-6 text-[#bed1c9]">This project space stores applications and creator decisions. It does not confirm that Project Rules have been deployed or that Project Funds exist. Approval here grants no external access.</p>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)] lg:gap-12">
        <div className="min-w-0 space-y-8">
          <section><h2 className="text-xl font-medium tracking-tight text-white">What we hope to build</h2><ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-[#bed1c9]">{project.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul></section>
          <section><h2 className="text-xl font-medium tracking-tight text-white">Taking part</h2><p className="mt-3 text-sm leading-7 text-[#bed1c9]">{project.participation}</p></section>
          <section><h2 className="text-xl font-medium tracking-tight text-white">Contributions &amp; rewards</h2><p className="mt-3 text-sm leading-7 text-[#bed1c9]">{project.rewards}</p></section>
        </div>
        <aside aria-label="Creator profile" className="rounded-2xl border border-white/10 bg-[#001b1d] p-5">
          <div className="flex items-center gap-3"><YawrdAvatar variant="sea" label="Creator avatar preset" size={44} /><p className="text-xs text-[#91b5aa]">Created by</p></div>
          <p className="mt-3 break-all font-mono text-xs leading-6 text-[#c2dedd]">{project.creatorAccountId}</p>
          <p className="mt-3 text-xs leading-6 text-[#91b5aa]">Testnet · Reviews require verification of this wallet.</p>
        </aside>
      </div>
    </div>
  </article>;
}
