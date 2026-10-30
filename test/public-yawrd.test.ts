import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getPublicYawrd, toPublicYawrd, type PublicYawrdInput } from "../src/public-yawrd.ts";
import { PublicYawrdPresentation } from "../app/components/public-yawrd.tsx";
import { ProjectHeading } from "../app/components/project-presentation.tsx";
import YawrdNotFound from "../app/yawrd/[projectId]/not-found.tsx";

const input: PublicYawrdInput = {
  id: "example", name: "Example", description: "A public idea",
  creator: { accountId: "example.demo.near" }, objectives: ["Meet neighbors"],
  participation: "Applications are not open.", rewards: "No rewards are offered.",
};
const render = (data: PublicYawrdInput = input) => renderToStaticMarkup(createElement(PublicYawrdPresentation, { project: toPublicYawrd(data) }));

test("public fixture is explicitly a preview and lookup is exact", () => {
  const project = getPublicYawrd("the-common-table");
  assert.equal(project?.name, "The Common Table");
  assert.equal(project?.status, "Fixture preview");
  assert.ok(project?.objectives.length);
  for (const id of ["missing", "", "THE-COMMON-TABLE", "__proto__", "constructor", "../the-common-table"]) assert.equal(getPublicYawrd(id), undefined);
});

test("public mapping allowlists project and creator fields and copies objectives", () => {
  const data = { ...input, privateInstructions: "PRIVATE_SENTINEL", repository: "REPO_SENTINEL", credentials: "SECRET_SENTINEL", creator: { ...input.creator, agentSecret: "AGENT_SENTINEL" } };
  const project = toPublicYawrd(data);
  assert.deepEqual(Object.keys(project), ["id", "name", "description", "status", "creator", "objectives", "participation", "rewards"]);
  assert.doesNotMatch(JSON.stringify(project), /SENTINEL/);
  assert.doesNotMatch(render(data), /SENTINEL/);
  project.objectives.push("Local edit");
  assert.deepEqual(input.objectives, ["Meet neighbors"]);
});

test("creator card works without optional profile fields and defaults to existing sea avatar", () => {
  const html = render();
  assert.match(html, /<details/);
  assert.match(html, /<summary/);
  assert.match(html, /example.demo.near/);
  assert.equal(toPublicYawrd(input).creator.avatar, "sea");
  assert.doesNotMatch(html, /near.social|View NEAR Social|undefined/);
});

test("explicit optional creator information and NEAR Social link render", () => {
  const html = render({ ...input, creator: { ...input.creator, displayName: "Example host", avatar: "kelp", bio: "A public introduction", nearSocialUrl: "https://near.social/example.demo.near" } });
  assert.match(html, /Example host/);
  assert.match(html, /A public introduction/);
  assert.match(html, /href="https:\/\/near.social\/example.demo.near"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("unsafe or unrelated profile links are omitted rather than inferred", () => {
  for (const nearSocialUrl of ["javascript:alert(1)", "http://near.social/user", "https://near.social.evil.test/user", "https://evil.test/user", "https://user:pass@near.social/user", "https://near.social:444/user", "https://near.social/", "invalid"]) {
    assert.equal(toPublicYawrd({ ...input, creator: { ...input.creator, nearSocialUrl } }).creator.nearSocialUrl, undefined);
  }
});

test("public rendering escapes text, discloses preview limits, and offers no application or wallet actions", () => {
  const project = getPublicYawrd("the-common-table")!;
  const html = renderToStaticMarkup(createElement(PublicYawrdPresentation, { project }));
  assert.match(html, /<h1/);
  assert.match(html, /Fixture preview/);
  assert.match(html, /has not been opened or funded/);
  assert.match(html, /Applications are not open/);
  assert.match(html, /No rewards are offered/);
  assert.match(html, /No wallet connection is needed/);
  assert.doesNotMatch(html, /<button|<form|Connect Meteor|Connect agent|Apply now|dangerouslySetInnerHTML/);
  const unsafe = render({ ...input, name: '<script>alert("name")</script>', description: '<img src=x onerror="alert(1)">', creator: { ...input.creator, bio: "<script>secret</script>" }, objectives: ["<iframe>"], rewards: "<script>reward</script>" });
  assert.doesNotMatch(unsafe, /<script|<img|<iframe/);
  assert.match(unsafe, /&lt;script&gt;/);
});

test("shared heading preserves builder preview markup and uses a heading on public pages", () => {
  const html = renderToStaticMarkup(createElement(ProjectHeading, { name: "Live name", description: "Live purpose" }));
  assert.match(html, /^<p class="text-\[clamp/);
  assert.match(html, /Live name/);
  assert.match(html, /Live purpose/);
  assert.doesNotMatch(html, /<h1/);
});

test("unknown-project presentation explains absence and links to an actual fixture", () => {
  const html = renderToStaticMarkup(createElement(YawrdNotFound));
  assert.match(html, /Yawrd not found/);
  assert.match(html, /href="\/yawrd\/the-common-table"/);
  assert.doesNotMatch(html, /<button|<form/);
});
