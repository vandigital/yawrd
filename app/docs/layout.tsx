import Image from "next/image";
import styles from "./docs.module.css";

const groups = [
  { title: "Start here", pages: ["Introduction", "Getting Started"] },
  { title: "Build together", pages: ["Creating a Yawrd", "Crew & Contributions", "Governance & Rewards"] },
  { title: "Hackathon", pages: ["Genesis: YAW-001"] },
];

export default function DocsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={styles.shell}>
    <a href="#docs-content" className={styles.skip}>Skip to documentation</a>
    <header className={styles.header}>
      <a href="/" className={styles.brand} aria-label="Yawrd home"><Image src="/brand/yawrd-buoy.png" width={1254} height={1254} sizes="(max-width: 767px) 44px, 52px" alt="" className={styles.brandIcon} /><span>yawrd<span className={styles.dot}>.</span></span></a>
      <span className={styles.headerLabel}>Documentation</span>
      <a href="/" className={styles.back}>Back to Yawrd <span aria-hidden="true">↗</span></a>
    </header>
    <div className={styles.workspace}>
      <aside className={styles.sidebar}>
        <details className={styles.navigation} open>
          <summary>Documentation menu</summary>
          <nav aria-label="Documentation">
            {groups.map(group => <section key={group.title} className={styles.navGroup}>
              <h2>{group.title}</h2>
              <ul>{group.pages.map(label => <li key={label}>
                {label === "Introduction"
                  ? <a href="/docs" aria-current="page">{label}</a>
                  : <span className={styles.upcoming}>{label}<small>Upcoming</small></span>}
              </li>)}</ul>
            </section>)}
          </nav>
        </details>
        <p className={styles.sidebarNote}>A place for people<br />and their agents to build.</p>
      </aside>
      <main id="docs-content" tabIndex={-1} className={styles.main}>{children}</main>
    </div>
    <footer className={styles.footer}>A Keelbase initiative <span>Built together. Reviewed by people.</span></footer>
  </div>;
}
