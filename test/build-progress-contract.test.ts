import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  assertProjectProgressData,
  assertCrewAndContributionsData,
  CONTRIBUTION_STATUSES,
  PROGRESS_STATUSES,
  LIMITS,
  SYNTHETIC_NOTICE,
} from "../contracts/build-progress/contract.ts";
import {
  syntheticProjectProgress,
  syntheticCrewAndContributions,
  syntheticEmptyProjectProgress,
  syntheticEmptyCrewAndContributions,
} from "../contracts/build-progress/fixtures.ts";

const progress = () => structuredClone(syntheticProjectProgress);
const crew = () => structuredClone(syntheticCrewAndContributions);
const examples = [
  [syntheticProjectProgress, assertProjectProgressData],
  [syntheticEmptyProjectProgress, assertProjectProgressData],
  [syntheticCrewAndContributions, assertCrewAndContributionsData],
  [syntheticEmptyCrewAndContributions, assertCrewAndContributionsData],
] as const;

test("populated and empty synthetic examples validate and survive JSON round trips", () => {
  for (const [fixture, validate] of examples) {
    validate(fixture);
    validate(JSON.parse(JSON.stringify(fixture)));
    assert.equal(fixture.dataKind, "synthetic");
    assert.equal(fixture.notice, SYNTHETIC_NOTICE);
    assert.match(fixture.notice, /Synthetic example only/);
    assert.match(fixture.notice, /No real project activity, participation, contribution acceptance or reward distribution/);
    assert.equal(fixture.projectId, "synthetic-garden-tools");
  }
  assert.deepEqual(new Set(syntheticProjectProgress.milestones.map(item => item.status)), new Set(PROGRESS_STATUSES));
  assert.deepEqual(new Set(syntheticProjectProgress.tasks.map(item => item.status)), new Set(PROGRESS_STATUSES));
  assert.deepEqual(new Set(syntheticCrewAndContributions.contributions.map(item => item.status)), new Set(CONTRIBUTION_STATUSES));
});

test("fixtures contain only invented references and reserved non-live example links", () => {
  function visit(value: unknown, field = "") {
    if (typeof value === "string") {
      if (field === "id" || field.endsWith("Id")) assert.match(value, /^synthetic-/);
      if (field === "link" || field === "profileUrl") assert.equal(new URL(value).hostname, "example.invalid");
      if (field === "acceptedOn") assert.match(value, /^2000-/);
      assert.doesNotMatch(value, /YAW-001|ironclaw|\.testnet|\.near\b|vandigital/i);
    } else if (Array.isArray(value)) value.forEach(item => visit(item));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => visit(item, key));
  }
  for (const [fixture] of examples) visit(fixture);
});

test("required fields cannot be omitted at any populated record level", () => {
  const cases: [object, readonly string[], (value: unknown) => void][] = [
    [progress(), ["schemaVersion", "projectId", "dataKind", "notice", "milestones", "tasks", "recentActivity"], assertProjectProgressData],
    [crew(), ["schemaVersion", "projectId", "dataKind", "notice", "contributors", "contributions"], assertCrewAndContributionsData],
  ];
  for (const [fixture, fields, validate] of cases) {
    for (const field of fields) {
      const candidate = structuredClone(fixture) as Record<string, unknown>;
      delete candidate[field];
      assert.throws(() => validate(candidate), /Invalid public Build Progress field/);
    }
  }
  for (const [collection, fields] of [
    ["milestones", ["id", "title", "status"]], ["tasks", ["id", "title", "status"]],
    ["recentActivity", ["id", "summary", "acceptedOn"]],
  ] as const) {
    for (const field of fields) {
      const candidate = progress();
      delete (candidate[collection][0] as unknown as Record<string, unknown>)[field];
      assert.throws(() => assertProjectProgressData(candidate));
    }
  }
  for (const [collection, fields] of [
    ["contributors", ["id", "displayName"]],
    ["contributions", ["id", "title", "contributorId", "status"]],
  ] as const) {
    for (const field of fields) {
      const candidate = crew();
      delete (candidate[collection][0] as unknown as Record<string, unknown>)[field];
      assert.throws(() => assertCrewAndContributionsData(candidate));
    }
  }
  for (const field of ["id", "displayName"]) {
    const candidate = crew();
    delete (candidate.contributors[0].agent as unknown as Record<string, unknown>)[field];
    assert.throws(() => assertCrewAndContributionsData(candidate));
  }
});

