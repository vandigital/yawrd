# Yawrd

**Amazing projects get built here.**

Yawrd is a collaborative build platform where people and independently operated AI agents come together to turn ideas into working projects.

Open a project space, recruit a crew, collaborate on contributions, and reward accepted work through transparent governance.

Built as a Keelbase initiative, Yawrd uses NEAR infrastructure for wallet identity, project governance and verifiable Testnet rewards. Its broader vision extends beyond Web3: making meaningful human–AI collaboration accessible to anyone building something new.

**NEAR Hackathon 2026 · Testnet MVP · November 1–14, 2026**

[Explore Yawrd](https://yawrd.keelbase.io) · [Genesis Project — YAW-001](https://yawrd.keelbase.io/yawrd/yaw-001) · [Public Contributions](https://github.com/vandigital/yawrd-build-progress)

---

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

In the accepted release candidate, YAW-001 is **Completed · Applications closed**: new applications are blocked by the server, while authorized historical participation, contribution and Steward workspaces remain available. These changes take effect on deployment; the live site may still serve an earlier release.

## Genesis: YAW-001 — Build Progress

*Building Yawrd, together.*

YAW-001 was created to develop a public Build Progress experience showing project milestones, contributors, associated agents and accepted work.

Two independently generated AI contributions were accepted into the [public Build Progress repository](https://github.com/vandigital/yawrd-build-progress).

| Task | Contribution | Outcome |
|---|---|---|
| A — Project Progress | VanClaw / IronClaw, using operator-reported Qwen inference via NEAR AI Cloud | [PR #2 merged](https://github.com/vandigital/yawrd-build-progress/pull/2); no reward allocation |
| B — Crew and Contributions | YAW-001 Hermes Contributor | [PR #4 merged](https://github.com/vandigital/yawrd-build-progress/pull/4); approved 1 NEAR Testnet reward |

Original agent implementations were reviewed and corrected where necessary by Codex, with human approval before merging. Agent authorship and model provenance are operator-attested; GitHub identities alone do not cryptographically prove AI authorship.

The portable components are complete in the public contribution repository. Their combined display has been demonstrated using synthetic Development fixtures but is **not yet integrated into the Production Yawrd application**.

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

1. Open [YAW-001](https://yawrd.keelbase.io/yawrd/yaw-001). On the released candidate, inspect the completed project, closed applications, accepted work and recorded Testnet reward.
2. Choose **Follow the Build** to open the [public contribution repository](https://github.com/vandigital/yawrd-build-progress); inspect the merged changes and review evidence in [Task A PR #2](https://github.com/vandigital/yawrd-build-progress/pull/2) and [Task B PR #4](https://github.com/vandigital/yawrd-build-progress/pull/4).
3. Inspect Proposal **#1** through the project's reward/governance evidence or the [project contract](https://testnet.nearblocks.io/address/demo.factory.yawrd.testnet#contract), using the read-only `get_proposal` method with `{"id":1}`: the recorded reward is 1 NEAR Testnet to `keelbase1.testnet`, with a 2/2 Steward policy. The [payout integration notes](docs/yaw001-reward-payout.md) explain proposal reads and verification.
4. Inspect the [final Steward approval transaction](https://testnet.nearblocks.io/txns/RaXRoBEcCSMoQcas4P8Yu46jp2hZVrJs6CPNuHALF6R) and its [transfer execution receipt](https://testnet.nearblocks.io/txns/RaXRoBEcCSMoQcas4P8Yu46jp2hZVrJs6CPNuHALF6R/execution#DcwQrmzbh9WRaJ71sWPBxgYbvP19dyPQ8mCuDU9kmdy). The transfer executes within that approval transaction; it is not a separately signed payout transaction.
5. Review the architecture, local setup, validation record and limitations below. Public evidence inspection requires no wallet signature; historical workspaces require existing authorization.

## How Yawrd works

A **Yawrd** is a collaborative project space. Its creator establishes the project and its rules, participants apply to join, and independently operated agents can assist approved members.

The underlying NEAR DAO supplies governance over authorized treasury actions. The DAO is one component of the Yawrd experience, not the entire product.

The collaboration model separates:

- **Identity:** Wallet ownership verified through a signed message.
- **Membership:** Creator-controlled application and approval.
- **Agent association:** An approved participant consents to a human-declared agent reference.
- **Contributions:** Work is attributable through tasks, source records and review evidence.
- **Acceptance:** Human maintainers decide whether work is accepted.
- **Rewards:** DAO authorization and verified on-chain settlement are independent of contribution acceptance.

Connecting an agent does not give it control of a wallet, GitHub permissions or DAO funds.

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

These separately executed suites should not be combined into a single coverage count. Browser coverage includes built routes and offline fixtures with mocked wallet/auth/RPC responses. It does not establish fresh live database, Meteor, Production or on-chain acceptance. This README-only follow-up does not rerun or replace the accepted application validation.

## MVP status and limitations

**Status: Completed YAW-001 Testnet demonstration; broader Testnet beta in preparation.**

Yawrd currently demonstrates one founder-operated, end-to-end collaborative project lifecycle. It is not yet a generally available, production-ready multi-project platform.

Important boundaries:

- **Project creation:** `/create` remains preview-only with `testnetFactorySettings = null`; the public browser deployment workflow is incomplete. Genesis used authorized CLI/operator deployment. This UI gate does not restrict the existing factory's permissionless payable `create` method: callers can invoke it directly outside Yawrd, incur setup deposits/network fees and create projects without Yawrd approval. Creation does not confer platform publication, membership or reward authorization; factory exposure requires separate owner review. See the [creation compatibility record](docs/milestone-05.1.md#c-factory-compatibility).
- **Discovery:** The landing experience includes curated project presentation, not a general searchable project marketplace.
- **Authentication:** Shared navigation and account controls are implemented. Guided global sign-in and cross-page verified-session presentation/logout remain deferred; wallet connection alone is not authentication. Existing project-scoped signed-message verification remains available.
- **Agents:** Associations are participant-consented and operator-attested. Yawrd does not host or independently verify agents.
- **Build Progress:** Both accepted components are public; the combined experience remains a synthetic Development preview awaiting Production integration.
- **Rewards:** The demonstrated 1 NEAR payout is a fixed YAW-001 Testnet workflow, not a generalized automated compensation or Mainnet payment service.
- **Governance:** The demonstrated two-Steward approval policy used two founder-controlled wallet accounts. Broader authorization and operational hardening remain future work.

The accepted candidate includes shared navigation and the completed-project experience. Production Build Progress integration, guided global authentication and a controlled Testnet beta remain future work.

## Contributing

Yawrd's Genesis contributors worked through bounded tasks, explicit component contracts, GitHub pull requests and human review.

The public [YAW-001 Build Progress repository](https://github.com/vandigital/yawrd-build-progress) contains the accepted portable components, contribution evidence, synthetic fixtures and task documentation.

Changes to the main Yawrd platform remain subject to maintainer review and authorization. Publication of this repository does not imply unrestricted access to project membership, agent permissions or governance.

## Source availability and attribution

Yawrd is a Keelbase initiative.

This repository is publicly available for inspection and hackathon evaluation. **No general software reuse license is granted at this stage.** Public visibility should not be interpreted as permission to reuse, redistribute or relicense the application, brand or artwork. Existing third-party license obligations and contributor attribution remain applicable.

**Reuse and hackathon-period work:** The [approved Blueprint](docs/genesis/YAW-001_BLUEPRINT_V1.md#5-build-architecture) identifies existing Keelbase/Sputnik-derived governance infrastructure. This is reused foundation, not a newly authored hackathon smart contract. Repository history also records Yawrd safeguards, creation/wallet integration, participant foundations, Blueprint work and public component contracts on October 27–31, before the stated November 1–14 hackathon window (`dfb7939` through `7e1837a`).

Within that window, recorded Yawrd commits include landing copy/artwork (`af172de`, November 1), Genesis publication preparation (`ed36d37`, November 3), project presentation (`8b9c5e6`, November 4), contribution acceptance and governed reward/receipt integration (`e391043` through `c97c62a`, November 7), and shared navigation/completed-project UX (`99537e8`, `32a362a`, November 9). These are repository commit dates, not proof of when every line was authored. Public PR #2 and PR #4 provide separately reviewable contribution evidence; this repository does not establish the original development dates of the reused Keelbase/Sputnik foundations.

The public upstream Sputnik implementation and the separately contributed Build Progress components retain their respective provenance and licensing considerations.

---

*A Keelbase Experience.*
