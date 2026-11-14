import styles from "./docs.module.css";

const groups = [
  { title: "Start here", pages: [["Introduction", "/docs"], ["What works today", "/docs#what-works-today"]] },
  { title: "Build together", pages: [["The founder journey", "/docs#creation-journey"], ["Crew & contributions", "/docs#how-yawrd-works"], ["Wallets & approvals", "/docs#wallet-and-approvals"]] },
  { title: "Hackathon", pages: [["Genesis: YAW-001", "/docs#genesis-yaw-001"], ["WordWake in Development", "/docs#wordwake"], ["What comes next", "/docs#next-capabilities"]] },
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
              <ul>{group.pages.map(([label, href]) => <li key={href}>
                <a href={href}>{label}</a>
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
