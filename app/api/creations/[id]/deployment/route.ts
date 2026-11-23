import { creationEnvironment, creationDatabaseUrl } from '../../../../../src/creation/release-environment';
import { withCreationAdmission } from '../../../../../src/creation/admission';
import { database } from '../../../../../src/participants/database';
import { configuredOrigin } from '../../../../../src/participants/http';
import { createTestnetRpc } from '../../../../../src/creation-integration';
import { testnetFactorySettings } from '../../../../../src/testnet-factory-settings';
import { authorizedDeploymentForEnvironment, authorizedDevelopmentRecovery } from '../../../../../src/creation/deployment';
import { creationDeploymentRequest } from '../../../../../src/creation/deployment-http';

export const runtime = 'nodejs';
const guarded: typeof database = (sql, values) => { creationDatabaseUrl(); return database(sql, values); };
export const dynamic = 'force-dynamic';
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!creationEnvironment()) return Response.json({error:'not_found'}, {status:404});
  const { id } = await context.params;
  return withCreationAdmission(request, guarded, configuredOrigin(), () => creationDeploymentRequest(request, id, guarded, configuredOrigin(), testnetFactorySettings, createTestnetRpc(), authorizedDeploymentForEnvironment, authorizedDevelopmentRecovery));
}

export const GET = handle;
export const POST = handle;
