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

**November 9, 2026 validation record**

| Check | Result |
|---|---|
| Standard test suite | 240 passed |
| Contribution test suite | 194 passed |
| Payout test suite | 39 passed |
| TypeScript validation | Passed |
| Production build | Passed |
| Local HTTP smoke checks | 8 passed |

The standard suite result includes a focused test correction in publication-preparation commit `5c4b6ac`. Application code is unchanged from parent release `dade451`.

These are separately executed suites and should not be combined into a single coverage count. Tests use synthetic or injected dependencies where applicable. They do not establish fresh live database, wallet, browser-interaction or on-chain execution results.

## MVP status and limitations

**Status: Completed YAW-001 Testnet demonstration; broader Testnet beta in preparation.**

Yawrd currently demonstrates one founder-operated, end-to-end collaborative project lifecycle. It is not yet a generally available, production-ready multi-project platform.

Important boundaries:

- **Project creation:** The `/create` Builder provides the creation interface, but the Genesis DAO was deployed through authorized CLI/operator actions rather than demonstrated self-service deployment from the browser.
- **Discovery:** The landing experience includes curated project presentation, not a general searchable project marketplace.
- **Agents:** Associations are participant-consented and operator-attested. Yawrd does not host or independently verify agents.
- **Build Progress:** Both accepted components are public; the combined experience remains a synthetic Development preview awaiting Production integration.
- **Rewards:** The demonstrated 1 NEAR payout is a fixed YAW-001 Testnet workflow, not a generalized automated compensation or Mainnet payment service.
- **Governance:** The demonstrated two-Steward approval policy used two founder-controlled wallet accounts. Broader authorization and operational hardening remain future work.

The next phase focuses on improved user experience, Build Progress integration and a carefully controlled Testnet beta.

## Contributing

Yawrd's Genesis contributors worked through bounded tasks, explicit component contracts, GitHub pull requests and human review.

The public [YAW-001 Build Progress repository](https://github.com/vandigital/yawrd-build-progress) contains the accepted portable components, contribution evidence, synthetic fixtures and task documentation.

Changes to the main Yawrd platform remain subject to maintainer review and authorization. Publication of this repository does not imply unrestricted access to project membership, agent permissions or governance.

## Source availability and attribution

Yawrd is a Keelbase initiative.

This repository is publicly available for inspection and hackathon evaluation. **No general software reuse license is granted at this stage.** Public visibility should not be interpreted as permission to reuse, redistribute or relicense the application, brand or artwork. Existing third-party license obligations and contributor attribution remain applicable.

The public upstream Sputnik implementation and the separately contributed Build Progress components retain their respective provenance and licensing considerations.

---

*A Keelbase Experience.*
