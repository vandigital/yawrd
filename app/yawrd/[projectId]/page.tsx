import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicYawrd } from "../../../src/public-yawrd";
import { PublicYawrdPresentation } from "../../components/public-yawrd";
import { cookies } from "next/headers";
import { database } from "../../../src/participants/database";
import { ParticipantRepository } from "../../../src/participants/repository";
import { SESSION_COOKIE, sessionHash } from "../../../src/participants/auth";
import { PersistedYawrdPresentation } from "../../components/persisted-yawrd";
import { BuoyMark, YawrdBrandIcon } from "../../components/buoy-mark";

type Props = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const fixture = getPublicYawrd((await params).projectId);
  // Never query restricted data or render unpublished names in metadata.
  return { title: fixture ? `${fixture.name} · Yawrd preview` : "Yawrd project space", robots: { index: false, follow: false } };
}

export default async function PublicYawrdPage({ params }: Props) {
  const { projectId } = await params;
  const project = getPublicYawrd(projectId);
  let persisted = null;
  let view = null;
  let unavailable = false;
  if (!project) {
    try {
      const repo = new ParticipantRepository(database);
      persisted = await repo.project(projectId);
      if (persisted) view = await repo.view(projectId, sessionHash((await cookies()).get(SESSION_COOKIE)?.value ?? null));
    } catch { unavailable = true; }
    if (!unavailable && !persisted) notFound();
  }
  const genesis = persisted?.id === "yaw-001";
  return <main id="project-content" className="min-h-screen bg-[#0d1716] px-5 pb-16 text-[#e9f1ee] sm:px-8">
    <div className="mx-auto max-w-[1000px]">
      <header className="mb-8 flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-white/[0.09] py-4 sm:mb-12 sm:min-h-24">
        <a href="/" aria-label="Yawrd home" className="flex items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c2dedd]">
          {projectId === "yaw-001" ? <YawrdBrandIcon className="h-11 w-9 mix-blend-screen" /> : <BuoyMark className="size-9" />}
          <span className="text-[22px] font-semibold tracking-[-0.06em]">yawrd<span className="text-[#73aaa5]">.</span></span>
        </a>
        <span className="rounded-full border border-[#3d8c8a]/50 bg-[#3d8c8a]/10 px-3 py-2 text-[11px] font-semibold text-[#c2dedd]">{project ? "Public preview · Fixture data" : "Yawrd project space · Testnet"}</span>
      </header>
      {genesis && <nav aria-label="Project navigation" className="mb-6 flex flex-wrap gap-6 text-xs text-[#c2dedd]">
        <a href="/#discover" className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">← Discover Yawrds</a>
        <a href="/docs" className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Yawrd docs</a>
      </nav>}
      {project ? <PublicYawrdPresentation project={project} /> : unavailable ? <section role="alert" className="rounded-2xl border border-[#5b918c]/40 bg-[#162521] p-8">
        <h1 className="text-2xl font-medium">Project temporarily unavailable</h1>
        <p className="mt-3 text-sm leading-7 text-[#bed1c9]">Yawrd could not load this project safely. Please try again later.</p>
      </section> : persisted && view ? <PersistedYawrdPresentation project={persisted} view={view} /> : null}
    </div>
  </main>;
}
