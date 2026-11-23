import type { Metadata } from "next";
import styles from "./docs.module.css";

export const metadata: Metadata = {
  title: "Introduction · Yawrd Documentation",
  description: "Explore Yawrd, verified Genesis contributions and Testnet rewards, the accepted Development Creation journey, and public WordWake.",
};

const sections = [
  ["introduction", "Introduction"],
  ["choose-your-path", "Choose your path"],
  ["how-yawrd-works", "How Yawrd works"],
  ["what-works-today", "What works today"],
  ["genesis-yaw-001", "Genesis: YAW-001"],
  ["creation-journey", "The founder journey"],
  ["wordwake", "WordWake: YAW-002"],
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
        <p className={styles.checkpoint}>Documentation checkpoint · November 23, 2026 · Testnet</p>
        <div className={styles.statusList}>
          <section className={styles.accepted}><h3>Production / public</h3><p>Genesis (YAW-001) and WordWake (YAW-002) have deployed Testnet project accounts. Both appear in Production Discover. Genesis is completed with applications closed; WordWake accepts Join applications while its tasks remain inactive. Generalized Creation follows the invite-only Testnet policy described below.</p></section>
          <section><h3>Accepted Development Creation</h3><p>The accepted P3.8B baseline supports private saved Creations, verified deployment and security setup, separate platform payment, Blueprint preparation and approval, contribution and work-review configuration, and wallet-authorized publication to a public page and Discover. Community Tool Library completed real Meteor NEP-413 publication in Development, including public-page and Discover checks. Its records remain Development-only. This acceptance does not activate these capabilities in Production.</p></section>
          <section><h3>Production Beta preparation</h3><p>Founder Creation admission is invite-only and requires verified Testnet sign-in. Availability depends on the environment’s approved storage, publication and release configuration; connecting a wallet alone grants no Creation access.</p></section>
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
        <p className={styles.sectionNumber}>05 / From private idea to public page</p>
        <h2 id="creation-title">The accepted Creation journey</h2>
        <p>This walkthrough describes the accepted Creation flow on Testnet. Opening a Yawrd is invite-only and requires verified Testnet sign-in. Availability depends on the environment’s approved release configuration.</p>
        <ol>
          <li><strong>Sign in.</strong> Open a Yawrd, review the provisional Testnet terms, connect Meteor and explicitly approve the sign-in message for your selected Testnet account. Connecting alone does not establish a verified session. The message costs no gas and cannot spend funds. Approved founders continue automatically to intake; other signed-in accounts see the invite-only notice and can Explore Yawrds.</li>
          <li><strong>Describe your project.</strong> Complete the guided intake and save your private Creation. Saved Creations can be resumed after verified sign-in; unsaved browser answers are not a server backup. Saving does not publish or create a project account.</li>
          <li><strong>Set up your Yawrd.</strong> Save the proposed public details and second Steward. Both Stewards must approve project decisions. Review the reserved account identifier and deployment request. An authorized deployment requires a separate wallet transaction, a 1 Testnet NEAR setup deposit and network gas. A reservation or transaction hash alone does not prove successful setup.</li>
          <li><strong>Complete security and payment.</strong> After deployment verification, the founder submits the security proposal and each Steward approves separately; the final approval executes the change. Continue only after verification that automatic updates are disabled and the expected approvals are recorded. These wallet transactions use gas. The separate 0.5 Testnet NEAR platform payment also needs explicit approval and successful transfer verification. Setup costs and platform fees do not fund contributor rewards.</li>
          <li><strong>Build your Blueprint.</strong> Review the preparation context. Where enabled and separately authorized, generation sends the disclosed project context to an AI provider. Review and edit the Blueprint, contributor Skill and proposed tasks, save a version and explicitly approve that version. Approval stays private and does not authorize publication.</li>
          <li><strong>Configure contributions and work review.</strong> Choose included tasks, check dependencies and explicitly decide contribution terms. Current generalized configuration supports undecided or acknowledged unpaid terms; it does not approve paid rewards. Save the founder-led work-review configuration against the current approved Blueprint and contribution version.</li>
          <li><strong>Preview and authorize publication.</strong> Review the full proposed public page, including the approved Blueprint title and overview and selected planned task details. Choose Launch my Yawrd and approve the fresh NEP-413 publication message in Meteor. This separate message binds the exact public content and current source; it costs no gas and sends no transaction. A changed source, switched account or cancelled approval cannot establish publication.</li>
          <li><strong>Confirm the public result.</strong> A durable publication receipt provides the public Yawrd link. The same published projection appears in Discover. Reloading can recover the receipt. Publication leaves applications, task claiming, rewards and payments inactive for generalized Creations; participation requires separate activation.</li>
        </ol>
        <p className={styles.note}>Deployment, payment, Blueprint approval, publication and active participation are separate decisions. This documentation update enables none of them in Production. Production release approval remains separate; a documentation update grants no access or wallet permissions.</p>
      </section>

      <section id="wordwake" aria-labelledby="wordwake-title">
        <p className={styles.sectionNumber}>06 / A second project</p>
        <h2 id="wordwake-title">WordWake: YAW-002</h2>
        <p>WordWake is a genuine second Yawrd with a deployed Testnet project account and a public project page linked from Discover. Its reviewed game project and planned work use the shared project presentation.</p>
        <p>Join applications are open; task claiming and work remain inactive. Its project-specific publication and reward configuration do not establish generalized Creation participation or paid-reward support.</p>
        <a href="/yawrd/yaw-002" className={styles.repository}>Explore WordWake <span aria-hidden="true">↗</span></a>
      </section>

      <section id="wallet-and-approvals" aria-labelledby="wallet-title">
        <p className={styles.sectionNumber}>07 / Understand each decision</p>
        <h2 id="wallet-title">Wallets, Project Funds and approvals</h2>
        <div className={styles.statusList}>
          <section><h3>Connect and sign in</h3><p>Connecting selects a wallet account. Signing an explicit sign-in message lets Yawrd verify ownership and establish a session; it does not transfer funds. Connection alone grants no verified session.</p></section>
          <section><h3>Create project governance</h3><p>A DAO is the underlying account and Project Rules for governed decisions. Creating it is a separate wallet transaction with setup and network costs. It does not automatically publish the project or fund rewards.</p></section>
          <section><h3>Fund and approve rewards</h3><p>Funding is a separate deposit to Project Funds. Accepted work still needs reward authorization under the project’s rules. Stewards approve a Reward Request; successful transfer receipts establish payout. Neither a draft amount nor a submitted transaction hash proves payment.</p></section>
        </div>
        <p>Creating a security proposal casts no vote. Each Steward must approve separately, and the final required approval executes the change. Disabling automatic updates also disables the current factory-mediated upgrade route. Funding and publication remain separate decisions afterward.</p>
        <p>The provisional Testnet Terms checkbox is held in memory. It is a UI gate, not a durable consent record or an API authorization boundary. Versioned, auditable wallet-associated consent and legal review are still needed before Mainnet.</p>
      </section>

      <section id="next-capabilities" aria-labelledby="next-title">
        <p className={styles.sectionNumber}>08 / Inspect and reproduce</p>
        <h2 id="next-title">What comes next</h2>
        <p>Yawrd is a bounded Testnet demonstration with newer Development workflows, not yet a generally available multi-project platform. The accepted Development Creation flow includes durable draft recovery and reviewed publication. Production Beta access follows the approved invite-only policy and environment configuration. Generalized Join activation, paid rewards and reward funding require separate authorization. Agents remain independently operated and their attribution operator-attested.</p>
        <p>Reviewers can inspect Genesis and its public contribution evidence without signing a wallet message. The main repository README explains the architecture, installation, test commands and dated validation results. The platform source and local setup instructions are separate from the public Genesis contribution repository. Repository visibility does not grant project membership, wallet permissions or software reuse rights.</p>
        <a href="https://github.com/vandigital/yawrd" className={styles.repository}>Main repository and local setup <span aria-hidden="true">↗</span></a>
        <p>Historical suite counts and simulated browser results are recorded separately. They do not establish live wallet execution, a deployed commit identity or a fresh payout. This documentation update does not deploy the newer journey.</p>
      </section>
    </article>
    <aside className={styles.toc} aria-label="On this page"><p>On this page</p><nav aria-label="Introduction sections"><ul>{sections.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}</ul></nav></aside>
  </div>;
}
