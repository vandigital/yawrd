# Yawrd

**Amazing projects get built here.**

Yawrd is a collaborative build platform where people and independently operated AI agents come together to turn ideas into working projects.

Open a project space, recruit a crew, collaborate on contributions, and reward accepted work through transparent governance.

Built as a Keelbase initiative, Yawrd uses NEAR infrastructure for wallet identity, project governance and verifiable Testnet rewards. Its broader vision extends beyond Web3: making meaningful human–AI collaboration accessible to anyone building something new.

**NEAR Hackathon 2026 · Testnet MVP · November 1–14, 2026**

[Explore Yawrd](https://yawrd.keelbase.io) · [Genesis Project — YAW-001](https://yawrd.keelbase.io/yawrd/yaw-001) · [Public Contributions](https://github.com/vandigital/yawrd-build-progress) · [Documentation](https://yawrd.keelbase.io/docs)

---

## Progress since submission

**Documentation checkpoint: November 15, 2026 (Asia/Manila).** Release states are deliberately separate:

| State | Verified progress and boundaries |
|---|---|
| **Verified Production/public** | Genesis completed the YAW-001 contribution/reward lifecycle: two accepted GitHub contributions, human-controlled acceptance and a historically verified 1 NEAR Testnet payout. Current HTTP 200 checks confirm `/`, `/docs`, `/create` and `/yawrd/yaw-001`; Genesis shows integrated Build Progress, accepted work and closed applications. Production `/create` still presents the older preview-only builder. |
| **Verified Development** | C1/C2 implement wallet-first welcome, guided signed-message sign-in, provisional Testnet consent, guided intake, independently operated AI assistance via copyable questions, and account-scoped browser drafts. C3A adds a founder dashboard and authorized saved-project preview. WordWake is a genuine second project with a verified deployed Testnet DAO, reviewed Blueprint, saved T1/T2 drafts and Project Resources. C3B adds governance preparation; C4A adds per-task browser-local reward drafts. These are localhost capabilities, not a Production release claim. |
| **Implemented but not executed** | C3C adds guarded Meteor wallet actions for a WordWake security proposal and two separate Steward approvals. Simulated browser coverage and read-only checks establish implementation, not real signing or execution. No hardening proposal has been submitted. Formal reward approval and funding remain separate unmet dependencies. |
| **Planned** | Generalized new-project deployment through the newer journey, durable server storage for new pre-deployment drafts, funded WordWake launch, public Join activation and broader multi-project/agent workflows. |

WordWake remains **private, unpublished and unavailable for applications**. The latest recorded read-only network check (01:17:59 Manila, November 15; finalized block 277686724) found automatic updates enabled and no proposal. This is dated evidence, not a fresh network check by this documentation update. Proposed T1/T2 rewards are **1 NEAR each, saved only in the founder's browser**; they are neither approved commitments nor funded rewards. No private founder intake or database records are included here.

Delivery evidence: [C1 welcome and consent](docs/hackathon-progress-2026-11-15.md#c1-welcome-and-sign-in), [C2 intake and browser drafts](docs/hackathon-progress-2026-11-15.md#c2-guided-intake), [C3A founder dashboard](docs/hackathon-progress-2026-11-15.md#c3a-founder-dashboard), [C3B governance preparation](docs/hackathon-progress-2026-11-15.md#c3b-governance-preparation), [C3B stability correction](docs/hackathon-progress-2026-11-15.md#c3b-stability-correction), [C4A reward configuration](docs/hackathon-progress-2026-11-15.md#c4a-task-reward-drafts), and [current C3C wallet integration](docs/hackathon-progress-2026-11-15.md#c3c-wallet-integration). This public checkpoint summarizes maintainer-reported Development results; local implementation reports and private-source artifacts are not bundled in this release.

## See Yawrd in action

Our first project is **YAW-001 — Build Progress**, where we used Yawrd to help build Yawrd itself.

On November 7, 2026, YAW-001 completed a founder-operated NEAR Testnet demonstration involving real participant applications, human-attested AI-agent contributions, public GitHub merges, signed contribution submission and founder acknowledgement, DAO governance and a successful 1 NEAR Testnet reward transfer.

This was a real, bounded lifecycle—not a simulated payout or synthetic contribution record.

**What the demonstration proves:**

1. A project can be deployed through an authorized operator workflow and published on Yawrd.
2. Participants can authenticate with NEAR wallets, apply and receive creator approval.
3. Approved participants can associate independently operated AI agents with their membership.
4. AI agents can generate attributable work submitted through a human-controlled GitHub process.
5. Human maintainers can review, correct, accept and merge contributions.
6. Accepted work can be acknowledged separately from payment authorization.
7. DAO Stewards can authorize a reward, with settlement verified through a real NEAR Testnet execution receipt.

Participation, contribution acceptance and treasury authorization are deliberately separate decisions.

YAW-001 is **Completed · Applications closed**. The public project page and its integrated Build Progress snapshot were verified by a read-only HTTP check on November 15, 2026. Existing authorized historical participation, contribution and Steward workspaces are retained. This public-route check does not establish the deployed Git SHA or reverify historical reward settlement.

## Genesis: YAW-001 — Build Progress

*Building Yawrd, together.*

YAW-001 was created to develop a public Build Progress experience showing project milestones, contributors, associated agents and accepted work.

Two independently generated AI contributions were accepted into the [public Build Progress repository](https://github.com/vandigital/yawrd-build-progress).

| Task | Contribution | Outcome |
|---|---|---|
| A — Project Progress | VanClaw / IronClaw, using operator-reported Qwen inference via NEAR AI Cloud | [PR #2 merged](https://github.com/vandigital/yawrd-build-progress/pull/2); no reward allocation |
| B — Crew and Contributions | YAW-001 Hermes Contributor | [PR #4 merged](https://github.com/vandigital/yawrd-build-progress/pull/4); approved 1 NEAR Testnet reward |

Original agent implementations were reviewed and corrected where necessary by Codex, with human approval before merging. Agent authorship and model provenance are operator-attested; GitHub identities alone do not cryptographically prove AI authorship.

The portable components are complete in the public contribution repository. Build Progress integration (`8b01cb5`) and the November 12 approved project-page checkpoint (`8f805ab`) are recorded in the [public Genesis checkpoint](docs/hackathon-progress-2026-11-15.md#genesis-public-baseline). The public Genesis route now displays a server-published, evidence-backed progress snapshot alongside accepted deliverables and contribution links. This does not imply a published crew roster, automated GitHub synchronization or fresh payout verification.

### Governed reward — 1 NEAR Testnet paid

YAW-001's Task B contribution was acknowledged in the Production application and subsequently rewarded through the Genesis DAO.

| Field | Recorded outcome |
|---|---|
| Network | NEAR Testnet |
| DAO | `demo.factory.yawrd.testnet` |
| Proposal | #1 |
| Steward policy | 2/2 approvals |
| Reward | 1 NEAR Testnet |
| Recipient | `keelbase1.testnet` |
| Settlement | Successful on-chain transfer |

The two Steward wallet accounts were distinct but both controlled by the founder. This demonstrates two-account governance authorization, not independent multi-person governance.

**Public blockchain evidence:**

- [Final Steward approval transaction](https://testnet.nearblocks.io/txns/RaXRoBEcCSMoQcas4P8Yu46jp2hZVrJs6CPNuHALF6R)
- [Successful payout transfer execution receipt](https://testnet.nearblocks.io/txns/RaXRoBEcCSMoQcas4P8Yu46jp2hZVrJs6CPNuHALF6R/execution#DcwQrmzbh9WRaJ71sWPBxgYbvP19dyPQ8mCuDU9kmdy)

The transfer receipt is the result of the final approval transaction, not a separately signed payout transaction. Yawrd displays verified settlement rather than treating proposal approval alone as proof of payment.

For detailed contribution provenance, verification and limitations, see the [YAW-001 Build Progress README](https://github.com/vandigital/yawrd-build-progress).

---

## Judge walkthrough

1. Open [YAW-001](https://yawrd.keelbase.io/yawrd/yaw-001). Inspect the completed project, closed applications, accepted work and recorded Testnet reward.
2. Choose **Follow the public build** to open the [public contribution repository](https://github.com/vandigital/yawrd-build-progress); inspect the merged changes and review evidence in [Task A PR #2](https://github.com/vandigital/yawrd-build-progress/pull/2) and [Task B PR #4](https://github.com/vandigital/yawrd-build-progress/pull/4).
3. Inspect Proposal **#1** through the project's reward/governance evidence or the [project contract](https://testnet.nearblocks.io/address/demo.factory.yawrd.testnet#contract), using the read-only `get_proposal` method with `{"id":1}`: the recorded reward is 1 NEAR Testnet to `keelbase1.testnet`, with a 2/2 Steward policy. The [payout integration notes](docs/yaw001-reward-payout.md) explain proposal reads and verification.
4. Inspect the [final Steward approval transaction](https://testnet.nearblocks.io/txns/RaXRoBEcCSMoQcas4P8Yu46jp2hZVrJs6CPNuHALF6R) and its [transfer execution receipt](https://testnet.nearblocks.io/txns/RaXRoBEcCSMoQcas4P8Yu46jp2hZVrJs6CPNuHALF6R/execution#DcwQrmzbh9WRaJ71sWPBxgYbvP19dyPQ8mCuDU9kmdy). The transfer executes within that approval transaction; it is not a separately signed payout transaction.
5. Review the architecture, local setup, validation record and limitations below. Public evidence inspection requires no wallet signature; historical workspaces require existing authorization.

## How Yawrd works

A **Yawrd** is a collaborative project space. Its creator establishes the project and its rules, participants apply to join, and independently operated agents can assist approved members.

The underlying NEAR DAO supplies governance over authorized treasury actions. The DAO is one component of the Yawrd experience, not the entire product.

Unlike a conventional task marketplace, Yawrd organizes collaboration around a shared project, reviewed work and explicit authority over Project Funds. A task being accepted does not automatically trigger a payment.

The collaboration model separates:

- **Identity:** Wallet ownership verified through a signed message.
- **Membership:** Creator-controlled application and approval.
- **Agent association:** An approved participant consents to a human-declared agent reference.
- **Contributions:** Work is attributable through tasks, source records and review evidence.
- **Acceptance:** Human maintainers decide whether work is accepted.
- **Rewards:** DAO authorization and verified on-chain settlement are independent of contribution acceptance.

Connecting an agent does not give it control of a wallet, GitHub permissions or DAO funds.

In the newer Development creation journey, founders connect a wallet, explicitly sign in, describe their project, review their intake and continue to setup. They may copy questions to an independently operated AI assistant and review its answers themselves; intake does not call an AI service. The existing WordWake Blueprint workspace separately demonstrates controlled AI-assisted preparation. A browser save does not create a DAO or publish a Yawrd.

Wallet connection selects an account; a verified signed message establishes sign-in without payment. DAO creation is a separate wallet transaction with setup/network costs. Reward funding is a separate deposit to Project Funds. Payout authorization requires Steward approval and successful transfer receipts. The provisional Testnet Terms checkbox is an in-memory UI gate, not durable wallet-bound consent or Mainnet consent.

## Technical architecture

Yawrd's MVP uses:

| Layer | Technology |
|---|---|
| Web application | Next.js App Router, React, TypeScript, Tailwind CSS |
| Hosting | Vercel |
| Authentication | Meteor / NEAR Connect, NEP-413 |
| Persistence | Neon PostgreSQL |
| Collaboration | GitHub repositories and reviewed pull requests |
| Governance | NEAR Testnet, Sputnik-compatible DAO/factory infrastructure |
| Verification | NEAR Testnet RPC and finalized transaction receipts |

Application routes include `/`, `/docs`, `/create` and `/yawrd/[projectId]`. Server-side API handlers enforce session-based authorization and restrict access to private project information.

This repository contains Yawrd's application and integration code. It does not contain the deployed Sputnik Rust contract implementation or WASM binaries. The deployed governance infrastructure was based on public upstream Sputnik interfaces, including the pinned compatibility reference [`near-daos/sputnik-dao-contract`](https://github.com/near-daos/sputnik-dao-contract/tree/5434a59dec23ee0c49df8c8c4350c208a7e75b0b).

GitHub contributions are reviewed externally; the MVP does not provide autonomous GitHub PR synchronization or general-purpose agent execution.

## Run locally

### Requirements

- Node.js and npm
- A supported development environment for Next.js
- Neon PostgreSQL and suitable application configuration for persistent, database-backed workflows
- NEAR Testnet wallet access for live authenticated participation

The publication candidate was successfully validated using **Node.js 26.12.1** and **npm 11.20.0**. Earlier Node versions have not been established as fully compatible with the repository's development tooling.

### Install and start

```bash
git clone https://github.com/vandigital/yawrd.git
cd yawrd
npm ci
npm run dev
```

Open `http://localhost:3000`.

The application includes public presentation routes, but running the full persistent YAW-001 workflow requires a correctly provisioned development database and configuration.

Review `.env.example` for supported configuration variables. Do not use Production database credentials for local development. The existing SQL migration files and proposals do not constitute a fully automated setup for every feature; schema, role grants and runtime permissions must be provisioned appropriately.

### Run the checks

```bash
npm run typecheck
npm test
npm run test:contributions
npm run test:payout
npm run build
```

**Accepted 09A.4 validation — November 9, 2026**

The 09A.4 release-candidate acceptance report validates exact candidate `32a362a38ef21c1ed8c8e29f53995fbf919bec76`:

| Check | Result |
|---|---|
| Core test suite | 247 passed |
| Contribution test suite | 194 passed |
| Payout test suite | 39 passed |
| TypeScript validation | Passed |
| Production build | Passed |
| Browser checks | 20 passed |

Publication preparation culminated in README commit `5ff772e` after focused test correction `5c4b6ac`. Two subsequent UX milestones changed the application: shared navigation (`99537e8`, 09A.1a) and the YAW-001 project redesign/application closure (`32a362a`, 09A.2). The table reflects the later 09A.4 acceptance, superseding the preparation checkpoint's 240 core tests and eight HTTP smoke checks; those earlier smoke checks are historical, not fresh candidate results.

The committed [09A.1a](docs/milestone-09a-1a-shared-navigation.md) and [09A.2](docs/milestone-09a-2-project-experience.md) reports preserve their original implementation/review snapshots. References there to uncommitted work, pending acceptance, local paths and ignored screenshots/logs describe those checkpoints, not the accepted candidate or publicly bundled artifacts.

These separately executed suites should not be combined into a single coverage count. Browser coverage includes built routes and offline fixtures with mocked wallet/auth/RPC responses. It does not establish fresh live database, Meteor, Production or on-chain acceptance. These historical results do not describe the current documentation validation.

### Later validation evidence

The [November 14 shared-project summary](docs/hackathon-progress-2026-11-15.md#historical-validation) records separate runs: 36 focused tests, 194 contribution tests, 39 payout tests and one mocked project browser suite across four widths. Its full core run had 266 passes and two existing migration-inventory failures. Those failures remain outside this documentation task.

The [November 15 C3C summary](docs/hackathon-progress-2026-11-15.md#historical-validation) records 236 focused tests, five simulated browser checks and a separate 131.3-second dashboard stability regression. Wallet, session and chain responses in those browser checks are simulated; they do not prove live Meteor signing or governance execution. Counts overlap other suites and must not be added together.

The [public checkpoint](docs/hackathon-progress-2026-11-15.md#release-validation) separates documentation release validation from historical Development results. Local build success is not a deployment.

## MVP status and limitations

**Status: Completed Genesis Testnet lifecycle; newer founder workflows verified in Development.**

- **Creation and storage:** Production still serves the preview-only builder. The newer Development journey supports intake and setup, but general new-project deployment and cross-device recovery of browser-local drafts remain unfinished. Genesis and WordWake deployments do not establish generalized launch readiness. A factory call outside Yawrd is separate from platform publication, membership or reward authorization; see the historical [creation compatibility record](docs/milestone-05.1.md#c-factory-compatibility).
- **Authentication and consent:** Guided verified sign-in exists in Development. Connection alone is not authentication. The Testnet checkbox is provisional and not an auditable consent record; durable versioned consent and legal review remain required before Mainnet.
- **Discovery and participation:** Discovery is curated. Genesis applications are closed; WordWake remains private. Public Join for new projects is planned.
- **Agents:** Associations and model provenance remain operator-attested. Yawrd does not host agents, independently certify their authorship or synchronize arbitrary GitHub PRs automatically.
- **Rewards:** The verified Genesis payout is a bounded Testnet demonstration, not a generalized payment service. WordWake reward drafts are browser-local and unapproved; reward approval, funding and launch are outstanding.
- **Governance:** Genesis used two distinct founder-controlled accounts, not independent multi-person governance. WordWake's C3C controls are implemented for human review; no proposal, approval or security change has executed. Automatic updates were still enabled at the last recorded read.
- **Release verification:** November 15 public HTTP checks establish visible route content, not a deployed commit identity, authenticated workspace validation or fresh on-chain settlement. This documentation update deploys nothing.

## Contributing

Yawrd's Genesis contributors worked through bounded tasks, explicit component contracts, GitHub pull requests and human review.

The public [YAW-001 Build Progress repository](https://github.com/vandigital/yawrd-build-progress) contains the accepted portable components, contribution evidence, synthetic fixtures and task documentation.

Changes to the main Yawrd platform remain subject to maintainer review and authorization. Publication of this repository does not imply unrestricted access to project membership, agent permissions or governance.

## Source availability and attribution

Yawrd is a Keelbase initiative.

This repository is publicly available for inspection and hackathon evaluation. Public agent contributions and Genesis evidence belong in the separate [Build Progress repository](https://github.com/vandigital/yawrd-build-progress). **No general software reuse license is granted at this stage.** Public visibility should not be interpreted as permission to reuse, redistribute or relicense the application, brand or artwork. Existing third-party license obligations and contributor attribution remain applicable.

**Reuse and hackathon-period work:** The [approved Blueprint](docs/genesis/YAW-001_BLUEPRINT_V1.md#5-build-architecture) identifies existing Keelbase/Sputnik-derived governance infrastructure. This is reused foundation, not a newly authored hackathon smart contract. Repository history also records Yawrd safeguards, creation/wallet integration, participant foundations, Blueprint work and public component contracts on October 27–31, before the stated November 1–14 hackathon window (`dfb7939` through `7e1837a`).

Within that window, recorded Yawrd commits include landing copy/artwork (`af172de`, November 1), Genesis publication preparation (`ed36d37`, November 3), project presentation (`8b9c5e6`, November 4), contribution acceptance and governed reward/receipt integration (`e391043` through `c97c62a`, November 7), and shared navigation/completed-project UX (`99537e8`, `32a362a`, November 9). These are repository commit dates, not proof of when every line was authored. Public PR #2 and PR #4 provide separately reviewable contribution evidence; this repository does not establish the original development dates of the reused Keelbase/Sputnik foundations.

The public upstream Sputnik implementation and the separately contributed Build Progress components retain their respective provenance and licensing considerations.

---

*A Keelbase Experience.*
