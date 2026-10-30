// Static visual review only. No Next.js route, database, sign-in bypass or seed.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { PersistedYawrdPresentation } from '../app/components/persisted-yawrd';
import { PublicYawrdPresentation } from '../app/components/public-yawrd';
import { getPublicYawrd } from '../src/public-yawrd';
import type { ParticipantView } from '../src/participants/types';

const output = new URL('../docs/verification/milestone-07b/', import.meta.url);
await mkdir(output, { recursive: true });
const css = (await postcss([tailwind()]).process(await readFile(new URL('../app/globals.css', import.meta.url), 'utf8'), { from: 'app/globals.css' })).css;
const project = { id: 'synthetic-visual-review', network: 'testnet' as const, creatorAccountId: 'creator.example.testnet', name: 'A place to build together', description: 'Synthetic visual review of the Yawrd participant workflow. This is not a published project.', objectives: ['Bring together a small crew with a shared purpose.', 'Make room for thoughtful contributions and open collaboration.'], participation: 'Introduce yourself and tell the creator how you would like to contribute.', rewards: 'No rewards are guaranteed and no Project Funds are confirmed.' };
const app = { id: '00000000-0000-4000-8000-000000000001', accountId: 'participant.example.testnet', introduction: 'I would love to help welcome new contributors and document what we build.', status: 'pending' as const, reviewerAccountId: null };
for (const state of ['public', 'apply', 'pending', 'approved', 'rejected', 'creator', 'fixture'] as const) {
  const creator = state === 'creator', approved = state === 'approved';
  const view: ParticipantView = {
    accountId: state === 'public' ? null : creator ? project.creatorAccountId : app.accountId,
    role: creator ? 'creator' : approved ? 'participant' : 'public',
    application: ['pending', 'approved', 'rejected'].includes(state) ? { ...app, status: state as 'pending' | 'approved' | 'rejected', reviewerAccountId: state === 'pending' ? null : project.creatorAccountId } : null,
    applications: creator ? [app, { ...app, id: '00000000-0000-4000-8000-000000000002', accountId: 'another.example.testnet', status: 'approved', reviewerAccountId: project.creatorAccountId }] : [],
    restrictedContent: creator || approved ? 'Welcome, Crew Members. This synthetic participant information is visible only in the approved and creator preview states.' : null,
  };
  const markup = state === 'fixture' ? renderToStaticMarkup(createElement(PublicYawrdPresentation, { project: getPublicYawrd('the-common-table')! })) : renderToStaticMarkup(createElement(PersistedYawrdPresentation, { project, view }));
  await writeFile(new URL(`${state}.html`, output), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>07B synthetic ${state} preview</title><style>${css}</style></head><body style="background:#0d1716;color:#e9f1ee"><main class="mx-auto max-w-[1000px] px-5 py-8"><p style="padding:12px 0;font:12px sans-serif;color:#c2dedd">07B visual review · ${state} · Synthetic state, no live database or wallet proof</p>${markup}</main></body></html>`);
}
console.log('Static review pages written to docs/verification/milestone-07b.');
