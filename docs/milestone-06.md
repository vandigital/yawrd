# Milestone 06 — Reusable public Yawrd page

The local example is `/yawrd/the-common-table`. `/` remains the Creation Builder.

The new public page uses an explicit public fixture, the existing sea buoy avatar preset, and the builder's gradient cover fallback. It shows the name, description, creator wallet account and expandable creator card, public objectives, participation ideas, reward information and clear fixture-preview disclosures. No wallet connection is required. Unknown identifiers call Next.js `notFound()` and render a dedicated not-found page.

The public page has no application, agent-connection, funding or wallet controls. It makes no deployment, membership or reward availability claims. An optional NEAR Social URL must be explicitly configured and use HTTPS on `near.social`; no URL is inferred from the account. The shipped fixture intentionally omits that link because there is no verified profile to associate with the example account.

## Files

- `src/public-yawrd.ts`: public data types, allowlist mapping, explicit example fixture and exact identifier lookup. No creation plan, wallet session, contract configuration, repository or agent data is imported.
- `app/components/project-presentation.tsx`: shared cover and project heading/description; preserves the builder's existing preview typography and classes.
- `app/components/public-yawrd.tsx`: responsive public presentation and native expandable creator card.
- `app/yawrd/[projectId]/page.tsx`: server-rendered route and preview metadata with no indexing.
- `app/yawrd/[projectId]/not-found.tsx`: branded not-found state with a working example link.
- `app/page.tsx`: uses the extracted presentation components in its live preview.
- `test/public-yawrd.test.ts`: eight public mapping/rendering tests.
- `test/register-tsx.mjs`: small Node test hook using the already installed TypeScript compiler to render TSX without a new dependency.
- `package.json`: includes the new tests and TSX hook in `npm test`.
- `docs/milestone-06.md`: implementation and verification record.

## Verification

- `npm test`: **53 passed**, including all 45 existing tests and 8 new tests. Coverage includes public field allowlisting, absent optional profile information, configured profile information, unsafe profile links, exact/unknown identifiers, escaped text, preview disclosures, shared builder markup and not-found rendering.
- `npm run typecheck`: passed.
- `npm run build`: passed; `/yawrd/[projectId]` is a server-rendered App Router route.
- Local HTTP checks: example **200**, unknown project **404**, builder **200**.
- Chromium: public page checked at 1440px, 390px and 320px widths; not-found checked at 1440px and 390px. No horizontal overflow. Creator card opened by pointer at desktop/mobile and by keyboard at 320px.
- Chromium builder smoke check at 1440px and 390px: changing the project name updated the suggested address label and live preview; no horizontal overflow. No wallet was connected and no signing flow was exercised.
- Screenshots visually inspected: public desktop/mobile and unknown desktop. All four captures are under `docs/verification/milestone-06/` (ignored local evidence): `public-desktop.png`, `public-mobile.png`, `unknown-desktop.png`, `unknown-mobile.png`. These are development-server captures and include the Next.js development indicator.
- Sandbox restrictions initially prevented a local server and build-worker execution; local-only verification succeeded with sandbox escalation. No dependencies were installed, no contract/factory settings changed, and nothing was deployed, signed or pushed.

## Decisions and remaining work

No new profile system or infrastructure was introduced. A native `details`/`summary` creator card keeps the public presentation server-renderable and functional without application JavaScript. The data mapper copies only explicitly public fields, and the shared extraction is deliberately limited to the cover and project introduction so builder behavior stays intact.

Before participant applications, product decisions are still needed for application fields and consent, identity/account verification, persistence and access control, Steward review and applicant status, public/private information boundaries, and notification behavior. Real project publication and verified funding/reward state also remain future work. Applications and reward actions remain unavailable in this preview.
