# YAW-001 — Build Progress
**Canonical Project Specification — Blueprint v1**

**Decision date:** October 29, 2026  
**Concept:** APPROVED  
**Status:** APPROVED — Version 1  
**Lifecycle:** NOT STARTED  
**Hackathon:** NEAR, November 1–14, 2026

**Approval record:** [Product-owner approval through ChatGPT](YAW-001_APPROVAL.md), October 29, 2026. This is scope approval, not a wallet-signed or on-chain approval.

## 1. Project Identity

- **Project reference:** YAW-001
- **Project name:** Build Progress
- **Tagline:** Building Yawrd, together.
- **Creator wallet:** `yawrd1.testnet`
- **Target DAO:** `demo.factory.yawrd.testnet` (not yet deployed)
- **Factory:** `factory.yawrd.testnet` (deployment pending)
- **Existing private platform repository:** `vandigital/yawrd`
- **Contribution repository:** New independent public GitHub repository, to be created during the YAW-001 lifecycle.

`YAW-001` is the public project reference, not necessarily the application's internal database identifier.

## 2. Public Project Description

Build Progress gives every Yawrd a visual way to share what is being built, follow project milestones and recognize the people and AI agents contributing to it.

We're building this feature collaboratively as Yawrd's first project, demonstrating how independent contributors can turn one person's vision into a working product.

## 3. Purpose and Success Criteria

The project must demonstrate Yawrd's complete lifecycle:

**Create → Deploy → Discover → Apply → Approve → Contribute → Review → Reward.**

Success requires:

- A Yawrder-approved Blueprint and genuine Yawrd creation through the platform.
- A deployed and verified NEAR Testnet DAO.
- A separate, reviewable public development repository.
- An approved Yawrdee and independently operated agent submitting genuine work.
- A working Build Progress feature integrated into the platform.
- Traceable contribution, review and acceptance evidence.
- A separately authorized DAO reward with verified transaction evidence.

A second independent contributor is strongly preferred, but is not required for the baseline demonstration. The demo must accurately disclose the number of contributors.

## 4. Feature Scope

**Deliverable:** One public-facing, read-only Build Progress experience.

### Task A — Project Progress

Build a visual overview showing:

- Published project milestones.
- Public task statuses.
- Recent accepted development activity.

### Task B — Crew and Contributions

Build a compatible panel showing:

- Approved public contributor profiles.
- Registered agent identities, where authorized for publication.
- Accepted contributions and their current published status.

### Review and Integration

Validate both components against their acceptance criteria, run relevant tests, request corrections when needed and integrate accepted work into the existing Yawrd application.

Both components must follow Yawrd's established visual language and use an agreed public data interface.

## 5. Build Architecture

The project uses the existing Yawrd infrastructure:

- Next.js App Router and Vercel for the application.
- Neon PostgreSQL for private operational records.
- Meteor NEP-413 and server sessions for authenticated access.
- GitHub for code, branches, PRs and CI.
- Existing Keelbase/Sputnik-derived DAO infrastructure for governance.
- Existing NEAR AI Cloud-connected IronClaw as the primary independent agent.

The public contribution repository must not expose the private platform source, private Neon data, credentials or proprietary Keelbase components.

Agents develop against a minimal public component interface and appropriate test fixtures. Authorized platform maintainers review and integrate the results.

The precise repository packaging and integration method must be determined from the existing codebase before contribution tasks are assigned.

## 6. Blueprint and Creation Journey

The intended Yawrder journey is:

1. Enter a rough idea or import an existing project plan.
2. Prepare a Blueprint through Yawrd's structured planning guidance.
3. Request an on-demand NEAR AI Cloud readiness assessment.
4. Review recommendations and explicitly approve a Blueprint version.
5. Proceed through the existing **Details → Stewards → Review** Creation Builder.
6. Explicitly authorize DAO deployment.
7. Associate the approved Blueprint, DAO and contribution repository with the workspace.
8. Activate the Yawrd for participation, then open participant applications.

Participant applications begin only after the Yawrd is activated for participation. The Milestone 07B application workflow is already implemented and **ACCEPTED for development/Testnet**; that acceptance does not activate YAW-001.

NEAR AI assessment is advisory. It cannot rewrite the Blueprint, alter governance settings or authorize deployment.

For YAW-001, the product owner explicitly approved Blueprint v1 on October 29, 2026 before this advisory step. The NEAR AI readiness assessment remains pending; scope approval does not establish readiness or authorize activation.

The existing Creation Builder remains authoritative for wallet identities, governance signers, approval thresholds and factory configuration.

For Genesis, the Blueprint experience may be introduced incrementally without disabling the established direct creation path.

## 7. Crew and Contributions

**Primary contributor:** Existing IronClaw instance operated through NEAR AI Cloud.

**Additional contributor:** One invited, approved community Yawrdee and their agent, if available.

**Coordination:** Existing application workflows and human oversight. No continuously running AI coordinator is required.

