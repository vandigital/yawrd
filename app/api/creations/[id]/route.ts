import { creationEnvironment, creationDatabaseUrl } from '../../../../src/creation/release-environment';
import { withCreationAdmission } from '../../../../src/creation/admission';
import { database } from '../../../../src/participants/database';
import { configuredOrigin } from '../../../../src/participants/http';
import { creationRequest } from '../../../../src/creation/http';

const guarded: typeof database = (sql, values) => { creationDatabaseUrl(); return database(sql, values); };
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  if (!creationEnvironment()) return Response.json({error:'not_found'}, {status:404});
  return withCreationAdmission(request, guarded, configuredOrigin(), () => creationRequest(request, id, guarded, configuredOrigin()));
}
export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  if (!creationEnvironment()) return Response.json({error:'not_found'}, {status:404});
  return withCreationAdmission(request, guarded, configuredOrigin(), () => creationRequest(request, id, guarded, configuredOrigin()));
}
