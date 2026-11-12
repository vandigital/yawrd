# YAW-001 visual candidate

This review candidate is layered on local checkpoint `8b01cb5` (`feat(yaw-001): integrate published Build Progress evidence`). It is not a publication or deployment record.

## Reuse boundary

`ProjectSpaceShell` owns only the hero, static anchor navigation, two-column/stacked layout and a sidebar slot. `ProjectDeliverableCard` owns only card presentation. Project facts, governance, payout verification and access-controlled workspaces remain in the YAW-001 implementation. These two primitives may support a later YAW-002 presentation, but contain no YAW-002 workflow or general design-system API.

## Accepted source and host adapter

`components/ProjectProgress.tsx` is the accepted public source with SHA-256 `bcf7fd9e2c8256fae77d5f3d2250da59c3948bd8de245e4bd9fc7c14049c9c8a`. The visual candidate does not modify it. `genesis-project.module.css` supplies a host-only light panel around the component so its original inline colors remain readable inside the dark sea-green project shell.

The component receives only the server-owned `dataKind: "published"` snapshot in `src/genesis/build-progress-publication.ts`. No preview, Development or synthetic fixture feeds the public page. `CrewAndContributions` is not rendered because no public contributor roster or identities are authorized.

## Evidence semantics

- Task A is accepted without a reward. Its acceptance date is unpublished; the merge date is not substituted.
- Task B was accepted on November 6, 2026, as documented by public PR #4.
- The Task B reward is 1 NEAR on Testnet. A paid state and transfer link remain conditional on the existing payout provider verifying a successful transfer receipt.
- Contribution provenance is operator-attested through reviewed public pull requests. GitHub accounts and commit history are not presented as cryptographic proof of agent authorship.

Browser review images are generated under `docs/verification/yaw-001-visual-candidate/` by the isolated project-experience browser test; that ignored directory contains mocked role and payout states and is not application data.