The following are distinct authorization steps:

- **Verified human wallet identity:** Authenticates the human operator's wallet account through Meteor NEP-413 and a verified server session; it does not approve membership.
- **Approved participant membership:** Requires creator approval of the participant's application for that Yawrd and grants its authorized participant access.
- **Human-authorized agent association:** Requires a human operator to authorize the agent associated with their participation; membership does not establish that association.
- **Separate GitHub repository permissions:** Require explicit repository access authorization; participant approval grants no GitHub permissions.
- **Contribution review and acceptance:** Require an authorized reviewer to assess submitted work; identity, membership, agent association and repository access do not establish contribution acceptance.

Only verified human wallet identity and approved participant membership are implemented and accepted for development/Testnet. Agent association, GitHub contribution authorization and contribution review/acceptance workflows remain pending.

Each accepted contribution must retain the associated task, human operator, agent identity, source revision, review outcome and reward references.

Contributions may be accepted, returned for changes or rejected by an authorized reviewer.

## 8. Privacy and Publication

**Public:** Approved project description, milestones, published statuses, approved contributor information and selected governance evidence.

**Restricted:** Draft Blueprints, applications, unpublished work, private discussions, credentials and internal project data.

No private project data becomes public merely because the Yawrd has a public page or repository.

Build Progress publishes only deliberately approved public data. Private applications, draft Blueprints and internal records remain restricted through server-side authorization; participant approval does not authorize their publication.

## 9. Governance and Rewards

- **Network:** NEAR Testnet.
- **Treasury:** YAW-001 DAO.
- **Governance signers:** Intended existing 2-of-2 configuration involving `yawrd.testnet` and `yawrd1.testnet`.
- **Reward policy:** Fixed task rewards are proposed, subject to owner authorization of amounts and terms before assignment.
- **Reward amounts and terms:** Pending owner authorization before assignment.

Contribution acceptance and reward payout approval remain separate decisions. Contribution acceptance does not authorize payment; payment requires separate governance approval.

No agent receives treasury administration or unilateral spending authority.

Contribution attribution does not automatically create royalty, ownership or revenue-sharing entitlements.

## 10. Explicit Exclusions

The Genesis MVP does not include:

- AI Build Monitor or continuous build surveillance.
- Autonomous agent swarms.
- Universal agent hosting or automated subaccount provisioning.
- Royalty distribution or automated contribution scoring.
- New governance contracts unless an established security gate requires a narrow fix.
- Sage/Jev integration.
- Automated GitHub repository provisioning or an additional storage infrastructure.

## 11. Implementation Dependencies and Current Status

**Completed or established:** Existing Creation Builder, wallet-signing verification, Neon development integration and participant-application implementation.

**Milestone 07B: ACCEPTED for development/Testnet** on October 29, 2026. Evidence recorded in [Milestone 07B](../milestone-07b.md):

- **106 offline tests passed** and **13 live database results passed**.
- Real two-wallet Meteor NEP-413 acceptance completed with creator **`yawrd1.testnet`** and applicant **`olddadai.testnet`**.
- Approval, rejection, restricted access, persistence and cross-project isolation verified.

These results establish participant-application acceptance within the development/Testnet scope, not production launch approval.

**NEAR AI Cloud preparation:** A dedicated Workspace API key has been prepared with an **owner-reported $10 spending limit**. No credentials are recorded here. Key preparation does not establish project-specific agent connection or readiness; the actual readiness assessment and agent invocation remain pending.

**Pending:** Blueprint preparation implementation, NEAR AI readiness assessment and agent invocation, human-authorized agent association, DAO deployment, independent contribution repository and GitHub contribution authorization, contribution review/acceptance workflows, agent contribution, integration and reward settlement.

No project deployment or coding contribution should be represented as completed until real execution evidence exists.

## 12. Launch Conditions

Before build work begins:

- The Yawrder has approved the actual Blueprint version.
- DAO deployment and its security gates have completed successfully.
- The independent contribution repository exists.
- The public component/data interface is agreed.
- Contributor permissions and task reward terms are authorized.
- The application can associate the approved Yawrdee, agent and submitted contribution.
- Human review and payout authorization remain enforceable.

All activation requirements above remain in force. Milestone 07B acceptance does not establish Blueprint approval, DAO deployment, agent connection, GitHub contribution authorization or reward availability. Blueprint v1 is **APPROVED — Version 1** by the separate product-owner approval recorded above, and the YAW-001 lifecycle remains **NOT STARTED**. DAO deployment, project activation and spending remain unauthorized; reward amounts and terms remain unapproved.

**Success is a real integrated product feature delivered through the Yawrd lifecycle—not a simulated agent collaboration or an ordinary bounty payment.**

---

**Document authority:** This is the product-owner-approved YAW-001 Blueprint v1. Approval establishes the feature scope; execution remains gated by the required activation steps and separate authorizations. Changes to the approved scope must be versioned rather than silently overwritten.
