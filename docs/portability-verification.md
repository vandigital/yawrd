# Upload candidate portability verification

2026-10-28 (Asia/Manila). PASS for the private application upload candidate,
using Rig's existing installed dependencies. No commit or publication performed.

## Change

Exact ignore rules keep the Node-only factory-review module, tool and test local.
TypeScript excludes those three paths. package.json removes review:factory and
names the three portable application suites explicitly for npm test. Application
code, the local review implementation/tests, package-lock.json, deployment evidence
and artifacts were not changed. Local review commands are in github-upload-plan.md.

## Isolation and checks

A fresh temporary directory received only the candidate's non-ignored source
files and a physical copy of installed node_modules. It had no .git metadata,
docs/verification, local factory-review source/test/tool, external artifact copy,
or source/dependency symlinks back to the Yawrd workspace. It was outside the
workspace and its sibling artifact tree. No dependencies were installed.

The following ran successfully in that isolated directory:
- npm test: 45 passed, 0 failed, 0 skipped.
- npm run build: optimized production build completed and static routes generated.
- npm run typecheck: passed, run after build to include generated Next.js types.
- Temporary loopback production server: HTTP 200 with Yawrd content; stopped afterward.

On the original Rig workspace:
- node --test test/factory-deployment-review.test.ts: 7 passed, 0 failed.
- git diff --check: passed.
- Existing local review files and every docs/verification file: byte hashes unchanged.
- Previously inventoried application files unchanged; only the authorized ignore,
  package, TypeScript and preparation-document changes were made.
- HEAD and Git index unchanged; no remotes configured.
- Upload inventory covers every current tracked/non-ignored candidate path;
  excluded evidence and local tools remain separately enumerated as LOCAL_ONLY.

## Limits and next owner action

This verifies portability away from Rig-only evidence, not a fresh dependency
installation or an end-to-end wallet transaction. Existing node_modules were
copied; npm ci on another machine/CI and hosting validation remain future checks.
The new report and refreshed inventory are documentation-only additions following
the executable checks. Candidate source bytes were compared against the workspace.

The candidate remains Testnet-only with factory settings unset. No live factory,
funding, signing, transaction, or deployment readiness is asserted.

Next owner action: authorize a reviewed local commit of the inventory's INCLUDE
files if desired. Repository creation, remote setup, pushing, Vercel deployment,
and DNS changes remain outside this milestone. Intended future destination:
private personal-account github.com/vandigital/yawrd.
