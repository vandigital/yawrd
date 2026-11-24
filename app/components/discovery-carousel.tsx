"use client";
import { useRef, useState } from 'react';
import styles from './discovery-carousel.module.css';
export type DiscoveryProject = {
  id:string; name:string; description:string; image:string; lifecycle?:'active'|'completed';
  publishedAt?:string|null; completedAt?:string|null;
  reward?:{amount:string;currency:'Testnet NEAR'}|null;
};
const time = (value:string|null|undefined) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
export function sortDiscoveryProjects(projects:readonly DiscoveryProject[]):DiscoveryProject[] {
  return [...projects].sort((a,b)=>{
    const bucket=Number(a.lifecycle==='completed')-Number(b.lifecycle==='completed');
    if(bucket)return bucket;
    const date=(p:DiscoveryProject)=>p.lifecycle==='completed' ? time(p.completedAt)??time(p.publishedAt) : time(p.publishedAt);
    const left=date(a),right=date(b);
    if(left!==right)return left===null?1:right===null?-1:right-left;
    return a.id<b.id?-1:a.id>b.id?1:0;
  });
}
export function DiscoveryCarousel({projects}:{projects:DiscoveryProject[]}) {
  // Lifecycle is independent of applications, task activation and payout permission.
  projects = sortDiscoveryProjects(projects);
  const rail=useRef<HTMLDivElement>(null), [active,setActive]=useState(0);
  function move(index:number) {
    const node=rail.current?.children[index] as HTMLElement | undefined;
    if (!node) return;
    setActive(index);node.focus({preventScroll:true});
    rail.current?.scrollTo({left:node.offsetLeft,
      behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  if (!projects.length) return null;
  return <section id="discover" className="landing-container" aria-labelledby="discover-title">
    <div className={styles.heading}><div><p className="landing-eyebrow">Published on Testnet</p><h2 id="discover-title">Discover Yawrds</h2></div>
      <div aria-label="Discovery controls"><button type="button" aria-label="Previous Yawrd" disabled={active===0} onClick={()=>move(active-1)}>←</button>
      <button type="button" aria-label="Next Yawrd" disabled={active===projects.length-1} onClick={()=>move(active+1)}>→</button></div></div>
    <div ref={rail} className={styles.rail} role="region" aria-roledescription="carousel" aria-label="Published Yawrds" tabIndex={0}
      onScroll={()=>{const node=rail.current;if(node){const cards=Array.from(node.children) as HTMLElement[];setActive(cards.reduce((best,card,i)=>Math.abs(card.offsetLeft-node.scrollLeft)<Math.abs(cards[best].offsetLeft-node.scrollLeft)?i:best,0));}}}
      onKeyDown={e=>{if(e.target!==e.currentTarget)return;const next=e.key==='ArrowRight'?active+1:e.key==='ArrowLeft'?active-1:e.key==='Home'?0:e.key==='End'?projects.length-1:null;if(next!==null){e.preventDefault();move(Math.max(0,Math.min(projects.length-1,next)));}}}>
      {projects.map((p,i)=><article key={p.id} className={styles.card} tabIndex={0} onFocus={()=>setActive(i)} aria-roledescription="slide" aria-label={`${i+1} of ${projects.length}: ${p.name}`}
        onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(Math.max(0,Math.min(projects.length-1,i+(e.key==='ArrowRight'?1:-1))));}}}>
        <div className={styles.banner} aria-hidden="true"><img src={p.image} alt="" width={367} height={180}/></div><div className={styles.content}><p className={styles.status}>{p.lifecycle==='completed'?'Completed':'Active'}</p><h3>{p.name}</h3><p className={styles.description}>{p.description}</p><div className={styles.footer}><a href={`/yawrd/${p.id}`} className="landing-secondary">Explore this Yawrd →</a><span className={styles.reward} title={p.reward?'Reviewed allocation; payout requires separate approval.':undefined}>Rewards: {p.reward ? `${p.reward.amount} ${p.reward.currency}` : 'Not set'}</span></div></div>
      </article>)}
    </div><p className={styles.position} aria-live="polite">{active+1} of {projects.length} · Swipe or use the arrow controls</p>
  </section>;
}
