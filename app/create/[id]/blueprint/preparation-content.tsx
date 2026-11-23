'use client';
import type { PreparationArtifacts } from '../../../../src/creation/preparation-contract';
import ui from './preparation.module.css';

const Lines=({items}:{items:string[]})=>items.length?<ul>{items.map((s,i)=><li key={i}>{s}</li>)}</ul>:<p>None recorded.</p>;
export function PreparationReview({content:a}:{content:PreparationArtifacts}){
  return <>
    <section><h2>Project overview and Blueprint</h2><h3>{a.blueprint.title||'Project title to review'}</h3><p>{a.blueprint.summary||'Summary to review.'}</p>
      <h3>Intended outcome</h3><p>{a.blueprint.outcome||'Outcome to review.'}</p><h3>Scope</h3><Lines items={a.blueprint.scope}/><h3>Boundaries</h3><Lines items={a.blueprint.boundaries}/></section>
    <section><h2>AI Contributor Skill</h2><p>{a.skill.purpose||'Contributor guidance to review.'}</p><Lines items={a.skill.instructions}/></section>
    <section><h2>Proposed work</h2>{!a.tasks.length&&<p>No task briefs saved yet.</p>}{a.tasks.map(t=><article key={t.id}>
      <h3>{t.title||'Task title to review'}</h3><p>{t.brief}</p><h4>Deliverables</h4><Lines items={t.deliverables}/>
      <p>Depends on: {t.dependencies.map(id=>a.tasks.find(v=>v.id===id)?.title||'Unresolved task reference').join(', ')||'No other task declared'}</p>
      <p>Shared inputs: {t.sharedReferences.map(id=>a.references.find(v=>v.id===id)?.title||'Unresolved shared input').join(', ')||'None declared'}</p>
      <h4>Acceptance checks and evidence</h4>{t.acceptanceCriteria.map((c,i)=><p key={i}>{c.check}<br/><strong>Evidence:</strong> {c.evidence}</p>)}
      <p><strong>{t.rewardTerms==='unpaid'?'Explicitly unpaid · No monetary reward offered':'Reward terms undecided · No payment entitlement'}</strong></p><p>{t.rewardNote}</p>
      <h4>Unresolved task decisions</h4><Lines items={t.unresolvedDecisions}/></article>)}</section>
    <section><h2>Questions and decisions</h2><h3>Unresolved project questions</h3><Lines items={a.openQuestions}/>
      <details><summary>Recorded facts, defaults and decisions</summary>
        <h3>Reported verified facts</h3><p>Sources and verification times are supplied with this content. This workspace does not independently reverify these claims.</p>
        {a.context.verifiedFacts.map((f,i)=><p key={i}>{f.text}<br/>Source: {f.source}<br/>Verified at: {f.verifiedAt}</p>)}
        <h3>Proposed defaults</h3>{a.context.proposedDefaults.map((d,i)=><p key={i}>{d.text}<br/>Rationale: {d.rationale}</p>)}
        <h3>Founder decisions</h3><Lines items={a.context.founderDecisions}/><h3>Activation details to verify before work</h3><Lines items={a.context.activationDetails}/>
      </details></section>
    {!!a.references.length&&<section><h2>Shared interfaces and fixtures</h2>{a.references.map(r=><details key={r.id}><summary>{r.title||'Shared input to review'}</summary><pre>{r.content}</pre></details>)}</section>}
    <details><summary>Private planning notes · excluded from Skill export</summary><p>{a.privateNotes||'No private notes recorded.'}</p></details>
  </>;
}

