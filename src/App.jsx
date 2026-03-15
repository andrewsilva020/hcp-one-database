import { useState, useRef, useEffect } from "react";
import { fetchCandidates, fetchJobs, fetchTeam, upsertTeamMember, upsertCandidate, upsertJob, updateCandidateStage, updateJobStatus, addCandidateNote, addJobNote as addJobNoteDB, submitCandidateToJob, removeCandidateFromJob, subscribeToChanges, signIn, signOut, getSession, deleteCandidate, deleteJob, uploadResume, getResumeUrl, logActivity, fetchActivity, fetchScorecards, upsertScorecard, deleteScorecard } from "./lib/supabase";

// ── DESIGN TOKENS ─────────────────────────────────────────────────
const C = {
  navy:    "#0a1628",
  navy2:   "#132040",
  navy3:   "#1e3461",
  accent:  "#1e56c8",
  accent2: "#2563eb",
  accentL: "#dbeafe",
  white:   "#ffffff",
  gray50:  "#f8fafc",
  gray100: "#f1f5f9",
  gray200: "#e2e8f0",
  gray300: "#cbd5e1",
  gray400: "#94a3b8",
  gray500: "#64748b",
  gray600: "#475569",
  gray700: "#334155",
  gray800: "#1e293b",
  success: "#16a34a",
  successL:"#dcfce7",
  warn:    "#d97706",
  warnL:   "#fef3c7",
  danger:  "#dc2626",
  dangerL: "#fee2e2",
  purple:  "#7c3aed",
  purpleL: "#ede9fe",
  pink:    "#db2777",
  pinkL:   "#fce7f3",
  orange:  "#ea580c",
  orangeL: "#ffedd5",
};

// ── TEAM ──────────────────────────────────────────────────────────
// Fallback team — replaced at runtime by Supabase team_members table
const TEAM_FALLBACK = [
  { id:"andrew",  name:"Andrew Silva",     initials:"AS", color:"#1e56c8", role:"Senior Recruiter" },
  { id:"sarah",   name:"Sarah Kim",        initials:"SK", color:"#7c3aed", role:"Recruiter" },
  { id:"mike",    name:"Mike Rodriguez",   initials:"MR", color:"#16a34a", role:"Recruiter" },
  { id:"jessica", name:"Jessica Okafor",   initials:"JO", color:"#d97706", role:"Recruiter" },
  { id:"david",   name:"David Chen",       initials:"DC", color:"#dc2626", role:"Sourcing Specialist" },
  { id:"priya",   name:"Priya Patel",      initials:"PP", color:"#0891b2", role:"Recruiter" },
  { id:"enoch",   name:"Enoch Washington", initials:"EW", color:"#ea580c", role:"CEO / Managing Director" },
];
let TEAM = TEAM_FALLBACK;
const getTeamMember = id => TEAM.find(t=>t.id===id);

// ── CONSTANTS ─────────────────────────────────────────────────────
const STAGES = ["Sourced","Submitted","Client Review","Interview 1","Interview 2","Final Interview","Offer","Placed","On Hold","Rejected"];
const SM = {
  "Sourced":         {c:C.accent,  bg:C.accentL,  t:"#1e40af"},
  "Submitted":       {c:C.purple,  bg:C.purpleL,  t:"#5b21b6"},
  "Client Review":   {c:"#0891b2", bg:"#cffafe",  t:"#0e7490"},
  "Interview 1":     {c:C.pink,    bg:C.pinkL,    t:"#9d174d"},
  "Interview 2":     {c:"#e11d48", bg:"#ffe4e6",  t:"#9f1239"},
  "Final Interview": {c:C.orange,  bg:C.orangeL,  t:"#9a3412"},
  "Offer":           {c:C.warn,    bg:C.warnL,    t:"#92400e"},
  "Placed":          {c:C.success, bg:C.successL, t:"#14532d"},
  "On Hold":         {c:C.gray500, bg:C.gray100,  t:C.gray700},
  "Rejected":        {c:C.danger,  bg:C.dangerL,  t:"#991b1b"},
};
const JOB_STATUSES = ["Open – Sourcing","Active","Hold","On Hold","Filled","Closed"];
const JSM = {
  "Open – Sourcing": {c:C.success, bg:C.successL},
  "Active":          {c:C.accent,  bg:C.accentL},
  "Hold":            {c:C.warn,    bg:C.warnL},
  "On Hold":         {c:C.gray500, bg:C.gray100},
  "Filled":          {c:C.orange,  bg:C.orangeL},
  "Closed":          {c:C.danger,  bg:C.dangerL},
};
const VERTICALS = ["Telecom / Wireless","AI / ML / Data","Cybersecurity","Software Engineering","Cloud / DevOps","Sales & Business Development","Directors & VPs","SVPs & C-Suite","Client Partners","Project / Program Mgmt","Network Engineering","Consulting"];
const SENIORITY  = ["Individual Contributor","Senior IC","Team Lead","Manager","Director","VP","SVP","C-Suite / Partner"];
const WORK_AUTH  = ["US Citizen","Green Card","H-1B","H-4 EAD","L-1","TN Visa","OPT/CPT","EAD","EU Passport","EU Blue Card","Residence Permit","Requires Sponsorship","Other"];
const SKILLS_POOL= ["Python","Snowflake","dbt","AWS","Azure","GCP","Machine Learning","LLM/GenAI","OSCP","CISSP","CEH","Penetration Testing","AppSec","ServiceNow","SAM Pro","ITIL","React","Java","Kubernetes","Terraform","SQL","Spark","Salesforce","Power Platform","Dynamics 365","SIEM","Splunk","Zero Trust","5G","RF Engineering","Program Management","Supply Chain","MedTech"];
const EMP_TYPES  = ["Full-Time","Contract","Contract-to-Hire","Part-Time"];

// ── UTILS ─────────────────────────────────────────────────────────
const today    = () => new Date().toISOString().split("T")[0];
const ini      = n  => (n||"?").split(" ").map(x=>x[0]).join("").substring(0,2).toUpperCase();
const aHue     = name => [...(name||"A")].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
const weekStart = () => { const d=new Date(); d.setDate(d.getDate()-d.getDay()); return d.toISOString().split("T")[0]; };
const weekEnd   = () => { const d=new Date(); d.setDate(d.getDate()+(6-d.getDay())); return d.toISOString().split("T")[0]; };

