import { creationEnvironment } from '../../../../src/creation/release-environment';
import { notFound } from 'next/navigation';
import PreparationPanel from './preparation-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Build your Blueprint', robots: { index: false, follow: false } };
export default async function CreationBlueprint({ params }: { params: Promise<{ id: string }> }) {
  const { id }=await params;
  if(!creationEnvironment()||!/^yawrd-[a-z2-7]{12}$/.test(id))notFound();
  // The shell contains no private SSR data. API authorization happens on the client request.
  return <PreparationPanel creationId={id}/>;
}
