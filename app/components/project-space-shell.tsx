import type { ReactNode } from 'react';
import styles from './project-space-shell.module.css';

type AnchorItem = Readonly<{ href: `#${string}`; label: string }>;

type ProjectSpaceShellProps = {
  eyebrow: ReactNode;
  title: string;
  tagline: string;
  status: string;
  compact?: boolean;
  completion?: Readonly<{ accepted: number | null; total: number; label: string }>;
  artwork: ReactNode;
  mark: ReactNode;
  anchors: readonly AnchorItem[];
  sidebar?: ReactNode;
  children: ReactNode;
};

/** Small, project-agnostic presentation shell; project facts and workflows stay with each Yawrd. */
export function ProjectSpaceShell({
  eyebrow,
  compact = false,
  title,
  tagline,
  status,
  completion,
  artwork,
  mark,
  anchors,
  sidebar,
  children,
}: ProjectSpaceShellProps) {
  return <article className={compact ? `${styles.shell} ${styles.compact}` : styles.shell}>
    <div className={completion ? styles.hero : `${styles.hero} ${styles.identityHero}`}>
      <div aria-hidden="true" className={styles.heroArtwork}>{artwork}</div>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={styles.tagline}>{tagline}</p>
        <p className={styles.status}>{status}</p>
      </div>
      <div aria-hidden="true" className={styles.mark}>{mark}</div>
      {completion && <div
        className={styles.completion}
        aria-label={completion.accepted===null ? `${completion.label}: Not started · ${completion.total} planned` : `${completion.accepted} of ${completion.total} ${completion.label}`}
      >
        <div className={styles.completionCopy}>
          <strong>{completion.accepted===null ? 'Not started' : `${completion.accepted}/${completion.total}`}</strong>
          <span>{completion.label}{completion.accepted===null && <> · {completion.total} planned</>}</span>
        </div>
        <div aria-hidden="true" className={styles.completionTrack}>
          {Array.from({ length: completion.total }, (_, index) =>
            <span className={completion.accepted!==null && index < completion.accepted ? styles.accepted : undefined} key={index} />)}
        </div>
      </div>}
    </div>

    {anchors.length > 0 && <nav aria-label="Project sections" className={styles.anchorNav}>
      {anchors.map(item => <a href={item.href} key={item.href}>{item.label}</a>)}
    </nav>}

    <div className={sidebar ? styles.layout : `${styles.layout} ${styles.identityLayout}`}>
      <div className={styles.main}>{children}</div>
      {sidebar && <aside aria-label="Project identity and governance" className={styles.sidebar}>{sidebar}</aside>}
    </div>
  </article>;
}

type ProjectDeliverableCardProps = {
  id: string;
  label: string;
  status: string;
  title: string;
  summary: string;
  meta: ReactNode;
  actions: ReactNode;
};

/** Presentational card only; callers own every fact and action. */
export function ProjectDeliverableCard({ id, label, status, title, summary, meta, actions }: ProjectDeliverableCardProps) {
  return <article className={styles.deliverableCard} aria-labelledby={`${id}-title`}>
    <div className={styles.deliverableTopline}>
      <span>{label}</span>
      <span className={styles.deliverableStatus}><i aria-hidden="true" />{status}</span>
    </div>
    <h3 id={`${id}-title`}>{title}</h3>
    <p className={styles.deliverableSummary}>{summary}</p>
    <div className={styles.deliverableMeta}>{meta}</div>
    <div className={styles.deliverableActions}>{actions}</div>
  </article>;
}

/** Shared read-only deliverable disclosure. No claim/assignment or payment behavior. */
export function ProjectDeliverableAccordion({ number, title, status, allocation, children }: {
  number: number; title: string; status: string; allocation: ReactNode; children: ReactNode;
}) {
  return <details className={styles.deliverableAccordion}>
    <summary><span className={styles.deliverableNumber}>{String(number).padStart(2,'0')}</span>
      <span className={styles.deliverableTitle}><strong>{title}</strong><span>{status}</span></span>
      <span className={styles.deliverableAllocation}>{allocation}</span>
      <span className={styles.disclosureIcon} aria-hidden="true">+</span>
    </summary>
    <div className={styles.deliverableBody}>{children}</div>
  </details>;
}
