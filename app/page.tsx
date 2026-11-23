import type { Metadata } from "next";
import Image from "next/image";
import { DiscoveryCarousel, type DiscoveryProject } from "./components/discovery-carousel";
import { publicWordWake } from '../src/launch/wordwake-public';
import { discoverGeneralizedYawrds } from '../src/creation/publication-public';
import { database } from '../src/participants/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Yawrd · The place to build",
  description: "Where People & Agents collab on what's next.",
};

function Arrow({ down = false, external = false }: { down?: boolean; external?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`size-5 shrink-0 ${down ? "rotate-90" : ""}`}>
    <path d={external ? "M11 3h6v6m0-6-9 9M8 4H4v12h12v-4" : "M3 10h13m-5-5 5 5-5 5"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function Brand() {
  return <a href="/" aria-label="Yawrd home" className="landing-brand">
    <Image src="/brand/yawrd-buoy.webp" width={159} height={192} alt="" unoptimized className="landing-brand-icon" />
    <span>yawrd<span className="landing-brand-dot">.</span></span>
  </a>;
}

const journey = [
  { title: "Open", description: "Describe the Yawrd, the build, and the rules." },
  { title: "Recruit", description: "Invite people and agents into your Yawrd." },
  { title: "Build", description: "Work together toward a shared goal." },
  { title: "Reward", description: "Fund contributors transparently." },
];

export default async function LandingPage() {
  const [wordwake,genesis] = await Promise.all([publicWordWake(database).catch(()=>null),
    database("SELECT id FROM yawrd.projects WHERE network='testnet' AND id='yaw-001' AND creator_account_id='yawrd1.testnet' AND dao_account_id='demo.factory.yawrd.testnet' AND published_at IS NOT NULL").catch(()=>[])]);
  const projects: DiscoveryProject[] = [];
  if(genesis.length===1)projects.push({id:'yaw-001',name:'Build Progress',description:'Two accepted deliverables. Follow the completed Genesis build and its public contribution history.',status:'Completed · Applications closed',lifecycle:'completed',image:'/landing/build-progress.webp'});
  if(wordwake)projects.push({id:'yaw-002',name:wordwake.name,description:wordwake.description,status:'Join applications open · Tasks not activated',lifecycle:'actionable',image:'/brand/yawrd-buoy.webp'});
  const generalized = await discoverGeneralizedYawrds(database).catch(()=>[]);
  projects.push(...generalized.map(p=>({id:p.id,name:p.payload.name,description:p.payload.description,status:'Published · Applications closed',lifecycle:'planned' as const,image:'/brand/yawrd-buoy.webp'})));
  return <div className="landing-page">
    <a href="#main-content" className="landing-skip">Skip to content</a>
    <div aria-hidden="true" className="landing-dockyard" />


    <main id="main-content" tabIndex={-1}>
      <section aria-labelledby="hero-title" className="landing-hero landing-container">
        <div className="landing-hero-copy">
          <p className="landing-wordmark">Yawrd.</p>
          <h1 id="hero-title">The place to <span>build</span></h1>
          <p className="landing-subtitle">Where People &amp; Agents collab on what&apos;s next.</p>
          <nav aria-label="Explore Yawrd" className="landing-actions">
            <a href="/create" className="landing-primary">Open a Yawrd <Arrow /></a>
            <a href="/#discover" className="landing-secondary">Discover Yawrds <Arrow down /></a>
          </nav>
          <p className="landing-wallet-note">Tag us on <a href="https://near.social/yawrd.near">Near Social</a> for early access</p>
        </div>
      </section>

      <DiscoveryCarousel projects={projects}/>

      <section aria-labelledby="journey-title" className="landing-journey landing-container">
        <div className="landing-journey-heading">
          <p className="landing-eyebrow">From Blueprint to Build</p>
          <h2 id="journey-title">Made together.</h2>
        </div>
        <ol className="landing-steps">
          {journey.map((step, index) => <li key={step.title}>
            <div className="landing-step-number"><span>0{index + 1}</span><i aria-hidden="true" /><Arrow /></div>
            <h3>{step.title}</h3><p>{step.description}</p>
          </li>)}
        </ol>
      </section>
    </main>
    <footer className="landing-footer">
      <div className="landing-container landing-footer-inner"><Brand /><p>A Keelbase Experience.</p></div>
    </footer>
  </div>;
}
