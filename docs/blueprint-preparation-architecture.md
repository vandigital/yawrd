# Blueprint Preparation — private engineering reference

**Date:** October 30, 2026 (Asia/Manila). **Status:** proposed architecture; documentation only, not implementation or activation approval. **Baseline:** private `vandigital/yawrd`, `main`, `921d14d94e58266deff9519b30f652a73c0d1ec6`.

This reference follows the repository's focused Markdown reports with relative source links and explicit verification limits. No equivalent architecture reference was found in the tracked documentation. Keep this document private; it is not a contribution-repository specification.

## Authority and current readiness

The approved requirements come from [YAW-001 Blueprint v1](genesis/YAW-001_BLUEPRINT_V1.md), especially sections 6–12, and its [approval record](genesis/YAW-001_APPROVAL.md). They require structured preparation, an on-demand advisory assessment, explicit version approval, the existing Creation Builder, separate wallet deployment authorization, private drafts and deliberate public disclosure. Genesis may preserve direct creation. Assessment cannot rewrite the Blueprint, change governance or authorize deployment. Scope approval and lifecycle activation are separate.

The workspace placement, records, field contracts and sequence below are **proposals** derived from the earlier architecture assessment, not additional approved product requirements.

| Current fact | Evidence and limit |
| --- | --- |
| Milestones 06, 07A and 07B are accepted within their development/Testnet scopes and committed | Owner context and tracked [06](milestone-06.md), [07A](milestone-07a.md), [07B](milestone-07b.md) reports. 07B records 106 offline tests, 13 live database passes and real two-wallet acceptance; those checks were not rerun for this document. **07B is not pending.** |
| YAW-001 Blueprint v1 is **APPROVED**; lifecycle is **NOT STARTED** | Canonical Blueprint and approval record. Approval through ChatGPT is not a wallet signature or on-chain approval. Deployment, activation and spending remain unauthorized. November 1 or later is a creation gate, not authorization. |
| Private repository synchronized; public `vandigital/yawrd-build-progress` exists with main-branch protections | Owner-reported current readiness; no remote synchronization or protection audit performed here. |
| IronClaw runtime, installed Agent Skill and read-only GitHub integration verified | Owner-reported current readiness; no runtime or external integration exercised here. Contribution authorization and write permissions remain pending. This does not establish human-authorized agent association or contribution acceptance. |
| Blueprint Preparation and project-specific readiness assessment remain pending | No preparation contracts, persistence or workflow found in the inspected application sources. Runtime verification does not constitute a YAW-001 assessment. Factory settings remain `null` in [source](../src/testnet-factory-settings.ts); no deployment evidence is asserted. |

