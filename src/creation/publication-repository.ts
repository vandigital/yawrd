import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { Query } from '../participants/database.ts';
import type { IdentityChallenge, IdentityProof } from '../identity/types.ts';
import { CHALLENGE_TTL_MS, verifySignature, type VerifyAccessKey } from '../identity/nep413.ts';
import { fail, WorkflowError } from '../participants/repository.ts';
import { PUBLICATION_RECIPIENT, publicationMessage, publicationText, type PublicationReceipt, type PublicationReview } from './publication.ts';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export class PublicationRepository {
  private readonly query: Query;
  private readonly verifyKey: VerifyAccessKey;
  private readonly clock: () => number;
  constructor(query: Query, verifyKey: VerifyAccessKey, clock = Date.now) { this.query=query; this.verifyKey=verifyKey; this.clock=clock; }
  private async execute(sql: string, args: unknown[] = []) {
    try { return await this.query(sql, args); }
    catch (error) {
      const e = error as { code?: string; message?: string };
      if (e.code === 'P0001' && ['launch_source_changed','launch_already_published','launch_challenge_expired','sign_in_required','creation_not_found','launch_challenge_required','launch_rate_limited'].includes(e.message ?? ''))
        throw new WorkflowError(e.message!, e.message === 'sign_in_required' ? 401 : e.message === 'creation_not_found' ? 404 : 409);
      throw new WorkflowError('publication_storage_required',503);
    }
  }
  async ready() {
    try {
      const [r] = await this.execute("SELECT current_user AS role, has_function_privilege(current_user,'yawrd_publication.issue(text,text,text,jsonb,text,text)','EXECUTE') AS allowed");
      return r?.role === 'yawrd_publication_writer' && r.allowed === true;
    } catch { return false; }
  }
  async receipt(hash: string, id: string, account: string): Promise<PublicationReceipt | null> {
    const [r] = await this.execute('SELECT yawrd_publication.receipt($1,$2,$3) AS receipt',[hash,id,account]);
    return r?.receipt as PublicationReceipt | null;
  }
  async issue(hash: string, id: string, account: string, origin: string, review: PublicationReview) {
    const issuedAt = this.clock();
    const c: IdentityChallenge = { id: randomBytes(32).toString('base64url'), accountId: account, network: 'testnet', origin,
      nonce: randomBytes(32).toString('base64'), recipient: PUBLICATION_RECIPIENT, message: '', issuedAt, expiresAt: issuedAt + CHALLENGE_TTL_MS };
    const sourceText = publicationText(review.source), payloadText = publicationText(review.proposed);
    c.message = publicationMessage(c,id,digest(sourceText),digest(payloadText));
    await this.execute('SELECT yawrd_publication.issue($1,$2,$3,$4::jsonb,$5,$6)',[hash,id,account,JSON.stringify(c),sourceText,payloadText]);
    return c;
  }
  async publish(hash: string, id: string, account: string, origin: string, challengeId: unknown, proof: IdentityProof): Promise<PublicationReceipt> {
    fail(proof && typeof proof.accountId==='string' && typeof proof.publicKey==='string' && typeof proof.signature==='string','invalid_request');
    fail(typeof challengeId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(challengeId),'invalid_request');
    const [row] = await this.execute('SELECT yawrd_publication.ticket($1,$2,$3,$4) AS ticket',[hash,id,account,challengeId]);
    const ticket = row?.ticket as { challenge: IdentityChallenge; sourceText: string; payloadText: string; published: boolean };
    fail(ticket?.challenge,'launch_challenge_required',409);
    const c = ticket.challenge;
    fail(c.id === challengeId && c.accountId === account && c.network === 'testnet' && c.origin === origin && c.recipient === PUBLICATION_RECIPIENT &&
      c.message === publicationMessage(c,id,digest(ticket.sourceText),digest(ticket.payloadText)), 'launch_challenge_required',409);
    const fresh = () => fail(c.expiresAt - c.issuedAt === CHALLENGE_TTL_MS && this.clock() >= c.issuedAt && (ticket.published || this.clock() < c.expiresAt),'launch_challenge_expired',409);
    fresh(); verifySignature(c,proof);
    const key = await this.verifyKey(account,proof.publicKey); // Fresh finalized FullAccess key, never session evidence.
    fresh();
    const [r] = await this.execute('SELECT yawrd_publication.publish($1,$2,$3,$4,$5::jsonb) AS receipt',
      [hash,id,account,challengeId,JSON.stringify({ proof, key, consentVersion: 'creation-publication-v1' })]);
    fail(r?.receipt,'publication_storage_required',503);
    return r.receipt as PublicationReceipt;
  }
}
