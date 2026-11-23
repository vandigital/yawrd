import { withCreationAdmission } from '../../../../../src/creation/admission';
import { database } from '../../../../../src/participants/database';
import { creationEnvironment, creationDatabaseUrl } from '../../../../../src/creation/release-environment';
import { configuredOrigin, json } from '../../../../../src/participants/http';
import { contributionConfigurationRequest } from '../../../../../src/creation/contribution-configuration-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!creationEnvironment()) return json({ error: 'not_found' }, 404);
  const guarded: typeof database = (sql, values) => { creationDatabaseUrl(); return database(sql, values); };
  const { id } = await context.params;
  return withCreationAdmission(request, guarded, configuredOrigin(), () => contributionConfigurationRequest(request, id, guarded, configuredOrigin()));
}
export const GET = handle;
export const POST = handle;
