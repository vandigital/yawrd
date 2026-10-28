# GitHub upload preparation

2026-10-28 (Asia/Manila). Preparation only; no staging, commits, repository creation,
remote changes, push, contract action, or deployment is authorized by this file.

## Destination and verdict

Intended destination: private personal-account repository
https://github.com/vandigital/yawrd. No Keelbase organization destination.
Vercel and yawrd.keelbase.io are later milestones.

The application upload candidate excludes Rig-only factory-review tooling and
raw evidence. See the portability report for isolated candidate verification. Do not upload the repository directory as a
ZIP, force-add ignored evidence, or mirror all refs. A later authorized push must
name the reviewed branch explicitly and leave refs/codex checkpoints local.

## Exact inventory

See github-upload-files.tsv: every previously tracked or non-ignored untracked
file at preparation time is classified, plus these two preparation documents.
INCLUDE means candidate for the later private upload, not staged or authorized.
HOLD is reserved for unresolved items; none remain after this portability fix.
LOCAL_ONLY means preserve on Rig and exclude from upload. SHA-256 values freeze
the reviewed bytes; this inventory's own hash is SELF. Re-review changed files
and newly discovered paths before any future staging.

Ignored dependencies/build caches, environment files, credential paths, and
hosting metadata are excluded by policy and are not enumerated individually.
No credential stores or ignored secret contents were opened. Ignore rules do
not protect a file already tracked; no such credential path was found in the
prior review. .env.example remains permitted only with placeholder values.

## Evidence decision

All existing docs/verification files are LOCAL_ONLY, including raw RPC responses,
encoded WASM, public keys/signatures, historic spending plans, machine paths,
runbooks, copied upstream source, and integrity manifests. They are preserved
in place without editing, deleting, moving, or rehashing their manifests.
The sibling verification/artifact workspace is outside this Git root and is
not an upload source.

Include docs/milestone-05.1.md as a dated implementation/mocked-check report,
and docs/creation-builder-compatibility.md as the linked interface explanation.
Their test results are historical, not checks rerun for this preparation.
References to separate verification records do not mean those records ship.

## Portability decision

Include package.json and tsconfig.json with the portability changes.
Keep these three files LOCAL_ONLY at their existing paths:
- src/factory-deployment-review.ts
- test/factory-deployment-review.test.ts
- tools/factory-deployment-review.ts

Exact .gitignore entries exclude them. TypeScript excludes these local paths.
The default test script explicitly names the three portable application suites;
new portable suites must be added deliberately. The Rig-only review script is
removed from package.json. No application runtime, tool implementation, test
implementation, evidence, artifact identity, or signing boundary was changed.

On Rig only, the retained commands are:
- node --test test/factory-deployment-review.test.ts
- node tools/factory-deployment-review.ts --dry-run

These commands require local evidence and the existing verified artifact; they
are not upload-candidate commands. Do not start the interactive server or infer
signing/deployment approval from this preparation.

See portability-verification.md for actual isolated test/typecheck/build results.
A later owner action may authorize a reviewed local commit of INCLUDE paths;
repository creation and pushing require their own explicit authorization.

## Attribution decision

Do not upload the copied nearcore Rust/YAML snapshots or contract-code blobs.
Their provenance records remain with local evidence. This avoids shipping those
copies before their exact upstream license/notice requirements are checked.
Existing Sputnik source links and pinned commit in the compatibility document
remain included; they describe interface compatibility, not a private fork.
No private Keelbase source or dependency is part of this candidate.

Do not invent an open-source license for independently authored Yawrd code.
No project license is selected by this preparation. Preserve package-lock.json
and upstream dependency notices; dependencies are obtained from public npm,
not copied node_modules. If copied upstream code/artifacts are proposed later,
review their pinned upstream licenses and supply the required notices first.
The compatibility evidence also contains copied Meteor SDK snippets and stays
local with the rest of the raw evidence.

## Progress retained

The application creation integration and its two-account governance boundary
remain unchanged. src/testnet-factory-settings.ts remains null; mocked checks
do not establish live readiness. Deployment preparation, historic budgets,
signing review, and artifact identity records remain on Rig. This document
does not refresh chain state, approve funding, or supersede those records.
