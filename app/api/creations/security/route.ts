import { database } from '../../../../src/participants/database';
import { creationEnvironment, creationDatabaseUrl } from '../../../../src/creation/release-environment';
import { configuredOrigin } from '../../../../src/participants/http';
import { creationSecurityLinksRequest } from '../../../../src/creation/platform-fee-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!creationEnvironment()) return Response.json({ error: 'not_found' }, { status: 404 });
  const guarded: typeof database = (sql, values) => { creationDatabaseUrl(); return database(sql, values); };
  return creationSecurityLinksRequest(request, guarded, configuredOrigin());
}
