import { database } from '../../../../src/participants/database';
import { authSessionRequest, configuredOrigin } from '../../../../src/participants/http';

export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return authSessionRequest(request, database, configuredOrigin());
}
