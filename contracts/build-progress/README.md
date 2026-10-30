# Build Progress public component contract v1

Review candidate for two read-only components: **Project Progress** and **Crew and
Contributions**. This directory contains a standalone data contract, shape
validators and invented examples. It contains no UI, API, database adapter or
publication workflow. The TypeScript types are the proposed component inputs;
no backend endpoint or private platform dependency is required to implement them.

## Publication boundary

Real inputs must be deliberately prepared, approved public snapshots. A future
trusted server-side publication boundary must verify disclosure permission and
supply only that data. Participant membership and human authorization of an agent
association do **not** authorize publication of either identity. Agent publication
requires separate explicit authorization. Omit an agent entirely when that
authorization is absent; do not emit a private identifier or an anonymous stub.

The validators check shape, bounds and references only. `dataKind: "published"`
is a presentation discriminant, **not evidence of permission or acceptance**.
Unknown fields are rejected rather than stripped. Never send private records to
the browser and filter them there. The validators cannot discover sensitive text
placed in an allowed title, name, summary or URL; deliberate publication review
must cover those values and the destination/content of every supplied link.

Exclude application records, introductions, decisions, wallet/account IDs,
sessions, signatures, credentials, private agent references and connection
details, draft Blueprints, private discussions, unpublished submissions, internal
database IDs, source revisions and review/reward audit records. Those records
are not needed by these components. Internal traceability remains outside this
public display contract. No arbitrary metadata, HTML, image URLs or embedded
objects are supported. Render text as text.

## Fields and limits

All fields are required unless marked optional. Arrays may be empty. Records
accept exactly the documented keys. Optional fields must be omitted rather than
set to `null`, an empty string or `undefined`.

| Common field | Rule and purpose |
| --- | --- |
| `schemaVersion` | Literal `1`; identifies this interface version. |
| `projectId` | Stable, deliberately assigned public project reference; binds the panel to a project without exposing operational IDs. |
| `dataKind` | `synthetic` or `published`; distinguishes illustrative and real publication data. |
| `notice` | Required exact `SYNTHETIC_NOTICE` for synthetic data; absent for published data. Components must visibly render this disclosure. |

`ProjectProgressData` adds:

| Field | Entry fields and purpose |
| --- | --- |
| `milestones` | `id`, `title`, `status`: identify and label published milestones. |
| `tasks` | `id`, `title`, `status`: identify and label published task states independently of milestones. |
| `recentActivity` | `id`, `summary`, `acceptedOn`, optional `link`: describe already accepted development activity with a public acceptance date and optional public evidence. |

Milestones and tasks share the explicit statuses `not_started`, `in_progress`,
`blocked`, `completed`. Display labels are **Not started**, **In progress**,
**Blocked**, **Completed**. These describe individual entries, not the lifecycle
of the project or deployment. Activity is already accepted by collection
definition, so it needs no redundant status or private review outcome.
`acceptedOn` must be a real calendar date in `YYYY-MM-DD` format. Activity arrives
newest first; equal dates retain supplied order. Other arrays retain deliberately
supplied publication order. Do not infer milestone/task relationships or compute
completion percentages; this contract supplies neither hierarchy nor weights.

`CrewAndContributionsData` adds:

| Field | Entry fields and purpose |
| --- | --- |
| `contributors` | `id`, `displayName`, optional `profileUrl`, optional `agent`: approved public Crew Member display information. A public display name may be a deliberately approved pseudonym. |
| `contributors[].agent` | `id`, `displayName`: separately publication-authorized agent identity belonging to this Crew Member. At most one per Crew Member in v1. |
| `contributions` | `id`, `title`, `contributorId`, optional `agentId`, `status`, optional `link`: accepted work with explicit human attribution, optional agent attribution and a published status/evidence link. |

Contribution statuses are `accepted` (**Accepted**) and `integrated`
(**Integrated**). Both describe already accepted work; `integrated` additionally
means integration was explicitly published. Pending, returned-for-changes and
rejected submissions are outside this public collection. Neither value indicates
reward approval or payment. A contribution's `contributorId` must resolve within
the same snapshot; its optional `agentId` must match that contributor's published
agent. A Crew Member can appear with no accepted contributions. An absent agent
attribution must never be inferred from the presence of an agent profile.