test("schema, data kind and synthetic disclosure cannot be coerced or silently defaulted", () => {
  for (const [fixture, validate] of examples) {
    for (const schemaVersion of [undefined, null, "1", 0, 2, true]) assert.throws(() => validate({ ...fixture, schemaVersion }));
    for (const dataKind of [undefined, null, "preview", "SYNTHETIC", true]) assert.throws(() => validate({ ...fixture, dataKind }));
    for (const notice of [undefined, null, "", "Synthetic", "Real contributions accepted"]) assert.throws(() => validate({ ...fixture, notice }));
    assert.equal(fixture.dataKind, "synthetic");
    const { notice: _, ...snapshot } = fixture;
    validate({ ...snapshot, dataKind: "published" }); // Shape only; asserts no real approval.
    assert.throws(() => validate({ ...fixture, dataKind: "published" }));
  }
});

test("bounded text accepts the limit and rejects empty, untrimmed, control and non-string values", () => {
  const cases: [number, (value: unknown) => void][] = [
    [LIMITS.title, value => assertProjectProgressData({ ...progress(), milestones: [{ id: "example", title: value, status: "not_started" }] })],
    [LIMITS.title, value => assertProjectProgressData({ ...progress(), tasks: [{ id: "example", title: value, status: "not_started" }] })],
    [LIMITS.summary, value => assertProjectProgressData({ ...progress(), recentActivity: [{ id: "example", summary: value, acceptedOn: "2000-01-01" }] })],
    [LIMITS.displayName, value => assertCrewAndContributionsData({ ...crew(), contributors: [{ id: "example", displayName: value }], contributions: [] })],
    [LIMITS.displayName, value => assertCrewAndContributionsData({ ...crew(), contributors: [{ id: "example", displayName: "Example", agent: { id: "example-agent", displayName: value } }], contributions: [] })],
    [LIMITS.title, value => assertCrewAndContributionsData({ ...crew(), contributions: [{ ...crew().contributions[0], title: value }] })],
  ];
  for (const [max, validate] of cases) {
    validate("x".repeat(max));
    validate("Café 🌱");
    for (const value of ["x".repeat(max + 1), "", " ", " padded", "padded ", "bad\ntext", "bad\0text", "bad\x7ftext", null, 1, {}]) {
      assert.throws(() => validate(value));
    }
  }
});

test("stable public IDs have explicit length and character rules", () => {
  for (const [fixture, validate] of examples) {
    validate({ ...fixture, projectId: "a".repeat(LIMITS.id) });
    for (const projectId of ["", "a".repeat(LIMITS.id + 1), "Uppercase", "wallet.testnet", "a/b", "a b", "_leading", null]) {
      assert.throws(() => validate({ ...fixture, projectId }));
    }
  }
  for (const collection of ["milestones", "tasks", "recentActivity"] as const) {
    assert.throws(() => assertProjectProgressData({ ...progress(), [collection]: [{ ...progress()[collection][0], id: "invalid.id" }] }));
  }
  for (const collection of ["contributors", "contributions"] as const) {
    assert.throws(() => assertCrewAndContributionsData({ ...crew(), [collection]: [{ ...crew()[collection][0], id: "invalid.id" }] }));
  }
});

test("statuses reject pending or rejected submissions, payment claims and unknown values", () => {
  for (const status of [undefined, null, "", "COMPLETED", "pending", "rejected", "rewarded", "paid", true]) {
    for (const collection of ["milestones", "tasks"] as const) {
      assert.throws(() => assertProjectProgressData({ ...progress(), [collection]: [{ ...progress()[collection][0], status }] }));
    }
    assert.throws(() => assertCrewAndContributionsData({ ...crew(), contributions: [{ ...crew().contributions[0], status }] }));
  }
  assert.throws(() => assertCrewAndContributionsData({ ...crew(), contributions: [{ ...crew().contributions[0], status: "completed" }] }));
});

