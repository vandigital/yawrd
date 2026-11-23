import { withCreationAdmission } from '../../../../../src/creation/admission';
import { database } from '../../../../../src/participants/database';
import { creationEnvironment, creationDatabaseUrl, creationActionEnabled } from '../../../../../src/creation/release-environment';
import { configuredOrigin } from '../../../../../src/participants/http';
import { createTestnetRpc } from '../../../../../src/creation-integration';
import { creationFeeRequest } from '../../../../../src/creation/platform-fee-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!creationEnvironment()) return Response.json({ error: 'not_found' }, { status: 404 });
  const guarded: typeof database = (sql, values) => { creationDatabaseUrl(); return database(sql, values); };
  const { id } = await context.params;
  return withCreationAdmission(request, guarded, configuredOrigin(), () => creationFeeRequest(request, id, guarded, configuredOrigin(), createTestnetRpc(), { authorized: creationActionEnabled('fee') }));
}

export const GET = handle;
export const POST = handle;