Bounds are explicit v1 display constraints, not changes to private platform
models or workflow policy:

| Value | Bound |
| --- | --- |
| Every ID/reference | 1–64 ASCII characters matching `[a-z0-9][a-z0-9_-]*`; stable across snapshots, never derived from a wallet or private association ID. |
| Display name | 1–80 UTF-16 code units. |
| Title | 1–120 UTF-16 code units. |
| Activity summary | 1–240 UTF-16 code units. |
| Link/profile URL | 1–2048 UTF-16 code units; explicit absolute lowercase `https://`, no whitespace, backslashes, credentials, non-default port, query or fragment. |
| Each array | 0–100 entries; dense, no extra properties. IDs unique within each array; agent IDs unique across the snapshot's contributors. |

Text must be trimmed, nonblank and free of ASCII control characters. Values are
rejected rather than silently truncated or normalized. Public IDs are opaque:
they are list keys/references, not proof that a person, project or event exists.
The fixed synthetic notice is not a user-authored summary. The two component
inputs use the same `projectId`, version and `dataKind` when shown together.

## Component acceptance criteria

1. Project Progress displays each published milestone and task title with its
   readable status. It displays each recent accepted activity summary and
   acceptance date in supplied order, with a link only when supplied. Stable IDs
   identify entries. It does not infer activity from tasks or pending submissions.
2. Crew and Contributions displays approved public display names, separately
   labeled publication-authorized agent names when supplied, and each accepted
   contribution's title, published status and human attribution. Show agent
   attribution only when `agentId` is present. Distinguish humans and agents;
   attribution establishes no payment, ownership or repository rights.
3. Each empty collection has a neutral state: **No published milestones yet**,
   **No public tasks yet**, **No accepted activity published yet**, **No public
   Crew Members yet**, or **No accepted contributions published yet**, as
   applicable. Other populated collections remain visible. A Crew Member with
   no agent or link still renders by name. Missing optional fields create no
   broken links, empty agent cards or inferred identities. Do not present absence
   of published data as proof of no private activity.
4. Synthetic inputs visibly display the exact supplied synthetic notice before
   the example content in each independently rendered component. Never relabel
   examples as live project milestones, accepted participation or rewards.
5. Render all content as escaped plain text. Use only explicit validated links;
   never construct destinations from IDs, wallet identities or agent references.
   Links must describe their destination accessibly; new tabs require
   `rel="noopener noreferrer"`. Do not fetch, embed or preview linked content.
   Malformed inputs fail validation rather than partially rendering.
6. Accept only the documented publication data. No authentication, application,
   association, private API or database dependency, client-side privacy filtering,
   wallet actions, write controls, reward claims or permission requests. Follow
   supplied Yawrd visual conventions and accessible semantic/text status labels;
   this unit supplies no visual redesign or new workflow.

## Synthetic coverage and portable verification

`fixtures.ts` exports populated and empty inputs for both components. All four
carry the synthetic discriminator and exact notice. The populated examples cover
all four milestone/task statuses, both accepted contribution statuses, two
invented Crew Members, one invented agent, human-only and human-plus-agent
attribution, and present/absent optional links. Dates are invented year-2000
acceptance dates. All IDs start with `synthetic-`; links use the reserved
`example.invalid` domain. Nothing represents a real project's participation,
deployment, acceptance or reward history.

The independently varying empty collections and optional combinations are valid;
empty fixture arrays also provide neutral starting points. For component work,
consume these objects directly through the exported TypeScript types. No network,
environment variables, React imports or framework setup are required by the data.

After deliberate review/publication authorization, this directory may be
transferred as a unit. The focused test is
`test/build-progress-contract.test.ts`; preserving that path and the
`contracts/build-progress/` directory preserves its imports. It uses only Node
built-ins and these portable sources. With a Node runtime supporting native
TypeScript stripping and ESM, its standalone offline command is:

```sh
node --test --test-isolation=none test/build-progress-contract.test.ts
```

The containing repository also includes the test in its existing `npm test`
runner. Contract/fixture tests verify shape and examples; they are not component
rendering tests, proof of publication consent, or proof of live participation.
Later component implementation must test the display acceptance criteria above.
