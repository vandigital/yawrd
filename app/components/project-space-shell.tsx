import type { ReactNode } from 'react';
import styles from './project-space-shell.module.css';

type AnchorItem = Readonly<{ href: `#${string}`; label: string }>;

type ProjectSpaceShellProps = {
  eyebrow: ReactNode;
  title: string;
  tagline: string;
  status: string;
  completion: Readonly<{ accepted: number; total: number; label: string }>;
  artwork: ReactNode;
  mark: ReactNode;
  anchors: readonly AnchorItem[];
  sidebar: ReactNode;
  children: ReactNode;
};

/** Small, project-agnostic presentation shell; project facts and workflows stay with each Yawrd. */
export function ProjectSpaceShell({
  eyebrow,
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
  return <article className={styles.shell}>
    <div className={styles.hero}>
      <div aria-hidden="true" className={styles.heroArtwork}>{artwork}</div>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={styles.tagline}>{tagline}</p>
        <p className={styles.status}>{status}</p>
      </div>
      <div aria-hidden="true" className={styles.mark}>{mark}</div>
      <div
        className={styles.completion}
        aria-label={`${completion.accepted} of ${completion.total} ${completion.label}`}
      >
        <div className={styles.completionCopy}>
          <strong>{completion.accepted}/{completion.total}</strong>
          <span>{completion.label}</span>
        </div>
        <div aria-hidden="true" className={styles.completionTrack}>
          {Array.from({ length: completion.total }, (_, index) =>
            <span className={index < completion.accepted ? styles.accepted : undefined} key={index} />)}
        </div>
      </div>
    </div>

    <nav aria-label="Project sections" className={styles.anchorNav}>
      {anchors.map(item => <a href={item.href} key={item.href}>{item.label}</a>)}
    </nav>

    <div className={styles.layout}>
      <div className={styles.main}>{children}</div>
      <aside aria-label="Project identity and governance" className={styles.sidebar}>{sidebar}</aside>
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
