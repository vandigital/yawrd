"use client";
import { useRef, useState } from 'react';
import styles from './discovery-carousel.module.css';
export type DiscoveryProject = { id:string; name:string; description:string; status:string; image:string; lifecycle?:'actionable'|'planned'|'completed' };
export function DiscoveryCarousel({projects}:{projects:DiscoveryProject[]}) {
  // Sort a copy; publication readers retain their eligibility and stable order.
  const rank = { actionable: 0, planned: 1, completed: 2 };
  projects = [...projects].sort((a, b) => rank[a.lifecycle ?? 'planned'] - rank[b.lifecycle ?? 'planned']);
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
        <div className={styles.banner} aria-hidden="true"><img src={p.image} alt="" width={367} height={180}/></div><div className={styles.content}><p className={styles.status}>{p.id.toUpperCase()} · {p.status}</p><h3>{p.name}</h3><p className={styles.description}>{p.description}</p><a href={`/yawrd/${p.id}`} className="landing-secondary">Explore this Yawrd →</a></div>
      </article>)}
    </div><p className={styles.position} aria-live="polite">{active+1} of {projects.length} · Swipe or use the arrow controls</p>
  </section>;
}