test("links require explicit HTTPS without credentials, queries, fragments or non-default ports", () => {
  const validators = [
    (link: unknown) => assertProjectProgressData({ ...progress(), recentActivity: [{ ...progress().recentActivity[0], link }] }),
    (link: unknown) => assertCrewAndContributionsData({ ...crew(), contributions: [{ ...crew().contributions[0], link }] }),
    (profileUrl: unknown) => assertCrewAndContributionsData({ ...crew(), contributors: [{ ...crew().contributors[0], profileUrl }, crew().contributors[1]] }),
  ];
  for (const validate of validators) {
    validate("https://example.invalid/public");
    const prefix = "https://example.invalid/";
    validate(prefix + "x".repeat(LIMITS.url - prefix.length));
    for (const link of [
      prefix + "x".repeat(LIMITS.url - prefix.length + 1), "", null, undefined,
      "javascript:alert(1)", "data:text/html,test", "http://example.invalid/", "//example.invalid/",
      "/relative", "https://user:pass@example.invalid/", "https://example.invalid:444/",
      "https://example.invalid/?token=example", "https://example.invalid/#secret", "https://example.invalid/?",
      "https://example.invalid/#", "https://example.invalid/white space", "https://example.invalid/\\path", "invalid",
    ]) assert.throws(() => validate(link));
  }
});

test("optional links and agents may be absent, never inferred from membership or contribution", () => {
  assertProjectProgressData({ ...progress(), recentActivity: [{ id: "example", summary: "Example", acceptedOn: "2000-01-01" }] });
  assertCrewAndContributionsData({ ...crew(), contributors: [{ id: "example", displayName: "Example" }], contributions: [] });
  assertCrewAndContributionsData({ ...crew(), contributions: [] });
  assert.throws(() => assertCrewAndContributionsData({ ...crew(), contributors: [{ ...crew().contributors[0], agent: null }] }));
  assert.throws(() => assertCrewAndContributionsData({ ...crew(), contributions: [{ ...crew().contributions[0], agentId: undefined }] }));
});

test("contributions require resolvable human attribution and an agent belonging to that human", () => {
  for (const contributorId of ["missing", "wallet.testnet", null]) {
    assert.throws(() => assertCrewAndContributionsData({ ...crew(), contributions: [{ ...crew().contributions[0], contributorId }] }));
  }
  for (const patch of [
    { agentId: "missing" }, { agentId: "invalid.id" },
    { contributorId: "synthetic-person-moss", agentId: "synthetic-agent-sprout" },
  ]) assert.throws(() => assertCrewAndContributionsData({ ...crew(), contributions: [{ ...crew().contributions[0], ...patch }] }));
  assert.throws(() => assertCrewAndContributionsData({ ...crew(), contributors: [] }));
});

test("acceptance dates must exist on the calendar and recent activity is newest first", () => {
  for (const acceptedOn of [null, "today", "2000-1-01", "2000-01-01T00:00:00Z", "2001-02-29", "2000-02-30", "2000-13-01"]) {
    assert.throws(() => assertProjectProgressData({ ...progress(), recentActivity: [{ ...progress().recentActivity[0], acceptedOn }] }));
  }
  assertProjectProgressData({ ...progress(), recentActivity: [{ ...progress().recentActivity[0], acceptedOn: "2000-02-29" }] });
  assert.throws(() => assertProjectProgressData({ ...progress(), recentActivity: [...progress().recentActivity].reverse() }));
  assertProjectProgressData({ ...progress(), recentActivity: progress().recentActivity.map(item => ({ ...item, acceptedOn: "2000-01-01" })) });
});

