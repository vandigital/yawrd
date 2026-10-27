"use client";

import { useMemo, useState } from "react";
import { buildYawrdCreation, type CreationInput, type CreationPlan } from "../src/create-yawrd";
import { BuoyMark } from "./components/buoy-mark";

const MOCK_CREATOR = "creator.demo.near";
const PREVIEW_FACTORY = "sputnik-dao.near";

function addressLabel(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
}

function getFieldForError(message: string): string {
  if (message.startsWith("Project name")) return "name";
  if (message.startsWith("Project purpose")) return "purpose";
  if (message.startsWith("Project account label") || message.startsWith("New DAO account ID")) return "label";
  if (message.startsWith("Steward approval threshold")) return "threshold";
  if (message.startsWith("Steward account ID") || message.startsWith("Duplicate Steward")) return "stewards";
  return "general";
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PlusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

export default function OpenYawrdPage() {
  const [name, setName] = useState("The Common Table");
  const [purpose, setPurpose] = useState("A shared place to bring neighbors together around food, ideas, and small projects that make our corner of the city feel more connected.");
  const [label, setLabel] = useState("the-common-table");
  const [labelEdited, setLabelEdited] = useState(false);
  const [additionalStewards, setAdditionalStewards] = useState(["maya.demo.near", "jules.demo.near"]);
  const [threshold, setThreshold] = useState("2");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const result = useMemo<{ plan: CreationPlan | null; error: string | null }>(() => {
    const input: CreationInput = {
      projectName: name,
      projectPurpose: purpose,
      projectAccountLabel: label,
      creatorAccountId: MOCK_CREATOR,
      initialStewardAccountIds: additionalStewards,
      stewardApprovalThreshold: Number(threshold),
      factoryAccountId: PREVIEW_FACTORY,
    };
    try {
      return { plan: buildYawrdCreation(input), error: null };
    } catch (error) {
      return { plan: null, error: error instanceof Error ? error.message : "The preview could not be prepared." };
    }
  }, [name, purpose, label, additionalStewards, threshold]);

  const errorField = result.error ? getFieldForError(result.error) : null;
  const showError = (field: string) => errorField === field && touched[field];
  const markTouched = (field: string) => setTouched((current) => ({ ...current, [field]: true }));
  const inputClass = "w-full rounded-xl border border-white/[0.12] bg-[#14201f] px-4 py-3.5 text-[15px] text-[#e9f1ee] outline-none transition placeholder:text-[#6f8580] focus:border-[#6bb2ae] focus:ring-2 focus:ring-[#3d8c8a]/20";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0d1716] text-[#e9f1ee]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_0%,rgba(61,140,138,0.17),transparent_45%)]" />
      <div aria-hidden="true" className="grid-texture pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative mx-auto max-w-[1480px] px-5 pb-20 sm:px-8 lg:px-12">
        <header className="flex min-h-24 items-center justify-between border-b border-white/[0.09]">
          <div className="flex items-center gap-3.5" aria-label="Yawrd">
            <BuoyMark className="size-9 shrink-0" />
            <span className="text-[22px] font-semibold tracking-[-0.06em]">yawrd<span className="text-[#73aaa5]">.</span></span>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a9c4bd] sm:gap-5">
            <span className="hidden sm:inline">Open a Yawrd</span>
            <span className="hidden size-1 rounded-full bg-[#55716d] sm:inline" />
            <span className="rounded-full border border-[#3d8c8a]/50 bg-[#3d8c8a]/10 px-3 py-2 text-[#b7ddda]">Local preview</span>
          </div>
        </header>

        <section className="pb-10 pt-12 sm:pb-14 sm:pt-16 lg:pt-20">
          <div className="mb-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8ebbb5]"><span className="h-px w-8 bg-[#5aaba6]" />A place to begin</div>
          <h1 className="max-w-[780px] text-[clamp(3.3rem,7vw,7.3rem)] leading-[0.98] font-medium tracking-[-0.075em]">Make room for<br /><span className="text-[#b8d8d2]">what&apos;s next.</span></h1>
          <div className="mt-7 flex flex-col gap-5 sm:mt-9 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-[530px] text-[16px] leading-[1.8] text-[#9cb0aa] sm:text-[17px]">Give your project a name, bring your Stewards together, and see how your Yawrd could take shape.</p>
            <p className="flex shrink-0 items-center gap-2 text-xs text-[#9fbdb7]"><span className="size-2 rounded-full bg-[#65aaa5] shadow-[0_0_14px_rgba(101,170,165,0.8)]" />Nothing is created from this page</p>
          </div>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.13fr)_minmax(340px,0.87fr)] lg:gap-8">
          <section aria-labelledby="details-title" className="rounded-[25px] border border-white/[0.1] bg-[#111e1c]/95 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.14)] sm:p-8 lg:p-10">
            <div className="mb-9 flex items-start gap-4 border-b border-white/[0.08] pb-7">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#4d8985] bg-[#3d8c8a]/15 text-xs font-semibold text-[#b9e1dd]">01</span>
              <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.23em] text-[#79b2ac]">Your starting point</p><h2 id="details-title" className="text-[27px] font-medium tracking-[-0.04em] sm:text-[31px]">The essentials</h2></div>
            </div>

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
                <div className="flex items-center justify-between gap-3"><label htmlFor="project-label" className="field-label">Project address label <span className="text-[#76b9b3]">*</span></label>{labelEdited && <button type="button" onClick={() => { setLabel(addressLabel(name)); setLabelEdited(false); }} className="mb-2 text-xs text-[#a8d5d0] underline decoration-[#548f89] underline-offset-4 hover:text-white">Use name</button>}</div>
                <div className="flex min-w-0 items-center rounded-xl border border-white/[0.12] bg-[#14201f] focus-within:border-[#6bb2ae] focus-within:ring-2 focus-within:ring-[#3d8c8a]/20">
                  <span className="pl-4 text-[#71aaa4]">/</span><input id="project-label" value={label} onChange={(event) => { setLabel(event.target.value); setLabelEdited(true); }} onBlur={() => markTouched("label")} aria-invalid={showError("label")} aria-describedby={showError("label") ? "label-error" : "label-help"} className="min-w-0 flex-1 bg-transparent py-3.5 pl-2 pr-4 text-[15px] text-[#e9f1ee] outline-none placeholder:text-[#6f8580]" placeholder="project-address" autoCapitalize="none" spellCheck={false} /></div>
                {showError("label") ? <p id="label-error" role="alert" className="field-error">{result.error}</p> : <p id="label-help" className="field-help">Suggested from your name. You can edit it before opening a Yawrd later.</p>}
              </div>
            </div>

            <div className="my-9 h-px bg-white/[0.08]" />
            <div className="mb-6"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.23em] text-[#79b2ac]">The people behind it</p><h3 className="text-[24px] font-medium tracking-[-0.04em]">Stewards & approvals</h3><p className="mt-2 text-sm leading-6 text-[#91aaa4]">Stewards help make decisions for this Yawrd.</p></div>
            <div className="space-y-5">
              <div><span className="field-label">Creator account</span><div className="flex items-center justify-between gap-3 rounded-xl border border-[#3d8c8a]/30 bg-[#3d8c8a]/[0.08] px-4 py-3.5"><span className="truncate font-mono text-[13px] text-[#c7e1dc]">{MOCK_CREATOR}</span><span className="shrink-0 rounded-md bg-[#3d8c8a]/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#a9d8d3]">Mock account</span></div><p className="field-help">Included as the first Steward in this local preview. No wallet is connected.</p></div>
              <div><span className="field-label">Additional Stewards <span className="font-normal text-[#78958e]">(optional)</span></span><div className="space-y-2.5">{additionalStewards.map((account, index) => <div key={index} className="flex gap-2"><input aria-label={`Additional Steward ${index + 1} account ID`} value={account} onChange={(event) => setAdditionalStewards((current) => current.map((value, position) => position === index ? event.target.value : value))} onBlur={() => markTouched("stewards")} aria-invalid={showError("stewards")} aria-describedby={showError("stewards") ? "stewards-error" : undefined} className={`${inputClass} min-w-0 font-mono text-[13px]`} placeholder="account.near" autoCapitalize="none" spellCheck={false} /><button type="button" aria-label={`Remove additional Steward ${index + 1}`} onClick={() => setAdditionalStewards((current) => current.filter((_, position) => position !== index))} className="flex size-[52px] shrink-0 items-center justify-center rounded-xl border border-white/[0.12] text-lg text-[#8fa9a2] transition hover:border-[#6bb2ae] hover:text-white">×</button></div>)}</div><button type="button" onClick={() => setAdditionalStewards((current) => [...current, ""])} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#a8d5d0] transition hover:text-white"><PlusIcon />Add a Steward</button>{showError("stewards") && <p id="stewards-error" role="alert" className="field-error">{result.error}</p>}</div>
              <div><label htmlFor="approval-threshold" className="field-label">Approval threshold <span className="text-[#76b9b3]">*</span></label><div className="flex items-center gap-4"><input id="approval-threshold" type="number" min="1" step="1" value={threshold} onChange={(event) => setThreshold(event.target.value)} onBlur={() => markTouched("threshold")} aria-invalid={showError("threshold")} aria-describedby={showError("threshold") ? "threshold-error" : "threshold-help"} className={`${inputClass} max-w-28 tabular-nums`} /><span className="text-sm text-[#9cb5ae]">of {additionalStewards.length + 1} Stewards must approve</span></div>{showError("threshold") ? <p id="threshold-error" role="alert" className="field-error">{result.error}</p> : <p id="threshold-help" className="field-help">Choose how many Stewards need to agree on a decision.</p>}</div>
            </div>

            <div className="mt-9 flex flex-col gap-4 rounded-2xl border border-[#3d8c8a]/25 bg-[#3d8c8a]/[0.08] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-[#c7e5df]">{result.plan ? "Your preview is ready" : "Your preview needs an update"}</p><p className="mt-1 text-xs leading-5 text-[#91ada6]">Changes live only in this browser tab and are not submitted.</p></div><a href="#yawrd-preview" onClick={() => setTouched({ name: true, purpose: true, label: true, stewards: true, threshold: true, general: true })} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#c2dedd] px-4 py-3 text-sm font-semibold text-[#10211f] transition hover:bg-white">View preview <ArrowIcon /></a></div>
          </section>

          <aside id="yawrd-preview" aria-labelledby="preview-title" className="scroll-mt-6 lg:sticky lg:top-8">
            <div className="overflow-hidden rounded-[25px] border border-[#5b918c]/35 bg-[#162521] shadow-[0_24px_70px_rgba(0,0,0,0.17)]">
              <div className="preview-art relative h-40 overflow-hidden border-b border-white/[0.08] sm:h-48"><div className="absolute left-6 top-6 flex items-center gap-2 rounded-full border border-white/20 bg-[#152924]/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#d4e9e4] backdrop-blur-sm"><span className="size-1.5 rounded-full bg-[#a6d1c7]" />Live draft</div><div aria-hidden="true" className="preview-orbit preview-orbit-one" /><div aria-hidden="true" className="preview-orbit preview-orbit-two" /><div aria-hidden="true" className="preview-orbit preview-orbit-three" /></div>
              <div className="p-6 sm:p-8"><div className="mb-5 flex items-center justify-between gap-3"><p id="preview-title" className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8fbdb5]">Your Yawrd preview</p><span className="text-[11px] text-[#86aaa2]">01 / 01</span></div>
                {result.plan ? <><h2 className="text-[clamp(2.1rem,3vw,3.35rem)] leading-[1.08] font-medium tracking-[-0.06em] text-[#e7f2ed]">{result.plan.initializer.config.name}</h2><p className="mt-4 text-sm leading-7 text-[#a8c0b8]">{result.plan.initializer.config.purpose}</p><div className="my-7 h-px bg-white/[0.1]" /><div className="space-y-6"><div><p className="preview-label">Project address preview</p><p className="mt-2 break-all font-mono text-xs leading-6 text-[#b9d7d0]">{result.plan.daoAccountId}</p></div><div><p className="preview-label">Stewards</p><div className="mt-3 flex flex-wrap gap-2">{result.plan.initializer.policy.roles[0].kind.Group.map((account, index) => <span key={account} className="rounded-full border border-[#64938a]/35 bg-[#25413a]/60 px-3 py-1.5 text-[11px] text-[#d0e4dd]">{index === 0 ? "Creator · " : ""}{account}</span>)}</div></div><div className="rounded-xl border border-[#75a49a]/20 bg-[#244037]/55 p-4"><p className="preview-label">Approval requirement</p><p className="mt-2 text-sm leading-6 text-[#d6e7e0]"><strong className="font-semibold text-[#e6f6ef]">{result.plan.initializer.policy.default_vote_policy.threshold} of {result.plan.initializer.policy.roles[0].kind.Group.length} Stewards</strong> must approve decisions for this Yawrd.</p></div></div></> : <div className="rounded-xl border border-[#8b6f63]/40 bg-[#583a30]/20 p-5"><p className="text-sm font-medium text-[#f1d4c8]">Preview unavailable</p><p className="mt-2 text-sm leading-6 text-[#d9b9ac]">{result.error}</p><p className="mt-3 text-xs text-[#bfa197]">Update the highlighted field to see the full preview.</p></div>}
              </div>
              <div className="flex items-center gap-2 border-t border-white/[0.08] bg-[#12201d] px-6 py-4 text-xs text-[#91aca4] sm:px-8"><span className="size-1.5 rounded-full bg-[#87bcb1]" />Local preview only · No Yawrd has been opened or funded</div>
            </div>
            <div className="mt-5 rounded-2xl border border-white/[0.1] bg-[#111d1b]/80 p-5 sm:p-6"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8ebbb5]">Before opening for real</p><p className="text-xs leading-6 text-[#9eb3ac]">Opening a Yawrd later would require wallet approval and network costs. After opening, Stewards would also need to approve a Project Rules update to turn off automatic updates; these stay on until that approval is completed. This page takes no wallet action.</p></div>
          </aside>
        </div>
        <footer className="mt-14 flex flex-col gap-2 border-t border-white/[0.08] pt-6 text-xs text-[#69837c] sm:flex-row sm:items-center sm:justify-between"><span>Yawrd · A space for what you make together</span><span>Prototype for visual review</span></footer>
      </div>
    </main>
  );
}
