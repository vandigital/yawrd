import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getGenesisPublicSnapshot } from "../src/genesis-public.ts";
import { getPublicYawrd } from "../src/public-yawrd.ts";
import { GenesisYawrdPresentation } from "../app/components/public-yawrd.tsx";

const project = getGenesisPublicSnapshot("yaw-001")!;
const html = renderToStaticMarkup(createElement(GenesisYawrdPresentation, { project }));
const blueprint = readFileSync(new URL("../docs/genesis/YAW-001_BLUEPRINT_V1.md", import.meta.url), "utf8");

test("Genesis resolves by its exact public reference, separately from illustrative fixtures", () => {
  assert.equal(project.id, "yaw-001");
  assert.equal(getPublicYawrd("yaw-001"), undefined);
  assert.equal(getPublicYawrd("the-common-table")?.status, "Fixture preview");
  for (const id of ["", "YAW-001", "yaw-001/", "demo.factory.yawrd.testnet", "dev-yaw-001", "__proto__", "constructor"]) {
    assert.equal(getGenesisPublicSnapshot(id), undefined);
  }
});

test("public identity and prose retain the approved Blueprint content", () => {
  for (const value of [project.reference, project.name, project.tagline, project.description, project.introduction, project.creatorAccountId, project.daoAccountId, project.factoryAccountId]) {
    assert.ok(blueprint.includes(value), value);
  }
  assert.equal(project.repositoryUrl, "https://github.com/vandigital/yawrd-build-progress");
  assert.deepEqual(project.scope.map(task => task.title), ["Project Progress", "Crew and Contributions", "Review and Integration"]);
});

test("snapshot contains only authored public fields and cannot acquire private state", () => {
  assert.deepEqual(Object.keys(project), ["id", "reference", "name", "tagline", "description", "introduction", "network", "creatorAccountId", "daoAccountId", "factoryAccountId", "repositoryUrl", "snapshotDate", "deploymentStatus", "participationStatus", "objective", "scope", "evidence"]);
  for (const value of [project, project.scope, ...project.scope, project.evidence, ...project.evidence]) assert.ok(Object.isFrozen(value));
  assert.doesNotMatch(JSON.stringify(project), /publishedAt|createdAt|restrictedContent|applications":|introduction":.*PRIVATE|session|credentials|privateRepository|vandigital\/yawrd"/);
});

test("accepted creation and hardening evidence link to the correct Testnet transactions", () => {
  assert.deepEqual(project.evidence.map(item => item.hash), ["GGvuLJcNNEQseQT4LE5uan7apN9gk7ff3WbEHZ4UKip", "4Hpa1DLq6okCSyDid9mCGjxq44qPKrq2hgEERT1eEuc9"]);
  for (const item of project.evidence) assert.ok(html.includes(`href="https://testnet.nearblocks.io/txns/${item.hash}"`));
  for (const account of [project.creatorAccountId, project.daoAccountId, project.factoryAccountId]) assert.ok(html.includes(`href="https://testnet.nearblocks.io/address/${account}"`));
});

test("Genesis discloses deployment, pending activation, closed applications and reward limits", () => {
  for (const text of ["Deployed on Testnet", "Participation pending", "activation for participation remains pending", "Applications are not yet open", "Reward amounts and terms remain unapproved", "No rewards are offered on this page", "does not monitor live status"]) assert.ok(html.includes(text), text);
  assert.match(html, /<time dateTime="2026-11-03">November 3, 2026<\/time>/);
  assert.doesNotMatch(html, /Illustrative content|Fixture preview|Example profile|Identity unverified|Apply now|<button|<form|<input|<iframe|Connect Meteor/);
});

test("public presentation has one page heading, labeled sections and the contribution link", () => {
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<h1[^>]*>Build Progress<\/h1>/);
  assert.match(html, /aria-labelledby="genesis-participation-title"/);
  assert.match(html, /aria-label="Project identity and public evidence"/);
  assert.ok(html.includes(`href="${project.repositoryUrl}"`));
});

test("banner uses the current site brand asset and keeps the creator's default avatar distinct", () => {
  assert.match(html, /PUBLIC GENESIS PREVIEW/);
  assert.match(html, /<img[^>]*src="\/brand\/yawrd-buoy.webp"[^>]*alt=""/);
  assert.match(html, /aria-label="Default Yawrder buoy avatar"/);
  assert.match(html, /Default buoy avatar/);
  assert.match(html, /Yawrder · Creator wallet/);
  assert.doesNotMatch(html, /yawrd-buoy.png|profile\/|href="\/profile|user-selected/);
});