function Text({label,value,onChange}:{label:string;value:string;onChange:(s:string)=>void}){
  return <label>{label}<textarea value={value} onChange={e=>onChange(e.target.value)} rows={2}/></label>;
}
function List({label,value,onChange}:{label:string;value:string[];onChange:(s:string[])=>void}){
  return <Text label={label+' (one item per line)'} value={value.join('\n')} onChange={s=>onChange(s===''?[]:s.split('\n'))}/>;
}
export function PreparationEditor({content:a,onChange}:{content:PreparationArtifacts;onChange:(a:PreparationArtifacts)=>void}){
  function edit(work:(next:PreparationArtifacts)=>void){const next=structuredClone(a);work(next);onChange(next);}
  return <div className={ui.editor}>
    <section><h2>Edit Blueprint</h2>{(['title','summary','outcome'] as const).map(k=><Text key={k} label={{title:'Project title',summary:'Project summary',outcome:'Intended outcome'}[k]} value={a.blueprint[k]} onChange={s=>edit(n=>{n.blueprint[k]=s;})}/>)}
      {(['scope','boundaries'] as const).map(k=><List key={k} label={k==='scope'?'Scope':'Boundaries'} value={a.blueprint[k]} onChange={s=>edit(n=>{n.blueprint[k]=s;})}/>)}</section>
    <section><h2>Edit AI Contributor Skill</h2><Text label="Skill name (lowercase words separated by hyphens)" value={a.skill.name} onChange={s=>edit(n=>{n.skill.name=s;})}/>
      <Text label="Guidance purpose" value={a.skill.purpose} onChange={s=>edit(n=>{n.skill.purpose=s;})}/><List label="Contributor instructions" value={a.skill.instructions} onChange={s=>edit(n=>{n.skill.instructions=s;})}/></section>
    <section><h2>Edit proposed work</h2>{a.tasks.map((t,i)=><article key={t.id}>
      {(['title','brief'] as const).map(k=><Text key={k} label={k==='title'?'Task title':'Task scope and brief'} value={t[k]} onChange={s=>edit(n=>{n.tasks[i][k]=s;})}/>)}
      <List label="Owned deliverables" value={t.deliverables} onChange={s=>edit(n=>{n.tasks[i].deliverables=s;})}/>
      <fieldset><legend>Depends on</legend>{a.tasks.filter(x=>x.id!==t.id).map(x=><label key={x.id}><input type="checkbox" checked={t.dependencies.includes(x.id)} onChange={e=>edit(n=>{n.tasks[i].dependencies=e.target.checked?[...t.dependencies,x.id]:t.dependencies.filter(id=>id!==x.id);})}/>{x.title||'Untitled task'}</label>)}</fieldset>
      <fieldset><legend>Shared interfaces and fixtures</legend>{a.references.map(x=><label key={x.id}><input type="checkbox" checked={t.sharedReferences.includes(x.id)} onChange={e=>edit(n=>{n.tasks[i].sharedReferences=e.target.checked?[...t.sharedReferences,x.id]:t.sharedReferences.filter(id=>id!==x.id);})}/>{x.title||'Untitled shared input'}</label>)}</fieldset>
      {t.acceptanceCriteria.map((c,j)=><div key={j}><Text label="Observable acceptance check" value={c.check} onChange={s=>edit(n=>{n.tasks[i].acceptanceCriteria[j].check=s;})}/><Text label="Required evidence" value={c.evidence} onChange={s=>edit(n=>{n.tasks[i].acceptanceCriteria[j].evidence=s;})}/>
        <button type="button" onClick={()=>edit(n=>{n.tasks[i].acceptanceCriteria.splice(j,1);})}>Remove check</button></div>)}
      <button type="button" disabled={t.acceptanceCriteria.length>=40} onClick={()=>edit(n=>{n.tasks[i].acceptanceCriteria.push({check:'',evidence:''});})}>Add acceptance check</button>
      <List label="Unresolved task decisions" value={t.unresolvedDecisions} onChange={s=>edit(n=>{n.tasks[i].unresolvedDecisions=s;})}/>
      <label>Reward terms<select value={t.rewardTerms} onChange={e=>edit(n=>{n.tasks[i].rewardTerms=e.target.value as 'undecided'|'unpaid';})}><option value="undecided">Undecided</option><option value="unpaid">Explicitly unpaid</option></select></label>
      <Text label="Reward wording to preserve" value={t.rewardNote} onChange={s=>edit(n=>{n.tasks[i].rewardNote=s;})}/>
      <button type="button" onClick={()=>edit(n=>{n.tasks.splice(i,1);})}>Remove task</button>
    </article>)}<button type="button" disabled={a.tasks.length>=40} onClick={()=>edit(n=>{let k=1;while(n.tasks.some(t=>t.id==='work-'+k))k++;n.tasks.push({id:'work-'+k,title:'',brief:'',deliverables:[],dependencies:[],sharedReferences:[],acceptanceCriteria:[],unresolvedDecisions:[],rewardTerms:'undecided',rewardNote:''});})}>Add proposed task</button></section>
    <section><h2>Edit context and decisions</h2><h3>Reported verified facts</h3>
      {a.context.verifiedFacts.map((f,i)=><article key={i}>{(['text','source','verifiedAt'] as const).map(k=><Text key={k} label={{text:'Fact',source:'Evidence source',verifiedAt:'Verification time (ISO date and time)'}[k]} value={f[k]} onChange={s=>edit(n=>{n.context.verifiedFacts[i][k]=s;})}/>)}<button type="button" onClick={()=>edit(n=>{n.context.verifiedFacts.splice(i,1);})}>Remove fact</button></article>)}
      <button type="button" disabled={a.context.verifiedFacts.length>=40} onClick={()=>edit(n=>{n.context.verifiedFacts.push({text:'',source:'',verifiedAt:''});})}>Add reported fact</button>
      <h3>Proposed defaults</h3>{a.context.proposedDefaults.map((d,i)=><article key={i}><Text label="Proposed default" value={d.text} onChange={s=>edit(n=>{n.context.proposedDefaults[i].text=s;})}/><Text label="Rationale" value={d.rationale} onChange={s=>edit(n=>{n.context.proposedDefaults[i].rationale=s;})}/><button type="button" onClick={()=>edit(n=>{n.context.proposedDefaults.splice(i,1);})}>Remove default</button></article>)}
      <button type="button" disabled={a.context.proposedDefaults.length>=40} onClick={()=>edit(n=>{n.context.proposedDefaults.push({text:'',rationale:''});})}>Add proposed default</button>
      <List label="Founder decisions" value={a.context.founderDecisions} onChange={s=>edit(n=>{n.context.founderDecisions=s;})}/><List label="Activation details to verify" value={a.context.activationDetails} onChange={s=>edit(n=>{n.context.activationDetails=s;})}/></section>
    <section><h2>Edit shared interfaces and fixtures</h2>{a.references.map((r,i)=><article key={r.id}><Text label="Shared input title" value={r.title} onChange={s=>edit(n=>{n.references[i].title=s;})}/>
      <label>Input kind<select value={r.kind} onChange={e=>edit(n=>{n.references[i].kind=e.target.value as typeof r.kind;})}><option value="interface">Interface</option><option value="fixture">Fixture</option><option value="reference">Reference</option></select></label>
      <Text label="Complete shared input content (include required examples or fixtures here)" value={r.content} onChange={s=>edit(n=>{n.references[i].content=s;})}/><button type="button" onClick={()=>edit(n=>{n.references.splice(i,1);})}>Remove shared input</button></article>)}
      <button type="button" disabled={a.references.length>=40} onClick={()=>edit(n=>{let k=1;while(n.references.some(r=>r.id==='input-'+k))k++;n.references.push({id:'input-'+k,title:'',kind:'reference',content:''});})}>Add shared input</button></section>
    <section><h2>Unresolved questions and private notes</h2><List label="Unresolved project questions" value={a.openQuestions} onChange={s=>edit(n=>{n.openQuestions=s;})}/><Text label="Private planning notes (excluded from Skill export)" value={a.privateNotes} onChange={s=>edit(n=>{n.privateNotes=s;})}/></section>
  </div>;
}