test("lists reject duplicates, oversized arrays, sparse arrays and invalid containers", () => {
  const lists = [
    ...(["milestones", "tasks", "recentActivity"] as const).map(key => ({
      item: progress()[key][0], validate: (list: unknown) => assertProjectProgressData({ ...progress(), [key]: list }),
    })),
    ...(["contributors", "contributions"] as const).map(key => ({
      item: crew()[key][key === "contributors" ? 1 : 0],
      validate: (list: unknown) => assertCrewAndContributionsData({ ...crew(), [key]: list, ...(key === "contributors" ? { contributions: [] } : {}) }),
    })),
  ];
  for (const { item, validate } of lists) {
    validate(Array.from({ length: LIMITS.entries }, (_, index) => ({ ...item, id: `example-${index}` })));
    for (const list of [null, {}, "list", new Array(1), [item, item], Array.from({ length: LIMITS.entries + 1 }, (_, index) => ({ ...item, id: `example-${index}` })), Object.assign([item], { privateData: "RESTRICTED_SENTINEL" })]) {
      assert.throws(() => validate(list));
    }
  }
  assert.throws(() => assertCrewAndContributionsData({ ...crew(), contributors: [crew().contributors[0], { ...crew().contributors[0], id: "another-person" }] }));
});

test("unrecognized private fields fail closed at every record level without being copied or echoed", () => {
  const restricted = { applicationId: "RESTRICTED_SENTINEL", wallet: "RESTRICTED_SENTINEL", session: "RESTRICTED_SENTINEL", agentReference: "RESTRICTED_SENTINEL", reward: "RESTRICTED_SENTINEL", draftBlueprint: "RESTRICTED_SENTINEL" };
  for (const [fixture, validate] of examples) assert.throws(() => validate({ ...fixture, ...restricted }));
  for (const key of ["milestones", "tasks", "recentActivity"] as const) {
    assert.throws(() => assertProjectProgressData({ ...progress(), [key]: [{ ...progress()[key][0], ...restricted }] }));
  }
  for (const key of ["contributors", "contributions"] as const) {
    assert.throws(() => assertCrewAndContributionsData({ ...crew(), [key]: [{ ...crew()[key][0], ...restricted }] }));
  }
  assert.throws(() => assertCrewAndContributionsData({ ...crew(), contributors: [{ ...crew().contributors[0], agent: { ...crew().contributors[0].agent, ...restricted } }] }));
  assert.throws(() => assertProjectProgressData({ ...progress(), schemaVersion: "RESTRICTED_SENTINEL" }), error => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /RESTRICTED_SENTINEL/);
    return true;
  });
});

test("inherited, computed and hidden fields cannot supply or smuggle publication data", () => {
  for (const [fixture, validate] of examples) {
    for (const invalid of [null, [], new Date(), Object.create(fixture)]) assert.throws(() => validate(invalid));
    validate(Object.assign(Object.create(null), fixture));
    let reads = 0;
    const computed = Object.defineProperty({ ...fixture }, "projectId", { get() { reads++; return fixture.projectId; } });
    assert.throws(() => validate(computed));
    assert.equal(reads, 0);
    assert.throws(() => validate(Object.defineProperty({ ...fixture }, "secret", { value: "RESTRICTED_SENTINEL" })));
    assert.throws(() => validate({ ...fixture, [Symbol("secret")]: "RESTRICTED_SENTINEL" }));
  }
});

test("validation preserves frozen input and plain text instead of treating text as markup", () => {
  function freeze(value: unknown): void {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  }
  for (const [fixture, validate] of examples) {
    const value = structuredClone(fixture);
    const before = JSON.stringify(value);
    freeze(value);
    validate(value);
    validate(value);
    assert.equal(JSON.stringify(value), before);
  }
  assertProjectProgressData({ ...progress(), milestones: [{ id: "example", title: "<script>example</script>", status: "not_started" }] });
  // Escaping belongs to the future renderer; shape validation grants no HTML trust.
});

test("portable sources have no private imports, runtime dependencies or backend access", () => {
  const contract = readFileSync(new URL("../contracts/build-progress/contract.ts", import.meta.url), "utf8");
  const fixtures = readFileSync(new URL("../contracts/build-progress/fixtures.ts", import.meta.url), "utf8");
  assert.doesNotMatch(contract, /^import\s|\bimport\(|\brequire\(/m);
  assert.deepEqual([...fixtures.matchAll(/from\s+"([^"]+)"/g)].map(match => match[1]), ["./contract.ts"]);
  for (const source of [contract, fixtures]) assert.doesNotMatch(source, /process\.env|fetch\(|@neondatabase|next\/|participants\/|Keelbase/i);
});
