import styles from './welcome.module.css';

export function CreationJourney({ current, paidContinuation = false, blueprintApproved = false }: { current: 0 | 1 | 2 | 3; paidContinuation?: boolean; blueprintApproved?: boolean }) {
  return <ol className={styles.steps} aria-label="Your creation journey">
    {['Sign in', 'Describe your project', 'Set up your Yawrd', 'Build your Blueprint', 'Launch your Yawrd'].map((title, i) =>
      <li key={title} aria-current={i === current ? 'step' : undefined}>
        <span>{i === 2 && paidContinuation ? '✓ Deployment and payment completed' : i === 3 && blueprintApproved ? '✓ Blueprint approved · Private configuration' : i < current ? '✓ Completed' : i === current ? 'Current' : i === 2 ? 'Configuration review only' : 'Later · unavailable'}</span><p>{String(i).padStart(2, '0')} {title}</p>
      </li>)}
  </ol>;
}
