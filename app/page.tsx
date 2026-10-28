"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildYawrdCreation, type CreationInput, type CreationPlan } from "../src/create-yawrd";
import { BuoyMark } from "./components/buoy-mark";
import { useTestnetWallet } from "./use-testnet-wallet";
import { CreationPanel } from "./components/creation-panel";
import { testnetFactorySettings } from "../src/testnet-factory-settings";

// Existing illustrative address; no Testnet factory deployment is verified here.
const PREVIEW_FACTORY = "sputnik-dao.near";
const CREATION_FACTORY = testnetFactorySettings?.factoryAccountId ?? PREVIEW_FACTORY;
const STEP_TITLES = ["Yawrd Details", "Yawrd Stewards", "Yawrd Review"] as const;

type Step = 1 | 2 | 3;

function addressLabel(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
}

function getFieldForError(message: string): string {
  if (message.startsWith("Project name")) return "name";
  if (message.startsWith("Project purpose")) return "purpose";
  if (message === "New DAO account ID cannot be a Steward account ID") return "stewards";
  if (message.startsWith("Project account label") || message.startsWith("New DAO account ID")) return "label";
  if (message.startsWith("Steward approval threshold")) return "threshold";
  if (message.startsWith("Steward account ID") || message.startsWith("Duplicate Steward")) return "stewards";
  if (message.startsWith("Connect Meteor Wallet")) return "creator";
  return "general";
}

