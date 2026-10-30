import { database } from '../../../../src/participants/database';
import { PersistentAuth } from '../../../../src/participants/auth';
import { authRequest, configuredOrigin } from '../../../../src/participants/http';
import { testnetAccessKeyVerifier } from '../../../../src/identity/nep413';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  return authRequest(request, (await context.params).action, new PersistentAuth(database, testnetAccessKeyVerifier()), configuredOrigin());
}