function exportCSV(cands, jobs) {
  const ch=["Name","Email","Phone","Title","Seniority","Vertical","Stage","Work Auth","Salary","Location","Experience","Source","Owner","Collaborators","Skills","Notes","Added","Updated"];
  const cr=cands.map(c=>[c.name,c.email,c.phone,c.title,c.seniority,c.vertical,c.stage,c.workAuth,c.salary,c.location,c.experience,c.source,getTeamMember(c.ownerId)?.name||c.ownerId,(c.collaborators||[]).map(id=>getTeamMember(id)?.name||id).join("; "),(c.skills||[]).join("; "),(c.notes||[]).map(n=>`[${n.author}] ${n.text}`).join(" | "),c.addedDate,c.lastUpdated]);
  const jh=["Title","Client","SPOC","Location","Type","Salary","Priority","Status","Req Date","Assigned Recruiters","Submitted","Candidates"];
  const jr=jobs.map(j=>[j.title,j.client,j.spoc,j.location,j.empType,j.salary,j.priority,j.status,j.reqDate,(j.assignedRecruiters||[]).map(id=>getTeamMember(id)?.name||id).join("; "),j.submitted,(j.submittedCandidates||[]).map(id=>cands.find(c=>c.id===id)?.name||id).join("; ")]);
  const esc=v=>`"${String(v||"").replace(/"/g,'""')}"`;
  const blob=new Blob([`HCP ONE CANDIDATES\n${[ch,...cr].map(r=>r.map(esc).join(",")).join("\n")}\n\n\nHCP ONE JOB ORDERS\n${[jh,...jr].map(r=>r.map(esc).join(",")).join("\n")}`],{type:"text/csv"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`HCP_Recruit_${today()}.csv`;a.click();
}

function similarity(a,b){
  a=(a||"").toLowerCase().trim();b=(b||"").toLowerCase().trim();
  if(!a||!b)return 0;if(a===b)return 1;
  const la=a.length,lb=b.length;
  const dp=Array.from({length:la+1},(_,i)=>Array.from({length:lb+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=la;i++)for(let j=1;j<=lb;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return 1-dp[la][lb]/Math.max(la,lb);
}
function detectDupes(candidates, email, phone, excludeId=null, name="") {
  const exact=candidates.filter(c=>{
    if(c.id===excludeId) return false;
    const em=email&&c.email?.toLowerCase().trim()===email.toLowerCase().trim()&&email.trim().length>3;
    const ph=phone&&c.phone?.replace(/\D/g,"")===phone.replace(/\D/g,"")&&phone.replace(/\D/g,"").length>=10;
    return em||ph;
  });
  const exactIds=new Set(exact.map(c=>c.id));
  const fuzzy=name?candidates.filter(c=>{
    if(c.id===excludeId||exactIds.has(c.id))return false;
    return similarity(c.name,name)>0.82;
  }):[];
  return [...exact,...fuzzy.map(c=>({...c,_fuzzy:true}))];
}

function generateWeeklyReport(cands, jobs, filterRecruiter="all", team=TEAM_FALLBACK) {
  const ws=weekStart(),we=weekEnd();
  const fc=filterRecruiter==="all"?cands:cands.filter(c=>c.ownerId===filterRecruiter||(c.collaborators||[]).includes(filterRecruiter));
  const fj=filterRecruiter==="all"?jobs:jobs.filter(j=>(j.assignedRecruiters||[]).includes(filterRecruiter));
  const byStage={};STAGES.forEach(s=>{byStage[s]=fc.filter(c=>c.stage===s);});
  const byClient={};jobs.forEach(j=>{if(!byClient[j.client])byClient[j.client]=[];});
  fc.forEach(c=>{c.submittedTo?.forEach(jid=>{const j=jobs.find(x=>x.id===jid);if(j){if(!byClient[j.client])byClient[j.client]=[];if(!byClient[j.client].find(x=>x.id===c.id))byClient[j.client].push(c);}});});
  const byRecruiter={};
  (team||TEAM_FALLBACK).forEach(t=>{const owned=cands.filter(c=>c.ownerId===t.id);const collab=cands.filter(c=>(c.collaborators||[]).includes(t.id));byRecruiter[t.id]={name:t.name,color:t.color,owned:owned.length,active:owned.filter(c=>!["Placed","Rejected"].includes(c.stage)).length,offers:owned.filter(c=>c.stage==="Offer").length,placed:owned.filter(c=>c.stage==="Placed").length,interviews:owned.filter(c=>["Interview 1","Interview 2","Final Interview"].includes(c.stage)).length,collab:collab.length,jobs:jobs.filter(j=>(j.assignedRecruiters||[]).includes(t.id)).length};});
  return {ws,we,active:fc.filter(c=>!["Placed","Rejected"].includes(c.stage)),byStage,byClient,byRecruiter,openJobs:fj.filter(j=>["Open – Sourcing","Active"].includes(j.status)),hotCands:fc.filter(c=>["Interview 1","Interview 2","Final Interview","Offer"].includes(c.stage)),total:fc.length,placed:fc.filter(c=>c.stage==="Placed").length};
}

// ── MICRO COMPONENTS ──────────────────────────────────────────────
function StageBadge({stage}){
  const m=SM[stage]||SM.Sourced;
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,background:m.bg,color:m.t||m.c,borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:600,whiteSpace:"nowrap",border:`1px solid ${m.c}30`}}>
    <span style={{width:6,height:6,borderRadius:"50%",background:m.c,flexShrink:0}}/>{stage}
  </span>;
}
function JobBadge({status}){
  const m=JSM[status]||JSM["Open – Sourcing"];
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,background:m.bg,color:m.c,borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:600,whiteSpace:"nowrap",border:`1px solid ${m.c}30`}}>
    <span style={{width:6,height:6,borderRadius:"50%",background:m.c,flexShrink:0}}/>{status}
  </span>;
}
function Tag({label,color=C.accent,bg=C.accentL}){
  return <span style={{display:"inline-block",background:bg,color,borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:500,whiteSpace:"nowrap"}}>{label}</span>;
}
function Avatar({name,size=36,color}){
  const h=aHue(name);
  return <div style={{width:size,height:size,borderRadius:Math.round(size*.25),background:color||`hsl(${h},45%,88%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.36,fontWeight:700,color:color?C.white:`hsl(${h},45%,28%)`,flexShrink:0,fontFamily:"'DM Sans',sans-serif"}}>{ini(name)}</div>;
}
function RecruiterBadge({id,size=26,showName=false}){
  const t=getTeamMember(id);if(!t)return null;
  return <div style={{display:"inline-flex",alignItems:"center",gap:5}} title={t.name}>
    <div style={{width:size,height:size,borderRadius:size*.25,background:t.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.38,fontWeight:700,color:C.white,flexShrink:0}}>{t.initials}</div>
    {showName&&<span style={{fontSize:12,color:C.gray600,fontWeight:500}}>{t.name}</span>}
  </div>;
}
function RecruiterStack({ids=[],size=22}){
  return <div style={{display:"flex",alignItems:"center"}}>
    {ids.slice(0,4).map((id,i)=><div key={id} style={{marginLeft:i>0?-6:0,zIndex:10-i,position:"relative",border:`2px solid ${C.white}`,borderRadius:size*.25}}><RecruiterBadge id={id} size={size}/></div>)}
    {ids.length>4&&<span style={{marginLeft:6,fontSize:10,color:C.gray400,fontWeight:600}}>+{ids.length-4}</span>}
  </div>;
}
function StatCard({label,value,accent,icon}){
  return <div style={{flex:1,minWidth:130,background:C.white,borderRadius:12,padding:"20px 22px",border:`1px solid ${C.gray200}`,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",position:"relative",overflow:"hidden"}}>
    <div style={{position:"absolute",top:0,right:0,width:64,height:64,borderRadius:"0 12px 0 64px",background:accent+"12",pointerEvents:"none"}}/>
    <div style={{fontSize:11,fontWeight:600,color:C.gray400,letterSpacing:0.5,textTransform:"uppercase",marginBottom:8}}>{icon} {label}</div>
    <div style={{fontSize:32,fontWeight:800,color:C.navy,fontFamily:"'DM Sans',sans-serif",lineHeight:1}}>{value}</div>
  </div>;
}

// ── FORM PRIMITIVES ───────────────────────────────────────────────
const inp={width:"100%",background:C.white,border:`1px solid ${C.gray300}`,borderRadius:8,padding:"9px 12px",color:C.gray800,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
const sel={...inp,cursor:"pointer"};
const ta={...inp,resize:"vertical",minHeight:80,lineHeight:1.6};
function F({label,span2,children}){
  return <div style={{gridColumn:span2?"span 2":"span 1"}}>
    <label style={{display:"block",color:C.gray500,fontSize:11,fontWeight:600,letterSpacing:0.3,marginBottom:5}}>{label}</label>
    {children}
  </div>;
}
function Divider(){return <div style={{height:1,background:C.gray100,margin:"18px 0"}}/>;}
function Modal({title,subtitle,onClose,wide,xl,children}){
  return <div style={{position:"fixed",inset:0,background:"rgba(10,22,40,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={onClose}>
    <div style={{background:C.white,borderRadius:16,width:"100%",maxWidth:xl?1060:wide?860:680,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(10,22,40,0.2)",border:`1px solid ${C.gray200}`}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"22px 24px 0",marginBottom:20}}>
        <div>
          <h2 style={{margin:0,color:C.navy,fontSize:17,fontFamily:"'DM Sans',sans-serif",fontWeight:700}}>{title}</h2>
          {subtitle&&<div style={{fontSize:12,color:C.gray400,marginTop:2}}>{subtitle}</div>}
        </div>
        <button onClick={onClose} style={{background:C.gray100,border:"none",color:C.gray500,fontSize:15,cursor:"pointer",padding:"5px 9px",borderRadius:6,lineHeight:1}}>✕</button>
      </div>
      <div style={{padding:"0 24px 24px"}}>{children}</div>
    </div>
  </div>;
}

// ── LOGIN ─────────────────────────────────────────────────────────
function LoginScreen({onLogin}){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const submit=async()=>{
    if(!email.trim()||!password.trim()) return setError("Please enter your email and password.");
    setLoading(true);setError("");
    try{await signIn(email.trim(),password);onLogin();}
    catch{setError("Invalid email or password.");}
    setLoading(false);
  };
  const T={primary:"#22313F",accent:"#FF7A59",surface:"#FFF8F4",ink:"#1A242E",muted:"#E9E5E0",accentHover:"#E8674A",accentLight:"#FFF0EB"};
  return <div style={{minHeight:"100vh",width:"100vw",background:`linear-gradient(135deg, ${T.ink} 0%, ${T.primary} 40%, #2C3E50 70%, #1A242E 100%)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',sans-serif",padding:20,position:"relative",overflow:"hidden"}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
    {/* Ambient glow effects */}
    <div style={{position:"absolute",top:"-20%",right:"-10%",width:"600px",height:"600px",borderRadius:"50%",background:"radial-gradient(circle, rgba(255,122,89,0.08) 0%, transparent 70%)",pointerEvents:"none"}}/>
    <div style={{position:"absolute",bottom:"-20%",left:"-10%",width:"500px",height:"500px",borderRadius:"50%",background:"radial-gradient(circle, rgba(255,122,89,0.05) 0%, transparent 70%)",pointerEvents:"none"}}/>
    {/* Subtle grid pattern */}
    <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",backgroundSize:"40px 40px",pointerEvents:"none"}}/>
    <div style={{width:"100%",maxWidth:420,position:"relative",zIndex:1}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <img src="/logo-light.png" alt="Talyntry" style={{height:28,marginBottom:20}} onError={e=>{e.target.style.display="none"}}/>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:36,color:"#fff",letterSpacing:-1,lineHeight:1.1,marginBottom:10}}>Welcome back</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.35)",fontWeight:400}}>Sign in to your Talyntry account</div>
      </div>
      <div style={{background:"rgba(255,248,244,0.97)",borderRadius:20,padding:"40px 36px",boxShadow:"0 32px 80px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)",backdropFilter:"blur(20px)"}}>
        {error&&<div style={{background:"#FEE2E2",border:"1px solid rgba(220,38,38,0.2)",borderRadius:10,padding:"11px 14px",marginBottom:20,color:"#DC2626",fontSize:13,fontWeight:500}}>{error}</div>}
        <div style={{marginBottom:20}}>
          <label style={{display:"block",color:T.primary,fontSize:11,fontWeight:600,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.5px"}}>Email address</label>
          <input style={{width:"100%",background:"#fff",border:`1.5px solid ${T.muted}`,borderRadius:10,padding:"13px 16px",color:T.ink,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",transition:"border-color 0.2s"}} value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.muted} placeholder="you@company.com" type="email" autoFocus/>
        </div>
        <div style={{marginBottom:28}}>
          <label style={{display:"block",color:T.primary,fontSize:11,fontWeight:600,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.5px"}}>Password</label>
          <input style={{width:"100%",background:"#fff",border:`1.5px solid ${T.muted}`,borderRadius:10,padding:"13px 16px",color:T.ink,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",transition:"border-color 0.2s"}} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} onFocus={e=>e.target.style.borderColor=T.accent} onBlur={e=>e.target.style.borderColor=T.muted} placeholder="••••••••" type="password"/>
        </div>
        <button onClick={submit} disabled={loading} onMouseEnter={e=>{if(!loading)e.target.style.background=T.accentHover;e.target.style.transform="translateY(-1px)";e.target.style.boxShadow="0 8px 28px rgba(255,122,89,0.4)"}} onMouseLeave={e=>{e.target.style.background=T.accent;e.target.style.transform="translateY(0)";e.target.style.boxShadow="0 4px 20px rgba(255,122,89,0.3)"}} style={{width:"100%",background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:"14px",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,fontFamily:"'Outfit',sans-serif",boxShadow:"0 4px 20px rgba(255,122,89,0.3)",transition:"all 0.25s cubic-bezier(0.16,1,0.3,1)",letterSpacing:"-0.01em"}}>
          {loading?"Signing in…":"Sign In"}
        </button>
      </div>
      <div style={{textAlign:"center",marginTop:24,fontSize:12,color:"rgba(255,255,255,0.18)",letterSpacing:"0.3px"}}>Talyntry · INXL Digital</div>
    </div>
  </div>;
}

// ── WEEKLY REPORT ─────────────────────────────────────────────────
function WeeklyReport({cands,jobs,team=TEAM_FALLBACK}){
  const [filterR,setFilterR]=useState("all");
  const r=generateWeeklyReport(cands,jobs,filterR,team);
  const printReport=()=>{
    const w=window.open("","_blank");
    const rows=Object.entries(r.byRecruiter).map(([,d])=>`<tr><td>${d.name}</td><td>${d.owned}</td><td>${d.active}</td><td>${d.interviews}</td><td>${d.offers}</td><td>${d.placed}</td><td>${d.collab}</td><td>${d.jobs}</td></tr>`).join("");
    const hotRows=r.hotCands.map(c=>{const o=getTeamMember(c.ownerId);return `<tr><td>${c.name}</td><td>${c.title}</td><td>${c.stage}</td><td>${c.salary||"—"}</td><td>${o?.name||"—"}</td></tr>`;}).join("");
    const jobRows=r.openJobs.map(j=>`<tr><td>${j.title}</td><td>${j.client}</td><td>${j.salary||"—"}</td><td>${j.status}</td><td>${(j.submittedCandidates||[]).length}</td></tr>`).join("");
    const clientRows=Object.entries(r.byClient).filter(([,c])=>c.length>0).map(([client,cs])=>`<tr><td><b>${client}</b></td><td>${cs.length}</td><td>${cs.filter(c=>["Interview 1","Interview 2","Final Interview"].includes(c.stage)).length}</td><td>${cs.filter(c=>c.stage==="Offer").length}</td><td>${cs.filter(c=>c.stage==="Placed").length}</td></tr>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Talyntry Weekly Report</title><style>body{font-family:'DM Sans',Arial,sans-serif;padding:40px;color:#0a1628;max-width:960px;margin:0 auto}h1{color:#22313F;font-size:22px;border-bottom:3px solid #FF7A59;padding-bottom:10px}h2{color:#22313F;margin-top:32px;font-size:13px;text-transform:uppercase;letter-spacing:1px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th{background:#0a1628;color:white;padding:9px 12px;text-align:left}td{padding:8px 12px;border-bottom:1px solid #e2e8f0}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:20px 0}.card{background:#f1f5f9;border-radius:10px;padding:16px;text-align:center}.num{font-size:28px;font-weight:800;color:#FF7A59}.lbl{font-size:11px;color:#64748b;margin-top:3px}@media print{button{display:none}}</style></head><body>
    <h1>Talyntry Weekly Activity Report</h1>
    <p style="color:#64748b">Week of ${r.ws} – ${r.we} · Generated ${today()} · ${filterR==="all"?"All Recruiters":getTeamMember(filterR)?.name}</p>
    <div class="summary"><div class="card"><div class="num">${r.total}</div><div class="lbl">Total Candidates</div></div><div class="card"><div class="num">${r.active.length}</div><div class="lbl">Active Pipeline</div></div><div class="card"><div class="num">${r.hotCands.length}</div><div class="lbl">Interview / Offer</div></div><div class="card"><div class="num">${r.openJobs.length}</div><div class="lbl">Open Job Orders</div></div></div>
    <h2>Pipeline by Stage</h2><table><tr>${STAGES.map(s=>`<th>${s}</th>`).join("")}</tr><tr>${STAGES.map(s=>`<td>${r.byStage[s]?.length||0}</td>`).join("")}</tr></table>
    <h2>Client Activity</h2><table><tr><th>Client</th><th>Candidates</th><th>In Interview</th><th>Offers</th><th>Placed</th></tr>${clientRows}</table>
    <h2>Hot Candidates</h2><table><tr><th>Candidate</th><th>Title</th><th>Stage</th><th>Rate</th><th>Owner</th></tr>${hotRows}</table>
    <h2>Open Roles</h2><table><tr><th>Role</th><th>Client</th><th>Pay</th><th>Status</th><th>Submitted</th></tr>${jobRows}</table>
    <h2>Team Performance</h2><table><tr><th>Recruiter</th><th>Owned</th><th>Active</th><th>Interviews</th><th>Offers</th><th>Placed</th><th>Collab</th><th>Jobs</th></tr>${rows}</table>
    </body></html>`);
    w.document.close();w.focus();setTimeout(()=>w.print(),400);
  };
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <span style={{fontSize:12,color:C.gray500,fontWeight:500}}>Filter:</span>
        <select style={{...sel,width:190,fontSize:12}} value={filterR} onChange={e=>setFilterR(e.target.value)}>
          <option value="all">All Recruiters</option>{team.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span style={{fontSize:12,color:C.gray400}}>Week: {r.ws} – {r.we}</span>
      </div>
      <button onClick={printReport} style={{background:C.navy,color:C.white,border:"none",borderRadius:8,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer"}}>🖨 Print / Export PDF</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:22}}>
      {[[r.total,"Total Candidates",C.accent,"⬡"],[r.active.length,"Active Pipeline",C.purple,"◈"],[r.hotCands.length,"Interview / Offer",C.pink,"◆"],[r.openJobs.length,"Open Roles",C.success,"□"]].map(([v,l,c,ic])=>(
        <div key={l} style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:10,padding:"16px",textAlign:"center"}}>
          <div style={{fontSize:11,color:C.gray400,marginBottom:6}}>{ic} {l}</div>
          <div style={{fontSize:30,fontWeight:800,color:c,fontFamily:"'DM Sans',sans-serif"}}>{v}</div>
        </div>
      ))}
    </div>
    <div style={{marginBottom:20}}>
      <div style={{fontSize:11,fontWeight:600,color:C.gray500,letterSpacing:0.5,textTransform:"uppercase",marginBottom:10}}>Pipeline by Stage</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {STAGES.map(s=>{const cnt=r.byStage[s]?.length||0;const m=SM[s];return <div key={s} style={{flex:1,minWidth:70,background:cnt>0?m.bg:C.gray50,border:`1px solid ${cnt>0?m.c+"40":C.gray200}`,borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:800,color:cnt>0?m.c:C.gray300,fontFamily:"'DM Sans',sans-serif"}}>{cnt}</div>
          <div style={{fontSize:9,color:cnt>0?m.c:C.gray300,marginTop:3,lineHeight:1.3}}>{s}</div>
        </div>;})}
      </div>
    </div>
    {r.hotCands.length>0&&<div style={{marginBottom:20}}>
      <div style={{fontSize:11,fontWeight:600,color:C.gray500,letterSpacing:0.5,textTransform:"uppercase",marginBottom:10}}>Hot Candidates</div>
      {r.hotCands.map(c=>{const o=getTeamMember(c.ownerId);return <div key={c.id} style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:9,padding:"11px 14px",display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
        <Avatar name={c.name} size={32} color={o?.color}/>
        <div style={{flex:1}}><div style={{color:C.navy,fontSize:13,fontWeight:600}}>{c.name}</div><div style={{color:C.gray400,fontSize:11}}>{c.title}</div></div>
        <StageBadge stage={c.stage}/>
        <span style={{color:C.success,fontSize:12,fontWeight:600,minWidth:80,textAlign:"right"}}>{c.salary||"—"}</span>
        {o&&<RecruiterBadge id={c.ownerId} size={24}/>}
      </div>;})}
    </div>}
    <div>
      <div style={{fontSize:11,fontWeight:600,color:C.gray500,letterSpacing:0.5,textTransform:"uppercase",marginBottom:10}}>Team Performance</div>
      <div style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:10,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:C.navy}}>{["Recruiter","Owned","Active","Interviews","Offers","Placed","Collab","Jobs"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",color:"rgba(255,255,255,0.7)",fontSize:11,fontWeight:600,letterSpacing:0.5}}>{h}</th>)}</tr></thead>
          <tbody>{Object.entries(r.byRecruiter).map(([id,d],idx)=>{const t=getTeamMember(id);return <tr key={id} style={{borderBottom:`1px solid ${C.gray100}`,background:idx%2===0?C.white:C.gray50}}>
            <td style={{padding:"11px 14px"}}><div style={{display:"flex",alignItems:"center",gap:9}}><RecruiterBadge id={id} size={26}/><div><div style={{color:C.navy,fontSize:13,fontWeight:600}}>{d.name}</div><div style={{color:C.gray400,fontSize:10}}>{t?.role}</div></div></div></td>
            {[d.owned,d.active,d.interviews,d.offers,d.placed,d.collab,d.jobs].map((v,i)=><td key={i} style={{padding:"11px 14px",color:v>0?C.navy:C.gray300,fontSize:14,fontWeight:v>0?700:400}}>{v}</td>)}
          </tr>;})}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

// ── CANDIDATE FORM ────────────────────────────────────────────────
function CandForm({initial,allCandidates,onSave,onClose,activeUser=TEAM_FALLBACK[0],team=TEAM_FALLBACK}){
  const E={name:"",email:"",phone:"",linkedin:"",title:"",seniority:"",vertical:"",stage:"Sourced",skills:[],salary:"",location:"",workAuth:"",experience:"",source:"",ownerId:activeUser.id,collaborators:[],notes:[]};
  const [tempId] = useState(()=>initial?.id||(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`));
  const [f,setF]=useState({...(initial||E), id: initial?.id || tempId});
  const [si,setSi]=useState("");
  const [parsing,setParsing]=useState(false);
  const [pMsg,setPMsg]=useState(null);
  const [dupes,setDupes]=useState([]);
  const [dupeOk,setDupeOk]=useState(false);
  const fr=useRef();
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const chkDupe=(em,ph,nm)=>{if(dupeOk)return;setDupes(detectDupes(allCandidates,em,ph,f.id,nm||f.name));};
  const addSkill=(sk)=>{const t=(sk||si).trim();if(t&&!f.skills.includes(t))s("skills",[...f.skills,t]);setSi("");};
  const toggleCollab=(id)=>{const cur=f.collaborators||[];if(cur.includes(id)){s("collaborators",cur.filter(x=>x!==id));}else{if(cur.length>=2)return;s("collaborators",[...cur,id]);}};
  const handleFile=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    setParsing(true);setPMsg("Uploading & reading resume…");
    try{
      // Upload immediately to storage using the pre-generated candidate ID
      const ext=file.name.split(".").pop();
      const path=`${tempId}/${Date.now()}.${ext}`;
      const {supabase}=await import("./lib/supabase");
      const {error:upErr}=await supabase.storage.from("HCP One Resumes").upload(path,file,{upsert:true});
      if(!upErr) s("resumePath",path);
      // Now parse — determine media type
      const isPDF=file.type==="application/pdf"||file.name.endsWith(".pdf");
      const isDOCX=file.name.match(/\.docx?$/i)||file.type.includes("word");
      const isImage=file.type.startsWith("image/")||file.name.match(/\.(png|jpg|jpeg|webp)$/i);
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej(new Error("Read failed"));r.readAsDataURL(file);});
      setPMsg("AI extracting details…");
      const extractPrompt="Extract candidate info from this resume. Return ONLY valid JSON with these exact fields: name, email, phone, title, seniority (one of: Individual Contributor/Senior IC/Team Lead/Manager/Director/VP/SVP/C-Suite / Partner), experience, salary, location, workAuth (one of: US Citizen/Green Card/H-1B/H-4 EAD/L-1/TN Visa/OPT/CPT/EAD/EU Passport/EU Blue Card/Residence Permit/Requires Sponsorship/Other), skills (array of up to 8 most relevant skills), vertical (one of: Telecom / Wireless/AI / ML / Data/Cybersecurity/Software Engineering/Cloud / DevOps/Sales & Business Development/Directors & VPs/SVPs & C-Suite/Client Partners/Project / Program Mgmt/Network Engineering/Consulting). Only include fields you can confidently extract.";
      let messages;
      if(isPDF){
        messages=[{role:"user",content:[{type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}},{type:"text",text:extractPrompt}]}];
      } else if(isImage){
        const imgType=file.type||"image/jpeg";
        messages=[{role:"user",content:[{type:"image",source:{type:"base64",media_type:imgType,data:base64}},{type:"text",text:extractPrompt}]}];
      } else if(isDOCX){
        // Extract text from DOCX using mammoth npm package
        let docText="";
        try{
          const mammoth=await import("mammoth");
          const arrayBuffer=await file.arrayBuffer();
          const result=await mammoth.extractRawText({arrayBuffer});
          docText=result.value?.substring(0,4000)||"";
        }catch(me){
          // fallback: strip binary chars
          const ab=await file.arrayBuffer();
          docText=new TextDecoder("utf-8",{fatal:false}).decode(ab).replace(/[^\x20-\x7E\n\r]/g," ").replace(/\s+/g," ").substring(0,3000);
        }
        messages=[{role:"user",content:`${extractPrompt}\n\nResume text:\n${docText}`}];
      } else {
        messages=[{role:"user",content:`${extractPrompt}\n\nResume text:\n${atob(base64).replace(/[^\x20-\x7E\n]/g," ").substring(0,3000)}`}];
      }
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,messages})});
      const data=await res.json();
      if(data.error) throw new Error(data.error.message);
      const parsed=JSON.parse((data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim());
      const mapped={};
      if(parsed.name) mapped.name=parsed.name;
      if(parsed.email) mapped.email=parsed.email;
      if(parsed.phone) mapped.phone=parsed.phone;
      if(parsed.title) mapped.title=parsed.title;
      if(parsed.seniority) mapped.seniority=parsed.seniority;
      if(parsed.experience) mapped.experience=parsed.experience;
      if(parsed.salary) mapped.salary=parsed.salary;
      if(parsed.location) mapped.location=parsed.location;
      if(parsed.workAuth||parsed.work_auth) mapped.workAuth=parsed.workAuth||parsed.work_auth;
      if(parsed.skills?.length) mapped.skills=parsed.skills;
      if(parsed.vertical) mapped.vertical=parsed.vertical;
      if(!Object.keys(mapped).length){
        setPMsg(upErr?"⚠ Could not extract. Fill manually.":"✓ Resume saved. Could not extract details — fill manually.");
      } else {
        setF(prev=>({...prev,...mapped}));
        setPMsg(upErr?`✓ Extracted ${Object.keys(mapped).length} fields (resume save failed).`:`✓ Resume saved & ${Object.keys(mapped).length} fields extracted.`);
      }
    }catch(err){console.error("Parse error:",err);setPMsg("⚠ Failed: "+err.message);}
    setParsing(false);
  };
  const submit=async()=>{
    if(!f.name.trim()||!f.email.trim()) return alert("Name + email required.");
    if(dupes.length&&!dupeOk) return alert("Review duplicate warning first.");
    await onSave({...f,addedDate:f.addedDate||today(),lastUpdated:today(),submittedTo:f.submittedTo||[]});
  };
  return <div>
    {dupes.length>0&&!dupeOk&&<div style={{background:C.warnL,border:`1px solid ${C.warn}40`,borderRadius:9,padding:"12px 14px",marginBottom:16}}>
      <div style={{color:C.warn,fontWeight:700,fontSize:12,marginBottom:6}}>⚠ Possible Duplicate{dupes.length>1?"s":""}</div>
      {dupes.map(d=><div key={d.id} style={{color:C.gray600,fontSize:12,marginBottom:3}}>
        {d._fuzzy?"≈ Similar name:":"→ Exact match:"} <b style={{color:C.navy}}>{d.name}</b> · {d.email} · <StageBadge stage={d.stage}/>
      </div>)}
      <button onClick={()=>setDupeOk(true)} style={{marginTop:8,background:C.white,border:`1px solid ${C.warn}`,color:C.warn,borderRadius:6,padding:"4px 12px",fontSize:11,cursor:"pointer",fontWeight:600}}>Dismiss & Continue</button>
    </div>}
    <div
      data-dropzone="true"
      onClick={()=>!parsing&&fr.current?.click()}
      onDragEnter={e=>{e.preventDefault();e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.background=C.accentL;}}
      onDragOver={e=>e.preventDefault()}
      onDragLeave={e=>{e.preventDefault();e.currentTarget.style.borderColor=C.gray300;e.currentTarget.style.background=C.gray50;}}
      onDrop={e=>{e.preventDefault();e.stopPropagation();e.currentTarget.style.borderColor=C.gray300;e.currentTarget.style.background=C.gray50;const file=e.dataTransfer.files[0];if(file&&!parsing){const fakeEvent={target:{files:[file]}};handleFile(fakeEvent);}}}
      style={{background:C.gray50,border:`2px dashed ${C.gray300}`,borderRadius:10,padding:"16px",textAlign:"center",marginBottom:18,cursor:"pointer",transition:"all 0.15s"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.background=C.accentL;}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=C.gray300;e.currentTarget.style.background=C.gray50;}}>
      <input ref={fr} type="file" accept=".pdf,.doc,.docx,.txt" style={{display:"none"}} onChange={handleFile}/>
      <div style={{fontSize:20,marginBottom:4}}>{parsing?"...":"◇"}</div>
      <div style={{color:C.gray500,fontSize:12,fontWeight:500}}>{parsing?"Parsing…":"Upload Resume — AI Auto-Fill"}</div>
      {pMsg&&<div style={{marginTop:6,fontSize:11,fontWeight:600,color:pMsg.startsWith("✓")?C.success:pMsg.startsWith("⚠")?C.warn:C.accent}}>{pMsg}</div>}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px 16px"}}>
      <F label="Full Name *"><input style={inp} value={f.name} onChange={e=>{s("name",e.target.value);chkDupe(f.email,f.phone,e.target.value);}} placeholder="Full name"/></F>
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
    <Divider/>
    <div style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:10,padding:"14px 16px",marginBottom:16}}>
      <div style={{fontSize:11,fontWeight:600,color:C.gray500,letterSpacing:0.5,textTransform:"uppercase",marginBottom:12}}>Recruiter Assignment</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <div>
          <label style={{display:"block",color:C.gray600,fontSize:12,fontWeight:500,marginBottom:6}}>Primary Owner</label>
          <select style={sel} value={f.ownerId} onChange={e=>s("ownerId",e.target.value)}>{team.map(t=><option key={t.id} value={t.id}>{t.name} — {t.role}</option>)}</select>
        </div>
        <div>
          <label style={{display:"block",color:C.gray600,fontSize:12,fontWeight:500,marginBottom:6}}>Collaborators <span style={{color:(f.collaborators||[]).length>=2?C.pink:C.gray400}}>({(f.collaborators||[]).length}/2)</span></label>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {team.filter(t=>t.id!==f.ownerId).map(t=>{
              const active=(f.collaborators||[]).includes(t.id);
              const atMax=(f.collaborators||[]).length>=2&&!active;
              return <div key={t.id} onClick={()=>!atMax&&toggleCollab(t.id)} style={{display:"flex",alignItems:"center",gap:5,background:active?t.color:C.white,border:`1px solid ${active?t.color:C.gray300}`,borderRadius:6,padding:"4px 9px",cursor:atMax?"not-allowed":"pointer",opacity:atMax?0.4:1,transition:"all 0.15s"}}>
                <div style={{width:16,height:16,borderRadius:3,background:active?"rgba(255,255,255,0.3)":t.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:C.white}}>{t.initials}</div>
                <span style={{fontSize:10,color:active?C.white:C.gray600,fontWeight:active?600:400}}>{t.name.split(" ")[0]}</span>
                {active&&<span style={{color:C.white,fontSize:11}}>✓</span>}
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
    <div style={{marginBottom:16}}>
      <label style={{display:"block",color:C.gray500,fontSize:11,fontWeight:600,letterSpacing:0.3,marginBottom:8}}>Skills</label>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <input style={{...inp,flex:1}} value={si} onChange={e=>setSi(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),addSkill())} placeholder="Type skill + Enter…"/>
        <select style={{...sel,width:160}} onChange={e=>{if(e.target.value)addSkill(e.target.value);e.target.value=""}}><option value="">Quick-add…</option>{SKILLS_POOL.filter(x=>!f.skills.includes(x)).map(x=><option key={x}>{x}</option>)}</select>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,minHeight:24}}>
        {f.skills.map(x=><span key={x} style={{background:C.accentL,color:C.accent,borderRadius:5,padding:"3px 9px",fontSize:11,fontWeight:500,display:"inline-flex",alignItems:"center",gap:5}}>{x}<span onClick={()=>s("skills",f.skills.filter(k=>k!==x))} style={{cursor:"pointer",color:C.gray400,fontSize:13,lineHeight:1}}>×</span></span>)}
        {!f.skills.length&&<span style={{color:C.gray300,fontSize:12}}>No skills added yet</span>}
      </div>
    </div>
    <div style={{display:"flex",gap:10}}>
      <button onClick={submit} style={{flex:1,background:C.navy,color:C.white,border:"none",borderRadius:9,padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{initial?.id?"Save Changes":"Add Candidate"}</button>
      <button onClick={onClose} style={{background:C.white,color:C.gray500,border:`1px solid ${C.gray300}`,borderRadius:9,padding:"12px 20px",fontSize:13,cursor:"pointer"}}>Cancel</button>
    </div>
  </div>;
}

// ── CANDIDATE DETAIL ──────────────────────────────────────────────
function CandDetail({c,jobs,onEdit,onStageChange,onAddNote,onSubmitToJob,activeUser=TEAM_FALLBACK[0],onDelete,onResumeUpload}){
  const [note,setNote]=useState("");
  const [detTab,setDetTab]=useState("Notes");
  const [resumeUrl,setResumeUrl]=useState(null);
  const [uploadingResume,setUploadingResume]=useState(false);
  const [resumeMsg,setResumeMsg]=useState(null);
  const [dragging,setDragging]=useState(false);
  const resumeRef=useRef();
  const dragCounter=useRef(0);

  useEffect(()=>{
    if(c.resumePath){
      getResumeUrl(c.resumePath).then(setResumeUrl);
    } else {
      setResumeUrl(null);
    }
  },[c.resumePath]);

  const handleResumeDrop=async(file)=>{
    if(!file) return;
    const ok=file.name.match(/\.(pdf|doc|docx|png|jpg|jpeg|webp)$/i)||file.type.startsWith("image/");
    if(!ok) return setResumeMsg("⚠ PDF, DOCX, or image files only.");
    setUploadingResume(true);setResumeMsg("Uploading…");
    try{
      await onResumeUpload(c.id,file);
      setResumeMsg("✓ Resume uploaded.");
    }catch(e){setResumeMsg("⚠ Upload failed: "+e.message);}
    setUploadingResume(false);
  };
  const progress=STAGES.filter(s=>!["On Hold","Rejected"].includes(s));
  const si=STAGES.indexOf(c.stage);
  const assigned=jobs.filter(j=>j.submittedCandidates?.includes(c.id));
  const owner=getTeamMember(c.ownerId);
  const collabs=(c.collaborators||[]).map(getTeamMember).filter(Boolean);
  const post=()=>{if(!note.trim())return;onAddNote(c.id,note.trim());setNote("");};
  return <div>
    <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:20}}>
      <Avatar name={c.name} size={52} color={owner?.color}/>
      <div style={{flex:1}}>
        <div style={{fontSize:20,fontWeight:700,color:C.navy,fontFamily:"'DM Sans',sans-serif",letterSpacing:-0.3}}>{c.name}</div>
        <div style={{color:C.gray500,fontSize:13,marginTop:2}}>{c.title}{c.seniority?` · ${c.seniority}`:""}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
          <StageBadge stage={c.stage}/>
          {c.workAuth&&<Tag label={c.workAuth} color={C.success} bg={C.successL}/>}
          {c.vertical&&<Tag label={c.vertical} color={C.purple} bg={C.purpleL}/>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,flexShrink:0}}><button onClick={onEdit} style={{background:C.navy,color:C.white,border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Edit</button>{onDelete&&<button onClick={()=>onDelete(c.id)} style={{background:C.dangerL,color:C.danger,border:`1px solid ${C.danger}30`,borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Delete</button>}</div>
    </div>
    <div style={{background:owner?owner.color+"08":C.gray50,border:`1px solid ${owner?owner.color+"30":C.gray200}`,borderRadius:10,padding:"14px 16px",marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {owner?<>
            <div style={{width:40,height:40,borderRadius:10,background:owner.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:C.white,flexShrink:0}}>{owner.initials}</div>
            <div>
              <div style={{color:C.gray400,fontSize:10,fontWeight:600,letterSpacing:0.8,textTransform:"uppercase",marginBottom:2}}>Candidate Owner</div>
              <div style={{color:owner.color,fontSize:15,fontWeight:700}}>{owner.name}</div>
              <div style={{color:C.gray500,fontSize:11}}>{owner.role}</div>
            </div>
          </>:<span style={{color:C.gray400,fontSize:12}}>No owner assigned</span>}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}>
          <div style={{color:C.gray400,fontSize:10,fontWeight:600,letterSpacing:0.8,textTransform:"uppercase"}}>Collaborators ({collabs.length}/2)</div>
          {collabs.length>0?<div style={{display:"flex",gap:7}}>
            {collabs.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:6,background:t.color+"15",border:`1px solid ${t.color}40`,borderRadius:7,padding:"5px 10px"}}>
              <div style={{width:22,height:22,borderRadius:5,background:t.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:C.white}}>{t.initials}</div>
              <div><div style={{color:t.color,fontSize:11,fontWeight:600}}>{t.name}</div><div style={{color:C.gray400,fontSize:9}}>{t.role}</div></div>
            </div>)}
          </div>:<span style={{color:C.gray300,fontSize:11}}>No collaborators</span>}
        </div>
      </div>
    </div>
    <div style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:10,padding:"14px 16px",marginBottom:18}}>
      <div style={{color:C.gray400,fontSize:10,fontWeight:600,letterSpacing:0.8,textTransform:"uppercase",marginBottom:10}}>Pipeline — click to advance</div>
      <div style={{display:"flex",gap:0}}>
        {progress.map(st=>{const idx=STAGES.indexOf(st);const done=idx<si&&!["On Hold","Rejected"].includes(c.stage);const cur=st===c.stage;const m=SM[st];
          return <div key={st} onClick={()=>onStageChange(c.id,st)} style={{flex:1,cursor:"pointer",textAlign:"center",padding:"0 1px"}}>
            <div style={{height:4,borderRadius:2,background:done||cur?m.c:C.gray200,marginBottom:4,transition:"background 0.2s"}}/>
            <div style={{fontSize:8,color:cur?m.c:done?C.gray400:C.gray300,fontWeight:cur?700:500,lineHeight:1.2}}>{st}</div>
          </div>;
        })}
      </div>
      <div style={{display:"flex",gap:6,marginTop:8}}>
        {["On Hold","Rejected"].map(st=><span key={st} onClick={()=>onStageChange(c.id,st,c.stage)} style={{cursor:"pointer",background:c.stage===st?SM[st].bg:C.white,color:SM[st].c,border:`1px solid ${SM[st].c}40`,borderRadius:6,padding:"4px 12px",fontSize:11,fontWeight:600}}>{st}{c.stage===st?" ✓":""}</span>)}
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
      {[["Email",c.email],["Phone",c.phone],["Location",c.location],["Salary/Rate",c.salary],["Experience",c.experience],["Source",c.source],["Work Auth",c.workAuth],["Seniority",c.seniority],["Added",c.addedDate]].map(([k,v])=>(
        <div key={k} style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:8,padding:"10px 12px"}}>
          <div style={{color:C.gray400,fontSize:10,textTransform:"uppercase",letterSpacing:0.5,fontWeight:600,marginBottom:3}}>{k}</div>
          {k==="Email"&&v
            ?<a href={`mailto:${v}?subject=${encodeURIComponent(`Exciting Opportunity – ${c.title||"Role"}`)}&body=${encodeURIComponent(`Hi ${c.name?.split(" ")[0]||""},\n\nI hope you're doing well! I wanted to reach out regarding an exciting opportunity that I believe would be a great fit for your background.\n\nWould you be open to a quick call this week?\n\nBest regards,\n${activeUser.name}`)}`} onClick={()=>onAddNote&&onAddNote(c.id,`Email sent to ${v}`)} style={{color:C.accent,fontSize:12,fontWeight:500,textDecoration:"none",wordBreak:"break-all"}}>{v} ✉</a>
            :<div style={{color:v?C.navy:C.gray300,fontSize:12,fontWeight:500,wordBreak:"break-all"}}>{v||"—"}</div>}
        </div>
      ))}
    </div>
    {c.linkedin&&<div style={{marginBottom:14}}><a href={`https://${c.linkedin.replace(/^https?:\/\//,"")}`} target="_blank" rel="noreferrer" style={{color:C.accent,fontSize:12,fontWeight:500}}>🔗 {c.linkedin}</a></div>}
    {/* Resume section */}
    <div style={{marginBottom:16}}>
      <div style={{color:C.gray400,fontSize:10,fontWeight:600,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Resume</div>
      {c.resumePath?(
        <div style={{background:C.successL,border:`1px solid ${C.success}30`,borderRadius:9,padding:"11px 14px",display:"flex",alignItems:"center",gap:10}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div style={{flex:1}}>
            <div style={{color:C.success,fontSize:12,fontWeight:600}}>Resume on file</div>
            <div style={{color:C.gray400,fontSize:11}}>Uploaded</div>
          </div>
          {resumeUrl&&<a href={resumeUrl} target="_blank" rel="noreferrer" style={{background:C.success,color:C.white,borderRadius:7,padding:"6px 14px",fontSize:11,fontWeight:600,textDecoration:"none"}}>View PDF</a>}
          {onResumeUpload&&<div onClick={()=>resumeRef.current?.click()} style={{background:C.white,color:C.gray500,border:`1px solid ${C.gray200}`,borderRadius:7,padding:"6px 12px",fontSize:11,fontWeight:500,cursor:"pointer"}}>Replace</div>}
        </div>
      ):(
        <div
          data-dropzone="true"
          onDragEnter={e=>{e.preventDefault();dragCounter.current++;setDragging(true);}}
          onDragOver={e=>e.preventDefault()}
          onDragLeave={e=>{e.preventDefault();dragCounter.current--;if(dragCounter.current===0)setDragging(false);}}
          onDrop={e=>{e.preventDefault();e.stopPropagation();dragCounter.current=0;setDragging(false);const f=e.dataTransfer.files[0];if(f)handleResumeDrop(f);}}
          onClick={()=>onResumeUpload&&resumeRef.current?.click()}
          style={{background:dragging?C.accentL:C.gray50,border:`2px dashed ${dragging?C.accent:C.danger+"50"}`,borderRadius:9,padding:"20px",textAlign:"center",cursor:onResumeUpload?"pointer":"default",transition:"all 0.15s"}}>
          <div style={{fontSize:24,marginBottom:6}}>📎</div>
          <div style={{color:C.danger,fontSize:12,fontWeight:600}}>No resume on file</div>
          {onResumeUpload&&<div style={{color:C.gray400,fontSize:11,marginTop:4}}>{dragging?"Drop to upload":"Click or drag & drop — PDF, DOCX, or image"}</div>}
        </div>
      )}
      <input ref={resumeRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)handleResumeDrop(f);}}/>
      {resumeMsg&&<div style={{marginTop:6,fontSize:11,fontWeight:600,color:resumeMsg.startsWith("✓")?C.success:C.warn}}>{resumeMsg}</div>}
    </div>

    {c.skills?.length>0&&<div style={{marginBottom:16}}>
      <div style={{color:C.gray400,fontSize:10,fontWeight:600,letterSpacing:0.8,textTransform:"uppercase",marginBottom:7}}>Skills</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{c.skills.map(x=><span key={x} style={{background:C.accentL,color:C.accent,borderRadius:5,padding:"3px 9px",fontSize:11,fontWeight:500}}>{x}</span>)}</div>
    </div>}
    <div style={{marginBottom:16}}>
      <div style={{color:C.gray400,fontSize:10,fontWeight:600,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Submitted to Roles ({assigned.length})</div>
      {!assigned.length&&<div style={{color:C.gray300,fontSize:12,padding:"6px 0"}}>Not submitted to any role yet.</div>}
      {assigned.map(j=><div key={j.id} style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:8,padding:"10px 13px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{color:C.navy,fontSize:13,fontWeight:600}}>{j.title}</div><div style={{color:C.gray400,fontSize:11,marginTop:1}}>{j.client} · {j.location}</div></div>
        <JobBadge status={j.status}/>
      </div>)}
      <select style={{...sel,fontSize:12,marginTop:6}} onChange={e=>{if(e.target.value){onSubmitToJob(c.id,e.target.value);e.target.value="";}}} defaultValue="">
        <option value="">+ Submit to another role…</option>
        {jobs.filter(j=>!j.submittedCandidates?.includes(c.id)&&!["Filled","Closed"].includes(j.status)).map(j=><option key={j.id} value={j.id}>{j.title} — {j.client}</option>)}
      </select>
    </div>
    <div>
      {/* Tab bar */}
      <div style={{display:"flex",gap:0,borderBottom:`2px solid ${C.gray100}`,marginBottom:14}}>
        {["Notes","Timeline","Scorecard"].map(t=><button key={t} onClick={()=>setDetTab(t)} style={{background:"none",border:"none",borderBottom:`2px solid ${detTab===t?C.accent:"transparent"}`,marginBottom:-2,padding:"8px 16px",fontSize:12,fontWeight:detTab===t?700:500,color:detTab===t?C.accent:C.gray400,cursor:"pointer"}}>{t==="Scorecard"?"Scorecard":t==="Timeline"?"Timeline":"Notes"}{t==="Notes"&&c.notes?.length?<span style={{background:C.accentL,color:C.accent,borderRadius:8,padding:"1px 6px",fontSize:10,marginLeft:5,fontWeight:700}}>{c.notes.length}</span>:null}</button>)}
      </div>

      {detTab==="Notes"&&<>
        <div style={{maxHeight:200,overflowY:"auto",marginBottom:8,display:"flex",flexDirection:"column",gap:6}}>
          {!c.notes?.length&&<div style={{color:C.gray300,fontSize:12}}>No notes yet.</div>}
          {c.notes?.map((n,i)=>{const t=getTeamMember(n.authorId);return <div key={i} style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:8,padding:"10px 12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {t&&<div style={{width:18,height:18,borderRadius:4,background:t.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7.5,fontWeight:700,color:C.white}}>{t.initials}</div>}
                <span style={{color:t?.color||C.accent,fontSize:11,fontWeight:600}}>{n.author}</span>
              </div>
              <span style={{color:C.gray300,fontSize:10}}>{n.date}</span>
            </div>
            <div style={{color:C.gray600,fontSize:12,lineHeight:1.6}}>{n.text}</div>
          </div>;})}
        </div>
        <div style={{display:"flex",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:7,flex:1}}>
            <RecruiterBadge id={activeUser.id} size={24}/>
            <input style={{...inp,flex:1}} value={note} onChange={e=>setNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&post()} placeholder={`Add note as ${activeUser.name}…`}/>
          </div>
          <button onClick={post} style={{background:C.navy,color:C.white,border:"none",borderRadius:8,padding:"0 16px",fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0}}>Post</button>
        </div>
      </>}

      {detTab==="Timeline"&&<div style={{maxHeight:320,overflowY:"auto"}}><ActivityTimeline candidateId={c.id}/></div>}

      {detTab==="Scorecard"&&<ScorecardPanel candidateId={c.id} jobs={jobs} activeUser={activeUser}/>}
    </div>
  </div>;
}

// ── JOB FORM ──────────────────────────────────────────────────────
function JobForm({initial,onSave,onClose,activeUser=TEAM_FALLBACK[0],team=TEAM_FALLBACK}){
  const E={title:"",client:"",spoc:"",location:"",empType:"Full-Time",salary:"",priority:"P1",status:"Open – Sourcing",reqDate:today(),submitted:0,interviewed:0,offers:0,jd:"",notes:[],submittedCandidates:[],assignedRecruiters:[activeUser.id]};
  const [f,setF]=useState(initial||E);
  const [gen,setGen]=useState(false);
  const [jdDragging,setJdDragging]=useState(false);
  const [jdMsg,setJdMsg]=useState(null);
  const jdDragCounter=useRef(0);
  const jdRef=useRef();
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const toggleR=(id)=>{const cur=f.assignedRecruiters||[];s("assignedRecruiters",cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]);};
  const handleJDFile=async(file)=>{
    if(!file) return;
    setJdMsg("Extracting text…");
    try{
      const isPDF=file.type==="application/pdf"||file.name.endsWith(".pdf");
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej(r.error);r.readAsDataURL(file);});
      if(isPDF){
        const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2000,messages:[{role:"user",content:[{type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}},{type:"text",text:"Extract the full job description text from this document. Return only the plain text content, no commentary."}]}]})});
        const data=await res.json();
        if(data.error) throw new Error(data.error.message);
        s("jd",data.content?.[0]?.text||"");
        setJdMsg("✓ JD extracted from PDF.");
      } else {
        // For text/docx try reading as text
        const text=await file.text().catch(()=>null);
        if(text){s("jd",text);setJdMsg("✓ Text extracted.");}
        else setJdMsg("⚠ Could not read file. Try a PDF or paste directly.");
      }
    }catch(e){setJdMsg("⚠ Failed: "+e.message);}
  };
  const genJD=async()=>{
    if(!f.title||!f.client) return alert("Enter title and client first.");
    setGen(true);
    try{const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:900,messages:[{role:"user",content:`Write a professional job description. Role: ${f.title}. Client: ${f.client}. Location: ${f.location||"TBD"}. Pay: ${f.salary||"Competitive"}. Type: ${f.empType}. Sections: About the Role, Responsibilities (4 bullets), Required Qualifications (4 bullets), Nice to Have, Compensation. Plain text, use • for bullets.`}]})});const d=await res.json();s("jd",d.content?.[0]?.text||"");}
    catch{alert("JD generation failed.");}
    setGen(false);
  };
  const submit=()=>{if(!f.title.trim()||!f.client.trim()) return alert("Title and client required.");onSave({...f,id:f.id||Date.now()});};
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px 16px"}}>
      <F label="Job Title *" span2><input style={inp} value={f.title} onChange={e=>s("title",e.target.value)} placeholder="AI Penetration Tester"/></F>
      <F label="Client *"><input style={inp} value={f.client} onChange={e=>s("client",e.target.value)} placeholder="Happiest Minds…"/></F>
      <F label="Client SPOC"><input style={inp} value={f.spoc} onChange={e=>s("spoc",e.target.value)} placeholder="Praveen T…"/></F>
      <F label="Location"><input style={inp} value={f.location} onChange={e=>s("location",e.target.value)} placeholder="US, Poland…"/></F>
      <F label="Employment Type"><select style={sel} value={f.empType} onChange={e=>s("empType",e.target.value)}>{EMP_TYPES.map(x=><option key={x}>{x}</option>)}</select></F>
      <F label="Salary / Bill Rate"><input style={inp} value={f.salary} onChange={e=>s("salary",e.target.value)} placeholder="$73/hr or 160–180K"/></F>
      <F label="Status"><select style={sel} value={f.status} onChange={e=>s("status",e.target.value)}>{JOB_STATUSES.map(x=><option key={x}>{x}</option>)}</select></F>
      <F label="Priority"><select style={sel} value={f.priority} onChange={e=>s("priority",e.target.value)}><option>P1</option><option>P2</option><option>P3</option></select></F>
    </div>
    <Divider/>
    <div style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:9,padding:"13px 15px",marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:600,color:C.gray500,letterSpacing:0.5,textTransform:"uppercase",marginBottom:10}}>Assigned Recruiters</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {team.map(t=>{const active=(f.assignedRecruiters||[]).includes(t.id);return <div key={t.id} onClick={()=>toggleR(t.id)} style={{display:"flex",alignItems:"center",gap:6,background:active?t.color:C.white,border:`1px solid ${active?t.color:C.gray300}`,borderRadius:7,padding:"5px 11px",cursor:"pointer",transition:"all 0.15s"}}>
          <div style={{width:18,height:18,borderRadius:4,background:active?"rgba(255,255,255,0.3)":t.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:C.white}}>{t.initials}</div>
          <span style={{fontSize:11,color:active?C.white:C.gray600,fontWeight:active?600:400}}>{t.name.split(" ")[0]}</span>
        </div>;})}
      </div>
    </div>
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <label style={{color:C.gray500,fontSize:11,fontWeight:600,letterSpacing:0.3}}>Job Description</label>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {jdMsg&&<span style={{fontSize:11,fontWeight:600,color:jdMsg.startsWith("✓")?C.success:C.warn}}>{jdMsg}</span>}
          <button onClick={()=>jdRef.current?.click()} style={{background:C.gray100,color:C.gray600,border:`1px solid ${C.gray200}`,borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:500}}>📎 Drop File</button>
          <button onClick={genJD} disabled={gen} style={{background:C.accentL,color:C.accent,border:`1px solid ${C.accent}30`,borderRadius:6,padding:"4px 12px",fontSize:11,cursor:"pointer",fontWeight:600}}>{gen?"Generating…":"✨ AI Generate"}</button>
        </div>
      </div>
      <input ref={jdRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)handleJDFile(f);}}/>
      <div
        data-dropzone="true"
        onDragEnter={e=>{e.preventDefault();jdDragCounter.current++;setJdDragging(true);}}
        onDragOver={e=>e.preventDefault()}
        onDragLeave={e=>{e.preventDefault();jdDragCounter.current--;if(jdDragCounter.current===0)setJdDragging(false);}}
        onDrop={e=>{e.preventDefault();e.stopPropagation();jdDragCounter.current=0;setJdDragging(false);const file=e.dataTransfer.files[0];if(file)handleJDFile(file);}}
        style={{position:"relative",borderRadius:8,border:`2px solid ${jdDragging?C.accent:C.gray200}`,transition:"border 0.15s",background:jdDragging?C.accentL:C.white}}>
        {jdDragging&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:C.accentL+"cc",borderRadius:7,zIndex:2,fontSize:13,fontWeight:600,color:C.accent,pointerEvents:"none"}}>Drop to extract JD</div>}
        <textarea style={{...ta,minHeight:140,fontFamily:"monospace",fontSize:12,border:"none",borderRadius:8,background:"transparent",width:"100%",boxSizing:"border-box"}} value={f.jd} onChange={e=>s("jd",e.target.value)} placeholder="Paste JD, drop a PDF/DOCX, or use AI Generate…"/>
      </div>
    </div>
    <div style={{display:"flex",gap:10}}>
      <button onClick={submit} style={{flex:1,background:C.navy,color:C.white,border:"none",borderRadius:9,padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{initial?.id?"Save Changes":"Create Job Order"}</button>
      <button onClick={onClose} style={{background:C.white,color:C.gray500,border:`1px solid ${C.gray300}`,borderRadius:9,padding:"12px 20px",fontSize:13,cursor:"pointer"}}>Cancel</button>
    </div>
  </div>;
}

// ── JOB DETAIL ────────────────────────────────────────────────────
function JobDetail({job,candidates,onEdit,onStatusChange,onAddNote,onRemove,onOpenCand,activeUser=TEAM_FALLBACK[0],onDelete}){
  const [note,setNote]=useState("");
  const [showJD,setShowJD]=useState(false);
  const [matching,setMatching]=useState(false);
  const [matches,setMatches]=useState(null);
  const submitted=candidates.filter(c=>job.submittedCandidates?.includes(c.id));
  const PC={"P1":C.danger,"P2":C.warn,"P3":C.gray400};
  const post=()=>{if(!note.trim())return;onAddNote(job.id,note.trim());setNote("");};

  const findMatches=async()=>{
    setMatching(true);setMatches(null);
    try{
      // Build a lean candidate list for the prompt (no resumes, just key fields)
      const candList=candidates
        .filter(c=>!["Placed","Rejected"].includes(c.stage))
        .map(c=>({id:c.id,name:c.name,title:c.title,seniority:c.seniority,skills:(c.skills||[]).join(", "),workAuth:c.workAuth,location:c.location,experience:c.experience,vertical:c.vertical,stage:c.stage,salary:c.salary}));
      const prompt=`You are a recruiting AI. Match candidates to this job and return ONLY valid JSON — an array of exactly 5 objects, no markdown.

JOB:
Title: ${job.title}
Client: ${job.client}
Location: ${job.location||"Flexible"}
Type: ${job.empType}
Salary: ${job.salary||"Not specified"}
JD: ${job.jd||"Not provided"}

CANDIDATES (${candList.length} total):
${JSON.stringify(candList)}

Return JSON array of top 5 matches:
[{"id":"candidate_uuid","name":"name","matchScore":85,"reason":"2-sentence reason why they fit","strengths":["skill1","skill2"],"concerns":"any concern or null"}]

Score 0-100. Consider: title match, skills, seniority, work auth, location, experience. Be specific in reasons.`;

      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      if(data.error) throw new Error(data.error.message);
      const raw=data.content?.[0]?.text||"[]";
      const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());
      setMatches(parsed);
    }catch(e){setMatches([{error:e.message}]);}
    setMatching(false);
  };
  return <div>
    <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:18}}>
      <div style={{flex:1}}>
        <div style={{fontSize:19,fontWeight:700,color:C.navy,fontFamily:"'DM Sans',sans-serif",letterSpacing:-0.3,lineHeight:1.25,marginBottom:4}}>{job.title}</div>
        <div style={{color:C.gray500,fontSize:13}}>{job.client}{job.spoc?` · SPOC: ${job.spoc}`:""}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
          <JobBadge status={job.status}/>
          {job.empType&&<Tag label={job.empType} color={C.accent} bg={C.accentL}/>}
          {job.priority&&<span style={{color:PC[job.priority]||C.gray400,background:(PC[job.priority]||C.gray400)+"15",borderRadius:5,padding:"3px 8px",fontSize:11,fontWeight:700}}>{job.priority}</span>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,flexShrink:0}}><button onClick={onEdit} style={{background:C.navy,color:C.white,border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Edit</button>{onDelete&&<button onClick={()=>onDelete(job.id)} style={{background:C.dangerL,color:C.danger,border:`1px solid ${C.danger}30`,borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Delete</button>}</div>
    </div>
    {(job.assignedRecruiters||[]).length>0&&<div style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:9,padding:"11px 14px",marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:600,color:C.gray400,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Assigned Recruiters</div>
      <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
        {(job.assignedRecruiters||[]).map(id=>{const t=getTeamMember(id);if(!t)return null;return <div key={id} style={{display:"flex",alignItems:"center",gap:7,background:t.color+"15",border:`1px solid ${t.color}30`,borderRadius:7,padding:"5px 11px"}}>
          <div style={{width:20,height:20,borderRadius:5,background:t.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8.5,fontWeight:700,color:C.white}}>{t.initials}</div>
          <span style={{fontSize:12,color:t.color,fontWeight:600}}>{t.name}</span>
        </div>;})}
      </div>
    </div>}
    <div style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:9,padding:"11px 14px",marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:600,color:C.gray400,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Status — click to change</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {JOB_STATUSES.map(st=>{const m=JSM[st]||JSM["Open – Sourcing"];return <span key={st} onClick={()=>onStatusChange(job.id,st)} style={{cursor:"pointer",background:job.status===st?m.bg:C.white,color:job.status===st?m.c:C.gray400,border:`1px solid ${job.status===st?m.c+"50":C.gray200}`,borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:600,transition:"all 0.15s"}}>{st}</span>;})}
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
      {[["Location",job.location],["Salary/Rate",job.salary],["SPOC",job.spoc],["Type",job.empType],["Req Date",job.reqDate],["Priority",job.priority],["Submitted",job.submitted],["Interviewed",job.interviewed],["Offers",job.offers]].map(([k,v])=>(
        <div key={k} style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:8,padding:"9px 11px"}}>
          <div style={{color:C.gray400,fontSize:10,textTransform:"uppercase",letterSpacing:0.5,fontWeight:600,marginBottom:3}}>{k}</div>
          <div style={{color:(v!=null&&v!="")?C.navy:C.gray300,fontSize:12,fontWeight:500}}>{(v!=null&&v!="")?v:"—"}</div>
        </div>
      ))}
    </div>
    {job.jd&&<div style={{marginBottom:14}}>
      <button onClick={()=>setShowJD(!showJD)} style={{background:C.gray50,color:C.gray500,border:`1px solid ${C.gray200}`,borderRadius:7,padding:"7px 14px",fontSize:12,cursor:"pointer",fontWeight:500,marginBottom:showJD?8:0}}>{showJD?"▲ Hide JD":"▼ View Job Description"}</button>
      {showJD&&<div style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:9,padding:"14px 16px",whiteSpace:"pre-wrap",fontSize:12,color:C.gray600,lineHeight:1.7,fontFamily:"monospace",maxHeight:250,overflowY:"auto"}}>{job.jd}</div>}
    </div>}
    <div style={{marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:600,color:C.gray400,letterSpacing:0.8,textTransform:"uppercase",marginBottom:9}}>Submitted Candidates ({submitted.length})</div>
      {!submitted.length&&<div style={{color:C.gray300,fontSize:12,padding:"6px 0"}}>No candidates submitted yet.</div>}
      {submitted.map(c=>{const o=getTeamMember(c.ownerId);return <div key={c.id} onClick={()=>onOpenCand(c)} style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:9,padding:"10px 13px",marginBottom:7,display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"all 0.15s",boxShadow:"0 1px 2px rgba(0,0,0,0.04)"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.boxShadow=`0 2px 8px ${C.accent}18`;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.gray200;e.currentTarget.style.boxShadow="0 1px 2px rgba(0,0,0,0.04)";}}>
        <Avatar name={c.name} size={30} color={o?.color}/>
        <div style={{flex:1}}><div style={{color:C.navy,fontSize:13,fontWeight:600}}>{c.name}</div><div style={{color:C.gray400,fontSize:11,marginTop:1}}>{c.title} · {c.workAuth||c.location}</div></div>
        <StageBadge stage={c.stage}/>
        <span style={{fontSize:11,color:C.gray500,minWidth:70,textAlign:"right"}}>{c.salary||"—"}</span>
        {o&&<RecruiterBadge id={c.ownerId} size={20}/>}
        <button onClick={e=>{e.stopPropagation();onRemove(job.id,c.id);}} style={{background:"transparent",color:C.gray300,border:"none",fontSize:16,cursor:"pointer",padding:"2px 6px"}}>×</button>
      </div>;})}
    </div>
    {/* AI Matching */}
    <div style={{background:`linear-gradient(135deg,${C.navy}08,${C.accent}08)`,border:`1px solid ${C.accent}30`,borderRadius:12,padding:"14px 16px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:matches?12:0}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:C.navy}}>🤖 AI Candidate Matching</div>
          <div style={{fontSize:11,color:C.gray400,marginTop:1}}>Surfaces your top 5 pipeline matches for this role</div>
        </div>
        <button onClick={findMatches} disabled={matching} style={{background:matching?C.gray100:C.navy,color:matching?C.gray400:C.white,border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:matching?"not-allowed":"pointer",flexShrink:0,display:"flex",alignItems:"center",gap:6}}>
          {matching?<><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span> Matching…</>:"✨ Find Matches"}
        </button>
      </div>
      {matches&&matches[0]?.error&&<div style={{color:C.danger,fontSize:12,marginTop:8}}>⚠ {matches[0].error}</div>}
      {matches&&!matches[0]?.error&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
        {matches.map((m,i)=>{
          const cand=candidates.find(c=>c.id===m.id);
          const scoreColor=m.matchScore>=80?C.success:m.matchScore>=60?C.warn:C.danger;
          return <div key={m.id||i} onClick={()=>cand&&onOpenCand(cand)} style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:10,padding:"12px 14px",cursor:cand?"pointer":"default",transition:"all 0.15s"}} onMouseEnter={e=>{if(cand){e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.boxShadow=`0 2px 10px ${C.accent}15`;}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.gray200;e.currentTarget.style.boxShadow="none";}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
              <div style={{width:28,height:28,borderRadius:7,background:scoreColor+"20",border:`2px solid ${scoreColor}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:scoreColor,flexShrink:0}}>{i+1}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{color:C.navy,fontSize:13,fontWeight:700}}>{m.name}</div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{background:scoreColor+"20",color:scoreColor,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>{m.matchScore}% match</div>
                    {cand&&<StageBadge stage={cand.stage}/>}
                  </div>
                </div>
                {cand&&<div style={{color:C.gray400,fontSize:11,marginTop:1}}>{cand.title} · {cand.workAuth} · {cand.location}</div>}
              </div>
            </div>
            <div style={{fontSize:12,color:C.gray600,lineHeight:1.5,marginBottom:m.strengths?.length?6:0}}>{m.reason}</div>
            {m.strengths?.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:m.concerns?4:0}}>
              {m.strengths.map(s=><span key={s} style={{background:C.successL,color:C.success,borderRadius:5,padding:"2px 7px",fontSize:10,fontWeight:600}}>✓ {s}</span>)}
            </div>}
            {m.concerns&&<div style={{fontSize:11,color:C.warn,marginTop:2}}>⚠ {m.concerns}</div>}
          </div>;
        })}
      </div>}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
    <div>
      <div style={{fontSize:10,fontWeight:600,color:C.gray400,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Team Notes · {job.notes?.length||0}</div>
      <div style={{maxHeight:140,overflowY:"auto",marginBottom:8,display:"flex",flexDirection:"column",gap:6}}>
        {!job.notes?.length&&<div style={{color:C.gray300,fontSize:12}}>No notes yet.</div>}
        {job.notes?.map((n,i)=>{const t=getTeamMember(n.authorId);return <div key={i} style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:8,padding:"9px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              {t&&<div style={{width:16,height:16,borderRadius:4,background:t.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:700,color:C.white}}>{t.initials}</div>}
              <span style={{color:t?.color||C.accent,fontSize:11,fontWeight:600}}>{n.author}</span>
            </div>
            <span style={{color:C.gray300,fontSize:10}}>{n.date}</span>
          </div>
          <div style={{color:C.gray600,fontSize:12,lineHeight:1.6}}>{n.text}</div>
        </div>;})}
      </div>
      <div style={{display:"flex",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:7,flex:1}}>
          <RecruiterBadge id={activeUser.id} size={22}/>
          <input style={{...inp,flex:1}} value={note} onChange={e=>setNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&post()} placeholder={`Add note as ${activeUser.name}…`}/>
        </div>
        <button onClick={post} style={{background:C.navy,color:C.white,border:"none",borderRadius:8,padding:"0 15px",fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0}}>Post</button>
      </div>
    </div>
  </div>;
}

// ── ACTIVITY TIMELINE ─────────────────────────────────────────────
const ACTIVITY_ICONS={created:"●",stage_change:"→",note:"◆",email:"@",resume:"◇",job_submit:"▸",edit:"✎"};
const ACTIVITY_COLORS={created:C.success,stage_change:C.accent,note:C.purple,email:C.orange,resume:C.warn,job_submit:C.pink,edit:C.gray400};
function ActivityTimeline({candidateId}){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    fetchActivity(candidateId).then(d=>{setItems(d);setLoading(false);}).catch(()=>setLoading(false));
  },[candidateId]);
  if(loading) return <div style={{color:C.gray400,fontSize:12,textAlign:"center",padding:16}}>Loading activity…</div>;
  if(!items.length) return <div style={{color:C.gray400,fontSize:12,textAlign:"center",padding:16}}>No activity recorded yet.</div>;
  return <div style={{display:"flex",flexDirection:"column",gap:0}}>
    {items.map((item,i)=>{
      const color=ACTIVITY_COLORS[item.type]||C.gray400;
      const icon=ACTIVITY_ICONS[item.type]||"•";
      const date=new Date(item.created_at);
      const timeStr=date.toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
      return <div key={item.id} style={{display:"flex",gap:12,position:"relative"}}>
        {i<items.length-1&&<div style={{position:"absolute",left:15,top:28,bottom:0,width:2,background:C.gray100}}/>}
        <div style={{width:30,height:30,borderRadius:"50%",background:color+"20",border:`2px solid ${color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,zIndex:1}}>{icon}</div>
        <div style={{flex:1,paddingBottom:14,paddingTop:4}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
            <div style={{fontSize:12,color:C.navy,fontWeight:500,lineHeight:1.4}}>{item.detail}</div>
            <div style={{fontSize:10,color:C.gray400,flexShrink:0,fontWeight:500}}>{timeStr}</div>
          </div>
          <div style={{fontSize:11,color:C.gray400,marginTop:2}}>{item.actor_name}</div>
        </div>
      </div>;
    })}
  </div>;
}

// ── SCORECARD ─────────────────────────────────────────────────────
const RECOMMENDATIONS=["Strong Yes","Yes","Maybe","No"];
const INTERVIEW_TYPES=["Phone Screen","Technical","Client Interview","Final Round","Reference Check"];
const RATING_LABELS=["","Poor","Below Avg","Average","Good","Excellent"];
function ScorecardPanel({candidateId,jobs,activeUser}){
  const [cards,setCards]=useState([]);
  const [loading,setLoading]=useState(true);
  const [adding,setAdding]=useState(false);
  const blank={candidateId,jobId:"",interviewType:"Phone Screen",rating:3,strengths:"",concerns:"",recommendation:"Yes",notes:""};
  const [form,setForm]=useState(blank);
  const [saving,setSaving]=useState(false);
  const sf=(k,v)=>setForm(p=>({...p,[k]:v}));
  useEffect(()=>{
    fetchScorecards(candidateId).then(d=>{setCards(d);setLoading(false);}).catch(()=>setLoading(false));
  },[candidateId]);
  const save=async()=>{
    setSaving(true);
    try{
      await upsertScorecard({...form,recruiterId:activeUser.id,recruiterName:activeUser.name});
      const d=await fetchScorecards(candidateId);setCards(d);
      setAdding(false);setForm(blank);
    }catch(e){alert("Save failed: "+e.message);}
    setSaving(false);
  };
  const del=async(id)=>{if(!window.confirm("Delete scorecard?"))return;await deleteScorecard(id);const d=await fetchScorecards(candidateId);setCards(d);};
  const recColor={["Strong Yes"]:C.success,["Yes"]:C.accent,["Maybe"]:C.warn,["No"]:C.danger};
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{fontSize:13,fontWeight:600,color:C.navy}}>Scorecards <span style={{color:C.gray400,fontWeight:400}}>({cards.length})</span></div>
      <button onClick={()=>setAdding(p=>!p)} style={{background:adding?C.gray100:C.navy,color:adding?C.gray600:C.white,border:`1px solid ${adding?C.gray300:"transparent"}`,borderRadius:7,padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{adding?"Cancel":"+ Add Scorecard"}</button>
    </div>
    {adding&&<div style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:10,padding:16,marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px",marginBottom:12}}>
        <F label="Job Order"><select style={sel} value={form.jobId} onChange={e=>sf("jobId",e.target.value)}><option value="">No specific job</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.title} @ {j.client}</option>)}</select></F>
        <F label="Interview Type"><select style={sel} value={form.interviewType} onChange={e=>sf("interviewType",e.target.value)}>{INTERVIEW_TYPES.map(t=><option key={t}>{t}</option>)}</select></F>
        <F label="Recommendation"><select style={sel} value={form.recommendation} onChange={e=>sf("recommendation",e.target.value)}>{RECOMMENDATIONS.map(r=><option key={r}>{r}</option>)}</select></F>
        <F label={`Rating — ${RATING_LABELS[form.rating]}`}>
          <div style={{display:"flex",gap:6,marginTop:4}}>
            {[1,2,3,4,5].map(n=><div key={n} onClick={()=>sf("rating",n)} style={{width:32,height:32,borderRadius:8,background:n<=form.rating?C.accent:C.gray100,color:n<=form.rating?C.white:C.gray400,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,cursor:"pointer",fontWeight:700,border:`1px solid ${n<=form.rating?C.accent:C.gray200}`}}>★</div>)}
          </div>
        </F>
      </div>
      <F label="Strengths"><textarea style={{...inp,minHeight:60,resize:"vertical"}} value={form.strengths} onChange={e=>sf("strengths",e.target.value)} placeholder="What stood out positively…"/></F>
      <div style={{marginTop:10}}><F label="Concerns"><textarea style={{...inp,minHeight:60,resize:"vertical"}} value={form.concerns} onChange={e=>sf("concerns",e.target.value)} placeholder="Any red flags or concerns…"/></F></div>
      <div style={{marginTop:10}}><F label="Additional Notes"><textarea style={{...inp,minHeight:50,resize:"vertical"}} value={form.notes} onChange={e=>sf("notes",e.target.value)} placeholder="Other observations…"/></F></div>
      <button onClick={save} disabled={saving} style={{marginTop:12,width:"100%",background:C.navy,color:C.white,border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer"}}>{saving?"Saving…":"Save Scorecard"}</button>
    </div>}
    {loading?<div style={{color:C.gray400,fontSize:12,textAlign:"center",padding:12}}>Loading…</div>:
    !cards.length&&!adding?<div style={{color:C.gray400,fontSize:12,textAlign:"center",padding:12}}>No scorecards yet.</div>:
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {cards.map(card=>{
        const job=jobs.find(j=>j.id===card.job_id);
        return <div key={card.id} style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:10,padding:"12px 14px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{background:(recColor[card.recommendation]||C.gray400)+"20",color:recColor[card.recommendation]||C.gray400,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700}}>{card.recommendation}</span>
                <span style={{background:C.accentL,color:C.accent,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:600}}>{card.interview_type}</span>
                {job&&<span style={{color:C.gray500,fontSize:11}}>{job.title} @ {job.client}</span>}
              </div>
              <div style={{display:"flex",gap:3,marginTop:6}}>
                {[1,2,3,4,5].map(n=><span key={n} style={{color:n<=card.rating?C.warn:"#e2e8f0",fontSize:16}}>★</span>)}
                <span style={{color:C.gray400,fontSize:11,marginLeft:4}}>{RATING_LABELS[card.rating]}</span>
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:11,color:C.gray400}}>{card.recruiter_name}</div>
              <div style={{fontSize:10,color:C.gray300}}>{new Date(card.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
              <button onClick={()=>del(card.id)} style={{marginTop:4,background:"none",border:"none",color:C.gray300,cursor:"pointer",fontSize:11}}>✕</button>
            </div>
          </div>
          {card.strengths&&<div style={{marginBottom:6}}><span style={{fontSize:10,fontWeight:700,color:C.success,textTransform:"uppercase",letterSpacing:0.5}}>Strengths</span><div style={{fontSize:12,color:C.gray600,marginTop:2}}>{card.strengths}</div></div>}
          {card.concerns&&<div style={{marginBottom:6}}><span style={{fontSize:10,fontWeight:700,color:C.danger,textTransform:"uppercase",letterSpacing:0.5}}>Concerns</span><div style={{fontSize:12,color:C.gray600,marginTop:2}}>{card.concerns}</div></div>}
          {card.notes&&<div><span style={{fontSize:10,fontWeight:700,color:C.gray400,textTransform:"uppercase",letterSpacing:0.5}}>Notes</span><div style={{fontSize:12,color:C.gray600,marginTop:2}}>{card.notes}</div></div>}
        </div>;
      })}
    </div>}
  </div>;
}

// ── TEAM MANAGER ──────────────────────────────────────────────────
function TeamManager({team,activeUser,onSave,onRefresh}){
  const isAdmin=activeUser?.is_admin;
  const blank={id:"",name:"",initials:"",color:"#1e56c8",role:"Recruiter",email:"",active:true,is_admin:false};
  const [form,setForm]=useState(blank);
  const [editing,setEditing]=useState(null);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState(null);
  const colors=["#1e56c8","#7c3aed","#16a34a","#d97706","#dc2626","#0891b2","#ea580c","#db2777","#0f766e","#6366f1"];
  const s=(k,v)=>setForm(p=>({...p,[k]:v}));

  const canEdit=(m)=>{
    if(isAdmin) return true;
    return m.id===activeUser?.id; // non-admins can only edit themselves
  };

  const startEdit=(m)=>{
    if(!canEdit(m)) return;
    // Non-admins only see limited fields
    setForm({...m});setEditing(m.id);setMsg(null);
  };
  const startNew=()=>{
    if(!isAdmin) return;
    setForm(blank);setEditing("new");setMsg(null);
  };
  const save=async()=>{
    if(!form.name.trim()||!form.id.trim()) return setMsg("Name and ID are required.");
    setSaving(true);
    try{
      await onSave({...form,initials:form.initials||form.name.split(" ").map(x=>x[0]).join("").substring(0,2).toUpperCase()});
      setMsg("✓ Saved");
      setEditing(null);setForm(blank);
      if(onRefresh) onRefresh();
    }catch(e){setMsg("⚠ Save failed: "+e.message);}
    setSaving(false);
  };

  return <div>
    <div style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:13,color:C.gray700,fontWeight:600,marginBottom:3}}>
          {isAdmin?"Admin View — Full Control":"Your Team"}
        </div>
        <div style={{fontSize:12,color:C.gray400}}>
          {isAdmin?"You can add, edit, and deactivate any team member. New members auto-join when they first log in.":"You can edit your own profile. Contact Andrew to make other changes."}
        </div>
      </div>
      {isAdmin&&<button onClick={startNew} style={{background:C.navy,color:C.white,border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0}}>+ Add Member</button>}
    </div>

    {/* Team list */}
    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:20}}>
      {team.map(m=>{
        const editable=canEdit(m);
        const isMe=m.id===activeUser?.id;
        return <div key={m.id} style={{background:C.white,border:`1px solid ${isMe?m.color+"40":C.gray200}`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          <div style={{width:38,height:38,borderRadius:9,background:m.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:C.white,flexShrink:0}}>{m.initials}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{color:C.navy,fontSize:13,fontWeight:600}}>{m.name}</div>
              {isMe&&<span style={{background:C.accentL,color:C.accent,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>You</span>}
              {m.is_admin&&<span style={{background:C.warnL,color:C.warn,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>Admin</span>}
            </div>
            <div style={{color:C.gray400,fontSize:11,marginTop:1}}>{m.role} · {m.email||<span style={{color:C.danger,fontWeight:500}}>No email — can't log in</span>}</div>
          </div>
          <span style={{background:m.active?C.successL:C.dangerL,color:m.active?C.success:C.danger,borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:600,flexShrink:0}}>{m.active?"Active":"Inactive"}</span>
          {editable&&<button onClick={()=>startEdit(m)} style={{background:C.gray100,color:C.gray600,border:`1px solid ${C.gray200}`,borderRadius:6,padding:"5px 12px",fontSize:11,cursor:"pointer",fontWeight:500,flexShrink:0}}>Edit</button>}
          {!editable&&<div style={{width:60}}/>}
        </div>;
      })}
    </div>

    {/* Edit / Add form */}
    {editing&&<div style={{background:C.gray50,border:`1px solid ${C.gray200}`,borderRadius:12,padding:"20px"}}>
      <div style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:4}}>{editing==="new"?"Add New Team Member":isAdmin?"Edit Team Member":"Edit Your Profile"}</div>
      {!isAdmin&&<div style={{fontSize:12,color:C.gray400,marginBottom:14}}>You can update your name, initials, and avatar color.</div>}
      {msg&&<div style={{background:msg.startsWith("✓")?C.successL:C.dangerL,color:msg.startsWith("✓")?C.success:C.danger,borderRadius:7,padding:"8px 12px",marginBottom:14,fontSize:12,fontWeight:500}}>{msg}</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 16px",marginBottom:16}}>
        <F label="Full Name *"><input style={inp} value={form.name} onChange={e=>s("name",e.target.value)} placeholder="Sarah Kim"/></F>
        {isAdmin&&<F label="ID (no spaces, lowercase)"><input style={inp} value={form.id} onChange={e=>s("id",e.target.value.toLowerCase().replace(/\s/g,""))} placeholder="sarah" disabled={editing!=="new"}/></F>}
        {isAdmin&&<F label="Role"><input style={inp} value={form.role} onChange={e=>s("role",e.target.value)} placeholder="Recruiter"/></F>}
        {isAdmin&&<F label="Email (must match Supabase login)"><input style={inp} value={form.email||""} onChange={e=>s("email",e.target.value)} placeholder="sarah@inxldigital.com" type="email"/></F>}
        <F label="Initials"><input style={inp} value={form.initials} onChange={e=>s("initials",e.target.value.toUpperCase().substring(0,2))} placeholder="SK" maxLength={2}/></F>
        {isAdmin&&<F label="Status"><select style={sel} value={form.active?"active":"inactive"} onChange={e=>s("active",e.target.value==="active")}><option value="active">Active</option><option value="inactive">Inactive</option></select></F>}
      </div>
      <div style={{marginBottom:16}}>
        <label style={{display:"block",color:C.gray500,fontSize:11,fontWeight:600,letterSpacing:0.3,marginBottom:8}}>Avatar Color</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {colors.map(c=><div key={c} onClick={()=>s("color",c)} style={{width:28,height:28,borderRadius:7,background:c,cursor:"pointer",border:form.color===c?`3px solid ${C.navy}`:"3px solid transparent",transition:"border 0.15s"}}/>)}
          <input type="color" value={form.color} onChange={e=>s("color",e.target.value)} style={{width:28,height:28,borderRadius:7,border:"none",cursor:"pointer",padding:0}}/>
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={save} disabled={saving} style={{flex:1,background:C.navy,color:C.white,border:"none",borderRadius:8,padding:"11px",fontSize:13,fontWeight:600,cursor:"pointer"}}>{saving?"Saving…":"Save"}</button>
        <button onClick={()=>{setEditing(null);setForm(blank);setMsg(null);}} style={{background:C.white,color:C.gray500,border:`1px solid ${C.gray300}`,borderRadius:8,padding:"11px 18px",fontSize:13,cursor:"pointer"}}>Cancel</button>
      </div>
    </div>}
  </div>;
}

// ── MAIN APP ──────────────────────────────────────────────────────

// ── BRAND TOKENS ─────────────────────────────────────────────────
const B={primary:"#22313F",accent:"#FF7A59",surface:"#FFF8F4",ink:"#1A242E",muted:"#E9E5E0",accentLight:"#FFF0EB",accentHover:"#E8674A"};

// ── SVG ICONS ────────────────────────────────────────────────────
const IC={
  dashboard:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  candidates:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  pipeline:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  jobs:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>,
  team:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
  analytics:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
  settings:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  search:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  plus:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14m-7-7h14"/></svg>,
  download:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  logout:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  filter:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  report:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  chevron:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
};

// ── DASHBOARD HOME ───────────────────────────────────────────────
function DashboardHome({cands,jobs,team,onOpenCand,onOpenJob,setPage}){
  const active=cands.filter(c=>!["Placed","Rejected","On Hold"].includes(c.stage));
  const interviews=cands.filter(c=>["Interview 1","Interview 2","Final Interview"].includes(c.stage));
  const offers=cands.filter(c=>c.stage==="Offer");
  const placed=cands.filter(c=>c.stage==="Placed");
  const openJobs=jobs.filter(j=>["Open – Sourcing","Active"].includes(j.status));
  const pipeData=[
    {label:"Applied",count:cands.filter(c=>c.stage==="Sourced").length,color:B.accent},
    {label:"Screened",count:cands.filter(c=>c.stage==="Submitted"||c.stage==="Client Review").length,color:"#8b5cf6"},
    {label:"Interviewed",count:interviews.length,color:"#6366f1"},
    {label:"Offered",count:offers.length,color:"#f59e0b"},
    {label:"Hired",count:placed.length,color:"#34d399"},
  ];
  const maxPipe=Math.max(...pipeData.map(d=>d.count),1);
  const recentCands=[...cands].sort((a,b)=>(b.addedDate||"").localeCompare(a.addedDate||"")).slice(0,5);

  return <div style={{display:"flex",flexDirection:"column",gap:24}}>
    {/* Welcome banner */}
    <div style={{background:`linear-gradient(135deg, ${B.primary} 0%, #2C3E50 100%)`,borderRadius:16,padding:"28px 32px",color:"#fff",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.5)",marginBottom:4}}>Hello</div>
        <div style={{fontSize:22,fontWeight:700,marginBottom:4}}>You have {active.length} active candidates</div>
      </div>
      <div style={{display:"flex",gap:20}}>
        {[["Interviews Scheduled",interviews.length],["Open Jobs",openJobs.length],["Total Candidates",cands.length],["Hires This Month",placed.length]].map(([l,v])=>
          <div key={l} style={{textAlign:"center",padding:"0 16px",borderLeft:"1px solid rgba(255,255,255,0.1)"}}>
            <div style={{fontSize:28,fontWeight:800,lineHeight:1}}>{v}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:4}}>{l}</div>
          </div>
        )}
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:20}}>
      {/* Hiring Pipeline */}
      <div style={{background:"#fff",border:`1px solid ${B.muted}`,borderRadius:16,padding:"24px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontSize:16,fontWeight:700,color:B.ink}}>Hiring Pipeline</div>
          <div style={{background:B.accentLight,color:B.accent,padding:"4px 12px",borderRadius:8,fontSize:11,fontWeight:600}}>This Month</div>
        </div>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:12,height:160}}>
          {pipeData.map(d=><div key={d.label} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
            <div style={{fontSize:13,fontWeight:700,color:d.color}}>{d.count}</div>
            <div style={{width:"100%",background:`${d.color}18`,borderRadius:8,position:"relative",height:Math.max(d.count/maxPipe*120,8),transition:"height 0.5s ease"}}>
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:"60%",background:`${d.color}30`,borderRadius:8}}/>
            </div>
            <div style={{fontSize:10,color:B.ink,fontWeight:500,opacity:0.5}}>{d.label}</div>
          </div>)}
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{background:"#fff",border:`1px solid ${B.muted}`,borderRadius:16,padding:"24px 28px"}}>
        <div style={{fontSize:16,fontWeight:700,color:B.ink,marginBottom:20}}>Recent Activity</div>
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {recentCands.map((c,i)=>{const o=getTeamMember(c.ownerId);return <div key={c.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<recentCands.length-1?`1px solid ${B.muted}`:"none"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:SM[c.stage]?.c||B.accent,flexShrink:0}}/>
            <div style={{flex:1,fontSize:13,color:B.ink}}><strong>{c.name}</strong> moved to {c.stage}</div>
            <div style={{fontSize:11,color:"#A09A93",flexShrink:0}}>{c.addedDate||"—"}</div>
          </div>;})}
          {!recentCands.length&&<div style={{color:"#A09A93",fontSize:13,textAlign:"center",padding:20}}>No recent activity</div>}
        </div>
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginTop:4}}>
      {/* Current Openings */}
      <div style={{background:"#fff",border:`1px solid ${B.muted}`,borderRadius:16,padding:"24px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:700,color:B.ink}}>Current Openings ({openJobs.length})</div>
          <span onClick={()=>setPage("jobs")} style={{fontSize:12,color:B.accent,fontWeight:600,cursor:"pointer"}}>See all</span>
        </div>
        <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:4}}>
          {openJobs.slice(0,4).map(j=>{const subs=cands.filter(c=>(j.submittedCandidates||[]).includes(c.id));return <div key={j.id} onClick={()=>onOpenJob(j)} style={{minWidth:180,background:B.surface,border:`1px solid ${B.muted}`,borderRadius:12,padding:"16px",cursor:"pointer",transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=B.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=B.muted}>
            <div style={{fontSize:13,fontWeight:700,color:B.ink,marginBottom:4}}>{j.title}</div>
            <div style={{fontSize:11,color:"#A09A93",marginBottom:8}}>{j.client}</div>
            <div style={{fontSize:12,fontWeight:600,color:B.accent}}>{subs.length} Applicants</div>
          </div>;})}
          {!openJobs.length&&<div style={{color:"#A09A93",fontSize:13,padding:20}}>No open jobs</div>}
        </div>
      </div>

      {/* Top Candidates */}
      <div style={{background:"#fff",border:`1px solid ${B.muted}`,borderRadius:16,padding:"24px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:700,color:B.ink}}>Hot Candidates</div>
          <span onClick={()=>setPage("candidates")} style={{fontSize:12,color:B.accent,fontWeight:600,cursor:"pointer"}}>View all</span>
        </div>
        {[...interviews,...offers].slice(0,6).map((c,i)=>{const o=getTeamMember(c.ownerId);return <div key={c.id} onClick={()=>onOpenCand(c)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${B.muted}`,cursor:"pointer"}}>
          <Avatar name={c.name} size={32} color={o?.color}/>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:B.ink}}>{c.name}</div><div style={{fontSize:11,color:"#A09A93"}}>{c.title}</div></div>
          <StageBadge stage={c.stage}/>
        </div>;})}
        {!interviews.length&&!offers.length&&<div style={{color:"#A09A93",fontSize:13,textAlign:"center",padding:20}}>No hot candidates right now</div>}
      </div>
    </div>
  </div>;
}

// ── MAIN APP ─────────────────────────────────────────────────────
export default function HCPRecruit(){
  const [cands,setCands]=useState([]);
  const [jobs,setJobs]=useState([]);
  const [team,setTeam]=useState(TEAM_FALLBACK);
  const [activeUser,setActiveUser]=useState(TEAM_FALLBACK[0]);
  const [loading,setLoading]=useState(true);
  const [session,setSession]=useState(null);
  const [authChecked,setAuthChecked]=useState(false);
  const [page,setPage]=useState("dashboard");
  const [view,setView]=useState("list");
  const [modal,setModal]=useState(null);
  const [cs,setCs]=useState(""); const [cStage,setCStage]=useState("All"); const [cVert,setCVert]=useState("All");
  const [cAuth,setCAuth]=useState("All"); const [cOwner,setCOwner]=useState("All"); const [cSort,setCSort]=useState("name");
  const [cSeniority,setCSeniority]=useState("All"); const [cClient,setCClient]=useState("All"); const [cHasResume,setCHasResume]=useState("All");
  const [cFiltersOpen,setCFiltersOpen]=useState(false);
  const [js,setJs]=useState(""); const [jStat,setJStat]=useState("All"); const [jClient,setJClient]=useState("All"); const [jOwner,setJOwner]=useState("All");
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);

  useEffect(()=>{document.title="Talyntry";getSession().then(s=>{setSession(s);setAuthChecked(true);});},[]);
  useEffect(()=>{
    const preventDrag=(e)=>{e.preventDefault();};
    const preventDrop=(e)=>{if(e.target.closest("[data-dropzone]")) return;e.preventDefault();};
    window.addEventListener("dragover",preventDrag);
    window.addEventListener("drop",preventDrop);
    return()=>{window.removeEventListener("dragover",preventDrag);window.removeEventListener("drop",preventDrop);};
  },[]);
  useEffect(()=>{
    if(!session) return;
    const email=session.user?.email;
    Promise.all([fetchCandidates(),fetchJobs(),fetchTeam()])
      .then(async([c,j,t])=>{
        setCands(c);setJobs(j);
        const matched=t.find(m=>m.email&&m.email.toLowerCase()===email?.toLowerCase());
        if(!matched&&email){
          const namePart=email.split("@")[0].replace(/[._]/g," ").replace(/\b\w/g,x=>x.toUpperCase());
          const newMember={id:email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g,""),name:namePart,initials:namePart.split(" ").map(x=>x[0]).join("").substring(0,2).toUpperCase(),color:"#64748b",role:"Recruiter",email,active:true,is_admin:false};
          await upsertTeamMember(newMember);
          const refreshed=await fetchTeam();TEAM=refreshed;setTeam(refreshed);
          const me=refreshed.find(m=>m.email?.toLowerCase()===email.toLowerCase());
          if(me) setActiveUser(me);
        } else {TEAM=t;setTeam(t);if(matched) setActiveUser(matched);}
        setLoading(false);
      }).catch(err=>{console.error("Load error:",err);setLoading(false);});
    const unsub=subscribeToChanges(()=>fetchCandidates().then(setCands),()=>fetchJobs().then(setJobs));
    return unsub;
  },[session]);

  // Auth check
  if(!authChecked) return <div style={{minHeight:"100vh",background:`linear-gradient(135deg, ${B.ink} 0%, ${B.primary} 40%, #2C3E50 100%)`,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:8,height:8,borderRadius:"50%",background:B.accent,animation:"pulse 1.5s ease infinite"}}></div><style>{"@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.2)}}"}</style></div>;
  if(!session) return <LoginScreen onLogin={()=>getSession().then(setSession)}/>;

  // Loading
  if(loading) return <div style={{minHeight:"100vh",width:"100vw",background:`linear-gradient(135deg, ${B.ink} 0%, ${B.primary} 40%, #2C3E50 100%)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',sans-serif",position:"relative",overflow:"hidden"}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
    <div style={{position:"absolute",top:"-20%",right:"-10%",width:600,height:600,borderRadius:"50%",background:"radial-gradient(circle, rgba(255,122,89,0.06) 0%, transparent 70%)",pointerEvents:"none"}}/>
    <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(rgba(255,255,255,0.02) 1px, transparent 1px)",backgroundSize:"40px 40px",pointerEvents:"none"}}/>
    <div style={{textAlign:"center",position:"relative",zIndex:1}}>
      <img src="/logo-light.png" alt="Talyntry" style={{height:28,margin:"0 auto 24px",display:"block"}} onError={e=>{e.target.style.display="none"}}/>
      <div style={{fontSize:12,color:"rgba(255,255,255,0.3)",letterSpacing:1.5,textTransform:"uppercase",marginBottom:40}}>Talent Intelligence Platform</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        {[0,0.2,0.4].map(d=><div key={d} style={{width:8,height:8,borderRadius:"50%",background:B.accent,animation:`bounce 1.2s infinite ${d}s`}}/>)}
      </div>
      <div style={{color:"rgba(255,255,255,0.25)",fontSize:12,marginTop:20}}>Loading your workspace…</div>
    </div>
    <style>{"@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}}"}</style>
  </div>;

  // Data
  const clients=[...new Set(jobs.map(j=>j.client).filter(Boolean))].sort();
  const fCands=cands
    .filter(c=>{const q=cs.toLowerCase();if(!q) return true;const jobsForCand=jobs.filter(j=>(c.submittedTo||[]).includes(j.id));return [c.name,c.title,c.email,c.phone,c.location,c.vertical,c.seniority,c.workAuth,c.salary,c.experience,c.source,c.linkedin,...(c.skills||[]),...(c.notes||[]).map(n=>n.text),...(c.collaborators||[]).map(id=>getTeamMember(id)?.name),getTeamMember(c.ownerId)?.name,...jobsForCand.map(j=>j.title),...jobsForCand.map(j=>j.client)].some(v=>v?.toString().toLowerCase().includes(q));})
    .filter(c=>cStage==="All"||c.stage===cStage).filter(c=>cVert==="All"||c.vertical===cVert)
    .filter(c=>cAuth==="All"||c.workAuth===cAuth).filter(c=>cOwner==="All"||c.ownerId===cOwner||(c.collaborators||[]).includes(cOwner))
    .filter(c=>cSeniority==="All"||c.seniority===cSeniority)
    .filter(c=>cClient==="All"||jobs.filter(j=>(c.submittedTo||[]).includes(j.id)).some(j=>j.client===cClient))
    .filter(c=>cHasResume==="All"||(cHasResume==="yes"?!!c.resumePath:!c.resumePath))
    .sort((a,b)=>cSort==="stage"?STAGES.indexOf(a.stage)-STAGES.indexOf(b.stage):cSort==="salary"?parseInt((b.salary||"0").replace(/\D/g,""))-parseInt((a.salary||"0").replace(/\D/g,"")):(a.name||"").localeCompare(b.name||""));
  const fJobs=jobs.filter(j=>{const q=js.toLowerCase();return !q||[j.title,j.client,j.spoc].some(v=>v?.toLowerCase().includes(q));}).filter(j=>jStat==="All"||j.status===jStat).filter(j=>jClient==="All"||j.client===jClient).filter(j=>jOwner==="All"||(j.assignedRecruiters||[]).includes(jOwner)).sort((a,b)=>({"P1":0,"P2":1,"P3":2}[a.priority]||1)-({"P1":0,"P2":1,"P3":2}[b.priority]||1));
  const stats={total:cands.length,active:cands.filter(c=>!["Placed","Rejected","On Hold"].includes(c.stage)).length,hot:cands.filter(c=>["Interview 1","Interview 2","Final Interview","Offer"].includes(c.stage)).length,placed:cands.filter(c=>c.stage==="Placed").length,openJobs:jobs.filter(j=>["Open – Sourcing","Active"].includes(j.status)).length,filled:jobs.filter(j=>j.status==="Filled").length};

  // Handlers
  const reload=async()=>{const[c,j]=await Promise.all([fetchCandidates(),fetchJobs()]);setCands(c);setJobs(j);};
  const saveCand=async(c)=>{const isNew=!c.id||typeof c.id==="number";await upsertCandidate(c);await logActivity(c.id||c.tempId,isNew?"created":"edit",activeUser.id,activeUser.name,isNew?`${c.name} added to system`:`Profile updated`);await reload();setModal(null);};
  const saveJob=async(j)=>{await upsertJob(j);await reload();setModal(null);};
  const stageChange=async(id,stage,prevStage)=>{await updateCandidateStage(id,stage);await logActivity(id,"stage_change",activeUser.id,activeUser.name,`Stage changed${prevStage?` from ${prevStage}`:""} to ${stage}`);const data=await fetchCandidates();setCands(data);};
  const jobStatusChange=async(id,status)=>{await updateJobStatus(id,status);const data=await fetchJobs();setJobs(data);};
  const addCandNoteHandler=async(id,text)=>{await addCandidateNote(id,{author:activeUser.name,authorId:activeUser.id,text,date:today()});await logActivity(id,"note",activeUser.id,activeUser.name,text);const data=await fetchCandidates();setCands(data);};
  const addJobNoteHandler=async(id,text)=>{await addJobNoteDB(id,{author:activeUser.name,authorId:activeUser.id,text,date:today()});const data=await fetchJobs();setJobs(data);};
  const submitToJobHandler=async(cid,jid)=>{const job=jobs.find(j=>j.id===jid);await submitCandidateToJob(cid,jid);await logActivity(cid,"job_submit",activeUser.id,activeUser.name,`Submitted to ${job?.title||"job"}${job?.client?` @ ${job.client}`:""}`);await reload();};
  const removeFromJob=async(jid,cid)=>{await removeCandidateFromJob(cid,jid);const data=await fetchJobs();setJobs(data);};
  const deleteCandHandler=async(id)=>{if(!window.confirm("Delete this candidate? This cannot be undone."))return;await deleteCandidate(id);await reload();setModal(null);};
  const deleteJobHandler=async(id)=>{if(!window.confirm("Delete this job order? This cannot be undone."))return;await deleteJob(id);await reload();setModal(null);};
  const handleResumeUpload=async(candidateId,file)=>{await uploadResume(candidateId,file);await logActivity(candidateId,"resume",activeUser.id,activeUser.name,"Resume uploaded");const data=await fetchCandidates();setCands(data);};
  const openCand=(c)=>setModal({t:"cand",c});

  const sW=sidebarCollapsed?68:240;
  const NAV_ITEMS=[
    {id:"dashboard",label:"Dashboard",icon:IC.dashboard},
    {id:"candidates",label:"Candidates",icon:IC.candidates},
    {id:"pipeline",label:"Pipeline",icon:IC.pipeline},
    {id:"jobs",label:"Jobs",icon:IC.jobs},
  ];
  const ADMIN_ITEMS=[
    {id:"team",label:"Team",icon:IC.team,action:()=>setModal({t:"team"})},
    {id:"report",label:"Reports",icon:IC.report,action:()=>setModal({t:"report"})},
  ];

  return <div style={{display:"flex",minHeight:"100vh",fontFamily:"'Outfit',sans-serif",background:B.surface}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>

    {/* ═══ SIDEBAR ═══ */}
    <div style={{width:sW,minHeight:"100vh",background:"#fff",borderRight:`1px solid ${B.muted}`,display:"flex",flexDirection:"column",position:"fixed",left:0,top:0,bottom:0,zIndex:50,transition:"width 0.2s ease",overflow:"hidden"}}>
      {/* Logo */}
      <div style={{padding:sidebarCollapsed?"20px 16px":"20px 24px",borderBottom:`1px solid ${B.muted}`,display:"flex",alignItems:"center",gap:10,minHeight:64}}>
        <img src="/logo-dark.png" alt="Talyntry" style={{height:sidebarCollapsed?28:22,width:"auto"}} onError={e=>{e.target.style.display="none"}}/>
      </div>

      {/* Nav items */}
      <div style={{flex:1,padding:"12px 12px",display:"flex",flexDirection:"column",gap:2}}>
        {NAV_ITEMS.map(item=>{
          const isActive=page===item.id||(item.id==="candidates"&&page==="candidates")||(item.id==="pipeline"&&page==="pipeline");
          return <button key={item.id} onClick={()=>setPage(item.id)} style={{display:"flex",alignItems:"center",gap:12,padding:sidebarCollapsed?"10px 14px":"10px 16px",borderRadius:10,border:"none",cursor:"pointer",background:isActive?B.accentLight:"transparent",color:isActive?B.accent:B.ink,fontWeight:isActive?600:500,fontSize:13,fontFamily:"inherit",transition:"all 0.15s",width:"100%",textAlign:"left",opacity:isActive?1:0.65}}>
            <span style={{flexShrink:0,display:"flex"}}>{item.icon}</span>
            {!sidebarCollapsed&&<span>{item.label}</span>}
            {!sidebarCollapsed&&item.id==="candidates"&&<span style={{marginLeft:"auto",background:B.muted,color:B.ink,borderRadius:6,padding:"1px 7px",fontSize:10,fontWeight:700}}>{cands.length}</span>}
            {!sidebarCollapsed&&item.id==="jobs"&&<span style={{marginLeft:"auto",background:B.muted,color:B.ink,borderRadius:6,padding:"1px 7px",fontSize:10,fontWeight:700}}>{jobs.length}</span>}
          </button>;
        })}

        <div style={{height:1,background:B.muted,margin:"12px 4px"}}/>
        <div style={{fontSize:10,color:"#A09A93",fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,padding:"4px 16px",marginBottom:4}}>{!sidebarCollapsed&&"Admin"}</div>
        {ADMIN_ITEMS.map(item=>
          <button key={item.id} onClick={item.action} style={{display:"flex",alignItems:"center",gap:12,padding:sidebarCollapsed?"10px 14px":"10px 16px",borderRadius:10,border:"none",cursor:"pointer",background:"transparent",color:B.ink,fontWeight:500,fontSize:13,fontFamily:"inherit",opacity:0.55,width:"100%",textAlign:"left",transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.55}>
            <span style={{flexShrink:0,display:"flex"}}>{item.icon}</span>
            {!sidebarCollapsed&&<span>{item.label}</span>}
          </button>
        )}
      </div>

      {/* User + logout */}
      <div style={{padding:"16px",borderTop:`1px solid ${B.muted}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <RecruiterBadge id={activeUser.id} size={32}/>
          {!sidebarCollapsed&&<div style={{flex:1,overflow:"hidden"}}>
            <div style={{fontSize:13,fontWeight:600,color:B.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{activeUser.name}</div>
            <div style={{fontSize:10,color:"#A09A93"}}>{activeUser.role||"Recruiter"}</div>
          </div>}
          {!sidebarCollapsed&&<span onClick={()=>signOut().then(()=>setSession(null))} style={{cursor:"pointer",color:"#A09A93",display:"flex",opacity:0.6}} title="Sign out">{IC.logout}</span>}
        </div>
      </div>
    </div>

    {/* ═══ MAIN CONTENT ═══ */}
    <div style={{flex:1,marginLeft:sW,transition:"margin-left 0.2s ease"}}>
      {/* Top bar */}
      <div style={{background:"#fff",borderBottom:`1px solid ${B.muted}`,padding:"0 28px",position:"sticky",top:0,zIndex:40,display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
        <div style={{fontSize:18,fontWeight:700,color:B.ink,textTransform:"capitalize"}}>{page}</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {(page==="candidates"||page==="pipeline")&&<button onClick={()=>setModal({t:"add-cand"})} style={{display:"flex",alignItems:"center",gap:6,background:B.accent,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(255,122,89,0.25)"}}>{IC.plus} Add Candidate</button>}
          {page==="jobs"&&<button onClick={()=>setModal({t:"add-job"})} style={{display:"flex",alignItems:"center",gap:6,background:B.accent,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(255,122,89,0.25)"}}>{IC.plus} Add Job Order</button>}
          <button onClick={()=>exportCSV(cands,jobs)} style={{display:"flex",alignItems:"center",gap:5,background:B.surface,color:B.ink,border:`1px solid ${B.muted}`,borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",opacity:0.7}}>{IC.download} CSV</button>
        </div>
      </div>

      {/* Page content */}
      <div style={{padding:"24px 28px"}}>

        {/* DASHBOARD */}
        {page==="dashboard"&&<DashboardHome cands={cands} jobs={jobs} team={team} onOpenCand={openCand} onOpenJob={j=>setModal({t:"job",j})} setPage={setPage}/>}

        {/* CANDIDATES */}
        {page==="candidates"&&<>
          <div style={{background:"#fff",border:`1px solid ${B.muted}`,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{position:"relative",flex:"1 1 200px",minWidth:180}}>
                <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#A09A93",display:"flex"}}>{IC.search}</span>
                <input style={{...inp,paddingLeft:32}} value={cs} onChange={e=>setCs(e.target.value)} placeholder="Search name, title, skill, client, work auth, notes…"/>
              </div>
              <button onClick={()=>setCFiltersOpen(p=>!p)} style={{background:cFiltersOpen?B.accent:"#fff",color:cFiltersOpen?"#fff":B.ink,border:`1px solid ${cFiltersOpen?B.accent:B.muted}`,borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                {IC.filter} Filters
                {(cStage!=="All"||cVert!=="All"||cAuth!=="All"||cOwner!=="All"||cSeniority!=="All"||cClient!=="All"||cHasResume!=="All")&&<span style={{background:B.accent,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{[cStage,cVert,cAuth,cOwner,cSeniority,cClient,cHasResume].filter(x=>x!=="All").length}</span>}
              </button>
              <select style={{...sel,flex:"0 0 140px"}} value={cSort} onChange={e=>setCSort(e.target.value)}>
                <option value="name">Sort: A–Z</option><option value="stage">Sort: Stage</option><option value="salary">Sort: Rate ↓</option>
              </select>
              <span style={{color:"#A09A93",fontSize:12,fontWeight:500,marginLeft:"auto"}}>{fCands.length} candidate{fCands.length!==1?"s":""}</span>
            </div>
            {cFiltersOpen&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8,marginTop:12,paddingTop:12,borderTop:`1px solid ${B.muted}`}}>
              <select style={sel} value={cStage} onChange={e=>setCStage(e.target.value)}><option value="All">All Stages</option>{STAGES.map(s=><option key={s}>{s}</option>)}</select>
              <select style={sel} value={cVert} onChange={e=>setCVert(e.target.value)}><option value="All">All Verticals</option>{VERTICALS.map(v=><option key={v}>{v}</option>)}</select>
              <select style={sel} value={cAuth} onChange={e=>setCAuth(e.target.value)}><option value="All">All Work Auth</option>{WORK_AUTH.map(w=><option key={w}>{w}</option>)}</select>
              <select style={sel} value={cOwner} onChange={e=>setCOwner(e.target.value)}><option value="All">All Recruiters</option>{team.map(t=><option key={t.id} value={t.id}>{t.name.split(" ")[0]}</option>)}</select>
              <select style={sel} value={cSeniority} onChange={e=>setCSeniority(e.target.value)}><option value="All">All Seniority</option>{SENIORITY.map(s=><option key={s}>{s}</option>)}</select>
              <select style={sel} value={cClient} onChange={e=>setCClient(e.target.value)}><option value="All">All Clients</option>{clients.map(c=><option key={c}>{c}</option>)}</select>
              {[["All","All Candidates"],["yes","Has Resume"],["no","No Resume"]].map(([v,l])=><label key={v} style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:12,color:cHasResume===v?B.ink:"#A09A93",fontWeight:cHasResume===v?600:400}}><input type="radio" name="resume" checked={cHasResume===v} onChange={()=>setCHasResume(v)} style={{accentColor:B.accent}}/>{l}</label>)}
            </div>}
          </div>

          {/* Candidate list */}
          <div style={{background:"#fff",border:`1px solid ${B.muted}`,borderRadius:12,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{background:B.surface}}>
                {["Candidate","Title","Stage","Rate","Owner","Client","Auth"].map(h=><th key={h} style={{padding:"12px 14px",textAlign:"left",fontWeight:600,color:"#A09A93",fontSize:11,textTransform:"uppercase",letterSpacing:0.5,borderBottom:`1px solid ${B.muted}`}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {fCands.map(c=>{
                  const o=getTeamMember(c.ownerId);
                  const cJobs=jobs.filter(j=>(c.submittedTo||[]).includes(j.id));
                  return <tr key={c.id} onClick={()=>openCand(c)} style={{cursor:"pointer",transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=B.surface} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"12px 14px",borderBottom:`1px solid ${B.muted}`,display:"flex",alignItems:"center",gap:10}}>
                      <Avatar name={c.name} size={36} color={o?.color}/>
                      <div><div style={{fontWeight:600,color:B.ink}}>{c.name}</div><div style={{fontSize:11,color:"#A09A93"}}>{c.location||""}</div></div>
                    </td>
                    <td style={{padding:"12px 14px",borderBottom:`1px solid ${B.muted}`,color:B.ink}}>{c.title||"—"}</td>
                    <td style={{padding:"12px 14px",borderBottom:`1px solid ${B.muted}`}}><StageBadge stage={c.stage}/></td>
                    <td style={{padding:"12px 14px",borderBottom:`1px solid ${B.muted}`,color:c.salary?"#34d399":"#A09A93",fontWeight:600,fontSize:12}}>{c.salary||"—"}</td>
                    <td style={{padding:"12px 14px",borderBottom:`1px solid ${B.muted}`}}>{o?<RecruiterBadge id={o.id} size={24} showName/>:<span style={{color:"#A09A93"}}>—</span>}</td>
                    <td style={{padding:"12px 14px",borderBottom:`1px solid ${B.muted}`,fontSize:12,color:B.ink}}>{cJobs.map(j=>j.client).filter(Boolean).join(", ")||"—"}</td>
                    <td style={{padding:"12px 14px",borderBottom:`1px solid ${B.muted}`}}>{c.workAuth?<Tag label={c.workAuth}/>:<span style={{color:"#A09A93"}}>—</span>}</td>
                  </tr>;
                })}
                {!fCands.length&&<tr><td colSpan={7} style={{textAlign:"center",padding:48,color:"#A09A93",fontSize:13}}>No candidates match your filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </>}

        {/* PIPELINE */}
        {page==="pipeline"&&<div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:16,alignItems:"flex-start"}}>
          {STAGES.map(stage=>{
            const col=fCands.filter(c=>c.stage===stage);const m=SM[stage];
            return <div key={stage} style={{flex:"0 0 200px",minWidth:200}}
              onDragOver={e=>{e.preventDefault();e.currentTarget.style.background=`${m.c}08`;}}
              onDragLeave={e=>{e.currentTarget.style.background="transparent";}}
              onDrop={e=>{e.preventDefault();e.currentTarget.style.background="transparent";const cid=e.dataTransfer.getData("text/plain");if(cid){const cand=cands.find(x=>x.id===cid);stageChange(cid,stage,cand?.stage);}}}>
              <div style={{background:m.bg,border:`1px solid ${m.c}40`,borderRadius:9,padding:"8px 12px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:m.t||m.c,fontWeight:700,fontSize:11}}>{stage}</span>
                <span style={{background:m.c,color:"#fff",borderRadius:10,padding:"2px 8px",fontSize:11,fontWeight:700}}>{col.length}</span>
              </div>
              {col.map(c=>{const o=getTeamMember(c.ownerId);return <div key={c.id} draggable
                onDragStart={e=>{e.dataTransfer.setData("text/plain",c.id);e.currentTarget.style.opacity="0.5";}}
                onDragEnd={e=>{e.currentTarget.style.opacity="1";}}
                onClick={()=>openCand(c)} style={{background:"#fff",border:`1px solid ${B.muted}`,borderRadius:9,padding:"11px 12px",marginBottom:6,cursor:"grab",transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=m.c;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=B.muted;}}>
                <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:5,justifyContent:"space-between"}}>
                  <div style={{display:"flex",gap:7,alignItems:"center"}}><Avatar name={c.name} size={26} color={o?.color}/><div style={{fontWeight:600,fontSize:12,color:B.ink,lineHeight:1.3}}>{c.name}</div></div>
                  {c.ownerId&&<RecruiterBadge id={c.ownerId} size={18}/>}
                </div>
                <div style={{fontSize:11,color:"#A09A93",marginBottom:4}}>{c.title}</div>
                {c.salary&&<div style={{fontSize:11,color:"#34d399",fontWeight:600}}>{c.salary}</div>}
              </div>;})}
              {!col.length&&<div style={{background:"#fff",border:`2px dashed ${B.muted}`,borderRadius:9,padding:20,textAlign:"center",color:"#A09A93",fontSize:11}}>Drop here</div>}
            </div>;
          })}
        </div>}

        {/* JOBS */}
        {page==="jobs"&&<>
          <div style={{background:"#fff",border:`1px solid ${B.muted}`,borderRadius:12,padding:"14px 16px",marginBottom:16,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{position:"relative",flex:"1 1 200px",minWidth:180}}>
              <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#A09A93",display:"flex"}}>{IC.search}</span>
              <input style={{...inp,paddingLeft:32}} value={js} onChange={e=>setJs(e.target.value)} placeholder="Search role, client, SPOC…"/>
            </div>
            <select style={{...sel,flex:"0 0 155px"}} value={jStat} onChange={e=>setJStat(e.target.value)}><option value="All">All Statuses</option>{JOB_STATUSES.map(s=><option key={s}>{s}</option>)}</select>
            <select style={{...sel,flex:"0 0 145px"}} value={jClient} onChange={e=>setJClient(e.target.value)}><option value="All">All Clients</option>{clients.map(c=><option key={c}>{c}</option>)}</select>
            <select style={{...sel,flex:"0 0 145px"}} value={jOwner} onChange={e=>setJOwner(e.target.value)}><option value="All">All Recruiters</option>{team.map(t=><option key={t.id} value={t.id}>{t.name.split(" ")[0]}</option>)}</select>
            <span style={{color:"#A09A93",fontSize:12,fontWeight:500,marginLeft:"auto"}}>{fJobs.length} role{fJobs.length!==1?"s":""}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:12}}>
            {fJobs.map(j=>{
              const subs=cands.filter(c=>j.submittedCandidates?.includes(c.id));
              const PC={"P1":C.danger,"P2":C.warn,"P3":C.gray400};
              return <div key={j.id} onClick={()=>setModal({t:"job",j})} style={{background:"#fff",border:`1px solid ${B.muted}`,borderRadius:13,padding:"18px 20px",cursor:"pointer",transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=B.accent;e.currentTarget.style.transform="translateY(-2px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=B.muted;e.currentTarget.style.transform="translateY(0)";}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div style={{flex:1,paddingRight:10}}>
                    <div style={{fontSize:14,fontWeight:700,color:B.ink,lineHeight:1.3,marginBottom:3}}>{j.title}</div>
                    <div style={{fontSize:12,color:"#A09A93",fontWeight:500}}>{j.client}{j.spoc?` · ${j.spoc}`:""}</div>
                  </div>
                  <JobBadge status={j.status}/>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {j.empType&&<Tag label={j.empType} color={B.accent} bg={B.accentLight}/>}
                  {j.priority&&<span style={{color:PC[j.priority]||"#A09A93",background:(PC[j.priority]||"#A09A93")+"15",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700}}>{j.priority}</span>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 10px",marginBottom:12}}>
                  {j.location&&<div style={{fontSize:11,color:"#A09A93"}}>{j.location}</div>}
                  {j.salary&&<div style={{fontSize:11,color:B.ink,fontWeight:600}}>{j.salary}</div>}
                  <div style={{fontSize:11,color:"#A09A93"}}>{subs.length} submitted</div>
                </div>
                <div style={{borderTop:`1px solid ${B.muted}`,paddingTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <RecruiterStack ids={j.assignedRecruiters||[]} size={22}/>
                  <div style={{display:"flex",alignItems:"center"}}>
                    {subs.slice(0,5).map((c,i)=>{const o=getTeamMember(c.ownerId);return <div key={c.id} style={{marginLeft:i>0?-7:0,zIndex:10-i,position:"relative",border:"2px solid #fff",borderRadius:7}}><Avatar name={c.name} size={24} color={o?.color}/></div>;})}
                    {!subs.length&&<span style={{color:"#A09A93",fontSize:11}}>No candidates yet</span>}
                  </div>
                </div>
              </div>;
            })}
            {!fJobs.length&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:48,color:"#A09A93",fontSize:13}}>No job orders match your filters.</div>}
          </div>
        </>}

      </div>
    </div>

    {/* ═══ MODALS ═══ */}
    {modal?.t==="add-cand"&&<Modal title="Add New Candidate" subtitle="Fill in details or upload a resume for AI auto-fill" onClose={()=>setModal(null)}><CandForm allCandidates={cands} onSave={saveCand} onClose={()=>setModal(null)} activeUser={activeUser} team={team}/></Modal>}
    {modal?.t==="edit-cand"&&<Modal title="Edit Candidate" onClose={()=>setModal(null)}><CandForm initial={modal.c} allCandidates={cands} onSave={saveCand} onClose={()=>setModal(null)} activeUser={activeUser} team={team}/></Modal>}
    {modal?.t==="cand"&&(()=>{const live=cands.find(c=>c.id===modal.c.id)||modal.c;return <Modal title="Candidate Profile" onClose={()=>setModal(null)} wide><CandDetail c={live} jobs={jobs} onEdit={()=>setModal({t:"edit-cand",c:live})} onStageChange={stageChange} onAddNote={addCandNoteHandler} onSubmitToJob={submitToJobHandler} activeUser={activeUser} onDelete={activeUser?.is_admin?deleteCandHandler:null} onResumeUpload={handleResumeUpload}/></Modal>;})()}
    {modal?.t==="add-job"&&<Modal title="New Job Order" subtitle="Create a job order and assign recruiters" onClose={()=>setModal(null)} wide><JobForm onSave={saveJob} onClose={()=>setModal(null)} activeUser={activeUser} team={team}/></Modal>}
    {modal?.t==="edit-job"&&<Modal title="Edit Job Order" onClose={()=>setModal(null)} wide><JobForm initial={modal.j} onSave={saveJob} onClose={()=>setModal(null)} activeUser={activeUser} team={team}/></Modal>}
    {modal?.t==="job"&&(()=>{const live=jobs.find(j=>j.id===modal.j.id)||modal.j;return <Modal title="Job Order Detail" onClose={()=>setModal(null)} wide><JobDetail job={live} candidates={cands} onEdit={()=>setModal({t:"edit-job",j:live})} onStatusChange={jobStatusChange} onAddNote={addJobNoteHandler} onRemove={removeFromJob} onOpenCand={c=>{setModal(null);setTimeout(()=>setModal({t:"cand",c}),40);}} activeUser={activeUser} onDelete={activeUser?.is_admin?deleteJobHandler:null}/></Modal>;})()}
    {modal?.t==="report"&&<Modal title="Weekly Activity Report" subtitle={`Week of ${weekStart()} – ${weekEnd()}`} onClose={()=>setModal(null)} xl><WeeklyReport cands={cands} jobs={jobs} team={team}/></Modal>}
    {modal?.t==="team"&&<Modal title="Team Management" subtitle={activeUser?.is_admin?"Admin — full control":"View your team"} onClose={()=>setModal(null)} wide><TeamManager team={team} activeUser={activeUser} onSave={async(m)=>{await upsertTeamMember(m);const t=await fetchTeam();TEAM=t;setTeam(t);}} onRefresh={async()=>{const t=await fetchTeam();TEAM=t;setTeam(t);}}/></Modal>}
  </div>;
}
