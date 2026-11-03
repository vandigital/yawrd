import type { PublicYawrd } from "../../src/public-yawrd";
import type { GenesisPublicSnapshot } from "../../src/genesis-public";
import { YawrdAvatar, YawrdBrandIcon } from "./buoy-mark";
import { ProjectCover, ProjectHeading } from "./project-presentation";

const publicLinkClass = "rounded-sm text-[#c2dedd] underline decoration-[#5b918c] underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c2dedd]";

/** The Genesis variant of the existing public project presentation. No client state. */
export function GenesisYawrdPresentation({ project }: { project: GenesisPublicSnapshot }) {
  return <article className="overflow-hidden rounded-[24px] border border-[#5b918c]/35 bg-[#162521] shadow-[0_24px_70px_rgba(0,0,0,0.17)]">
    <div className="relative isolate overflow-hidden">
      <ProjectCover className="h-44 sm:h-52" />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,#0a454550,#002c35b3)]" />
      <div aria-hidden="true" className="absolute inset-y-0 right-0 w-2/3 bg-[url('/landing/build-progress.webp')] bg-cover bg-center opacity-25 [mask-image:linear-gradient(to_right,transparent,black)] sm:w-1/2" />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,#a9f1e933,transparent_60%)]" />
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-24 w-72 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-[50%] border border-[#a9f1e9]/20 shadow-[0_0_36px_#8fe5d90d,inset_0_0_24px_#8fe5d90d] sm:h-28 sm:w-96" />
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-36 w-[26rem] -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-[50%] border border-[#a9f1e9]/10 sm:h-40 sm:w-[34rem]" />
      <div aria-hidden="true" className="absolute inset-0 grid place-items-center pb-6 mix-blend-screen">
        <YawrdBrandIcon className="h-24 w-20 drop-shadow-[0_10px_18px_#00181999] sm:h-32 sm:w-[106px]" />
      </div>
      <p className="absolute bottom-5 left-6 text-[10px] font-semibold tracking-[0.12em] text-white sm:left-10 sm:text-xs">{project.reference} · PUBLIC GENESIS PREVIEW</p>
    </div>
    <div className="p-6 sm:p-10">
      <div className="mb-5 flex flex-wrap gap-2 text-xs font-medium text-[#c2dedd]">
        <span className="rounded-full border border-[#5b918c]/50 bg-[#3d8c8a]/10 px-3 py-2">{project.deploymentStatus}</span>
        <span className="rounded-full border border-white/10 px-3 py-2">Participation pending</span>
      </div>
      <ProjectHeading name={project.name} description={project.tagline} variant="public" />
      <div className="mt-6 max-w-2xl space-y-3 text-sm leading-7 text-[#bed1c9] sm:text-base">
        <p>{project.description}</p>
        <p>{project.introduction}</p>
      </div>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.65fr)] lg:gap-12">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="genesis-status-title" className="rounded-2xl border border-[#5b918c]/40 bg-[#3d8c8a]/10 p-5">
            <h2 id="genesis-status-title" className="text-lg font-medium tracking-tight text-white">Genesis deployment status</h2>
            <p className="mt-3 text-sm leading-7 text-[#bed1c9]">The project&apos;s on-chain account and Project Rules have been deployed on NEAR Testnet. Deployment is complete; activation for participation remains pending.</p>
            <p className="mt-3 text-xs leading-6 text-[#a8c0b8]">Approved public snapshot · <time dateTime={project.snapshotDate}>November 3, 2026</time>. Deployment evidence is linked below; this page does not monitor live status.</p>
          </section>
          <section aria-labelledby="genesis-objective-title">
            <h2 id="genesis-objective-title" className="text-xl font-medium tracking-tight text-white">What we&apos;re building</h2>
            <p className="mt-3 text-sm leading-7 text-[#bed1c9]">{project.objective}</p>
            <p className="mt-3 text-sm leading-7 text-[#bed1c9]">The approved deliverable is one public, read-only Build Progress experience. The contribution scope below describes planned work.</p>
            <ol className="mt-5 space-y-5">
              {project.scope.map((task, index) => <li key={task.title} className="flex gap-4">
                <span aria-hidden="true" className="pt-1 font-mono text-xs text-[#91b5aa]">0{index + 1}</span>
                <div><h3 className="font-medium text-[#e7f2ed]">{task.title}</h3><p className="mt-1 text-sm leading-7 text-[#bed1c9]">{task.description}</p></div>
              </li>)}
            </ol>
          </section>
          <section aria-labelledby="genesis-participation-title" className="rounded-2xl border border-white/10 bg-[#12201d] p-5">
            <p className="mb-2 text-xs font-semibold tracking-wide text-[#91b5aa]">Taking part</p>
            <h2 id="genesis-participation-title" className="text-xl font-medium tracking-tight text-white">{project.participationStatus}</h2>
            <p className="mt-3 text-sm leading-7 text-[#bed1c9]">You can explore this Yawrd without connecting a wallet. Participant applications will open only after activation and owner approval.</p>
            <p className="mt-3 text-sm leading-7 text-[#bed1c9]">Crew Member approval, agent association, repository access and contribution acceptance each require separate authorization.</p>
          </section>
          <section aria-labelledby="genesis-rewards-title">
            <h2 id="genesis-rewards-title" className="text-xl font-medium tracking-tight text-white">Contributions &amp; rewards</h2>
            <p className="mt-3 text-sm leading-7 text-[#bed1c9]">Reward amounts and terms remain unapproved. Accepted work requires separate approval before any reward payment. No rewards are offered on this page.</p>
          </section>
        </div>
        <aside aria-label="Project identity and public evidence" className="min-w-0 space-y-5">
          <section aria-labelledby="genesis-identity-title" className="rounded-2xl border border-white/10 bg-[#12201d] p-5">
            <h2 id="genesis-identity-title" className="mb-5 text-base font-medium text-[#e7f2ed]">Project identity</h2>
            <dl className="space-y-5 text-xs leading-6">
              <div>
                <dt className="text-[#91b5aa]">Yawrder · Creator wallet</dt>
                <dd className="mt-2 flex items-center gap-3">
                  <YawrdAvatar variant="sea" label="Default Yawrder buoy avatar" size={44} />
                  <div className="min-w-0"><a className={`break-all font-mono ${publicLinkClass}`} href={`https://testnet.nearblocks.io/address/${project.creatorAccountId}`}>{project.creatorAccountId}</a><p className="mt-1 text-[11px] text-[#a8c0b8]">Default buoy avatar</p></div>
                </dd>
              </div>
              <div><dt className="text-[#91b5aa]">Project account · DAO</dt><dd className="mt-1 break-all font-mono"><a className={publicLinkClass} href={`https://testnet.nearblocks.io/address/${project.daoAccountId}`}>{project.daoAccountId}</a></dd></div>
              <div><dt className="text-[#91b5aa]">Deployment factory</dt><dd className="mt-1 break-all font-mono"><a className={publicLinkClass} href={`https://testnet.nearblocks.io/address/${project.factoryAccountId}`}>{project.factoryAccountId}</a></dd></div>
              <div><dt className="text-[#91b5aa]">Network</dt><dd className="text-[#c2dedd]">{project.network} · Test tokens</dd></div>
            </dl>
            <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-6 text-[#a8c0b8]">Creator and project account identities are backed by the accepted Genesis deployment evidence. Account links open the public Testnet explorer.</p>
          </section>
          <section aria-labelledby="genesis-source-title" className="rounded-2xl border border-white/10 p-5">
            <h2 id="genesis-source-title" className="text-base font-medium text-[#e7f2ed]">Follow the build</h2>
            <p className="mt-3 text-sm leading-7 text-[#bed1c9]">The public contribution repository holds the shared component interface and contribution guidance.</p>
            <a href={project.repositoryUrl} className={`mt-4 inline-block text-sm ${publicLinkClass}`}>View contribution repository <span aria-hidden="true">↗</span></a>
          </section>
          <section aria-labelledby="genesis-evidence-title" className="rounded-2xl border border-white/10 p-5">
            <h2 id="genesis-evidence-title" className="text-base font-medium text-[#e7f2ed]">On-chain evidence</h2>
            <p className="mt-3 text-xs leading-6 text-[#a8c0b8]">Accepted Genesis transaction references. Inspect each record on the Testnet explorer.</p>
            <ul className="mt-4 space-y-5">
              {project.evidence.map(item => <li key={item.hash}>
                <a className={`block text-sm ${publicLinkClass}`} href={`https://testnet.nearblocks.io/txns/${item.hash}`}>{item.label} <span aria-hidden="true">↗</span><span className="mt-2 block break-all font-mono text-[11px] leading-6">{item.hash}</span></a>
              </li>)}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  </article>;
}

export function PublicYawrdPresentation({ project }: { project: PublicYawrd }) {
  const { creator } = project;
  return <article className="overflow-hidden rounded-[24px] border border-[#5b918c]/35 bg-[#162521] shadow-[0_24px_70px_rgba(0,0,0,0.17)]">
    <ProjectCover className="h-32 sm:h-52" />
    <div className="p-6 sm:p-10">
      <p className="mb-5 text-xs font-semibold tracking-wide text-[#c2dedd]">{project.status} · Public Yawrd</p>
      <ProjectHeading name={project.name} description={project.description} variant="public" />
      <p className="mt-6 rounded-xl border border-[#5b918c]/40 bg-[#3d8c8a]/10 p-4 text-sm leading-6 text-[#bed1c9]">Illustrative content only. This Yawrd has not been opened or funded. Membership and reward availability are not established. No wallet connection is needed to explore this preview.</p>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.65fr)] lg:gap-12">
        <div className="space-y-8">
          <section aria-labelledby="objectives-title">
            <h2 id="objectives-title" className="text-xl font-medium tracking-tight text-white">What we hope to build</h2>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-[#bed1c9]">{project.objectives.map((objective, index) => <li key={index}>{objective}</li>)}</ul>
          </section>
          <section aria-labelledby="participation-title">
            <h2 id="participation-title" className="text-xl font-medium tracking-tight text-white">Taking part</h2>
            <p className="mt-3 text-sm leading-7 text-[#bed1c9]">{project.participation}</p>
            <p className="mt-3 text-xs font-medium text-[#c2dedd]">Applications are not open in this preview.</p>
          </section>
          <section aria-labelledby="rewards-title">
            <h2 id="rewards-title" className="text-xl font-medium tracking-tight text-white">Contributions &amp; rewards</h2>
            <p className="mt-3 text-sm leading-7 text-[#bed1c9]">{project.rewards}</p>
          </section>
        </div>
        <aside aria-label="Creator profile">
          <details className="rounded-2xl border border-white/[0.1] bg-[#12201d] open:pb-5">
            <summary className="cursor-pointer rounded-2xl p-5 text-[#c2dedd] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c2dedd]">
              <span className="mt-2 flex items-center gap-3">
                <YawrdAvatar variant={creator.avatar} label="Creator avatar preset" size={44} />
                <span className="min-w-0">
                  <span className="block text-xs text-[#91b5aa]">Created by · Example profile</span>
                  <span className="mt-1 block break-words text-sm font-medium text-[#e7f2ed]">{creator.displayName ?? creator.accountId}</span>
                </span>
              </span>
              <span className="mt-3 block break-all font-mono text-xs leading-6">{creator.accountId}</span>
              <span className="mt-2 block text-xs underline underline-offset-4">Creator profile details</span>
            </summary>
            <div className="space-y-3 px-5 text-sm leading-6 text-[#bed1c9]">
              {creator.bio && <p>{creator.bio}</p>}
              <p>Example wallet account · Identity unverified</p>
              {creator.nearSocialUrl && <a href={creator.nearSocialUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-sm text-[#c2dedd] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">View NEAR Social profile (opens a new tab)</a>}
            </div>
          </details>
        </aside>
      </div>
    </div>
  </article>;
}
