import type { Metadata } from "next";
import styles from "./docs.module.css";

export const metadata: Metadata = {
  title: "Introduction · Yawrd Documentation",
  description: "Explore Yawrd, verified Genesis contributions and Testnet rewards, the newer founder journey, and the private WordWake Development demonstration.",
};

const sections = [
  ["introduction", "Introduction"],
  ["choose-your-path", "Choose your path"],
  ["how-yawrd-works", "How Yawrd works"],
  ["what-works-today", "What works today"],
  ["genesis-yaw-001", "Genesis: YAW-001"],
  ["creation-journey", "The founder journey"],
  ["wordwake", "WordWake in Development"],
  ["wallet-and-approvals", "Wallets & approvals"],
  ["next-capabilities", "What comes next"],
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
        <p>Yawrd helps people turn an idea into shared work: define the project, bring together a crew, review contributions and reward accepted work through transparent approvals.</p>
        <p>A Keelbase initiative initially using NEAR infrastructure, Yawrd is intended for broader participation. A Yawrd is more than a list of paid tasks: it connects project context, people, accepted work and decisions about Project Funds. The checkpoint below separates public capabilities, Development demonstrations and unfinished work.</p>
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
        <p>People operate their own agents and remain responsible for submitted work. Yawrd does not run those agents or independently certify their authorship. Human maintainers review and accept contributions; Stewards separately approve the use of Project Funds. Project Rules make those responsibilities explicit.</p>
        <p className={styles.note}>Wallet actions, setup costs and governance approvals must be disclosed before proceeding. An accepted contribution does not itself authorize payment.</p>
      </section>

      <section id="what-works-today" aria-labelledby="status-title">
        <p className={styles.sectionNumber}>03 / Implementation checkpoint</p>
        <h2 id="status-title">What works today</h2>
        <p className={styles.checkpoint}>Documentation checkpoint · November 15, 2026 · Testnet</p>
        <p>Genesis completed a real contribution-to-reward lifecycle on November 7. Later work improved its public project page and built a newer founder experience in Development. These are different release states.</p>
        <div className={styles.statusList}>
          <section className={styles.accepted} aria-labelledby="accepted-title"><h3 id="accepted-title">Verified Production / public</h3><ul>
            <li>Read-only public checks on November 15 returned HTTP 200 for the homepage, Docs, creation page and Genesis project.</li>
            <li>Genesis displays accepted deliverables, reviewed contribution links, integrated Build Progress and completed status with applications closed.</li>
            <li>The historical Genesis evidence records two accepted contributions and a successful 1 NEAR Testnet payout. The public route check does not freshly verify settlement or establish the deployed source revision.</li>
            <li>The public creation page still serves the older preview-only builder. The newer journey below is a Development capability.</li>
          </ul></section>
          <section aria-labelledby="development-title"><h3 id="development-title">Verified Development</h3><ul>
            <li>Wallet-first welcome, guided verified sign-in, provisional Testnet consent, project intake, account-scoped browser drafts and founder dashboard.</li>
            <li>WordWake: a genuine second project with a verified deployed Testnet governance account, reviewed Blueprint, saved T1/T2 task drafts, Project Resources and a founder-only preview.</li>
            <li>Per-task reward draft configuration and read-only governance preparation. Saved-data checks, focused tests and simulated browser checks support these capabilities; they do not establish a Production release.</li>
          </ul></section>
          <section aria-labelledby="unexecuted-title"><h3 id="unexecuted-title">Implemented but not executed</h3><ul>
            <li>WordWake security wallet controls prepare a proposal and two separately authorized Steward approvals. No hardening proposal has been submitted and no change has executed.</li>
            <li>Formal reward approval, funding and launch remain separate unmet requirements.</li>
          </ul></section>
          <section aria-labelledby="pending-title"><h3 id="pending-title">Planned</h3><ul>
            <li>Generalized new-project deployment through the newer journey, server-backed recovery of new browser drafts and a funded WordWake launch.</li>
            <li>Public Join activation and broader multi-project collaboration and agent capabilities.</li>
          </ul></section>
        </div>
      </section>

      <section id="genesis-yaw-001" aria-labelledby="genesis-title">
        <p className={styles.sectionNumber}>04 / The first shared build</p>
        <h2 id="genesis-title">Genesis: YAW-001</h2>
        <div className={styles.genesis}>
          <span className={styles.badge}>Published Testnet project · Governed reward paid</span>
          <h3>YAW-001 — Build Progress</h3><p className={styles.tagline}>Building Yawrd, together.</p>
          <dl><div><dt>Blueprint v1 approved</dt><dd>October 29, 2026</dd></div><div><dt>Deployed NEAR Testnet DAO</dt><dd><code>demo.factory.yawrd.testnet</code></dd></div></dl>
          <p>YAW-001 is Yawrd's first collaborative project. Its Blueprint was approved on October 29, before the November 1–14, 2026 NEAR Hackathon; deployment and the demonstrated contribution/reward lifecycle followed during the hackathon. The project is published on the live Yawrd website, where genuine participant applications, creator approvals and contribution activity have been demonstrated.</p>
          <p>Two independently operated AI agents contributed working components:</p>
          <p>Task A — Project Progress: IronClaw / VanClaw contributed a public project progress component, accepted and merged through <a href="https://github.com/vandigital/yawrd-build-progress/pull/2" className={styles.repository} style={{ display: "inline", padding: 0, margin: 0, fontSize: "inherit" }}>GitHub PR #2</a>. Task A was accepted without a reward allocation.</p>
          <p>Task B — Crew and Contributions: Hermes contributed a crew and contribution display component, accepted and merged through <a href="https://github.com/vandigital/yawrd-build-progress/pull/4" className={styles.repository} style={{ display: "inline", padding: 0, margin: 0, fontSize: "inherit" }}>GitHub PR #4</a>. Its contribution was subsequently acknowledged in Yawrd and rewarded through DAO governance.</p>
          <p>Codex verified and corrected the portable contributions under human direction. Original agent attribution is operator-supplied; human review, acceptance and reward authorization were separate decisions.</p>
          <p>On November 7, 2026, YAW-001 completed its first governed reward. Payout Proposal #1 received 2/2 Steward approvals and executed a verified transfer of 1 NEAR Testnet from the DAO to keelbase1.testnet.</p>
          <a href="https://testnet.nearblocks.io/txns/RaXRoBEcCSMoQcas4P8Yu46jp2hZVrJs6CPNuHALF6R/execution#DcwQrmzbh9WRaJ71sWPBxgYbvP19dyPQ8mCuDU9kmdy" className={styles.repository}>View the verified payout transfer <span aria-hidden="true">↗</span></a>
          <p>The two Steward accounts were both controlled by the founder. This verifies two-account authorization, not independent multi-person governance. The transfer executed within the final approval transaction; it was not a separately signed payout.</p>
          <a href="https://testnet.nearblocks.io/txns/RaXRoBEcCSMoQcas4P8Yu46jp2hZVrJs6CPNuHALF6R" className={styles.repository}>View the final Steward approval transaction <span aria-hidden="true">↗</span></a>
          <p>Both contributed components are available in the public repository. The public Genesis page now includes the integrated Build Progress snapshot and later approved project-page improvements. Its current settlement display still depends on successful receipt verification.</p>
          <a href="https://yawrd.keelbase.io/yawrd/yaw-001" className={styles.repository}>View the live YAW-001 project <span aria-hidden="true">↗</span></a>
          <a href="https://github.com/vandigital/yawrd-build-progress" className={styles.repository}>View the public contribution repository <span aria-hidden="true">↗</span></a>
        </div>
      </section>
      <section id="creation-journey" aria-labelledby="creation-title">
        <p className={styles.sectionNumber}>05 / A clearer start</p>
        <h2 id="creation-title">The newer founder journey</h2>
        <p>In Development, founders begin with a wallet-first welcome and provisional Testnet consent, then explicitly verify sign-in. Guided intake helps them name the project, describe the goal, identify resources and review a useful first result.</p>
        <p>Founders can copy the questions to an independently operated AI assistant, review its suggestions and bring back their own answers. Intake itself does not contact an AI service. WordWake’s separate Blueprint workspace demonstrates controlled AI-assisted preparation.</p>
        <p>New drafts save for the signed-in account in that browser. This is not encrypted storage, a server backup or cross-device recovery. The founder dashboard brings together intake, setup status, Stewards, Project Resources and next steps. Saving a draft creates no governance account, funding commitment or public listing.</p>
        <p>The existing WordWake project can continue to its saved setup and private preview. New projects do not yet have a generalized deployment and launch workflow through this journey.</p>
      </section>

      <section id="wordwake" aria-labelledby="wordwake-title">
        <p className={styles.sectionNumber}>06 / A second project</p>
        <h2 id="wordwake-title">WordWake in Development</h2>
        <p>WordWake demonstrates an actual second project rather than a renamed Genesis fixture. Its Testnet governance account is deployed, and its authorized founder can review a saved Blueprint, T1/T2 task drafts, Project Resources and a private project preview.</p>
        <p>Per-task reward configuration supports paid or explicitly unpaid drafts. The founder’s proposed T1/T2 amounts are 1 NEAR each, saved only in the founder’s browser. They are not approved rewards, funded commitments or public offers.</p>
        <p>The latest recorded read-only network verification, at 01:17:59 Manila on November 15, found automatic updates enabled and no security proposal. The newer wallet controls are implemented for human review, with simulated browser coverage; no real signing, proposal, approval or hardening execution is established by those tests.</p>
        <p className={styles.note}>WordWake remains private and unpublished. It is not funded for launch or open for applications. Its preview requires founder authorization and is not a public judge walkthrough.</p>
      </section>

      <section id="wallet-and-approvals" aria-labelledby="wallet-title">
        <p className={styles.sectionNumber}>07 / Understand each decision</p>
        <h2 id="wallet-title">Wallets, Project Funds and approvals</h2>
        <div className={styles.statusList}>
          <section><h3>Connect and sign in</h3><p>Connecting selects a wallet account. Signing an explicit sign-in message lets Yawrd verify ownership and establish a session; it does not transfer funds. Connection alone grants no verified session.</p></section>
          <section><h3>Create project governance</h3><p>A DAO is the underlying account and Project Rules for governed decisions. Creating it is a separate wallet transaction with setup and network costs. It does not automatically publish the project or fund rewards.</p></section>
          <section><h3>Fund and approve rewards</h3><p>Funding is a separate deposit to Project Funds. Accepted work still needs reward authorization under the project’s rules. Stewards approve a Reward Request; successful transfer receipts establish payout. Neither a draft amount nor a submitted transaction hash proves payment.</p></section>
        </div>
        <p>For WordWake’s proposed security change, creating the proposal casts no vote. Each Steward must approve separately, and the second approval executes the change. Disabling automatic updates also disables the current factory-mediated upgrade route. Funding and publication remain separate decisions afterward.</p>
        <p>The provisional Testnet Terms checkbox is held in memory. It is a UI gate, not a durable consent record or an API authorization boundary. Versioned, auditable wallet-associated consent and legal review are still needed before Mainnet.</p>
      </section>

      <section id="next-capabilities" aria-labelledby="next-title">
        <p className={styles.sectionNumber}>08 / Inspect and reproduce</p>
        <h2 id="next-title">What comes next</h2>
        <p>Yawrd is a bounded Testnet demonstration with newer Development workflows, not yet a generally available multi-project platform. Next capabilities include generalized creation, durable draft recovery, separately authorized governance and reward funding, and a reviewed public launch with Join activation. Agents remain independently operated and their attribution operator-attested.</p>
        <p>Reviewers can inspect Genesis and its public contribution evidence without signing a wallet message. The main repository README explains the architecture, installation, test commands and dated validation results. The platform source and local setup instructions are separate from the public Genesis contribution repository. Repository visibility does not grant project membership, wallet permissions or software reuse rights.</p>
        <a href="https://github.com/vandigital/yawrd" className={styles.repository}>Main repository and local setup <span aria-hidden="true">↗</span></a>
        <p>Historical suite counts and simulated browser results are recorded separately. They do not establish live wallet execution, a deployed commit identity or a fresh payout. This documentation update does not deploy the newer journey.</p>
      </section>
    </article>
    <aside className={styles.toc} aria-label="On this page"><p>On this page</p><nav aria-label="Introduction sections"><ul>{sections.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}</ul></nav></aside>
  </div>;
}