Historical statements remain in their original records: 07A predates 07B implementation; 07B's “draft awaiting formal approval” language is superseded by the approval record. Blueprint section 11's repository-pending statement and the [Agent Skill's](genesis/skills/yawrd-build-progress/SKILL.md) runtime-unverified statement predate the owner's current readiness report. This reference reconciles those facts without editing the approved documents or Skill. Repository existence and runtime readiness do not start YAW-001 or satisfy its remaining launch conditions.

## Verified reusable foundations and gaps

“Verified” here means inspected local source, supported by the recorded milestone evidence; it does not mean a fresh live-environment check.

| Foundation | Reuse and limit |
| --- | --- |
| [NEP-413 verifier](../src/identity/nep413.ts) and [persistent authentication](../src/participants/auth.ts) | Single-use database challenges, finalized Testnet FullAccess-key verification, opaque hashed session tokens, rotation/revocation and one-hour expiry. Reuse verified session identity; wallet connection alone grants no workspace access. Access-key revocation is not rechecked on every action. |
| [Neon query adapter](../src/participants/database.ts), [database guards](../src/participants/database-config.ts), [participant repository](../src/participants/repository.ts), [migration](../migrations/001_participants.sql) | Server-only parameterized queries, injected `Query` for tests, SQL-derived actors, immutable audit-record patterns and separate runtime/migration credentials. Existing project reads require `published_at`; there is **no private pre-creation workspace repository interface or Blueprint schema**. Add a separately authorized persistence design rather than publishing a draft to reuse these reads. |
| [HTTP helpers](../src/participants/http.ts) | Configured origin/Host/Origin and Fetch Metadata checks, exact request fields, 8 KiB JSON cap, Secure/HttpOnly/SameSite cookies, private/no-store responses and sanitized errors. Reuse helpers where suitable; new action authorization, payload limits and quotas still need design. The participant action router is not a generic workspace API. |
| [Public mapper](../src/public-yawrd.ts) | Field-by-field copying demonstrates allowlisting. It is a fixture presentation mapper, not a Blueprint publication or approval service. |
| [Creation UI](../app/page.tsx), [payload builder](../src/create-yawrd.ts), [creation integration](../src/creation-integration.ts) | Details → Stewards → Review already exists. Connected wallet supplies creator; configured factory supplies deployment target. Integration enforces Testnet, exactly two Stewards/two approvals, code/cost checks and separate signing. Blueprint mapping must preserve these gates and the post-creation hardening requirement before additional Project Funds. |

## Proposed architecture and data contracts

Add an owner-only **Blueprint Preparation** workspace before Details → Stewards → Review, while retaining the approved Genesis option for direct creation. Private storage must work before a DAO or published project exists. Use a stable workspace identity distinct from the public `YAW-001` reference and any future project/DAO identifier.

Flow: idea/import → owner refinement → immutable version → optional assessment request → owner review/explicit version approval → public-details mapping → existing Builder review → separately authorized wallet action. Assessment is on-demand, never an autonomous coordinator. Whether assessment is mandatory before normal approval remains an owner decision; YAW-001 already has valid scope approval before assessment.

The following are **candidate logical contracts**, not existing TypeScript interfaces, SQL tables or final schemas. Names, limits and required fields need agreement before implementation.

| Contract | Proposed contents and invariants |
| --- | --- |
| Workspace | Stable ID, Testnet owner identity derived from a live session, creation time and selected version reference. Default owner-only access; participant approval grants no draft access. No DAO needed to save preparation. |
| Blueprint version | Separate schema version and content revision, immutable version ID, workspace/parent references, author and server time. Structured identity, purpose, outcomes/acceptance criteria, scope/exclusions, work plan, participation, reward assumptions, dependencies/risks and unresolved decisions. Isolate explicitly approved public name/description from private planning text. New edits create new revisions; never overwrite approved content. |
| Advisory assessment | Assessment schema version, exact Blueprint version reference, request actor/time, provider/model and prompt version, completion/failure status, findings, uncertainties, missing evidence and refinement questions. Preserve results against the assessed revision; later edits do not inherit readiness. No mutation, approval, governance or deployment capability. Validate provider output as untrusted data. |
| Refinement prompts | Versioned question set tied to schema sections: what outcome proves success, what is excluded, what can Crew Members deliver, what dependencies remain, what may be public, and which reward terms still need approval? Preserve unknowns; suggestions require owner edits and a new revision. Prompts cannot silently supply missing evidence or authorize actions. |
| Owner approval | Immutable event referencing the exact Blueprint revision, approving session-derived owner, server time and explicit consent/approval wording version. Approval is distinct from assessment and publication permission. Editing creates an unapproved revision; it cannot inherit an earlier approval. Historical ChatGPT approval remains documentary evidence unless a separately approved import process records its provenance; do not fabricate a wallet approval. |
| Creation handoff | Bind workspace, approved revision, approval reference and selected public details to the Builder handoff. No raw Blueprint or assessment is sent to public presentation or contract arguments. Later association with a created project needs verified creation evidence and authorization. |

Proposed pure mapper output is limited to the existing `CreationInput` fields `projectName` and `projectPurpose`, sourced from the deliberately approved public name and description. Do not map the entire private purpose/scope text. Account label selection stays in Details; Stewards and threshold stay in the Builder; creator and factory stay authoritative from wallet/configuration. The mapper returns no `CreationPlan`, transaction or deployment settings and performs no I/O.

Before mapping, a future server boundary must verify live owner access and exact revision approval; a client `approved: true` flag or TypeScript type cannot prove either. Bind the handoff to that revision. If imported public details change in the Builder, require reconciliation/new version approval before claiming the result represents the approved Blueprint. Recheck wallet identity at handoff/signing; a mismatch must not transfer workspace ownership or silently substitute a creator.

## Security boundaries

- Keep drafts, assessments, imports and approval records private through server-side owner checks on every read/write. Exclude them from public APIs, metadata, unauthenticated SSR/React payloads, shared caches, GitHub and logs. Use separate allowlists for public handoff and later publication; scope approval alone permits neither blanket publication nor public-repository copying.
- Enforce immutable versions and exact foreign references in the eventual database design. Approval and handoff must reject stale/mismatched revisions atomically; concurrent saves cannot approve or map unseen edits. Reuse restricted runtime access patterns, with new privileges reviewed explicitly.
- Treat imported plans and model responses as untrusted content. Initial imports should be bounded text, without arbitrary URL fetching or file execution. Send only an explicitly disclosed, owner-authorized assessment payload to NEAR AI; settle cost limits, retention, timeouts and retry behavior first. Assessment gets no wallet, database mutation, GitHub write or deployment tools.
- Preserve participant approval, agent association, GitHub permission, contribution acceptance and reward authorization as separate decisions. Preparation grants none. Preserve existing Testnet governance restrictions, wallet cost/approval disclosures, direct creation behavior and all accepted participant workflows.

## Implementation sequence and first task

Proposed sequence, each requiring its own implementation authorization:

1. Agree the minimal public-details contract and implement/test the pure mapper below; expand the versioned Blueprint, assessment and prompt contracts separately.
2. Design owner-only workspace persistence, immutable versions/approvals and concurrency rules. Review migration/privileges before any separately authorized development migration; test cross-owner denial, expired/revoked sessions, immutability and stale approval rejection.
3. Add private preparation/refinement and explicit approval UI/API using existing auth/HTTP foundations. Test private rendering and public leakage denial. No assessment provider required for this slice.
4. Add the disclosed, on-demand assessment adapter after payload/cost approval; first use deterministic test doubles for malformed output, failures, revision binding and advisory-only behavior. Live invocation requires separate authorization.
5. Integrate approved handoff before Details, enforce drift/identity checks and regress creation, direct creation and participant workflows. Project association/publication and YAW-001 activation remain separate gates.

**Smallest independently testable first task:** a pure public-details mapper plus its minimal versioned input contract and offline tests. No UI, database, complete Blueprint schema, provider adapter or changes to creation signing are needed. File/function names remain an implementation choice.

Acceptance criteria:

- A validated public-details snapshot and matching revision/approval reference deterministically produce only `projectName` and `projectPurpose`; the input is unchanged. Approval evidence is supplied by a future trusted boundary, not authenticated by this pure function.
- Missing/blank public values, unsupported schema versions and missing/mismatched revision references fail closed under agreed validation rules. Do not silently truncate or infer private text as a fallback.
- Extra private content, assessment suggestions, creator/factory/account-label overrides, Steward lists and thresholds never appear in output. Tests include deliberately contaminated inputs and prove the exact output allowlist.
- Tests use synthetic fixtures and the installed Node/TypeScript test setup; no dependencies, credentials, network, database or wallet actions. Existing offline regression tests and typecheck pass when this future change is implemented. This document does not authorize that implementation.

## Decisions requiring product-owner approval

- Preparation entry/skip behavior, required Blueprint fields/limits and whether assessment is normally required before approval; treatment of the already-approved YAW-001 document on import.
- Exact public name/description consent, revision drift/reapproval behavior and approval withdrawal/supersession policy. Scope approval must remain separate from deployment and publication.
- Owner-only access versus future collaborators, import formats, draft/assessment retention/deletion and private-workspace-to-created-project association.
- Assessment disclosure/payload, provider/model, prompt and readiness vocabulary, budget/rate limits and failure/retry policy. Current runtime verification supplies no spending authorization.

**Preparation verification:** branch/HEAD and documentation conventions checked; relevant local sources inspected. Only this reference was added. No application tests or live checks were run for this documentation-only change; no migration, provider invocation, wallet action, deployment, staging, commit or push was performed. Approved Blueprint, approval record, Agent Skill and pre-existing unstaged `AGENTS.md` edit are preserved.
