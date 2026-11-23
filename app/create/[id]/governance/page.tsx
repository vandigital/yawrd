import { creationEnvironment } from '../../../../src/creation/release-environment';
import { notFound } from 'next/navigation';
import GovernancePanel from './governance-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Decide how work gets approved', robots: { index: false, follow: false } };
export default async function Governance({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!creationEnvironment() || !/^yawrd-[a-z2-7]{12}$/.test(id)) notFound();
  return <GovernancePanel creationId={id}/>;
}
