import { database } from '../../../../../src/participants/database';
import { ParticipantRepository } from '../../../../../src/participants/repository';
import { configuredOrigin, participantRequest } from '../../../../../src/participants/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request, context: { params: Promise<{ projectId: string; action: string }> }) {
  const { projectId, action } = await context.params;
  return participantRequest(request, projectId, action, new ParticipantRepository(database), configuredOrigin());
}
export const GET = handle;
export const POST = handle;
