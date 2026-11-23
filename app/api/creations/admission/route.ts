import { creationEnvironment, creationDatabaseUrl } from '../../../../src/creation/release-environment';
import { database } from '../../../../src/participants/database';
import { configuredOrigin } from '../../../../src/participants/http';
import { creationAdmissionRequest } from '../../../../src/creation/admission';

const guarded: typeof database = (sql, values) => { creationDatabaseUrl(); return database(sql, values); };
export const dynamic = 'force-dynamic';
export function GET(request: Request) { if (!creationEnvironment()) return Response.json({error:'not_found'}, {status:404});
  return creationAdmissionRequest(request, guarded, configuredOrigin()); }
