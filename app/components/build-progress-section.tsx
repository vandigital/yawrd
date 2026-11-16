import type { ReactNode } from 'react';
import { ProjectProgress, type ProjectProgressData } from '../../components/ProjectProgress';
import styles from './genesis-project.module.css';

/** The approved progress host, shared without changing the public contribution contract. */
export function BuildProgressSection({ data, children, note, privateDraft = false }: {
  data?: ProjectProgressData; children?: ReactNode; note?: string; privateDraft?: boolean;
}) {
  return <div className={styles.progressBlock}>
    <div className={styles.sectionHeading}><div><p className={styles.sectionKicker}>{privateDraft ? 'Private project draft' : 'Server-published snapshot'}</p><h2 id="published-progress-title">Build Progress</h2></div><span>{privateDraft ? 'Not started' : 'Evidence-backed'}</span></div>
    {data ? <div className={styles.progressAdapter}><ProjectProgress data={data} /></div> : children}
    {note && <p className={styles.progressNote}>{note}</p>}
  </div>;
}