function ArrowIcon({ back = false }: { back?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`size-4 ${back ? "rotate-180" : ""}`}>
      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function OpenYawrdPage() {
  const wallet = useTestnetWallet();
  const stepsNavRef = useRef<HTMLElement>(null);
  const previousCreator = useRef(wallet.accountId);
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("The Common Table");
  const [purpose, setPurpose] = useState("A shared place to bring neighbors together around food, ideas, and small projects that make our corner of the city feel more connected.");
  const [label, setLabel] = useState("the-common-table");
  const [labelEdited, setLabelEdited] = useState(false);
  const [additionalStewards, setAdditionalStewards] = useState(["maya.demo.near", "jules.demo.near"]);
  const [threshold, setThreshold] = useState("2");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (previousCreator.current !== wallet.accountId) {
      previousCreator.current = wallet.accountId;
      setStep((current) => current === 3 ? 2 : current);
    }
  }, [wallet.accountId]);

  const result = useMemo<{ plan: CreationPlan | null; preview: CreationPlan | null; error: string | null }>(() => {
    const input: CreationInput = {
      projectName: name,
      projectPurpose: purpose,
      projectAccountLabel: label,
      // A placeholder runs the existing field validation while disconnected;
      // its plan is never exposed or used as a creation plan.
      creatorAccountId: wallet.accountId ?? "preview-creator.testnet",
      initialStewardAccountIds: additionalStewards,
      stewardApprovalThreshold: Number(threshold),
      factoryAccountId: CREATION_FACTORY,
    };
    try {
      const plan = buildYawrdCreation(input);
      return wallet.accountId
        ? { plan, preview: plan, error: null }
        : { plan: null, preview: plan, error: "Connect Meteor Wallet on Testnet to include your creator account." };
    } catch (error) {
      return { plan: null, preview: null, error: error instanceof Error ? error.message : "The preview could not be prepared." };
    }
  }, [name, purpose, label, additionalStewards, threshold, wallet.accountId]);

  const errorField = result.error ? getFieldForError(result.error) : null;
  const showError = (field: string) => Boolean(errorField === field && touched[field]);
  const markTouched = (field: string) => setTouched((current) => ({ ...current, [field]: true }));
  const inputClass = "w-full rounded-xl border border-[#39514b] bg-[#16231f] px-4 py-3.5 text-[15px] text-[#f0f6f2] outline-none transition-colors placeholder:text-[#7c958b] hover:border-[#658b80] focus:border-[#c2dedd] focus:ring-2 focus:ring-[#3d8c8a]/30 aria-[invalid=true]:border-[#c98274]";

  function goToStep(next: Step) {
    setStep(next);
    stepsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function nextStep() {
    if (step === 1) {
      setTouched((current) => ({ ...current, name: true, purpose: true, label: true }));
      // The builder checks project details before crew fields, so later-field errors
      // do not block this step. All validation still comes from the builder.
      if (!result.error || errorField === "creator" || errorField === "stewards" || errorField === "threshold") goToStep(2);
    } else if (step === 2) {
      setTouched((current) => ({ ...current, stewards: true, threshold: true }));
      if (result.plan) goToStep(3);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0d1716] text-[#e9f1ee]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_0%,rgba(61,140,138,0.17),transparent_45%)]" />
      <div aria-hidden="true" className="grid-texture pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative mx-auto max-w-[1320px] px-5 pb-16 sm:px-8 lg:px-12">
        <header className="flex min-h-20 items-center justify-between border-b border-white/[0.09] sm:min-h-24">
          <div className="flex items-center gap-3.5" aria-label="Yawrd">
            <BuoyMark className="size-9 shrink-0" />
            <span className="text-[22px] font-semibold tracking-[-0.06em]">yawrd<span className="text-[#73aaa5]">.</span></span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-[#3d8c8a]/50 bg-[#3d8c8a]/10 px-3 py-2 text-[11px] font-semibold text-[#c2dedd]">Testnet · Local preview</span>
            {wallet.accountId ? (
              <button type="button" onClick={wallet.disconnect} disabled={wallet.busy} className="rounded-xl border border-[#456058] px-3 py-2 text-xs font-medium text-[#d6e6df] hover:border-[#c2dedd] disabled:opacity-50">Disconnect</button>
            ) : (
              <button type="button" onClick={wallet.connect} disabled={!wallet.ready || !wallet.available || wallet.busy} className="rounded-xl border border-[#456058] px-3 py-2 text-xs font-medium text-[#d6e6df] hover:border-[#c2dedd] disabled:opacity-50">{wallet.busy ? "Connecting…" : "Connect Meteor"}</button>
            )}
          </div>
        </header>
        {wallet.error && <p role="alert" className="mt-4 field-error">{wallet.error}</p>}
        {wallet.ready && !wallet.available && <p role="alert" className="mt-4 field-error">Meteor Wallet is unavailable for Testnet connection.</p>}

        <section className="pb-9 pt-12 sm:pb-12 sm:pt-16 lg:pt-[72px]">
          <h1 className="max-w-[900px] text-[clamp(3.15rem,6vw,5.8rem)] leading-[1.02] font-medium tracking-[-0.065em] text-white">Create your Yawrd</h1>
          <p className="mt-5 max-w-[670px] text-[16px] leading-[1.65] text-[#b8cec5] sm:text-[18px]">A place where people and their agents come together to build what&apos;s next</p>
        </section>

        <nav ref={stepsNavRef} aria-label="Creation steps" className="mb-7 border-b border-white/[0.1] sm:mb-8">
          <ol className="grid grid-cols-3 gap-2 sm:gap-6">
            {STEP_TITLES.map((title, index) => {
              const number = (index + 1) as Step;
              return (
                <li key={title} aria-current={step === number ? "step" : undefined} className={`flex min-h-[68px] flex-col justify-center gap-1 border-b-2 pb-3 pt-2 text-[12px] font-medium leading-4 text-white sm:min-h-0 sm:flex-row sm:items-center sm:justify-start sm:gap-3 sm:py-4 sm:text-sm ${step === number ? "border-[#c2dedd]" : "border-transparent"}`}>
                  <span className="text-[11px] font-semibold tabular-nums text-[#87aaa2]">0{number}</span>
                  <span>{title}</span>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className={step === 3 ? "mx-auto max-w-[880px]" : "grid items-start gap-6 lg:grid-cols-[minmax(0,1.16fr)_minmax(340px,0.84fr)] lg:gap-8"}>
          <section aria-labelledby="step-title" className="rounded-[24px] border border-white/[0.1] bg-[#111e1c]/95 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.14)] sm:p-8 lg:p-10">
            <h2 id="step-title" className="mb-8 flex items-baseline gap-4 border-b border-white/[0.08] pb-6 text-[26px] font-medium tracking-[-0.04em] text-white sm:text-[30px]">
              <span className="text-[13px] font-medium tabular-nums tracking-normal text-[#91ada5]">0{step}</span>
              {STEP_TITLES[step - 1]}
            </h2>

            {step === 1 && (
              <div className="space-y-7">
                <div>
                  <label htmlFor="project-name" className="field-label">Project name <span className="text-[#76b9b3]">*</span></label>
                  <input id="project-name" value={name} onChange={(event) => { const next = event.target.value; setName(next); if (!labelEdited) setLabel(addressLabel(next)); }} onBlur={() => markTouched("name")} aria-invalid={showError("name")} aria-describedby={showError("name") ? "name-error" : undefined} className={inputClass} placeholder="What will you call your Yawrd?" />
                  {showError("name") && <p id="name-error" role="alert" className="field-error">{result.error}</p>}
                </div>
                <div>
                  <label htmlFor="project-purpose" className="field-label">Short description <span className="text-[#76b9b3]">*</span></label>
                  <textarea id="project-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} onBlur={() => markTouched("purpose")} aria-invalid={showError("purpose")} aria-describedby={showError("purpose") ? "purpose-error" : "purpose-help"} rows={4} className={`${inputClass} resize-y leading-7`} placeholder="What will this space make possible?" />
                  {showError("purpose") ? <p id="purpose-error" role="alert" className="field-error">{result.error}</p> : <p id="purpose-help" className="field-help">A sentence or two about the purpose you share.</p>}
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="project-label" className="field-label">Project address label <span className="text-[#76b9b3]">*</span></label>
                    {labelEdited && <button type="button" onClick={() => { setLabel(addressLabel(name)); setLabelEdited(false); }} className="mb-2 rounded-sm text-xs text-[#c2dedd] underline decoration-[#548f89] underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2dedd]">Use name</button>}
                  </div>
                  <div className="flex min-w-0 items-center rounded-xl border border-[#39514b] bg-[#16231f] transition-colors hover:border-[#658b80] focus-within:border-[#c2dedd] focus-within:ring-2 focus-within:ring-[#3d8c8a]/30">
                    <span className="pl-4 text-[#91bfb3]">/</span>
                    <input id="project-label" value={label} onChange={(event) => { setLabel(event.target.value); setLabelEdited(true); }} onBlur={() => markTouched("label")} aria-invalid={showError("label")} aria-describedby={showError("label") ? "label-error" : "label-help"} className="min-w-0 flex-1 bg-transparent py-3.5 pl-2 pr-4 text-[15px] text-[#e9f1ee] outline-none placeholder:text-[#6f8580]" placeholder="project-address" autoCapitalize="none" spellCheck={false} />
                  </div>
                  {showError("label") ? <p id="label-error" role="alert" className="field-error">{result.error}</p> : <p id="label-help" className="field-help">Suggested from your name. You can edit it before opening a Yawrd later.</p>}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-7">
                <div>
                  <span className="field-label">Creator account</span>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[#3d8c8a]/35 bg-[#3d8c8a]/[0.08] px-4 py-3.5">
                    <span className="truncate font-mono text-[13px] text-[#c7e1dc]">{wallet.accountId ?? "No account connected"}</span>
                    <span className="shrink-0 rounded-md bg-[#3d8c8a]/20 px-2 py-1 text-[10px] font-semibold text-[#a9d8d3]">Testnet</span>
                  </div>
                  {wallet.accountIds.length > 1 && <select aria-label="Creator account" value={wallet.accountId ?? ""} onChange={(event) => wallet.selectAccount(event.target.value)} className={`${inputClass} mt-3`}>{wallet.accountIds.map((account) => <option key={account} value={account}>{account}</option>)}</select>}
                  <p className="field-help">{wallet.accountId ? "Your connected account is included as the first Steward." : "Connect Meteor Wallet to include your Testnet account as the first Steward."}</p>
                  {showError("creator") && <p role="alert" className="field-error">{result.error}</p>}
                </div>
                <div>
                  <span className="field-label">Additional Stewards <span className="font-normal text-[#78958e]">(optional)</span></span>
                  <div className="space-y-2.5">
                    {additionalStewards.map((account, index) => (
                      <div key={index} className="flex gap-2">
                        <input aria-label={`Additional Steward ${index + 1} account ID`} value={account} onChange={(event) => setAdditionalStewards((current) => current.map((value, position) => position === index ? event.target.value : value))} onBlur={() => markTouched("stewards")} aria-invalid={showError("stewards")} aria-describedby={showError("stewards") ? "stewards-error" : undefined} className={`${inputClass} min-w-0 font-mono text-[13px]`} placeholder="account.near" autoCapitalize="none" spellCheck={false} />
                        <button type="button" aria-label={`Remove additional Steward ${index + 1}`} onClick={() => setAdditionalStewards((current) => current.filter((_, position) => position !== index))} className="flex size-[52px] shrink-0 items-center justify-center rounded-xl border border-[#39514b] text-lg text-[#a9c1b7] transition-colors hover:border-[#c2dedd] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2dedd]">×</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setAdditionalStewards((current) => [...current, ""])} className="mt-3 inline-flex items-center gap-2 rounded-md text-sm font-medium text-[#c2dedd] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c2dedd]"><PlusIcon />Add a Steward</button>
                  {showError("stewards") && <p id="stewards-error" role="alert" className="field-error">{result.error}</p>}
                </div>
                <div>
                  <label htmlFor="approval-threshold" className="field-label">Approval threshold <span className="text-[#76b9b3]">*</span></label>
                  <div className="flex items-center gap-4">
                    <input id="approval-threshold" type="number" min="1" step="1" value={threshold} onChange={(event) => setThreshold(event.target.value)} onBlur={() => markTouched("threshold")} aria-invalid={showError("threshold")} aria-describedby={showError("threshold") ? "threshold-error" : "threshold-help"} className={`${inputClass} max-w-28 tabular-nums`} />
                    <span className="text-sm text-[#9cb5ae]">of {additionalStewards.length + 1} Stewards must approve</span>
                  </div>
                  {showError("threshold") ? <p id="threshold-error" role="alert" className="field-error">{result.error}</p> : <p id="threshold-help" className="field-help">Choose how many Stewards need to agree on a decision.</p>}
                </div>
              </div>
            )}

            {step === 3 && result.plan && (
              <div className="space-y-8">
                <div>
                  <h3 className="mb-4 text-lg font-medium text-white">Details</h3>
                  <dl className="space-y-5 rounded-2xl border border-white/[0.09] bg-[#14221f] p-5 sm:p-6">
                    <div><dt className="review-label">Project name</dt><dd className="mt-1 text-xl font-medium text-[#e8f2ee]">{result.plan.initializer.config.name}</dd></div>
                    <div><dt className="review-label">Short description</dt><dd className="mt-1 text-sm leading-7 text-[#bed1c9]">{result.plan.initializer.config.purpose}</dd></div>
                    <div><dt className="review-label">{testnetFactorySettings ? "Intended project address" : "Example project address"}</dt><dd className="mt-1 break-all font-mono text-sm text-[#b8d9d2]">{result.plan.daoAccountId}</dd></div>
                  </dl>
                </div>
                <div>
                  <h3 className="mb-4 text-lg font-medium text-white">Stewards</h3>
                  <div className="rounded-2xl border border-white/[0.09] bg-[#14221f] p-5 sm:p-6">
                    <p className="review-label">Stewards</p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {result.plan.initializer.policy.roles[0].kind.Group.map((account, index) => (
                        <li key={account} className="rounded-full border border-[#64938a]/35 bg-[#25413a]/60 px-3 py-1.5 text-xs text-[#d0e4dd]">{index === 0 ? "Creator · " : ""}{account}</li>
                      ))}
                    </ul>
                    <p className="mt-5 text-sm leading-6 text-[#c7ddd5]"><strong className="font-semibold text-white">{result.plan.initializer.policy.default_vote_policy.threshold} of {result.plan.initializer.policy.roles[0].kind.Group.length} Stewards</strong> must approve decisions for this Yawrd.</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#5b918c]/40 bg-[#3d8c8a]/[0.1] p-5 sm:p-6">
                  <p className="font-medium text-[#d6eee8]">Review your Yawrd</p>
                  <p className="mt-2 text-sm leading-6 text-[#abc8bf]">Connecting selects your Testnet account. Opening a Yawrd uses the separate setup review and wallet approval below. Testnet opening requires exactly two Stewards and two approvals.</p>
                  <p className="mt-3 text-xs leading-6 text-[#a9c3b9]">Automatic updates begin enabled. Both Stewards must approve turning them off, followed by on-chain verification, before additional Project Funds can be enabled.</p>
                </div>
              </div>
            )}

            {step === 3 && !result.plan && <p role="alert" className="field-error">{result.error}</p>}
            {showError("general") && <p role="alert" className="field-error">{result.error}</p>}

            <div className={`mt-9 flex items-center gap-3 border-t border-white/[0.08] pt-7 ${step === 1 ? "justify-end" : step === 3 ? "justify-start" : "justify-between"}`}>
              {step > 1 && <button type="button" onClick={() => goToStep(step === 3 ? 2 : 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#456058] px-5 py-3 text-sm font-medium text-[#d6e6df] transition-colors hover:border-[#c2dedd] hover:bg-[#1b302a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2dedd]"><ArrowIcon back />Back</button>}
              {step < 3 && <button type="button" onClick={nextStep} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#c2dedd] px-5 py-3 text-sm font-semibold text-[#10211f] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2dedd]">Next<ArrowIcon /></button>}
            </div>
          </section>

          {step < 3 && (
            <aside aria-labelledby="preview-title" className="lg:sticky lg:top-8">
              <div className="overflow-hidden rounded-[24px] border border-[#5b918c]/35 bg-[#162521] shadow-[0_24px_70px_rgba(0,0,0,0.17)]">
                <div aria-hidden="true" className="preview-art h-20 border-b border-white/[0.08] sm:h-24" />
                <div className="p-6 sm:p-8">
                  <h2 id="preview-title" className="text-base font-medium text-white">Live preview</h2>
                  {result.preview ? (
                    <div className="mt-5">
                      <p className="text-[clamp(1.9rem,3vw,3rem)] leading-[1.08] font-medium tracking-[-0.06em] text-[#e7f2ed]">{result.preview.initializer.config.name}</p>
                      <p className="mt-3 text-sm leading-7 text-[#a8c0b8]">{result.preview.initializer.config.purpose}</p>
                      <div className="my-6 h-px bg-white/[0.1]" />
                      <p className="break-all font-mono text-xs leading-6 text-[#b9d7d0]">{result.preview.daoAccountId}</p>
                      <p className="mt-4 text-sm text-[#c6ded5]">{result.preview.initializer.policy.roles[0].kind.Group.length} Stewards · {result.preview.initializer.policy.default_vote_policy.threshold} approvals needed</p>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-xl border border-[#8b6f63]/40 bg-[#583a30]/20 p-5">
                      <p className="text-sm font-medium text-[#f1d4c8]">Preview needs an update</p>
                      <p className="mt-2 text-sm leading-6 text-[#d9b9ac]">{result.error}</p>
                    </div>
                  )}
                </div>
                <p className="border-t border-white/[0.08] bg-[#12201d] px-6 py-4 text-xs leading-5 text-[#91aca4] sm:px-8">Example address is not verified on Testnet · Nothing has been opened or funded</p>
              </div>
            </aside>
          )}
        </div>
        <CreationPanel visible={step === 3} input={{ projectName: name, projectPurpose: purpose, projectAccountLabel: label, creatorAccountId: wallet.accountId ?? "", initialStewardAccountIds: additionalStewards, stewardApprovalThreshold: Number(threshold), factoryAccountId: CREATION_FACTORY }} getWallet={wallet.getContext} sign={wallet.signCreation} />

      </div>
    </main>
  );
}
