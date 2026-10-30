# Blueprint public-details mapper — bounded unit

Implemented against the proposed [preparation architecture](blueprint-preparation-architecture.md) and approved [YAW-001 Blueprint v1](genesis/YAW-001_BLUEPRINT_V1.md), especially sections 6 and 8. This unit adds no preparation workflow or creation integration.

## Contract

[`BlueprintPublicDetailsSnapshot`](../src/blueprint-public-details.ts) v1 contains only:

| Field | Rule |
| --- | --- |
| `schemaVersion` | Numeric literal `1`; no coercion or unsupported-version fallback. |
| `blueprintRevisionId` | Explicit nonblank string identifying an immutable Blueprint revision, globally distinct across workspaces. |
| `publicName` | Explicit nonblank string selected for public disclosure. |
| `publicDescription` | Explicit nonblank string selected for public disclosure; never private purpose/scope or an assessment suggestion. |

The separately supplied `BlueprintApprovalReference` requires a nonblank `approvalId` and `blueprintRevisionId`. Revision IDs are compared exactly without trimming, case conversion or numeric interpretation. These are opaque references: the mapper does not validate their existence, uniqueness, ownership or provenance.

`mapBlueprintPublicDetails(snapshot, approvalReference)` accepts runtime `unknown` values and either throws a generic field-specific `Error` or returns exactly `Pick<CreationInput, "projectName" | "projectPurpose">`. Required fields must be own data properties of records; arrays, class instances, inherited fields and computed required fields are rejected. Extra properties are ignored and never copied, traversed or serialized. No input values appear in validation errors.

Public text follows the existing Builder's trim/nonblank rules. Interior whitespace, Unicode and multiline text are preserved. The Builder has no name/purpose maximum, so this unit introduces no arbitrary preparation limits and performs no truncation. It never derives an account label or supplies any creation, wallet, factory or governance settings. It performs no I/O and does not mutate its inputs.

## Trust and integration limits

This function checks shape and reference equality. A caller can fabricate matching references or change public text while retaining an ID; passing validation **does not authenticate approval or disclosure consent**. A future trusted server boundary must load the actual immutable revision, verify current owner access, exact approval and disclosure permission, and supply the corresponding snapshot and approval reference. It must also handle withdrawal/supersession and Builder drift before claiming that creation represents the approved revision.

Field allowlisting prevents private Blueprint fields, assessment content and creation overrides from being copied. It cannot determine whether text deliberately placed in `publicName` or `publicDescription` contains sensitive information. Deliberate selection and permission to publish those strings remain responsibilities of the future boundary and owner review.

The existing Details → Stewards → Review flow and direct creation path are untouched. There is no persistence, HTTP route, UI, assessment invocation, wallet action or DAO function in this unit.

## Product-owner review before later integration

- Confirm public name/description disclosure wording and selection behavior. This implementation creates no consent policy or automatic import of the approved YAW-001 document.
- Decide whether to add public-text limits; none exist in the current Builder. Transport and persistence limits belong to their separately authorized boundaries.
- Confirm the eventual immutable revision/approval identity scheme, workspace binding, withdrawal/supersession and reconciliation of Builder edits. The opaque references here do not implement these policies.

These decisions do not block the isolated mapper; they remain prerequisites for the corresponding future workflow work.

## Offline verification

Synthetic tests are included in `npm test` through [`test/blueprint-public-details.test.ts`](../test/blueprint-public-details.test.ts). Coverage includes valid mapping, runtime validation, unsupported versions, missing and mismatched references, private-data contamination, exact output keys, no fallback/inference/truncation, deterministic output, input immutability and compatibility with the existing payload builder. No genuine Blueprint content or approval evidence is used as a fixture.

Verification on October 30, 2026 (Asia/Manila):

| Check | Actual result |
| --- | --- |
| `npm test` | Passed: 119 offline tests, including 13 new mapper tests; no failures or skips. |
| `npm run typecheck` | Passed. |
| Build script equivalent, `node node_modules/next/dist/bin/next build --webpack` | Passed with installed Next.js 16.4.3: compilation, TypeScript, static page generation and traces. Ran outside the sandbox in an isolated `/tmp` source copy using existing dependencies and a clean process environment, with telemetry disabled and no environment files copied or loaded. |
| `git diff --check` | Passed. |

The initial sandboxed build stopped before compilation with `Could not parse output from TypeScript's --showConfig`. The first outside-sandbox attempt compiled but failed typecheck because the temporary copy omitted `scripts/migrations.mjs`, imported by an existing live-test source. Including the tracked support sources resolved that copy error; no application workaround or build configuration change was made. Live tests were not executed. No dependency installation, database access, provider call, wallet action, staging, commit, push or deployment was performed.

The pre-existing unstaged `AGENTS.md` modification and untracked architecture reference were preserved byte-for-byte.
