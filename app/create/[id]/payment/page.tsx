import { creationEnvironment, creationActionEnabled } from '../../../../src/creation/release-environment';
import { notFound } from 'next/navigation';
import PaymentPanel from './payment-panel';
import styles from '../../setup/setup.module.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Review your Yawrd platform fee', robots: { index: false, follow: false } };
export default async function CreationPayment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!creationEnvironment() || !/^yawrd-[a-z2-7]{12}$/.test(id)) notFound();
  return <main className={styles.page}><div className={styles.container}><PaymentPanel creationId={id} preparationAvailable={creationActionEnabled('generation')}/></div></main>;
}
