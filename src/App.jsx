import { useState, useRef, useCallback, useEffect } from "react";
import { fetchCandidates, fetchJobs, upsertCandidate, upsertJob, updateCandidateStage, updateJobStatus, addCandidateNote, addJobNote as addJobNoteDB, submitCandidateToJob, removeCandidateFromJob, subscribeToChanges, signIn, signOut, getSession } from "./lib/supabase";

const TEAM = [
  { id: "andrew",  name: "Andrew Silva",    initials: "AS", color: "#3b82f6", role: "Senior Recruiter" },
  { id: "sarah",   name: "Sarah Kim",       initials: "SK", color: "#a855f7", role: "Recruiter" },
  { id: "mike",    name: "Mike Rodriguez",  initials: "MR", color: "#10b981", role: "Recruiter" },
  { id: "jessica", name: "Jessica Okafor",  initials: "JO", color: "#f59e0b", role: "Recruiter" },
  { id: "david",   name: "David Chen",      initials: "DC", color: "#ef4444", role: "Sourcing Specialist" },
  { id: "priya",   name: "Priya Patel",     initials: "PP", color: "#06b6d4", role: "Recruiter" },
  { id: "enoch",   name: "Enoch Washington",initials: "EW", color: "#f97316", role: "CEO / Managing Director" },
];
const ACTIVE_USER = TEAM[0];

const STAGES = ["Sourced","Submitted","Client Review","Interview 1","Interview 2","Final Interview","Offer","Placed","On Hold","Rejected"];
const SM = {
  "Sourced":         {c:"#38bdf8",bg:"#06161f",b:"#38bdf818"},
  "Submitted":       {c:"#818cf8",bg:"#0e0f20",b:"#818cf818"},
  "Client Review":   {c:"#a78bfa",bg:"#110c20",b:"#a78bfa18"},
  "Interview 1":     {c:"#f472b6",bg:"#1f0813",b:"#f472b618"},
  "Interview 2":     {c:"#fb7185",bg:"#1f0a0c",b:"#fb718518"},
  "Final Interview": {c:"#f97316",bg:"#1a0d04",b:"#f9731618"},
  "Offer":           {c:"#facc15",bg:"#191500",b:"#facc1518"},
  "Placed":          {c:"#4ade80",bg:"#041a0e",b:"#4ade8018"},
  "On Hold":         {c:"#94a3b8",bg:"#0d1117",b:"#94a3b818"},
  "Rejected":        {c:"#f87171",bg:"#1a0606",b:"#f8717118"},
};
const JOB_STATUSES = ["Open – Sourcing","Active","Hold","On Hold","Filled","Closed"];
const JSM = {
  "Open – Sourcing":{c:"#4ade80",bg:"#041a0e"},
  "Active":         {c:"#38bdf8",bg:"#06161f"},
  "Hold":           {c:"#facc15",bg:"#191500"},
  "On Hold":        {c:"#94a3b8",bg:"#0d1117"},
  "Filled":         {c:"#fb923c",bg:"#1a0d04"},
  "Closed":         {c:"#f87171",bg:"#1a0606"},
};
const VERTICALS = ["Telecom / Wireless","AI / ML / Data","Cybersecurity","Software Engineering","Cloud / DevOps","Sales & Business Development","Directors & VPs","SVPs & C-Suite","Client Partners","Project / Program Mgmt","Network Engineering","Consulting"];
const SENIORITY = ["Individual Contributor","Senior IC","Team Lead","Manager","Director","VP","SVP","C-Suite / Partner"];
const WORK_AUTH = ["US Citizen","Green Card","H-1B","H-4 EAD","L-1","TN Visa","OPT/CPT","EAD","EU Passport","EU Blue Card","Residence Permit","Requires Sponsorship","Other"];
const SOURCES = ["LinkedIn Sales Nav","Dice","Indeed","Referral","Inbound","ZipRecruiter","Direct Outreach","Career Fair","Other"];
const SKILLS_POOL = ["Python","Snowflake","dbt","AWS","Azure","GCP","Machine Learning","LLM/GenAI","OSCP","CISSP","CEH","Penetration Testing","AppSec","ServiceNow","SAM Pro","ITIL","React","Java","Kubernetes","Terraform","SQL","Spark","Salesforce","Power Platform","Dynamics 365","SIEM","Splunk","Zero Trust","5G","RF Engineering","Program Management","Supply Chain","MedTech"];
const EMP_TYPES = ["Full-Time","Contract","Contract-to-Hire","Part-Time"];

const today = () => new Date().toISOString().split("T")[0];
const ini = n => (n||"?").split(" ").map(x=>x[0]).join("").substring(0,2).toUpperCase();
const aHue = name => [...(name||"A")].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
const getTeamMember = id => TEAM.find(t=>t.id===id);
const weekStart = () => { const d=new Date(); d.setDate(d.getDate()-d.getDay()); return d.toISOString().split("T")[0]; };
const weekEnd = () => { const d=new Date(); d.setDate(d.getDate()+(6-d.getDay())); return d.toISOString().split("T")[0]; };

