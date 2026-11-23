import { creationEnvironment, creationDatabaseUrl } from '../../../src/creation/release-environment';
import { withCreationAdmission } from '../../../src/creation/admission';
import { database } from '../../../src/participants/database';
import { configuredOrigin } from '../../../src/participants/http';
import { creationRequest } from '../../../src/creation/http';

const guarded: typeof database = (sql, values) => { creationDatabaseUrl(); return database(sql, values); };
export const dynamic = 'force-dynamic';
export function GET(request: Request) { if (!creationEnvironment()) return Response.json({error:'not_found'}, {status:404});
  return withCreationAdmission(request, guarded, configuredOrigin(), () => creationRequest(request, null, guarded, configuredOrigin())); }
export function POST(request: Request) { if (!creationEnvironment()) return Response.json({error:'not_found'}, {status:404});
  return withCreationAdmission(request, guarded, configuredOrigin(), () => creationRequest(request, null, guarded, configuredOrigin())); }
