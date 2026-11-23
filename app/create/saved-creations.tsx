"use client";

import { useEffect, useState } from 'react';
import type { CreationSummary } from '../../src/creation/repository';
import { listCreations } from './creation-api';

export default function SavedCreations({ accountId, onResume }: { accountId: string; onResume: (id: string) => void }) {
  const [items, setItems] = useState<CreationSummary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true); setError('');
    listCreations(accountId).then(page => { if (active) { setItems(page.items); setNext(page.nextAfterId); } })
      .catch(() => { if (active) setError('Saved drafts could not be loaded. Retry to resume a private draft.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [accountId, attempt]);
  async function more() {
    if (!next || busy) return;
    setBusy(true); setError('');
    try { const page = await listCreations(accountId, next); setItems(previous => [...previous, ...page.items]); setNext(page.nextAfterId); }
    catch { setError('More saved drafts could not be loaded. Try again.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Private saved drafts"><h3>Your private saved drafts</h3>
    {busy && <p role="status">Loading saved drafts…</p>}
    {!busy && !error && !items.length && <p>No saved drafts yet. Save your intake to resume it after signing in again.</p>}
    {items.map(item => <p key={item.id}><button onClick={() => onResume(item.id)}>Resume {item.displayName || 'Untitled Yawrd'}</button></p>)}
    {next && <button disabled={busy} onClick={() => void more()}>Load more drafts</button>}
    {error && <p role="alert">{error} <button disabled={busy} onClick={() => setAttempt(n => n + 1)}>Retry saved drafts</button></p>}
  </section>;
}