function exportCSV(cands, jobs) {
  const ch=["Name","Email","Phone","Title","Seniority","Vertical","Stage","Work Auth","Salary","Location","Experience","Source","Owner","Collaborators","Skills","Notes","Added","Updated"];
  const cr=cands.map(c=>[c.name,c.email,c.phone,c.title,c.seniority,c.vertical,c.stage,c.workAuth,c.salary,c.location,c.experience,c.source,getTeamMember(c.ownerId)?.name||c.ownerId,(c.collaborators||[]).map(id=>getTeamMember(id)?.name||id).join("; "),(c.skills||[]).join("; "),(c.notes||[]).map(n=>`[${n.author}] ${n.text}`).join(" | "),c.addedDate,c.lastUpdated]);
  const jh=["Title","Client","SPOC","Location","Type","Salary","Priority","Status","Req Date","Assigned Recruiters","Submitted","Candidates"];
  const jr=jobs.map(j=>[j.title,j.client,j.spoc,j.location,j.empType,j.salary,j.priority,j.status,j.reqDate,(j.assignedRecruiters||[]).map(id=>getTeamMember(id)?.name||id).join("; "),j.submitted,(j.submittedCandidates||[]).map(id=>cands.find(c=>c.id===id)?.name||id).join("; ")]);
  const esc=v=>`"${String(v||"").replace(/"/g,'""')}"`;
  const s1=[ch,...cr].map(r=>r.map(esc).join(",")).join("\n");
  const s2=[jh,...jr].map(r=>r.map(esc).join(",")).join("\n");
  const blob=new Blob([`HCP ONE CANDIDATES\n${s1}\n\n\nHCP ONE JOB ORDERS\n${s2}`],{type:"text/csv"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`HCP_Recruit_${today()}.csv`;a.click();
}

function detectDupes(candidates, email, phone, excludeId=null) {
  return candidates.filter(c => {
    if(c.id===excludeId) return false;
    const em=email&&c.email?.toLowerCase().trim()===email.toLowerCase().trim()&&email.trim().length>3;
    const ph=phone&&c.phone?.replace(/\D/g,"")===phone.replace(/\D/g,"")&&phone.replace(/\D/g,"").length>=10;
    return em||ph;
  });
}

function generateWeeklyReport(cands, jobs, filterRecruiter="all") {
  const ws=weekStart(); const we=weekEnd();
  const fc = filterRecruiter==="all" ? cands : cands.filter(c=>c.ownerId===filterRecruiter||(c.collaborators||[]).includes(filterRecruiter));
  const fj = filterRecruiter==="all" ? jobs : jobs.filter(j=>(j.assignedRecruiters||[]).includes(filterRecruiter));
  const active=fc.filter(c=>!["Placed","Rejected"].includes(c.stage));
  const byStage={};
  STAGES.forEach(s=>{ byStage[s]=fc.filter(c=>c.stage===s); });
  const byClient={};
  jobs.forEach(j=>{ if(!byClient[j.client]) byClient[j.client]=[];});
  fc.forEach(c=>{ c.submittedTo?.forEach(jid=>{ const j=jobs.find(x=>x.id===jid); if(j){if(!byClient[j.client])byClient[j.client]=[];if(!byClient[j.client].find(x=>x.id===c.id))byClient[j.client].push(c);}});});
  const byRecruiter={};
  TEAM.forEach(t=>{
    const owned=cands.filter(c=>c.ownerId===t.id);
    const collab=cands.filter(c=>(c.collaborators||[]).includes(t.id));
    byRecruiter[t.id]={name:t.name,color:t.color,owned:owned.length,active:owned.filter(c=>!["Placed","Rejected"].includes(c.stage)).length,offers:owned.filter(c=>c.stage==="Offer").length,placed:owned.filter(c=>c.stage==="Placed").length,interviews:owned.filter(c=>["Interview 1","Interview 2","Final Interview"].includes(c.stage)).length,collab:collab.length,jobs:jobs.filter(j=>(j.assignedRecruiters||[]).includes(t.id)).length};
  });
  const openJobs=fj.filter(j=>["Open – Sourcing","Active"].includes(j.status));
  const hotCands=fc.filter(c=>["Interview 1","Interview 2","Final Interview","Offer"].includes(c.stage));
  return { ws, we, active, byStage, byClient, byRecruiter, openJobs, hotCands, total:fc.length, placed:fc.filter(c=>c.stage==="Placed").length };
}

function Pill({label,color,bg}){
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,background:bg||"#0d1526",color:color||"#60a5fa",border:`1px solid ${color||"#60a5fa"}18`,borderRadius:20,padding:"3px 9px",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>
    <span style={{width:5,height:5,borderRadius:"50%",background:color||"#60a5fa",flexShrink:0}}/>{label}
  </span>;
}
function StagePill({stage}){const m=SM[stage]||SM.Sourced;return <Pill label={stage} color={m.c} bg={m.bg}/>;}
function JobPill({status}){const m=JSM[status]||JSM["Open – Sourcing"];return <Pill label={status} color={m.c} bg={m.bg}/>;}

function RecruiterBadge({id,size=22,showName=false}){
  const t=getTeamMember(id);if(!t)return null;
  return <div style={{display:"inline-flex",alignItems:"center",gap:5}} title={t.name}>
    <div style={{width:size,height:size,borderRadius:size*.28,background:t.color+"22",border:`1px solid ${t.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.4,fontWeight:800,color:t.color,flexShrink:0,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{t.initials}</div>
    {showName&&<span style={{fontSize:11,color:"#4a6080",fontWeight:600}}>{t.name}</span>}
  </div>;
}

function RecruiterStack({ids=[],size=20}){
  return <div style={{display:"flex",alignItems:"center"}}>
    {ids.slice(0,4).map((id,i)=><div key={id} style={{marginLeft:i>0?-6:0,zIndex:10-i,position:"relative"}}><RecruiterBadge id={id} size={size}/></div>)}
    {ids.length>4&&<span style={{marginLeft:4,fontSize:9,color:"#2a4060"}}>+{ids.length-4}</span>}
  </div>;
}

function Avatar({name,size=34}){
  const h=aHue(name);
  return <div style={{width:size,height:size,borderRadius:Math.round(size*.28),background:`hsl(${h},38%,17%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.35,fontWeight:900,color:`hsl(${h},70%,62%)`,flexShrink:0,fontFamily:"'Cabinet Grotesk',sans-serif",letterSpacing:-0.5}}>{ini(name)}</div>;
}

function Stat({label,value,accent}){
  return <div style={{flex:1,minWidth:110,background:"#070c18",border:"1px solid #111d2e",borderRadius:12,padding:"15px 18px",position:"relative",overflow:"hidden"}}>
    <div style={{position:"absolute",top:-6,right:-6,width:48,height:48,borderRadius:"50%",background:`${accent}12`,filter:"blur(12px)",pointerEvents:"none"}}/>
    <div style={{fontSize:26,fontWeight:900,color:accent,fontFamily:"'Cabinet Grotesk',sans-serif",lineHeight:1}}>{value}</div>
    <div style={{fontSize:10,color:"#1a2a3a",marginTop:4,fontWeight:500}}>{label}</div>
  </div>;
}

const inp={width:"100%",background:"#070c18",border:"1px solid #162030",borderRadius:8,padding:"8px 12px",color:"#b8cce0",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
const sel={...inp,cursor:"pointer"};
const ta={...inp,resize:"vertical",minHeight:72,lineHeight:1.5};

function F({label,span2,children}){
  return <div style={{gridColumn:span2?"span 2":"span 1",marginBottom:2}}>
    <label style={{display:"block",color:"#243040",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>{label}</label>
    {children}
  </div>;
}

function Modal({title,onClose,wide,xl,children}){
  return <div style={{position:"fixed",inset:0,background:"rgba(0,3,10,0.92)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:14,backdropFilter:"blur(8px)"}} onClick={onClose}>
    <div style={{background:"#070c18",border:"1px solid #111d2e",borderRadius:16,width:"100%",maxWidth:xl?1060:wide?860:700,maxHeight:"94vh",overflowY:"auto",padding:"22px 24px",boxShadow:"0 40px 100px rgba(0,0,0,0.9)"}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <h2 style={{margin:0,color:"#d0e0f8",fontSize:16,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,letterSpacing:-0.3}}>{title}</h2>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#243040",fontSize:19,cursor:"pointer",padding:"2px 6px",lineHeight:1}}>✕</button>
      </div>
      {children}
    </div>
  </div>;
}

function WeeklyReport({cands,jobs}){
  const [filterR,setFilterR]=useState("all");
  const r=generateWeeklyReport(cands,jobs,filterR);
  const printReport=()=>{
    const w=window.open("","_blank");
    const rows=Object.entries(r.byRecruiter).map(([,d])=>`<tr><td>${d.name}</td><td>${d.owned}</td><td>${d.active}</td><td>${d.interviews}</td><td>${d.offers}</td><td>${d.placed}</td><td>${d.collab}</td><td>${d.jobs}</td></tr>`).join("");
    const hotRows=r.hotCands.map(c=>{const owner=getTeamMember(c.ownerId);return `<tr><td>${c.name}</td><td>${c.title}</td><td>${c.stage}</td><td>${c.salary||"—"}</td><td>${owner?.name||"—"}</td></tr>`;}).join("");
    const jobRows=r.openJobs.map(j=>`<tr><td>${j.title}</td><td>${j.client}</td><td>${j.salary||"—"}</td><td>${j.status}</td><td>${(j.submittedCandidates||[]).length}</td></tr>`).join("");
    const clientRows=Object.entries(r.byClient).filter(([,c])=>c.length>0).map(([client,cs])=>`<tr><td><b>${client}</b></td><td>${cs.length}</td><td>${cs.filter(c=>["Interview 1","Interview 2","Final Interview"].includes(c.stage)).length}</td><td>${cs.filter(c=>c.stage==="Offer").length}</td><td>${cs.filter(c=>c.stage==="Placed").length}</td></tr>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>HCP One Weekly Report</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#1a1a1a;max-width:900px;margin:0 auto}h1{color:#1c4fc4;border-bottom:3px solid #1c4fc4;padding-bottom:8px}h2{color:#1c4fc4;margin-top:28px;font-size:15px;text-transform:uppercase;letter-spacing:1px}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#1c4fc4;color:white;padding:8px 10px;text-align:left;font-size:12px}td{padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.card{background:#f0f4ff;border-radius:8px;padding:14px;text-align:center}.num{font-size:24px;font-weight:900;color:#1c4fc4}.lbl{font-size:11px;color:#666;margin-top:2px}@media print{button{display:none}}</style></head><body>
    <h1>⚡ HCP One Weekly Activity Report</h1>
    <p style="color:#666;margin-top:-8px">Week of ${r.ws} – ${r.we} · Generated ${today()} · ${filterR==="all"?"All Recruiters":getTeamMember(filterR)?.name}</p>
    <div class="summary"><div class="card"><div class="num">${r.total}</div><div class="lbl">Total Candidates</div></div><div class="card"><div class="num">${r.active.length}</div><div class="lbl">Active Pipeline</div></div><div class="card"><div class="num">${r.hotCands.length}</div><div class="lbl">Interview / Offer</div></div><div class="card"><div class="num">${r.openJobs.length}</div><div class="lbl">Open Job Orders</div></div></div>
    <h2>Pipeline by Stage</h2><table><tr>${STAGES.map(s=>`<th>${s}</th>`).join("")}</tr><tr>${STAGES.map(s=>`<td>${r.byStage[s]?.length||0}</td>`).join("")}</tr></table>
    <h2>Client Activity</h2><table><tr><th>Client</th><th>Candidates</th><th>In Interview</th><th>Offers</th><th>Placed</th></tr>${clientRows}</table>
    <h2>Hot Candidates</h2><table><tr><th>Candidate</th><th>Title</th><th>Stage</th><th>Rate</th><th>Owner</th></tr>${hotRows}</table>
    <h2>Open Job Orders</h2><table><tr><th>Role</th><th>Client</th><th>Pay</th><th>Status</th><th>Submitted</th></tr>${jobRows}</table>
    <h2>Recruiter Performance</h2><table><tr><th>Recruiter</th><th>Owned</th><th>Active</th><th>Interviews</th><th>Offers</th><th>Placed</th><th>Collab</th><th>Jobs</th></tr>${rows}</table>
    </body></html>`);
    w.document.close();w.focus();setTimeout(()=>w.print(),400);
  };
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <span style={{color:"#2a4060",fontSize:11,fontWeight:600}}>Filter:</span>
        <select style={{...sel,width:180,fontSize:11}} value={filterR} onChange={e=>setFilterR(e.target.value)}>
          <option value="all">All Recruiters</option>
          {TEAM.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span style={{color:"#1a2a3a",fontSize:11}}>Week: {r.ws} – {r.we}</span>
      </div>
      <button onClick={printReport} style={{background:"linear-gradient(135deg,#1c4fc4,#0d3598)",color:"white",border:"none",borderRadius:8,padding:"8px 18px",fontSize:12,fontWeight:800,cursor:"pointer"}}>🖨 Print / Export PDF</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
      {[[r.total,"Total Candidates","#60a5fa"],[r.active.length,"Active Pipeline","#a78bfa"],[r.hotCands.length,"Interview / Offer","#f472b6"],[r.openJobs.length,"Open Roles","#4ade80"]].map(([v,l,c])=>(
        <div key={l} style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:10,padding:"14px 16px",textAlign:"center"}}>
          <div style={{fontSize:28,fontWeight:900,color:c,fontFamily:"'Cabinet Grotesk',sans-serif",lineHeight:1}}>{v}</div>
          <div style={{fontSize:10,color:"#1a2a3a",marginTop:4}}>{l}</div>
        </div>
      ))}
    </div>
    <div style={{marginBottom:20}}>
      <div style={{color:"#2a4060",fontSize:10,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:10}}>Pipeline by Stage</div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {STAGES.map(s=>{const cnt=r.byStage[s]?.length||0;const m=SM[s];return <div key={s} style={{flex:1,minWidth:70,background:cnt>0?m.bg:"#050a14",border:`1px solid ${cnt>0?m.c+"30":"#111d2e"}`,borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:900,color:cnt>0?m.c:"#1a2a3a",fontFamily:"'Cabinet Grotesk',sans-serif"}}>{cnt}</div>
          <div style={{fontSize:8.5,color:cnt>0?m.c+"99":"#1a2a3a",marginTop:3,lineHeight:1.2}}>{s}</div>
        </div>;})}
      </div>
    </div>
    {r.hotCands.length>0&&<div style={{marginBottom:20}}>
      <div style={{color:"#2a4060",fontSize:10,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:10}}>🔥 Hot Candidates</div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {r.hotCands.map(c=>{const owner=getTeamMember(c.ownerId);return <div key={c.id} style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:8,padding:"10px 13px",display:"flex",alignItems:"center",gap:10}}>
          <Avatar name={c.name} size={30}/>
          <div style={{flex:1}}><div style={{color:"#c8daf0",fontSize:12,fontWeight:700}}>{c.name}</div><div style={{color:"#2a4060",fontSize:10,marginTop:1}}>{c.title}</div></div>
          <StagePill stage={c.stage}/>
          <span style={{color:"#4ade80",fontSize:11,fontWeight:700,minWidth:80,textAlign:"right"}}>{c.salary||"—"}</span>
          {owner&&<RecruiterBadge id={c.ownerId} size={22}/>}
        </div>;})}
      </div>
    </div>}
    <div>
      <div style={{color:"#2a4060",fontSize:10,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:10}}>Team Performance</div>
      <div style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:9,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:"#070c18"}}>{["Recruiter","Owned","Active","Interviews","Offers","Placed","Collab","Jobs"].map(h=><th key={h} style={{padding:"9px 12px",textAlign:"left",color:"#1a2a3a",fontSize:9,fontWeight:700,letterSpacing:0.7,textTransform:"uppercase",borderBottom:"1px solid #0d1a28"}}>{h}</th>)}</tr></thead>
          <tbody>{Object.entries(r.byRecruiter).map(([id,d])=>{const t=getTeamMember(id);return <tr key={id} style={{borderBottom:"1px solid #070c18"}}>
            <td style={{padding:"10px 12px"}}><div style={{display:"flex",alignItems:"center",gap:8}}><RecruiterBadge id={id} size={24}/><div><div style={{color:"#b8cce0",fontSize:12,fontWeight:700}}>{d.name}</div><div style={{color:"#1a2a3a",fontSize:9}}>{t?.role}</div></div></div></td>
            {[d.owned,d.active,d.interviews,d.offers,d.placed,d.collab,d.jobs].map((v,i)=><td key={i} style={{padding:"10px 12px",color:v>0?"#b8cce0":"#1a2a3a",fontSize:13,fontWeight:v>0?700:400}}>{v}</td>)}
          </tr>;})}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

function CandForm({initial,allCandidates,onSave,onClose}){
  const E={name:"",email:"",phone:"",linkedin:"",title:"",seniority:"",vertical:"",stage:"Sourced",skills:[],salary:"",location:"",workAuth:"",experience:"",source:"",ownerId:ACTIVE_USER.id,collaborators:[],notes:[]};
  const [f,setF]=useState(initial||E);
  const [si,setSi]=useState("");
  const [parsing,setParsing]=useState(false);
  const [pMsg,setPMsg]=useState(null);
  const [dupes,setDupes]=useState([]);
  const [dupeOk,setDupeOk]=useState(false);
  const fr=useRef();
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const chkDupe=(em,ph)=>{if(dupeOk)return;setDupes(detectDupes(allCandidates,em,ph,f.id));};
  const addSkill=(sk)=>{const t=(sk||si).trim();if(t&&!f.skills.includes(t))s("skills",[...f.skills,t]);setSi("");};
  const toggleCollab=(id)=>{const cur=f.collaborators||[];if(cur.includes(id)){s("collaborators",cur.filter(x=>x!==id));}else{if(cur.length>=2)return;s("collaborators",[...cur,id]);}};
  const handleFile=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    setParsing(true);setPMsg("Reading resume…");
    try{
      const text=await file.text().catch(()=>null);
      setPMsg("AI extracting details…");
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:900,messages:[{role:"user",content:`Extract candidate info. Return ONLY valid JSON: name, email, phone, title, seniority, experience, salary, location, workAuth, skills (array max 8), vertical. Resume:\n\n${text?text.substring(0,3500):"Unreadable."}`}]})});
      const data=await res.json();
      const parsed=JSON.parse((data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim());
      setF(p=>({...p,...Object.fromEntries(Object.entries(parsed).filter(([,v])=>v&&(Array.isArray(v)?v.length:true)))}));
      setPMsg("✓ Parsed! Review fields.");
    }catch{setPMsg("⚠ Parse failed. Fill manually.");}
    setParsing(false);
  };
  const submit=()=>{
    if(!f.name.trim()||!f.email.trim()) return alert("Name + email required.");
    if(dupes.length&&!dupeOk) return alert("Review duplicate warning first.");
    onSave({...f,id:f.id||Date.now(),addedDate:f.addedDate||today(),lastUpdated:today(),submittedTo:f.submittedTo||[]});
  };
  return <div>
    {dupes.length>0&&!dupeOk&&<div style={{background:"#1a0d04",border:"1px solid #fb923c30",borderRadius:9,padding:"10px 13px",marginBottom:14}}>
      <div style={{color:"#fb923c",fontWeight:700,fontSize:11,marginBottom:5}}>⚠ Possible Duplicate</div>
      {dupes.map(d=><div key={d.id} style={{color:"#7a8898",fontSize:11,marginBottom:2}}>→ <b style={{color:"#b8cce0"}}>{d.name}</b> · {d.email} · <StagePill stage={d.stage}/></div>)}
      <button onClick={()=>setDupeOk(true)} style={{marginTop:7,background:"transparent",border:"1px solid #fb923c30",color:"#fb923c",borderRadius:5,padding:"3px 11px",fontSize:10,cursor:"pointer",fontWeight:700}}>Dismiss & Continue</button>
    </div>}
    <div onClick={()=>!parsing&&fr.current?.click()} style={{background:"#050a14",border:"2px dashed #162030",borderRadius:10,padding:"14px",textAlign:"center",marginBottom:16,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#1c4fc4"} onMouseLeave={e=>e.currentTarget.style.borderColor="#162030"}>
      <input ref={fr} type="file" accept=".pdf,.doc,.docx,.txt" style={{display:"none"}} onChange={handleFile}/>
      <div style={{fontSize:18,marginBottom:2}}>{parsing?"⏳":"📄"}</div>
      <div style={{color:"#2a4060",fontSize:12,fontWeight:600}}>{parsing?"Parsing…":"Upload Resume — AI Auto-Fill"}</div>
      {pMsg&&<div style={{marginTop:5,fontSize:11,fontWeight:700,color:pMsg.startsWith("✓")?"#4ade80":pMsg.startsWith("⚠")?"#fb923c":"#60a5fa"}}>{pMsg}</div>}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 15px"}}>
      <F label="Full Name *"><input style={inp} value={f.name} onChange={e=>s("name",e.target.value)} placeholder="Full name"/></F>
      <F label="Email *"><input style={inp} value={f.email} onChange={e=>{s("email",e.target.value);chkDupe(e.target.value,f.phone);}} placeholder="email@domain.com"/></F>
      <F label="Phone"><input style={inp} value={f.phone} onChange={e=>{s("phone",e.target.value);chkDupe(f.email,e.target.value);}} placeholder="555-000-0000"/></F>
      <F label="LinkedIn"><input style={inp} value={f.linkedin} onChange={e=>s("linkedin",e.target.value)} placeholder="linkedin.com/in/…"/></F>
      <F label="Title"><input style={inp} value={f.title} onChange={e=>s("title",e.target.value)} placeholder="Senior RF Engineer"/></F>
      <F label="Seniority"><select style={sel} value={f.seniority} onChange={e=>s("seniority",e.target.value)}><option value="">Select…</option>{SENIORITY.map(x=><option key={x}>{x}</option>)}</select></F>
      <F label="Work Authorization"><select style={sel} value={f.workAuth} onChange={e=>s("workAuth",e.target.value)}><option value="">Select…</option>{WORK_AUTH.map(x=><option key={x}>{x}</option>)}</select></F>
      <F label="Industry Vertical"><select style={sel} value={f.vertical} onChange={e=>s("vertical",e.target.value)}><option value="">Select…</option>{VERTICALS.map(x=><option key={x}>{x}</option>)}</select></F>
      <F label="Pipeline Stage"><select style={sel} value={f.stage} onChange={e=>s("stage",e.target.value)}>{STAGES.map(x=><option key={x}>{x}</option>)}</select></F>
      <F label="Location"><input style={inp} value={f.location} onChange={e=>s("location",e.target.value)} placeholder="City, State"/></F>
      <F label="Salary / Rate"><input style={inp} value={f.salary} onChange={e=>s("salary",e.target.value)} placeholder="$85/Hr C2C or $145K"/></F>
      <F label="Experience"><input style={inp} value={f.experience} onChange={e=>s("experience",e.target.value)} placeholder="8 years"/></F>
    </div>
    <div style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:9,padding:"13px 15px",marginBottom:14,marginTop:6}}>
      <div style={{color:"#243040",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:10}}>Recruiter Assignment</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 15px"}}>
        <div>
          <label style={{display:"block",color:"#2a4060",fontSize:10,fontWeight:600,marginBottom:6}}>Primary Owner</label>
          <select style={sel} value={f.ownerId} onChange={e=>s("ownerId",e.target.value)}>
            {TEAM.map(t=><option key={t.id} value={t.id}>{t.name} — {t.role}</option>)}
          </select>
        </div>
        <div>
          <label style={{display:"block",color:"#2a4060",fontSize:10,fontWeight:600,marginBottom:6}}>Collaborators <span style={{color:(f.collaborators||[]).length>=2?"#f472b6":"#1a2a3a",fontWeight:700}}>({(f.collaborators||[]).length}/2 max)</span></label>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {TEAM.filter(t=>t.id!==f.ownerId).map(t=>{
              const active=(f.collaborators||[]).includes(t.id);
              const atMax=(f.collaborators||[]).length>=2&&!active;
              return <div key={t.id} onClick={()=>!atMax&&toggleCollab(t.id)} style={{display:"flex",alignItems:"center",gap:5,background:active?t.color+"18":"#070c18",border:`1px solid ${active?t.color+"50":atMax?"#0d1526":"#162030"}`,borderRadius:6,padding:"4px 9px",cursor:atMax?"not-allowed":"pointer",opacity:atMax?0.35:1,transition:"all 0.15s"}}>
                <div style={{width:16,height:16,borderRadius:4,background:t.color+"22",border:`1px solid ${t.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8.5,fontWeight:800,color:t.color}}>{t.initials}</div>
                <span style={{fontSize:10,color:active?t.color:"#243040",fontWeight:active?700:400}}>{t.name.split(" ")[0]}</span>
                {active&&<span style={{color:t.color,fontSize:10,lineHeight:1,marginLeft:1}}>✓</span>}
              </div>;
            })}
          </div>
          {(f.collaborators||[]).length>=2&&<div style={{marginTop:5,color:"#f472b630",fontSize:9,fontWeight:600}}>Max 2 collaborators reached</div>}
        </div>
      </div>
    </div>
    <div style={{marginBottom:14}}>
      <label style={{display:"block",color:"#243040",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Skills</label>
      <div style={{display:"flex",gap:7,marginBottom:7}}>
        <input style={{...inp,flex:1}} value={si} onChange={e=>setSi(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),addSkill())} placeholder="Type + Enter…"/>
        <select style={{...sel,width:155}} onChange={e=>{if(e.target.value)addSkill(e.target.value);e.target.value=""}}><option value="">Quick-add…</option>{SKILLS_POOL.filter(x=>!f.skills.includes(x)).map(x=><option key={x}>{x}</option>)}</select>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,minHeight:22}}>
        {f.skills.map(x=><span key={x} style={{background:"#0c1b2e",color:"#4a8ac4",borderRadius:5,padding:"3px 8px",fontSize:11,display:"inline-flex",alignItems:"center",gap:4}}>{x}<span onClick={()=>s("skills",f.skills.filter(k=>k!==x))} style={{cursor:"pointer",color:"#243040",fontSize:12,lineHeight:1}}>×</span></span>)}
        {!f.skills.length&&<span style={{color:"#162030",fontSize:11}}>No skills</span>}
      </div>
    </div>
    <div style={{display:"flex",gap:9}}>
      <button onClick={submit} style={{flex:1,background:"linear-gradient(135deg,#1c4fc4,#0d3598)",color:"white",border:"none",borderRadius:8,padding:"11px",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif"}}>{initial?.id?"Save Changes":"Add to Database"}</button>
      <button onClick={onClose} style={{background:"#070c18",color:"#243040",border:"1px solid #162030",borderRadius:8,padding:"11px 18px",fontSize:12,cursor:"pointer"}}>Cancel</button>
    </div>
  </div>;
}

function CandDetail({c,jobs,onEdit,onStageChange,onAddNote,onSubmitToJob}){
  const [note,setNote]=useState("");
  const progress=STAGES.filter(s=>!["On Hold","Rejected"].includes(s));
  const si=STAGES.indexOf(c.stage);
  const assigned=jobs.filter(j=>j.submittedCandidates?.includes(c.id));
  const owner=getTeamMember(c.ownerId);
  const collabs=(c.collaborators||[]).map(getTeamMember).filter(Boolean);
  const post=()=>{if(!note.trim())return;onAddNote(c.id,note.trim());setNote("");};
  return <div>
    <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:18}}>
      <Avatar name={c.name} size={50}/>
      <div style={{flex:1}}>
        <div style={{fontSize:19,fontWeight:900,color:"#d0e0f8",fontFamily:"'Cabinet Grotesk',sans-serif",letterSpacing:-0.3}}>{c.name}</div>
        <div style={{color:"#2a4060",fontSize:12,marginTop:1}}>{c.title}{c.seniority?` · ${c.seniority}`:""}</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:7}}>
          <StagePill stage={c.stage}/>
          {c.workAuth&&<Pill label={c.workAuth} color="#4ade80" bg="#041a0e"/>}
          {c.vertical&&<Pill label={c.vertical} color="#a78bfa" bg="#110c20"/>}
        </div>
      </div>
      <button onClick={onEdit} style={{background:"#1c4fc4",color:"white",border:"none",borderRadius:7,padding:"7px 13px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>✏ Edit</button>
    </div>
    <div style={{background:owner?owner.color+"0d":"#050a14",border:`1px solid ${owner?owner.color+"35":"#111d2e"}`,borderRadius:10,padding:"14px 16px",marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {owner?<>
            <div style={{width:38,height:38,borderRadius:10,background:owner.color+"25",border:`2px solid ${owner.color}60`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,color:owner.color,fontFamily:"'Cabinet Grotesk',sans-serif",flexShrink:0}}>{owner.initials}</div>
            <div>
              <div style={{color:"#162030",fontSize:9,fontWeight:700,letterSpacing:0.9,textTransform:"uppercase",marginBottom:2}}>Candidate Owner</div>
              <div style={{color:owner.color,fontSize:14,fontWeight:800,fontFamily:"'Cabinet Grotesk',sans-serif",letterSpacing:-0.2}}>{owner.name}</div>
              <div style={{color:"#2a4060",fontSize:10,marginTop:1}}>{owner.role}</div>
            </div>
          </>:<span style={{color:"#1a2a3a",fontSize:12}}>No owner assigned</span>}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}>
          <div style={{color:"#162030",fontSize:9,fontWeight:700,letterSpacing:0.9,textTransform:"uppercase"}}>Collaborators ({collabs.length}/2)</div>
          {collabs.length>0?<div style={{display:"flex",gap:7}}>
            {collabs.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:6,background:t.color+"15",border:`1px solid ${t.color}40`,borderRadius:8,padding:"6px 10px"}}>
              <div style={{width:24,height:24,borderRadius:6,background:t.color+"25",border:`1px solid ${t.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:t.color,flexShrink:0}}>{t.initials}</div>
              <div><div style={{color:t.color,fontSize:11,fontWeight:700}}>{t.name}</div><div style={{color:"#1a2a3a",fontSize:9}}>{t.role}</div></div>
            </div>)}
          </div>:<span style={{color:"#1a2a3a",fontSize:11}}>No collaborators</span>}
        </div>
      </div>
    </div>
    <div style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:10,padding:"11px 13px",marginBottom:16}}>
      <div style={{color:"#1a2a3a",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Pipeline — click to move</div>
      <div style={{display:"flex",gap:0}}>
        {progress.map(st=>{const idx=STAGES.indexOf(st);const done=idx<si&&!["On Hold","Rejected"].includes(c.stage);const cur=st===c.stage;const m=SM[st];
          return <div key={st} onClick={()=>onStageChange(c.id,st)} style={{flex:1,cursor:"pointer",textAlign:"center",padding:"0 1px"}}>
            <div style={{height:3,borderRadius:2,background:done||cur?m.c:"#111d2e",marginBottom:3,transition:"background 0.2s"}}/>
            <div style={{fontSize:7.5,color:cur?m.c:done?"#243040":"#162030",fontWeight:cur?800:500,lineHeight:1.2}}>{st}</div>
          </div>;
        })}
      </div>
      {["On Hold","Rejected"].includes(c.stage)&&<div style={{marginTop:7,display:"flex",gap:5}}>
        {["On Hold","Rejected"].map(st=><span key={st} onClick={()=>onStageChange(c.id,st)} style={{cursor:"pointer",background:c.stage===st?SM[st].bg:"transparent",color:SM[st].c,border:`1px solid ${SM[st].c}25`,borderRadius:5,padding:"3px 10px",fontSize:10,fontWeight:700}}>{st}{c.stage===st?" ←":""}</span>)}
      </div>}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:14}}>
      {[["Email",c.email],["Phone",c.phone],["Location",c.location],["Salary/Rate",c.salary],["Experience",c.experience],["Source",c.source],["Work Auth",c.workAuth],["Seniority",c.seniority],["Added",c.addedDate]].map(([k,v])=>(
        <div key={k} style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:7,padding:"8px 10px"}}>
          <div style={{color:"#162030",fontSize:9,textTransform:"uppercase",letterSpacing:0.7,fontWeight:700,marginBottom:2}}>{k}</div>
          <div style={{color:v?"#90a8c0":"#162030",fontSize:11,fontWeight:600,wordBreak:"break-all"}}>{v||"—"}</div>
        </div>
      ))}
    </div>
    {c.linkedin&&<div style={{marginBottom:12}}><a href={`https://${c.linkedin.replace(/^https?:\/\//,"")}`} target="_blank" rel="noreferrer" style={{color:"#4a8ac4",fontSize:12}}>🔗 {c.linkedin}</a></div>}
    {c.skills?.length>0&&<div style={{marginBottom:14}}>
      <div style={{color:"#1a2a3a",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:6}}>Skills</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{c.skills.map(x=><span key={x} style={{background:"#0c1b2e",color:"#4a8ac4",borderRadius:5,padding:"3px 8px",fontSize:11}}>{x}</span>)}</div>
    </div>}
    <div style={{marginBottom:14}}>
      <div style={{color:"#1a2a3a",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:7}}>Submitted to Roles ({assigned.length})</div>
      {!assigned.length&&<div style={{color:"#162030",fontSize:11,padding:"6px 0"}}>Not submitted to any role.</div>}
      {assigned.map(j=><div key={j.id} style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:7,padding:"8px 11px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{color:"#b8cce0",fontSize:12,fontWeight:700}}>{j.title}</div><div style={{color:"#2a4060",fontSize:10,marginTop:1}}>{j.client} · {j.location}</div></div>
        <JobPill status={j.status}/>
      </div>)}
      <select style={{...sel,fontSize:11,marginTop:6}} onChange={e=>{if(e.target.value){onSubmitToJob(c.id,parseInt(e.target.value));e.target.value="";}}} defaultValue="">
        <option value="">+ Submit to another role…</option>
        {jobs.filter(j=>!j.submittedCandidates?.includes(c.id)&&!["Filled","Closed"].includes(j.status)).map(j=><option key={j.id} value={j.id}>{j.title} — {j.client}</option>)}
      </select>
    </div>
    <div>
      <div style={{color:"#1a2a3a",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:7}}>Team Notes · {c.notes?.length||0}</div>
      <div style={{maxHeight:160,overflowY:"auto",marginBottom:7,display:"flex",flexDirection:"column",gap:5}}>
        {!c.notes?.length&&<div style={{color:"#162030",fontSize:11}}>No notes yet.</div>}
        {c.notes?.map((n,i)=>{const t=getTeamMember(n.authorId);return <div key={i} style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:6,padding:"8px 10px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              {t&&<div style={{width:16,height:16,borderRadius:4,background:t.color+"22",border:`1px solid ${t.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7.5,fontWeight:800,color:t.color}}>{t.initials}</div>}
              <span style={{color:t?.color||"#4a8ac4",fontSize:10,fontWeight:700}}>{n.author}</span>
            </div>
            <span style={{color:"#162030",fontSize:9}}>{n.date}</span>
          </div>
          <div style={{color:"#6a8898",fontSize:12,lineHeight:1.5}}>{n.text}</div>
        </div>;})}
      </div>
      <div style={{display:"flex",gap:7}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
          <RecruiterBadge id={ACTIVE_USER.id} size={20}/>
          <input style={{...inp,flex:1}} value={note} onChange={e=>setNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&post()} placeholder={`Note as ${ACTIVE_USER.name}…`}/>
        </div>
        <button onClick={post} style={{background:"#1c4fc4",color:"white",border:"none",borderRadius:7,padding:"0 14px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>Post</button>
      </div>
    </div>
  </div>;
}

function JobForm({initial,onSave,onClose}){
  const E={title:"",client:"",spoc:"",location:"",empType:"Full-Time",salary:"",priority:"P1",status:"Open – Sourcing",reqDate:today(),submitted:0,interviewed:0,offers:0,jd:"",notes:[],submittedCandidates:[],assignedRecruiters:[ACTIVE_USER.id]};
  const [f,setF]=useState(initial||E);
  const [gen,setGen]=useState(false);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const toggleR=(id)=>{const cur=f.assignedRecruiters||[];s("assignedRecruiters",cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]);};
  const genJD=async()=>{
    if(!f.title||!f.client) return alert("Enter title and client first.");
    setGen(true);
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:900,messages:[{role:"user",content:`Write a professional job description. Role: ${f.title}. Client: ${f.client}. Location: ${f.location||"TBD"}. Pay: ${f.salary||"Competitive"}. Type: ${f.empType}. Sections: About the Role, Responsibilities (4 bullets), Required Qualifications (4 bullets), Nice to Have, Compensation. Plain text, use • for bullets.`}]})});
      const d=await res.json();s("jd",d.content?.[0]?.text||"");
    }catch{alert("JD generation failed.");}
    setGen(false);
  };
  const submit=()=>{if(!f.title.trim()||!f.client.trim()) return alert("Title and client required.");onSave({...f,id:f.id||Date.now()});};
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 15px"}}>
      <F label="Job Title *" span2><input style={inp} value={f.title} onChange={e=>s("title",e.target.value)} placeholder="AI Penetration Tester"/></F>
      <F label="Client *"><input style={inp} value={f.client} onChange={e=>s("client",e.target.value)} placeholder="Happiest Minds…"/></F>
      <F label="Client SPOC"><input style={inp} value={f.spoc} onChange={e=>s("spoc",e.target.value)} placeholder="Praveen T, Alison…"/></F>
      <F label="Location"><input style={inp} value={f.location} onChange={e=>s("location",e.target.value)} placeholder="US, Poland…"/></F>
      <F label="Employment Type"><select style={sel} value={f.empType} onChange={e=>s("empType",e.target.value)}>{EMP_TYPES.map(x=><option key={x}>{x}</option>)}</select></F>
      <F label="Salary / Bill Rate"><input style={inp} value={f.salary} onChange={e=>s("salary",e.target.value)} placeholder="$73/hr or 160–180K"/></F>
      <F label="Status"><select style={sel} value={f.status} onChange={e=>s("status",e.target.value)}>{JOB_STATUSES.map(x=><option key={x}>{x}</option>)}</select></F>
      <F label="Priority"><select style={sel} value={f.priority} onChange={e=>s("priority",e.target.value)}><option>P1</option><option>P2</option><option>P3</option></select></F>
    </div>
    <div style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:9,padding:"12px 14px",marginBottom:13,marginTop:4}}>
      <div style={{color:"#243040",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:9}}>Assigned Recruiters</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {TEAM.map(t=>{const active=(f.assignedRecruiters||[]).includes(t.id);return <div key={t.id} onClick={()=>toggleR(t.id)} style={{display:"flex",alignItems:"center",gap:6,background:active?t.color+"18":"#070c18",border:`1px solid ${active?t.color+"50":"#162030"}`,borderRadius:7,padding:"5px 10px",cursor:"pointer",transition:"all 0.15s"}}>
          <div style={{width:20,height:20,borderRadius:5,background:t.color+"22",border:`1px solid ${t.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8.5,fontWeight:800,color:t.color}}>{t.initials}</div>
          <span style={{fontSize:11,color:active?t.color:"#243040",fontWeight:active?700:400}}>{t.name.split(" ")[0]}</span>
        </div>;})}
      </div>
    </div>
    <div style={{marginBottom:13}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
        <label style={{color:"#243040",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase"}}>Job Description</label>
        <button onClick={genJD} disabled={gen} style={{background:"#0c1b2e",color:"#4a8ac4",border:"1px solid #1e3a5f",borderRadius:5,padding:"3px 11px",fontSize:10,cursor:"pointer",fontWeight:700}}>{gen?"Generating…":"✨ AI Generate JD"}</button>
      </div>
      <textarea style={{...ta,minHeight:130,fontFamily:"monospace",fontSize:11}} value={f.jd} onChange={e=>s("jd",e.target.value)} placeholder="Paste JD or use AI Generate…"/>
    </div>
    <div style={{display:"flex",gap:8}}>
      <button onClick={submit} style={{flex:1,background:"linear-gradient(135deg,#1c4fc4,#0d3598)",color:"white",border:"none",borderRadius:8,padding:"11px",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif"}}>{initial?.id?"Save Changes":"Create Job Order"}</button>
      <button onClick={onClose} style={{background:"#070c18",color:"#243040",border:"1px solid #162030",borderRadius:8,padding:"11px 18px",fontSize:12,cursor:"pointer"}}>Cancel</button>
    </div>
  </div>;
}

function JobDetail({job,candidates,onEdit,onStatusChange,onAddNote,onRemove,onOpenCand}){
  const [note,setNote]=useState("");
  const [showJD,setShowJD]=useState(false);
  const submitted=candidates.filter(c=>job.submittedCandidates?.includes(c.id));
  const pc={"P1":"#f472b6","P2":"#fb923c","P3":"#94a3b8"};
  const post=()=>{if(!note.trim())return;onAddNote(job.id,note.trim());setNote("");};
  return <div>
    <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:16}}>
      <div style={{flex:1}}>
        <div style={{fontSize:18,fontWeight:900,color:"#d0e0f8",fontFamily:"'Cabinet Grotesk',sans-serif",letterSpacing:-0.3,lineHeight:1.2,marginBottom:3}}>{job.title}</div>
        <div style={{color:"#2a4060",fontSize:12}}>{job.client}{job.spoc?` · SPOC: ${job.spoc}`:""}</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:7}}>
          <JobPill status={job.status}/>
          {job.empType&&<Pill label={job.empType} color="#38bdf8" bg="#06161f"/>}
          {job.priority&&<span style={{color:pc[job.priority]||"#94a3b8",fontSize:11,fontWeight:800,marginLeft:2}}>{job.priority}</span>}
        </div>
      </div>
      <button onClick={onEdit} style={{background:"#1c4fc4",color:"white",border:"none",borderRadius:7,padding:"7px 13px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>✏ Edit</button>
    </div>
    {(job.assignedRecruiters||[]).length>0&&<div style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:8,padding:"10px 13px",marginBottom:14}}>
      <div style={{color:"#1a2a3a",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:7}}>Assigned Recruiters</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {(job.assignedRecruiters||[]).map(id=>{const t=getTeamMember(id);if(!t)return null;return <div key={id} style={{display:"flex",alignItems:"center",gap:6,background:t.color+"15",border:`1px solid ${t.color}30`,borderRadius:6,padding:"4px 10px"}}>
          <div style={{width:20,height:20,borderRadius:5,background:t.color+"22",border:`1px solid ${t.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8.5,fontWeight:800,color:t.color}}>{t.initials}</div>
          <span style={{fontSize:11,color:t.color,fontWeight:600}}>{t.name}</span>
        </div>;})}
      </div>
    </div>}
    <div style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:9,padding:"10px 13px",marginBottom:14}}>
      <div style={{color:"#162030",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:7}}>Status — click to change</div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {JOB_STATUSES.map(st=>{const m=JSM[st]||JSM["Open – Sourcing"];return <span key={st} onClick={()=>onStatusChange(job.id,st)} style={{cursor:"pointer",background:job.status===st?m.bg:"transparent",color:job.status===st?m.c:"#1a2a3a",border:`1px solid ${job.status===st?m.c+"40":"#111d2e"}`,borderRadius:5,padding:"3px 10px",fontSize:10,fontWeight:700,transition:"all 0.15s"}}>{st}</span>;})}
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:14}}>
      {[["Location",job.location],["Salary/Rate",job.salary],["SPOC",job.spoc],["Type",job.empType],["Req Date",job.reqDate],["Priority",job.priority],["Submitted",job.submitted],["Interviewed",job.interviewed],["Offers",job.offers]].map(([k,v])=>(
        <div key={k} style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:7,padding:"8px 10px"}}>
          <div style={{color:"#162030",fontSize:9,textTransform:"uppercase",letterSpacing:0.7,fontWeight:700,marginBottom:2}}>{k}</div>
          <div style={{color:(v!=null&&v!=="")?"#90a8c0":"#162030",fontSize:11,fontWeight:600}}>{(v!=null&&v!=="")?v:"—"}</div>
        </div>
      ))}
    </div>
    {job.jd&&<div style={{marginBottom:14}}>
      <button onClick={()=>setShowJD(!showJD)} style={{background:"transparent",color:"#2a4060",border:"1px solid #111d2e",borderRadius:6,padding:"6px 12px",fontSize:11,cursor:"pointer",fontWeight:600,marginBottom:showJD?8:0}}>{showJD?"▲ Hide JD":"▼ View Job Description"}</button>
      {showJD&&<div style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:8,padding:"12px 14px",whiteSpace:"pre-wrap",fontSize:11,color:"#607080",lineHeight:1.7,fontFamily:"monospace",maxHeight:240,overflowY:"auto"}}>{job.jd}</div>}
    </div>}
    <div style={{marginBottom:14}}>
      <div style={{color:"#1a2a3a",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Submitted Candidates ({submitted.length})</div>
      {!submitted.length&&<div style={{color:"#162030",fontSize:11,padding:"6px 0"}}>No candidates submitted yet.</div>}
      {submitted.map(c=>{const owner=getTeamMember(c.ownerId);return <div key={c.id} onClick={()=>onOpenCand(c)} style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:8,padding:"9px 12px",marginBottom:6,display:"flex",alignItems:"center",gap:9,cursor:"pointer",transition:"border-color 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#1c4fc430"} onMouseLeave={e=>e.currentTarget.style.borderColor="#111d2e"}>
        <Avatar name={c.name} size={28}/>
        <div style={{flex:1}}><div style={{color:"#b8cce0",fontSize:12,fontWeight:700}}>{c.name}</div><div style={{color:"#2a4060",fontSize:10,marginTop:1}}>{c.title} · {c.workAuth||c.location}</div></div>
        <StagePill stage={c.stage}/>
        <span style={{fontSize:10,color:"#2a4060",minWidth:70,textAlign:"right"}}>{c.salary||"—"}</span>
        {owner&&<RecruiterBadge id={c.ownerId} size={20}/>}
        <button onClick={e=>{e.stopPropagation();onRemove(job.id,c.id);}} style={{background:"transparent",color:"#1a2a3a",border:"none",fontSize:14,cursor:"pointer",padding:"2px 5px",flexShrink:0}}>×</button>
      </div>;})}
    </div>
    <div>
      <div style={{color:"#1a2a3a",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:7}}>Team Notes · {job.notes?.length||0}</div>
      <div style={{maxHeight:130,overflowY:"auto",marginBottom:7,display:"flex",flexDirection:"column",gap:5}}>
        {!job.notes?.length&&<div style={{color:"#162030",fontSize:11}}>No notes yet.</div>}
        {job.notes?.map((n,i)=>{const t=getTeamMember(n.authorId);return <div key={i} style={{background:"#050a14",border:"1px solid #111d2e",borderRadius:6,padding:"8px 10px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              {t&&<div style={{width:14,height:14,borderRadius:3,background:t.color+"22",border:`1px solid ${t.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:6.5,fontWeight:800,color:t.color}}>{t.initials}</div>}
              <span style={{color:t?.color||"#4a8ac4",fontSize:10,fontWeight:700}}>{n.author}</span>
            </div>
            <span style={{color:"#162030",fontSize:9}}>{n.date}</span>
          </div>
          <div style={{color:"#607080",fontSize:12,lineHeight:1.5}}>{n.text}</div>
        </div>;})}
      </div>
      <div style={{display:"flex",gap:7}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
          <RecruiterBadge id={ACTIVE_USER.id} size={18}/>
          <input style={{...inp,flex:1}} value={note} onChange={e=>setNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&post()} placeholder={`Note as ${ACTIVE_USER.name}…`}/>
        </div>
        <button onClick={post} style={{background:"#1c4fc4",color:"white",border:"none",borderRadius:7,padding:"0 13px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>Post</button>
      </div>
    </div>
  </div>;
}

function LoginScreen({onLogin}){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);

  const submit=async()=>{
    if(!email.trim()||!password.trim()) return setError("Email and password required.");
    setLoading(true);setError("");
    try{
      await signIn(email.trim(),password);
      onLogin();
    }catch(e){
      setError("Invalid email or password. Try again.");
    }
    setLoading(false);
  };

  return <div style={{minHeight:"100vh",background:"#03070f",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Instrument Sans',sans-serif"}}>
    <link href="https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@700;800;900&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
    <div style={{width:"100%",maxWidth:380,padding:"0 20px"}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{width:52,height:52,borderRadius:14,background:"linear-gradient(135deg,#1c4fc4,#0d3598)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 14px"}}>⚡</div>
        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:22,color:"#d0e0f8",letterSpacing:-0.5}}>HCP One Recruit</div>
        <div style={{fontSize:11,color:"#2a4060",marginTop:3}}>INXL Digital · Sign in to continue</div>
      </div>
      <div style={{background:"#070c18",border:"1px solid #111d2e",borderRadius:14,padding:"24px"}}>
        {error&&<div style={{background:"#1a0606",border:"1px solid #f8717130",borderRadius:7,padding:"9px 12px",marginBottom:14,color:"#f87171",fontSize:12}}>{error}</div>}
        <div style={{marginBottom:14}}>
          <label style={{display:"block",color:"#243040",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Email</label>
          <input style={{width:"100%",background:"#050a14",border:"1px solid #162030",borderRadius:8,padding:"10px 12px",color:"#b8cce0",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}} value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="you@inxldigital.com" type="email" autoFocus/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{display:"block",color:"#243040",fontSize:9,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Password</label>
          <input style={{width:"100%",background:"#050a14",border:"1px solid #162030",borderRadius:8,padding:"10px 12px",color:"#b8cce0",fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••" type="password"/>
        </div>
        <button onClick={submit} disabled={loading} style={{width:"100%",background:"linear-gradient(135deg,#1c4fc4,#0d3598)",color:"white",border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:800,cursor:loading?"not-allowed":"pointer",fontFamily:"'Cabinet Grotesk',sans-serif",opacity:loading?0.7:1}}>
          {loading?"Signing in…":"Sign In"}
        </button>
      </div>
    </div>
  </div>;
}

export default function HCPRecruit(){
  const [cands,setCands]=useState([]);
  const [jobs,setJobs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [session,setSession]=useState(null);
  const [authChecked,setAuthChecked]=useState(false);
  const [tab,setTab]=useState("candidates");
  const [view,setView]=useState("list");
  const [modal,setModal]=useState(null);
  const [cs,setCs]=useState(""); const [cStage,setCStage]=useState("All"); const [cVert,setCVert]=useState("All");
  const [cAuth,setCAuth]=useState("All"); const [cOwner,setCOwner]=useState("All"); const [cSort,setCSort]=useState("name");
  const [js,setJs]=useState(""); const [jStat,setJStat]=useState("All"); const [jClient,setJClient]=useState("All"); const [jOwner,setJOwner]=useState("All");

  useEffect(()=>{
    getSession().then(s=>{setSession(s);setAuthChecked(true);});
  },[]);

  useEffect(()=>{
    if(!session) return;
    Promise.all([fetchCandidates(),fetchJobs()])
      .then(([c,j])=>{setCands(c);setJobs(j);setLoading(false);})
      .catch(err=>{console.error("Load error:",err);setLoading(false);});
    const unsub=subscribeToChanges(
      ()=>fetchCandidates().then(setCands),
      ()=>fetchJobs().then(setJobs)
    );
    return unsub;
  },[session]);

  const clients=[...new Set(jobs.map(j=>j.client).filter(Boolean))].sort();

  const fCands=cands
    .filter(c=>{const q=cs.toLowerCase();return !q||[c.name,c.title,c.email,c.location,c.vertical,...(c.skills||[])].some(v=>v?.toLowerCase().includes(q));})
    .filter(c=>cStage==="All"||c.stage===cStage)
    .filter(c=>cVert==="All"||c.vertical===cVert)
    .filter(c=>cAuth==="All"||c.workAuth===cAuth)
    .filter(c=>cOwner==="All"||c.ownerId===cOwner||(c.collaborators||[]).includes(cOwner))
    .sort((a,b)=>cSort==="stage"?STAGES.indexOf(a.stage)-STAGES.indexOf(b.stage):cSort==="salary"?parseInt((b.salary||"0").replace(/\D/g,""))-parseInt((a.salary||"0").replace(/\D/g,"")):(a.name||"").localeCompare(b.name||""));

  const fJobs=jobs
    .filter(j=>{const q=js.toLowerCase();return !q||[j.title,j.client,j.spoc].some(v=>v?.toLowerCase().includes(q));})
    .filter(j=>jStat==="All"||j.status===jStat)
    .filter(j=>jClient==="All"||j.client===jClient)
    .filter(j=>jOwner==="All"||(j.assignedRecruiters||[]).includes(jOwner))
    .sort((a,b)=>({"P1":0,"P2":1,"P3":2}[a.priority]||1)-({"P1":0,"P2":1,"P3":2}[b.priority]||1));

  const stats={
    total:cands.length,active:cands.filter(c=>!["Placed","Rejected","On Hold"].includes(c.stage)).length,
    hot:cands.filter(c=>["Interview 1","Interview 2","Final Interview","Offer"].includes(c.stage)).length,
    placed:cands.filter(c=>c.stage==="Placed").length,
    openJobs:jobs.filter(j=>["Open – Sourcing","Active"].includes(j.status)).length,
    filled:jobs.filter(j=>j.status==="Filled").length,
  };

  const reload=async()=>{const[c,j]=await Promise.all([fetchCandidates(),fetchJobs()]);setCands(c);setJobs(j);};
  const saveCand=async(c)=>{await upsertCandidate(c);await reload();setModal(null);};
  const saveJob=async(j)=>{await upsertJob(j);await reload();setModal(null);};
  const stageChange=async(id,stage)=>{await updateCandidateStage(id,stage);const data=await fetchCandidates();setCands(data);};
  const jobStatusChange=async(id,status)=>{await updateJobStatus(id,status);const data=await fetchJobs();setJobs(data);};
  const addCandNoteHandler=async(id,text)=>{await addCandidateNote(id,{author:ACTIVE_USER.name,authorId:ACTIVE_USER.id,text,date:today()});const data=await fetchCandidates();setCands(data);};
  const addJobNoteHandler=async(id,text)=>{await addJobNoteDB(id,{author:ACTIVE_USER.name,authorId:ACTIVE_USER.id,text,date:today()});const data=await fetchJobs();setJobs(data);};
  const submitToJob=async(cid,jid)=>{await submitCandidateToJob(cid,jid);await reload();};
  const removeFromJob=async(jid,cid)=>{await removeCandidateFromJob(cid,jid);const data=await fetchJobs();setJobs(data);};
  const openCand=(c)=>setModal({t:"cand",c});

  const pc={"P1":"#f472b6","P2":"#fb923c","P3":"#94a3b8"};

  if(!authChecked) return <div style={{minHeight:"100vh",background:"#03070f",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#2a4060",fontSize:14}}>⚡</div></div>;
  if(!session) return <LoginScreen onLogin={()=>getSession().then(setSession)}/>;

  if(loading) return <div style={{minHeight:"100vh",background:"#03070f",display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{textAlign:"center"}}>
      <div style={{fontSize:32,marginBottom:12}}>⚡</div>
      <div style={{color:"#2a4060",fontSize:14,fontWeight:600}}>Connecting to database…</div>
    </div>
  </div>;

  return <div style={{minHeight:"100vh",background:"#03070f",color:"#a8c0d8",fontFamily:"'Instrument Sans',sans-serif"}}>
    <link href="https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@700;800;900&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
    <div style={{background:"#050a14",borderBottom:"1px solid #0d1a28",padding:"0 20px",position:"sticky",top:0,zIndex:100}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",height:54}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#1c4fc4,#0d3598)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>⚡</div>
          <div>
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:15,color:"#d0e0f8",letterSpacing:-0.5}}>HCP One Recruit</div>
            <div style={{fontSize:8,color:"#162030",letterSpacing:0.5,marginTop:-1,textTransform:"uppercase",fontWeight:700}}>INXL Digital · Live</div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,background:"#070c18",border:"1px solid #111d2e",borderRadius:7,padding:"4px 10px",marginRight:4}}>
            <RecruiterBadge id={ACTIVE_USER.id} size={20}/>
            <span style={{fontSize:10,color:"#2a4060",fontWeight:600}}>{ACTIVE_USER.name}</span>
            <span onClick={()=>signOut().then(()=>setSession(null))} style={{fontSize:9,color:"#1a2a3a",cursor:"pointer",marginLeft:4,fontWeight:700}} title="Sign out">✕</span>
          </div>
          <div style={{display:"flex",background:"#070c18",border:"1px solid #111d2e",borderRadius:7,overflow:"hidden",marginRight:3}}>
            {[["candidates","👤 Candidates"],["jobs","💼 Job Orders"]].map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)} style={{padding:"5px 12px",background:tab===t?"#111d2e":"transparent",color:tab===t?"#7aa4d8":"#162030",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,transition:"all 0.15s",whiteSpace:"nowrap"}}>{l}</button>
            ))}
          </div>
          {tab==="candidates"&&<div style={{display:"flex",background:"#070c18",border:"1px solid #111d2e",borderRadius:6,overflow:"hidden"}}>
            {[["list","☰"],["pipeline","▦"]].map(([v,i])=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:"5px 10px",background:view===v?"#111d2e":"transparent",color:view===v?"#7aa4d8":"#162030",border:"none",cursor:"pointer",fontSize:11,fontWeight:700}}>{i}</button>
            ))}
          </div>}
          <button onClick={()=>setModal({t:tab==="candidates"?"add-cand":"add-job"})} style={{background:"linear-gradient(135deg,#1c4fc4,#0d3598)",color:"white",border:"none",borderRadius:7,padding:"6px 13px",fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif",whiteSpace:"nowrap"}}>
            {tab==="candidates"?"+ Candidate":"+ Job Order"}
          </button>
          <button onClick={()=>setModal({t:"report"})} style={{background:"#070c18",color:"#4ade80",border:"1px solid #4ade8020",borderRadius:7,padding:"6px 12px",fontSize:11,cursor:"pointer",fontWeight:700}}>📊 Report</button>
          <button onClick={()=>exportCSV(cands,jobs)} style={{background:"#070c18",color:"#2a4060",border:"1px solid #111d2e",borderRadius:7,padding:"6px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>⬇ CSV</button>
        </div>
      </div>
    </div>

    <div style={{padding:"18px 20px"}}>
      <div style={{display:"flex",gap:7,marginBottom:18,flexWrap:"wrap"}}>
        <Stat label="Total Candidates" value={stats.total} accent="#60a5fa"/>
        <Stat label="Active Pipeline" value={stats.active} accent="#a78bfa"/>
        <Stat label="Interview / Offer" value={stats.hot} accent="#f472b6"/>
        <Stat label="Placed" value={stats.placed} accent="#4ade80"/>
        <Stat label="Open Roles" value={stats.openJobs} accent="#facc15"/>
        <Stat label="Filled" value={stats.filled} accent="#fb923c"/>
      </div>

      {tab==="candidates"&&<>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{position:"relative",flex:"1 1 190px"}}>
            <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"#162030",fontSize:11}}>🔍</span>
            <input style={{...inp,paddingLeft:28,background:"#050a14"}} value={cs} onChange={e=>setCs(e.target.value)} placeholder="Name, title, skill…"/>
          </div>
          <select style={{...sel,flex:"0 0 125px",background:"#050a14"}} value={cStage} onChange={e=>setCStage(e.target.value)}><option value="All">All Stages</option>{STAGES.map(s=><option key={s}>{s}</option>)}</select>
          <select style={{...sel,flex:"0 0 140px",background:"#050a14"}} value={cOwner} onChange={e=>setCOwner(e.target.value)}>
            <option value="All">All Recruiters</option>
            {TEAM.map(t=><option key={t.id} value={t.id}>{t.name.split(" ")[0]}</option>)}
          </select>
          <select style={{...sel,flex:"0 0 120px",background:"#050a14"}} value={cAuth} onChange={e=>setCAuth(e.target.value)}><option value="All">All Auth</option>{WORK_AUTH.map(w=><option key={w}>{w}</option>)}</select>
          <select style={{...sel,flex:"0 0 130px",background:"#050a14"}} value={cSort} onChange={e=>setCSort(e.target.value)}>
            <option value="name">A–Z Name</option><option value="stage">Stage</option><option value="salary">Rate ↓</option>
          </select>
          <div style={{color:"#162030",fontSize:10,flexShrink:0}}>{fCands.length}/{cands.length}</div>
        </div>

        {view==="list"&&<div style={{background:"#050a14",border:"1px solid #0d1a28",borderRadius:12,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:"#070c18"}}>
              {["Candidate","Title","Owner / Collab","Client / Role","Auth","Rate","Stage",""].map(h=><th key={h} style={{padding:"9px 12px",textAlign:"left",color:"#162030",fontSize:9,fontWeight:700,letterSpacing:0.7,textTransform:"uppercase",borderBottom:"1px solid #0d1a28",whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {fCands.map(c=>{
                const cjobs=jobs.filter(j=>j.submittedCandidates?.includes(c.id));
                return <tr key={c.id} onClick={()=>openCand(c)} style={{borderBottom:"1px solid #070c18",cursor:"pointer",transition:"background 0.1s"}} onMouseEnter={e=>e.currentTarget.style.background="#070c18"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{padding:"11px 12px"}}><div style={{display:"flex",alignItems:"center",gap:8}}><Avatar name={c.name} size={28}/><div><div style={{fontWeight:700,fontSize:12,color:"#c8daf0"}}>{c.name}</div></div></div></td>
                  <td style={{padding:"11px 12px"}}><div style={{color:"#5a7a98",fontSize:11,fontWeight:600,maxWidth:130}}>{c.title||"—"}</div></td>
                  <td style={{padding:"11px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      {c.ownerId&&<RecruiterBadge id={c.ownerId} size={20}/>}
                      {(c.collaborators||[]).length>0&&<div style={{display:"flex",alignItems:"center",gap:2}}>
                        <span style={{color:"#1a2a3a",fontSize:9,margin:"0 2px"}}>+</span>
                        <RecruiterStack ids={c.collaborators||[]} size={17}/>
                      </div>}
                    </div>
                  </td>
                  <td style={{padding:"11px 12px"}}>{cjobs.slice(0,1).map(j=><div key={j.id} style={{fontSize:10,color:"#2a4060",whiteSpace:"nowrap"}}>{j.client}</div>)}{!cjobs.length&&<span style={{color:"#162030",fontSize:10}}>—</span>}</td>
                  <td style={{padding:"11px 12px"}}>{c.workAuth&&<span style={{background:"#041a0e",color:"#2abe60",borderRadius:4,padding:"2px 5px",fontSize:9,fontWeight:700}}>{c.workAuth}</span>}</td>
                  <td style={{padding:"11px 12px",color:"#b0c8e0",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{c.salary||"—"}</td>
                  <td style={{padding:"11px 12px"}}><StagePill stage={c.stage}/></td>
                  <td style={{padding:"11px 12px"}}><button onClick={e=>{e.stopPropagation();setModal({t:"edit-cand",c});}} style={{background:"#070c18",color:"#243040",border:"1px solid #111d2e",borderRadius:5,padding:"3px 8px",fontSize:9,cursor:"pointer",fontWeight:700}}>Edit</button></td>
                </tr>;
              })}
              {!fCands.length&&<tr><td colSpan={8} style={{textAlign:"center",padding:44,color:"#111d2e",fontSize:12}}>No candidates match.</td></tr>}
            </tbody>
          </table>
        </div>}

        {view==="pipeline"&&<div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:12,alignItems:"flex-start"}}>
          {STAGES.map(stage=>{
            const col=fCands.filter(c=>c.stage===stage);const m=SM[stage];
            return <div key={stage} style={{flex:"0 0 185px",minWidth:185}}>
              <div style={{background:m.bg,border:`1px solid ${m.b}`,borderRadius:8,padding:"6px 10px",marginBottom:6,display:"flex",justifyContent:"space-between"}}>
                <span style={{color:m.c,fontWeight:800,fontSize:10,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{stage}</span>
                <span style={{background:`${m.c}22`,color:m.c,borderRadius:8,padding:"1px 6px",fontSize:10,fontWeight:800}}>{col.length}</span>
              </div>
              {col.map(c=><div key={c.id} onClick={()=>openCand(c)} style={{background:"#070c18",border:"1px solid #0d1a28",borderRadius:8,padding:"9px",marginBottom:5,cursor:"pointer",transition:"border-color 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=`${m.c}45`} onMouseLeave={e=>e.currentTarget.style.borderColor="#0d1a28"}>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,justifyContent:"space-between"}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}><Avatar name={c.name} size={22}/><div style={{fontWeight:700,fontSize:11,color:"#c8daf0",lineHeight:1.2}}>{c.name}</div></div>
                  {c.ownerId&&<RecruiterBadge id={c.ownerId} size={16}/>}
                </div>
                <div style={{fontSize:10,color:"#2a4060",marginBottom:2}}>{c.title}</div>
                {c.salary&&<div style={{fontSize:10,color:"#2abe60",fontWeight:700}}>{c.salary}</div>}
              </div>)}
              {!col.length&&<div style={{background:"#050a14",border:"1px dashed #0d1a28",borderRadius:8,padding:"16px",textAlign:"center",color:"#0d1a28",fontSize:10}}>Empty</div>}
            </div>;
          })}
        </div>}
      </>}

      {tab==="jobs"&&<>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{position:"relative",flex:"1 1 190px"}}>
            <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"#162030",fontSize:11}}>🔍</span>
            <input style={{...inp,paddingLeft:28,background:"#050a14"}} value={js} onChange={e=>setJs(e.target.value)} placeholder="Role, client…"/>
          </div>
          <select style={{...sel,flex:"0 0 150px",background:"#050a14"}} value={jStat} onChange={e=>setJStat(e.target.value)}><option value="All">All Statuses</option>{JOB_STATUSES.map(s=><option key={s}>{s}</option>)}</select>
          <select style={{...sel,flex:"0 0 145px",background:"#050a14"}} value={jClient} onChange={e=>setJClient(e.target.value)}><option value="All">All Clients</option>{clients.map(c=><option key={c}>{c}</option>)}</select>
          <select style={{...sel,flex:"0 0 145px",background:"#050a14"}} value={jOwner} onChange={e=>setJOwner(e.target.value)}>
            <option value="All">All Recruiters</option>
            {TEAM.map(t=><option key={t.id} value={t.id}>{t.name.split(" ")[0]}</option>)}
          </select>
          <div style={{color:"#162030",fontSize:10,flexShrink:0}}>{fJobs.length} role{fJobs.length!==1?"s":""}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
          {fJobs.map(j=>{
            const subs=cands.filter(c=>j.submittedCandidates?.includes(c.id));
            return <div key={j.id} onClick={()=>setModal({t:"job",j})} style={{background:"#050a14",border:"1px solid #0d1a28",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"border-color 0.2s,transform 0.12s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#1a3050";e.currentTarget.style.transform="translateY(-1px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#0d1a28";e.currentTarget.style.transform="translateY(0)";}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7}}>
                <div style={{flex:1,paddingRight:8}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#c8daf0",fontFamily:"'Cabinet Grotesk',sans-serif",lineHeight:1.25,marginBottom:2}}>{j.title}</div>
                  <div style={{fontSize:11,color:"#2a4060"}}>{j.client}{j.spoc?` · ${j.spoc}`:""}</div>
                </div>
                <JobPill status={j.status}/>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                {j.empType&&<Pill label={j.empType} color="#38bdf8" bg="#06161f"/>}
                {j.priority&&<span style={{color:pc[j.priority]||"#94a3b8",fontSize:10,fontWeight:800}}>{j.priority}</span>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 8px",marginBottom:9}}>
                {j.location&&<div style={{fontSize:10,color:"#1a2a3a"}}>📍 {j.location}</div>}
                {j.salary&&<div style={{fontSize:10,color:"#1a2a3a"}}>💰 {j.salary}</div>}
                <div style={{fontSize:10,color:"#1a2a3a"}}>📤 {subs.length} submitted</div>
              </div>
              <div style={{borderTop:"1px solid #0d1a28",paddingTop:9,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <RecruiterStack ids={j.assignedRecruiters||[]} size={20}/>
                <div style={{display:"flex",alignItems:"center"}}>
                  {subs.slice(0,5).map((c,i)=><div key={c.id} style={{marginLeft:i>0?-6:0,zIndex:10-i,position:"relative"}}><Avatar name={c.name} size={20}/></div>)}
                  {!subs.length&&<span style={{color:"#162030",fontSize:10}}>No candidates</span>}
                </div>
              </div>
            </div>;
          })}
          {!fJobs.length&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:44,color:"#111d2e",fontSize:12}}>No job orders match.</div>}
        </div>
      </>}
    </div>

    {modal?.t==="add-cand"&&<Modal title="Add New Candidate" onClose={()=>setModal(null)}><CandForm allCandidates={cands} onSave={saveCand} onClose={()=>setModal(null)}/></Modal>}
    {modal?.t==="edit-cand"&&<Modal title="Edit Candidate" onClose={()=>setModal(null)}><CandForm initial={modal.c} allCandidates={cands} onSave={saveCand} onClose={()=>setModal(null)}/></Modal>}
    {modal?.t==="cand"&&(()=>{const live=cands.find(c=>c.id===modal.c.id)||modal.c;return <Modal title="Candidate Profile" onClose={()=>setModal(null)} wide><CandDetail c={live} jobs={jobs} onEdit={()=>setModal({t:"edit-cand",c:live})} onStageChange={stageChange} onAddNote={addCandNoteHandler} onSubmitToJob={submitToJob}/></Modal>;})()}
    {modal?.t==="add-job"&&<Modal title="New Job Order" onClose={()=>setModal(null)} wide><JobForm onSave={saveJob} onClose={()=>setModal(null)}/></Modal>}
    {modal?.t==="edit-job"&&<Modal title="Edit Job Order" onClose={()=>setModal(null)} wide><JobForm initial={modal.j} onSave={saveJob} onClose={()=>setModal(null)}/></Modal>}
    {modal?.t==="job"&&(()=>{const live=jobs.find(j=>j.id===modal.j.id)||modal.j;return <Modal title="Job Order Detail" onClose={()=>setModal(null)} wide><JobDetail job={live} candidates={cands} onEdit={()=>setModal({t:"edit-job",j:live})} onStatusChange={jobStatusChange} onAddNote={addJobNoteHandler} onRemove={removeFromJob} onOpenCand={c=>{setModal(null);setTimeout(()=>setModal({t:"cand",c}),40);}}/></Modal>;})()}
    {modal?.t==="report"&&<Modal title="📊 Weekly Activity Report" onClose={()=>setModal(null)} xl><WeeklyReport cands={cands} jobs={jobs}/></Modal>}
  </div>;
}
