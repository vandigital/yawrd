import { creationEnvironment } from '../../../../src/creation/release-environment';
import { notFound } from 'next/navigation';
import LaunchPanel from './launch-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ready to launch?', robots: { index: false, follow: false } };
export default async function Launch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!creationEnvironment() || !/^yawrd-[a-z2-7]{12}$/.test(id)) notFound();
  return <LaunchPanel creationId={id}/>;
}
