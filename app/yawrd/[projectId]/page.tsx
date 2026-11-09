import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicYawrd } from "../../../src/public-yawrd";
import { PublicYawrdPresentation } from "../../components/public-yawrd";
import { cookies } from "next/headers";
import { database } from "../../../src/participants/database";
import { ParticipantRepository } from "../../../src/participants/repository";
import { SESSION_COOKIE, sessionHash } from "../../../src/participants/auth";
import { PersistedYawrdPresentation } from "../../components/persisted-yawrd";
import createStyles from "../../create/create.module.css";
import { verifiedContributionActivation, contributionsActive } from "../../../src/contributions/policy";

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
  const genesis = projectId === "yaw-001";
  const contributionWorkflowActive = genesis && persisted !== null && view !== null
    && contributionsActive(await verifiedContributionActivation(database));
  return <main id="project-content" className={genesis ? createStyles.page : "min-h-screen bg-[#0d1716] px-5 pb-16 text-[#e9f1ee] sm:px-8"}>
    <div className={genesis ? createStyles.container : "mx-auto max-w-[1000px]"}>

      {project ? <PublicYawrdPresentation project={project} /> : unavailable ? <section role="alert" className="rounded-2xl border border-[#5b918c]/40 bg-[#162521] p-8">
        <h1 className="text-2xl font-medium">Project temporarily unavailable</h1>
        <p className="mt-3 text-sm leading-7 text-[#bed1c9]">Yawrd could not load this project safely. Please try again later.</p>
      </section> : persisted && view ? <PersistedYawrdPresentation project={persisted} view={view} contributionsActive={contributionWorkflowActive} /> : null}
    </div>
  </main>;
}
