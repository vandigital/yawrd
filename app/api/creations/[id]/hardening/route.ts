import { withCreationAdmission } from '../../../../../src/creation/admission';
import { database } from '../../../../../src/participants/database';
import { creationEnvironment, creationDatabaseUrl, creationActionEnabled } from '../../../../../src/creation/release-environment';
import { configuredOrigin } from '../../../../../src/participants/http';
import { createTestnetRpc } from '../../../../../src/creation-integration';
import { creationHardeningRequest } from '../../../../../src/creation/hardening-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request:Request,context:{params:Promise<{id:string}>}){
  const origin=configuredOrigin();
  if(!creationEnvironment())return Response.json({error:'not_found'},{status:404});
  const guarded:typeof database=(sql,values)=>{creationDatabaseUrl();return database(sql,values);};
  if (request.method === 'POST' && !creationActionEnabled('hardening')) return Response.json({error:'creation_security_not_authorized'}, {status:403});
  const { id } = await context.params;
  return withCreationAdmission(request, guarded, origin, () => creationHardeningRequest(request,id,guarded,origin,createTestnetRpc()), id);
}
export const GET=handle;
export const POST=handle;
