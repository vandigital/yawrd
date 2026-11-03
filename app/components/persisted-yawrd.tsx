import type { ParticipantView, PersistedProject } from '../../src/participants/types';
import { ProjectCover, ProjectHeading } from './project-presentation';
import { YawrdAvatar, YawrdBrandIcon } from './buoy-mark';
import { ParticipantPanel } from './participant-panel';
import { GENESIS_YAW_001 } from '../../src/genesis/yaw-001';

const publicLinkClass = 'rounded-sm text-[#c2dedd] underline decoration-[#5b918c] underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c2dedd]';

export function PersistedYawrdPresentation({ project, view }: { project: PersistedProject; view: ParticipantView }) {
  const genesis = project.id === GENESIS_YAW_001.id && project.network === GENESIS_YAW_001.network && project.creatorAccountId === GENESIS_YAW_001.creatorAccountId ? GENESIS_YAW_001 : null;
  return <article className="overflow-hidden rounded-[24px] border border-[#5b918c]/35 bg-[#162521] shadow-[0_24px_70px_rgba(0,0,0,0.17)]">
    {genesis ? <div className="relative isolate overflow-hidden">
      <ProjectCover className="h-44 sm:h-52" />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,#0a454550,#002c35b3)]" />
      <div aria-hidden="true" className="absolute inset-y-0 right-0 w-2/3 bg-[url('/landing/build-progress.webp')] bg-cover bg-center opacity-25 [mask-image:linear-gradient(to_right,transparent,black)] sm:w-1/2" />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,#a9f1e933,transparent_60%)]" />
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-24 w-72 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-[50%] border border-[#a9f1e9]/20 shadow-[0_0_36px_#8fe5d90d,inset_0_0_24px_#8fe5d90d] sm:h-28 sm:w-96" />
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-36 w-[26rem] -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-[50%] border border-[#a9f1e9]/10 sm:h-40 sm:w-[34rem]" />
      <div aria-hidden="true" className="absolute inset-0 grid place-items-center pb-6 mix-blend-screen">
        <YawrdBrandIcon className="h-24 w-20 drop-shadow-[0_10px_18px_#00181999] sm:h-32 sm:w-[106px]" />
      </div>
      <p className="absolute bottom-5 left-6 text-[10px] font-semibold tracking-[0.12em] text-white sm:left-10 sm:text-xs">{genesis.reference} · GENESIS PROJECT</p>
    </div> : <ProjectCover className="h-32 sm:h-52" />}
    <div className="p-6 sm:p-10">
      {genesis ? <div className="mb-5 flex flex-wrap gap-2 text-xs font-medium text-[#c2dedd]">
        <span className="rounded-full border border-[#5b918c]/50 bg-[#3d8c8a]/10 px-3 py-2">Deployed on Testnet</span>
        <span className="rounded-full border border-white/10 px-3 py-2">Published project space</span>
      </div> : <p className="mb-5 text-xs font-semibold tracking-wide text-[#c2dedd]">Project space · Testnet</p>}
      <ProjectHeading name={project.name} description={genesis ? genesis.tagline : project.description} variant="public" />
      {genesis ? <div className="mt-6 max-w-2xl space-y-3 text-sm leading-7 text-[#bed1c9] sm:text-base">{project.description.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div> : <p className="mt-6 rounded-xl border border-[#5b918c]/40 bg-[#3d8c8a]/10 p-4 text-sm leading-6 text-[#bed1c9]">This project space stores applications and creator decisions. It does not confirm that Project Rules have been deployed or that Project Funds exist. Approval here grants no external access.</p>}
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.65fr)] lg:gap-12">
        <div className="min-w-0 space-y-8">
          {genesis && <section aria-labelledby="genesis-status-title" className="rounded-2xl border border-[#5b918c]/40 bg-[#3d8c8a]/10 p-5">
            <h2 id="genesis-status-title" className="text-lg font-medium tracking-tight text-white">Genesis deployment status</h2>
            <p className="mt-3 text-sm leading-7 text-[#bed1c9]">The project&apos;s on-chain account and Project Rules have been deployed on NEAR Testnet. This published project space supports participant applications and creator decisions.</p>
            <p className="mt-3 text-xs leading-6 text-[#a8c0b8]">Deployment evidence is linked below; it does not establish available Project Funds. Approval here grants no external access or role in Project Rules.</p>
          </section>}
          <section><h2 className="text-xl font-medium tracking-tight text-white">{genesis ? "What we're building" : 'What we hope to build'}</h2><ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-[#bed1c9]">{project.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul></section>
          <section><h2 className="text-xl font-medium tracking-tight text-white">Taking part</h2><p className="mt-3 text-sm leading-7 text-[#bed1c9]">{project.participation}</p></section>
          <section><h2 className="text-xl font-medium tracking-tight text-white">Contributions &amp; rewards</h2><p className="mt-3 text-sm leading-7 text-[#bed1c9]">{project.rewards}</p></section>
        </div>
        {genesis ? <aside aria-label="Project identity and public evidence" className="min-w-0 space-y-5">
          <section aria-labelledby="genesis-identity-title" className="rounded-2xl border border-white/10 bg-[#12201d] p-5">
            <h2 id="genesis-identity-title" className="mb-5 text-base font-medium text-[#e7f2ed]">Project identity</h2>
            <dl className="space-y-5 text-xs leading-6">
              <div><dt className="text-[#91b5aa]">Yawrder · Creator wallet</dt><dd className="mt-2 flex items-center gap-3">
                <YawrdAvatar variant="sea" label="Creator avatar preset" size={44} />
                <div className="min-w-0"><a className={`break-all font-mono ${publicLinkClass}`} href={`https://testnet.nearblocks.io/address/${project.creatorAccountId}`}>{project.creatorAccountId}</a><p className="mt-1 text-[11px] text-[#a8c0b8]">Default buoy avatar</p></div>
              </dd></div>
              <div><dt className="text-[#91b5aa]">Project account · DAO</dt><dd className="mt-1 break-all font-mono"><a className={publicLinkClass} href={`https://testnet.nearblocks.io/address/${genesis.daoAccountId}`}>{genesis.daoAccountId}</a></dd></div>
              <div><dt className="text-[#91b5aa]">Deployment factory</dt><dd className="mt-1 break-all font-mono"><a className={publicLinkClass} href={`https://testnet.nearblocks.io/address/${genesis.factoryAccountId}`}>{genesis.factoryAccountId}</a></dd></div>
              <div><dt className="text-[#91b5aa]">Network</dt><dd className="text-[#c2dedd]">NEAR Testnet · Test tokens</dd></div>
            </dl>
            <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-6 text-[#a8c0b8]">Creator and project account identities are backed by the accepted Genesis deployment evidence. Account links open the public Testnet explorer.</p>
          </section>
          <section aria-labelledby="genesis-source-title" className="rounded-2xl border border-white/10 p-5">
            <h2 id="genesis-source-title" className="text-base font-medium text-[#e7f2ed]">Follow the build</h2>
            <p className="mt-3 text-sm leading-7 text-[#bed1c9]">The public contribution repository holds the shared component interface and contribution guidance.</p>
            <a href={`https://github.com/${genesis.publicRepository}`} className={`mt-4 inline-block text-sm ${publicLinkClass}`}>View contribution repository <span aria-hidden="true">↗</span></a>
          </section>
          <section aria-labelledby="genesis-evidence-title" className="rounded-2xl border border-white/10 p-5">
            <h2 id="genesis-evidence-title" className="text-base font-medium text-[#e7f2ed]">On-chain evidence</h2>
            <p className="mt-3 text-xs leading-6 text-[#a8c0b8]">Accepted Genesis transaction references. Inspect each record on the Testnet explorer.</p>
            <ul className="mt-4 space-y-5">{[{ label: 'Project creation', hash: genesis.creationTransaction }, { label: 'Deployment hardening', hash: genesis.hardeningTransaction }].map(item => <li key={item.hash}>
              <a className={`block text-sm ${publicLinkClass}`} href={`https://testnet.nearblocks.io/txns/${item.hash}`}>{item.label} <span aria-hidden="true">↗</span><span className="mt-2 block break-all font-mono text-[11px] leading-6">{item.hash}</span></a>
            </li>)}</ul>
          </section>
        </aside> : <aside aria-label="Creator profile" className="rounded-2xl border border-white/10 bg-[#12201d] p-5">
          <div className="flex items-center gap-3"><YawrdAvatar variant="sea" label="Creator avatar preset" size={44} /><p className="text-xs text-[#91b5aa]">Created by</p></div>
          <p className="mt-3 break-all font-mono text-xs leading-6 text-[#c2dedd]">{project.creatorAccountId}</p>
          <p className="mt-3 text-xs leading-6 text-[#91b5aa]">Testnet · Reviews require verification of this wallet.</p>
        </aside>}
      </div>
      <ParticipantPanel projectId={project.id} initial={view} />
    </div>
  </article>;
}
