import { PUBLIC_ID_PATTERN } from '../../../../../src/project-identity';
import { json } from '../../../../../src/participants/http';
import { database } from '../../../../../src/participants/database';
import { ParticipantRepository } from '../../../../../src/participants/repository';
import { configuredOrigin, participantRequest } from '../../../../../src/participants/http';
import { ContributionRepository } from '../../../../../src/contributions/repository';
import { contributionRequest } from '../../../../../src/contributions/http';
import { verifiedContributionActivation } from '../../../../../src/contributions/policy';
import { payoutContextRequest } from '../../../../../src/rewards/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request, context: { params: Promise<{ projectId: string; action: string }> }) {
  const { projectId, action } = await context.params;
  if (PUBLIC_ID_PATTERN.test(projectId)) return json({error:'participation_closed'},409);
  if (action === 'reward-payout') return payoutContextRequest(request, projectId, database, configuredOrigin());
  if (action === 'contributions') {
    const activation = await verifiedContributionActivation(database);
    return contributionRequest(request, projectId, new ContributionRepository(database, activation), configuredOrigin());
  }
  return participantRequest(request, projectId, action, new ParticipantRepository(database), configuredOrigin());
}
export const GET = handle;
export const POST = handle;
