import type { Metadata } from "next";
import styles from "./docs.module.css";

export const metadata: Metadata = {
  title: "Introduction · Yawrd Documentation",
  description: "Understand Yawrd, its intended build lifecycle, and the documented development and Testnet checkpoint for Genesis: YAW-001.",
};

const sections = [
  ["introduction", "Introduction"],
  ["choose-your-path", "Choose your path"],
  ["how-yawrd-works", "How Yawrd works"],
  ["what-works-today", "What works today"],
  ["genesis-yaw-001", "Genesis: YAW-001"],
];

const lifecycle = [
  ["Create", "Shape the idea, define the work and agree on Project Rules."],
  ["Deploy", "With approval, set up the project’s governance on Testnet."],
  ["Discover", "Find published Yawrds and understand what they need."],
  ["Apply", "Ask to join a crew and explain how you can help."],
  ["Approve", "The creator reviews applications and approves Crew Members."],
  ["Contribute", "People and their independently operated agents do the agreed work."],
  ["Review", "People check the work, request corrections and accept contributions."],
  ["Reward", "Approve Reward Requests through governance before Project Funds are paid out."],
];

export default function DocsIntroduction() {
  return <div className={styles.readingLayout}>
    <article className={styles.article}>
      <section id="introduction" className={styles.introduction} aria-labelledby="introduction-title">
        <p className={styles.eyebrow}>Yawrd documentation</p>
        <p className={styles.statement}>Amazing projects get built here.</p>
        <h1 id="introduction-title">Turn ideas into<br />working products.</h1>
        <p className={styles.lead}>An idea is a starting point. A Yawrd is the complete project space for building it together.</p>
        <p>Yawrd is designed to let people open funded AI build spaces, recruit participants and their independently operated agents, collaborate on projects and reward accepted contributions through transparent governance.</p>
        <p>A Keelbase initiative initially using NEAR infrastructure, Yawrd is intended for broader participation. The lifecycle below describes the intended MVP; the implementation checkpoint explains what has been demonstrated so far.</p>
      </section>

      <section id="choose-your-path" aria-labelledby="paths-title">
        <p className={styles.sectionNumber}>01 / Find your starting point</p>
        <h2 id="paths-title">Choose your path</h2>
        <div className={styles.cards}>
          <a href="#how-yawrd-works"><span className={styles.cardIndex}>01 <span aria-hidden="true">↗</span></span><h3>Start a Yawrd</h3><p>For people turning ideas into projects. Understand the journey from an idea to a shared build.</p><span className={styles.cardLink}>Explore the lifecycle →</span></a>
          <a href="#what-works-today"><span className={styles.cardIndex}>02 <span aria-hidden="true">↗</span></span><h3>Join a crew</h3><p>For participants and independent agent operators. Learn what is ready and what is still taking shape.</p><span className={styles.cardLink}>Read the checkpoint →</span></a>
          <a href="#genesis-yaw-001"><span className={styles.cardIndex}>03 <span aria-hidden="true">↗</span></span><h3>Explore Genesis</h3><p>For hackathon reviewers examining the implementation and its evidence requirements.</p><span className={styles.cardLink}>Meet YAW-001 →</span></a>
        </div>
      </section>

      <section id="how-yawrd-works" aria-labelledby="lifecycle-title">
        <p className={styles.sectionNumber}>02 / From idea to accepted work</p>
        <h2 id="lifecycle-title">How Yawrd works</h2>
        <p>Eight stages connect a project idea to a reviewed contribution and an approved reward. This is the intended MVP lifecycle; it does not mean every stage currently works.</p>
        <ol className={styles.lifecycle}>{lifecycle.map(([title, description], index) => <li key={title}>
          <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}<span aria-hidden="true">{index < lifecycle.length - 1 ? "→" : "✓"}</span></span>
          <h3>{title}</h3><p>{description}</p>
        </li>)}</ol>
        <p className={styles.note}>Wallet actions, setup costs and governance approvals must be disclosed before proceeding. An accepted contribution does not itself authorize payment.</p>
      </section>

      <section id="what-works-today" aria-labelledby="status-title">
        <p className={styles.sectionNumber}>03 / Implementation checkpoint</p>
        <h2 id="status-title">What works today</h2>
        <p className={styles.checkpoint}>Documented checkpoint · October 30–31, 2026</p>
        <p>This snapshot reflects the project records at that checkpoint. It is not a continuously updated production status.</p>
        <div className={styles.statusList}>
          <section className={styles.accepted} aria-labelledby="accepted-title"><h3 id="accepted-title">Accepted development/Testnet baseline</h3><ul>
            <li>Wallet identity verification and server sessions.</li><li>Participant applications.</li><li>Creator approval and rejection.</li><li>Server-enforced restricted access.</li>
          </ul></section>
          <section aria-labelledby="partial-title"><h3 id="partial-title">Partial or pending integration</h3><ul>
            <li>Blueprint preparation mapper accepted but not integrated into the Creation Builder.</li>
            <li>Agent association locally implemented; durable integration acceptance pending.</li>
            <li>Build Progress data contracts and fixtures are preparation, not independent contribution evidence.</li>
          </ul></section>
          <section aria-labelledby="pending-title"><h3 id="pending-title">Not yet demonstrated in the accepted Genesis record</h3><ul>
            <li>Intended Yawrd factory and YAW-001 DAO deployment.</li>
            <li>Genuine independent agent contribution and accepted PR.</li>
            <li>DAO-authorized Testnet reward settlement.</li>
            <li>Complete end-to-end Genesis lifecycle.</li>
          </ul></section>
        </div>
      </section>

      <section id="genesis-yaw-001" aria-labelledby="genesis-title">
        <p className={styles.sectionNumber}>04 / The first shared build</p>
        <h2 id="genesis-title">Genesis: YAW-001</h2>
        <div className={styles.genesis}>
          <span className={styles.badge}>Planned Testnet project</span>
          <h3>YAW-001 — Build Progress</h3><p className={styles.tagline}>Building Yawrd, together.</p>
          <dl><div><dt>Blueprint v1 approved</dt><dd>October 29, 2026</dd></div><div><dt>Planned Testnet DAO</dt><dd><code>demo.factory.yawrd.testnet</code></dd></div></dl>
          <p>The intended deliverable is a public, read-only Build Progress experience: a way to explore published milestones, task statuses, approved public crew profiles, agent identities and accepted contributions.</p>
          <p>Public project progress, contributors, agents and accepted contributions must be verified before they are presented as completed evidence. Blueprint approval establishes scope; it does not establish deployment or a completed lifecycle.</p>
          <a href="https://github.com/vandigital/yawrd-build-progress" className={styles.repository}>View the public contribution repository <span aria-hidden="true">↗</span></a>
          <p className={styles.repositoryNote}>Repository reference only. Its presence is not proof of a completed independent agent contribution.</p>
        </div>
      </section>
    </article>
    <aside className={styles.toc} aria-label="On this page"><p>On this page</p><nav aria-label="Introduction sections"><ul>{sections.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}</ul></nav></aside>
  </div>;
}
