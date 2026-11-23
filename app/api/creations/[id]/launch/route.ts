import { withCreationAdmission } from '../../../../../src/creation/admission';
import { createTestnetRpc } from '../../../../../src/creation-integration';
import { database } from '../../../../../src/participants/database';
import { creationEnvironment, creationDatabaseUrl, creationActionEnabled } from '../../../../../src/creation/release-environment';
import { configuredOrigin, json } from '../../../../../src/participants/http';
import { PublicationRepository } from '../../../../../src/creation/publication-repository';
import { publicationDatabase } from '../../../../../src/creation/publication-database';
import { testnetAccessKeyVerifier } from '../../../../../src/identity/nep413';
import { launchPreparationRequest } from '../../../../../src/creation/launch-preparation-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!creationEnvironment()) return json({ error: 'not_found' }, 404);
  const guarded: typeof database = (sql, values) => { creationDatabaseUrl(); return database(sql, values); };
  const { id } = await context.params;
  return withCreationAdmission(request, guarded, configuredOrigin(), () => launchPreparationRequest(request, id, guarded, configuredOrigin(), createTestnetRpc(), new PublicationRepository(publicationDatabase,testnetAccessKeyVerifier()), creationActionEnabled('publication')));
}
export const GET = handle;
export const POST = handle;
