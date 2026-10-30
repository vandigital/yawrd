import type { ParticipantView, PersistedProject } from '../../src/participants/types';
import { ProjectCover, ProjectHeading } from './project-presentation';
import { YawrdAvatar } from './buoy-mark';
import { ParticipantPanel } from './participant-panel';

export function PersistedYawrdPresentation({ project, view }: { project: PersistedProject; view: ParticipantView }) {
  return <article className="overflow-hidden rounded-[24px] border border-[#5b918c]/35 bg-[#162521] shadow-[0_24px_70px_rgba(0,0,0,0.17)]">
    <ProjectCover className="h-32 sm:h-52" />
    <div className="p-6 sm:p-10">
      <p className="mb-5 text-xs font-semibold tracking-wide text-[#c2dedd]">Project space · Testnet</p>
      <ProjectHeading name={project.name} description={project.description} variant="public" />
      <p className="mt-6 rounded-xl border border-[#5b918c]/40 bg-[#3d8c8a]/10 p-4 text-sm leading-6 text-[#bed1c9]">This project space stores applications and creator decisions. It does not confirm that Project Rules have been deployed or that Project Funds exist. Approval here grants no external access.</p>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.65fr)] lg:gap-12">
        <div className="space-y-8">
          <section><h2 className="text-xl font-medium tracking-tight text-white">What we hope to build</h2><ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-[#bed1c9]">{project.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul></section>
          <section><h2 className="text-xl font-medium tracking-tight text-white">Taking part</h2><p className="mt-3 text-sm leading-7 text-[#bed1c9]">{project.participation}</p></section>
          <section><h2 className="text-xl font-medium tracking-tight text-white">Contributions &amp; rewards</h2><p className="mt-3 text-sm leading-7 text-[#bed1c9]">{project.rewards}</p></section>
        </div>
        <aside aria-label="Creator profile" className="rounded-2xl border border-white/10 bg-[#12201d] p-5">
          <div className="flex items-center gap-3"><YawrdAvatar variant="sea" label="Creator avatar preset" size={44} /><p className="text-xs text-[#91b5aa]">Created by</p></div>
          <p className="mt-3 break-all font-mono text-xs leading-6 text-[#c2dedd]">{project.creatorAccountId}</p>
          <p className="mt-3 text-xs leading-6 text-[#91b5aa]">Testnet · Reviews require verification of this wallet.</p>
        </aside>
      </div>
      <ParticipantPanel projectId={project.id} initial={view} />
    </div>
  </article>;
}
