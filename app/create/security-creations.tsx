'use client';
import { useEffect, useState } from 'react';
type SecurityLink = { id: string; name: string; daoAccountId: string };
/** A second Steward can discover only public, deployed security pages. */
export default function SecurityCreations({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<SecurityLink[]>([]), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setItems([]); setFailed(false);
    fetch('/api/creations/security', { credentials: 'same-origin', cache: 'no-store', headers: { 'x-yawrd-account': accountId } })
      .then(async response => { if (!response.ok) throw Error('unavailable'); return response.json(); })
      .then(data => { if (active) setItems(data.items); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [accountId, retry]);
  return <section aria-label="Your Steward security pages">
    {items.length > 0 && <><h3>Yawrd security · for Stewards</h3><p>Review security and approvals here. These pages do not show private project answers.</p>
      {items.map(item => <p key={item.id}><a href={'/create/' + item.id + '/secure'}>Security: {item.name}</a><br/><small>{item.daoAccountId}</small></p>)}</>}
    {failed && <p>Steward security links could not be loaded. <button onClick={() => setRetry(n => n + 1)}>Retry security links</button></p>}
  </section>;
}
