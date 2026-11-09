import styles from "./docs.module.css";

const groups = [
  { title: "Start here", pages: ["Introduction", "Getting Started"] },
  { title: "Build together", pages: ["Creating a Yawrd", "Crew & Contributions", "Governance & Rewards"] },
  { title: "Hackathon", pages: ["Genesis: YAW-001"] },
];

export default function DocsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={styles.shell}>
    <a href="#docs-content" className={styles.skip}>Skip to documentation</a>

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
                  : label === "Genesis: YAW-001"
                    ? <a href="/docs#genesis-yaw-001">{label}</a>
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
