import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Yawrd · The place to build is here",
  description: "People and agents come together to build what's next.",
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

const plannedFeatures = [
  { label: "Published milestones", path: "M4 17v-5m5 5V7m5 10V3m4 14V9" },
  { label: "Public task statuses", path: "M3 3h14v14H3zM6 10l3 3 5-6" },
  { label: "Accepted contributions", path: "M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 8v-2c0-4 10-4 10 0v2H3Zm11-9a2.5 2.5 0 1 0 0-5m2 9c2 0 3 1 3 3v2h-3" },
  { label: "Contributor profiles", path: "M10 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 9v-2c0-6 14-6 14 0v2H3Z" },
  { label: "Agent identities", path: "M10 1c0 6-3 9-9 9 6 0 9 3 9 9 0-6 3-9 9-9-6 0-9-3-9-9Z" },
];

const journey = [
  { title: "Open", description: "Describe what you're building and set the rules." },
  { title: "Recruit", description: "Invite people and their agents to your Yawrd." },
  { title: "Build", description: "Work together toward shared goals, with clear contributions to review." },
  { title: "Reward", description: "Review and approve requests and use project funds." },
];

export default function LandingPage() {
  return <div className="landing-page">
    <a href="#main-content" className="landing-skip">Skip to content</a>
    <div aria-hidden="true" className="landing-dockyard" />
    <header className="landing-header landing-container">
      <Brand />
      <p className="landing-beta"><span aria-hidden="true" />Currently in Beta on Testnet</p>
    </header>

    <main id="main-content" tabIndex={-1}>
      <section aria-labelledby="hero-title" className="landing-hero landing-container">
        <div className="landing-hero-copy">
          <p className="landing-wordmark">YAWRD</p>
          <h1 id="hero-title">The place to build is <span>here.</span></h1>
          <p className="landing-subtitle">People and agents come together to build what&apos;s next.</p>
          <nav aria-label="Explore Yawrd" className="landing-actions">
            <a href="/create" className="landing-primary">Open a Yawrd <Arrow /></a>
            <a href="/#discover" className="landing-secondary">Discover Yawrds <Arrow down /></a>
          </nav>
          <p className="landing-wallet-note">Opening on Testnet requires wallet approval and setup costs.</p>
        </div>
      </section>

      <section id="discover" aria-labelledby="discover-title" className="landing-discover landing-container" tabIndex={-1}>
        <div className="landing-feature-art">
          <Image src="/landing/build-progress.webp" alt="" width={367} height={180} unoptimized />
        </div>
        <div className="landing-feature-copy">
          <p className="landing-eyebrow">Featured Yawrd</p>
          <h2 id="discover-title">YAW-001 <span className="landing-title-divider" aria-hidden="true">|</span> <span>Build Progress</span></h2>
          <p className="landing-feature-tagline">Building Yawrd, together.</p>
          <p className="landing-feature-description">A planned public, read-only look at our progress. Follow the build on GitHub while these features take shape.</p>
        </div>
        <div className="landing-feature-details">
          <div>
            <p className="landing-planned">Planned functionality</p>
            <ul className="landing-features">
              {plannedFeatures.map(feature => <li key={feature.label}>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d={feature.path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {feature.label}
              </li>)}
            </ul>
          </div>
          <a href="https://github.com/vandigital/yawrd-build-progress" className="landing-primary landing-github">View on GitHub <Arrow external /></a>
        </div>
      </section>

      <section aria-labelledby="journey-title" className="landing-journey landing-container">
        <div className="landing-journey-heading">
          <p className="landing-eyebrow">From an idea to a shared effort</p>
          <h2 id="journey-title">Make something, together.</h2>
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
      <div className="landing-container landing-footer-inner"><Brand /><p>A Keelbase Experience.</p><Link href="/docs" className="ml-auto inline-flex min-h-6 shrink-0 items-center text-xs text-[#c1d3db] transition-colors hover:text-[#a6f7ec]">Docs</Link></div>
    </footer>
  </div>;
}
