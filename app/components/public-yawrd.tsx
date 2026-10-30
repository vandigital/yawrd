import type { PublicYawrd } from "../../src/public-yawrd";
import { YawrdAvatar } from "./buoy-mark";
import { ProjectCover, ProjectHeading } from "./project-presentation";

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
