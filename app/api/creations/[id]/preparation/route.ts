import { withCreationAdmission } from '../../../../../src/creation/admission';
import { database } from '../../../../../src/participants/database';
import { creationEnvironment, creationDatabaseUrl } from '../../../../../src/creation/release-environment';
import { configuredOrigin, json } from '../../../../../src/participants/http';
import { preparationRequest } from '../../../../../src/creation/preparation-http';
import { PreparationGenerationService } from '../../../../../src/creation/preparation-generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hosted release uses the normal 180-second provider deadline plus save margin.
// The 420-second premium recovery remains local Development-only.
export const maxDuration = 300;
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  if(!creationEnvironment())return json({error:'not_found'},404);
  const guarded: typeof database=(sql,values)=>{creationDatabaseUrl();return database(sql,values);};
  const { id } = await context.params;
  return withCreationAdmission(request, guarded, configuredOrigin(), () => preparationRequest(request,id,guarded,configuredOrigin(),new PreparationGenerationService(guarded)));
}
export const GET=handle;
export const POST=handle;
