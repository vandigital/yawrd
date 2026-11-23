import { validateYawrdIntakeDraft, updateYawrdIntakeDraft, type YawrdIntakeDraftV1 } from './yawrd-intake.ts';

/** A browser backup is never evidence of an acknowledged account save. */
export function intakeSaveState(current: string, confirmed: string | null, pending: boolean, failed: boolean) {
  const saved = confirmed !== null && current === confirmed && !pending && !failed;
  return { saved, canSave: !pending && !saved };
}

export const INTAKE_QUESTIONS = [
  { field: 'projectType', prompt: 'What type of project are you building?' },
  { field: 'startingPoint', prompt: 'How far along is your project?' },
  { field: 'availableResources', prompt: 'What do you already have to help build it?', helper: 'Tell us about people, tools, skills, documents, equipment, code or other resources you already have. “None yet” or “Starting from scratch” is fine. Say when access or permission is still undecided.', placeholder: 'I have design sketches, a laptop, two volunteers and a document explaining the idea.' },
  { field: 'successCriteria', prompt: 'What would make the first version a success?', helper: 'Describe one clear result that would show the first version is ready. What could someone see or try to check it? You do not need technical specifications.', placeholder: 'People can sign up, post an idea and see it appear on the community page.' },
  { field: 'intendedBudget', prompt: 'How much do you plan to spend on this project?', helper: 'Your estimated project budget is separate from Yawrd’s network deployment and platform setup fees.' },
  { field: 'founderDescription', prompt: 'Tell us about your project. What do you want to build?', helper: 'Describe your idea, who it is for, what it should do, and anything important contributors should know. Keep unknown choices explicit; ordinary language is enough.', placeholder: 'I want to create a simple platform that helps people in my neighborhood organize shared activities. Members should be able to suggest events, invite others and see what’s happening nearby.' },
] as const;

export const INTAKE_LABELS: Record<string, string> = {
  community: 'Community', creative: 'Creative', software: 'Software / App', research: 'Research', event: 'Event', other: 'Other',
  idea: 'Just an idea', 'written-plan': 'I have a written plan', 'work-started': 'Work has already started', 'existing-project': 'I already have a project',
  undecided: 'Undecided', 'no-money-needed': 'No money needed', 'under-500': 'Under 500 USD equivalent',
  '500-to-5000': '500–5,000 USD equivalent', 'over-5000': 'Over 5,000 USD equivalent',
};

export const COPY_INTAKE_QUESTIONS = [
  'Help me prepare my Yawrd project intake. Give clear, concrete answers in my own voice. Ask me about missing facts instead of inventing them. Keep the numbered headings and paragraphs so I can paste each answer and review it.',
  'Project name: What is your project called?',
  ...INTAKE_QUESTIONS.map((q, i) => `${i + 1}. ${q.prompt}${'helper' in q ? `\n${q.helper}` : ''}${q.field === 'projectType' ? '\nChoose: Community, Creative, Software / App, Research, Event, Other.' : q.field === 'startingPoint' ? '\nChoose: Just an idea, I have a written plan, Work has already started, I already have a project.' : q.field === 'intendedBudget' ? '\nChoose: Undecided, No money needed, Under 500 USD equivalent, 500–5,000 USD equivalent, Over 5,000 USD equivalent.' : ''}`),
  'I will review every answer and explicitly confirm the first-version outcome myself. Do not include private keys, recovery phrases, credentials or sensitive project information.',
].join('\n\n');

/** Deliberate recovery copies editable answers/name only. The destination's
 * schema, source identity and creation time stay intact; gates are re-derived.
 * Public setup/configuration is deliberately outside this operation.
 */
export function applyRestoredIntake(saved: YawrdIntakeDraftV1, restored: unknown, now: string): YawrdIntakeDraftV1 {
  const destination = validateYawrdIntakeDraft(saved), incoming = validateYawrdIntakeDraft(restored);
  return validateYawrdIntakeDraft({ ...updateYawrdIntakeDraft(destination,{...incoming.answers,
    initialOutcomeConfirmed: incoming.answers.successCriteria === destination.answers.successCriteria && incoming.answers.initialOutcomeConfirmed,
  },now),
    ...(incoming.projectName !== undefined ? { projectName: incoming.projectName } : {}),
  });
}
