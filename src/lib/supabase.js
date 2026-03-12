import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hshhhrkkbzgvmlyuwhtj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzaGhocmtrYnpndm1seXV3aHRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzQ4MjIsImV4cCI6MjA4ODg1MDgyMn0.W8Ff6YaUMnxSNyhLTlyLtjvfYCwPLBespxxU7xKVjgg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── RESUME STORAGE ────────────────────────────────────────────────
export async function uploadResume(candidateId, file) {
  const ext = file.name.split(".").pop();
  const path = `${candidateId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("HCP One Resumes").upload(path, file, { upsert: true });
  if (error) throw error;
  // Save path to candidate record
  const { error: updateError } = await supabase
    .from("candidates")
    .update({ resume_path: path, updated_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (updateError) throw updateError;
  return path;
}

export async function getResumeUrl(path) {
  if (!path) return null;
  const { data } = await supabase.storage.from("HCP One Resumes").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

export async function deleteResume(path) {
  const { error } = await supabase.storage.from("HCP One Resumes").remove([path]);
  if (error) throw error;
}

// ── DELETE ────────────────────────────────────────────────────────
export async function deleteCandidate(id) {
  // Delete related records first
  await supabase.from("candidate_notes").delete().eq("candidate_id", id);
  await supabase.from("candidate_jobs").delete().eq("candidate_id", id);
  const { error } = await supabase.from("candidates").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteJob(id) {
  await supabase.from("job_notes").delete().eq("job_id", id);
  await supabase.from("candidate_jobs").delete().eq("job_id", id);
  const { error } = await supabase.from("jobs").delete().eq("id", id);
  if (error) throw error;
}

// ── TEAM ──────────────────────────────────────────────────────────
export async function fetchTeam() {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}

export async function upsertTeamMember(member) {
  const { error } = await supabase.from("team_members").upsert(member);
  if (error) throw error;
}

// ── CANDIDATES ────────────────────────────────────────────────────
export async function fetchCandidates() {
  const { data, error } = await supabase
    .from("candidates")
    .select("*, candidate_notes(*), candidate_jobs(job_id)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    linkedin: c.linkedin,
    title: c.title,
    seniority: c.seniority,
    vertical: c.vertical,
    stage: c.stage,
    skills: c.skills || [],
    salary: c.salary,
    location: c.location,
    experience: c.experience,
    source: c.source,
    collaborators: c.collaborators || [],
    // camelCase aliases for the app
    ownerId: c.owner_id,
    workAuth: c.work_auth,
    addedDate: c.added_date,
    lastUpdated: c.updated_at?.split("T")[0],
    resumePath: c.resume_path || null,
    notes: c.candidate_notes || [],
    submittedTo: (c.candidate_jobs || []).map((r) => r.job_id),
  }));
}

export async function upsertCandidate(candidate) {
  const isNew = !candidate.id || typeof candidate.id === "number";
  const row = {
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone || "",
    linkedin: candidate.linkedin || "",
    title: candidate.title || "",
    seniority: candidate.seniority || "",
    vertical: candidate.vertical || "",
    stage: candidate.stage || "Sourced",
    skills: candidate.skills || [],
    salary: candidate.salary || "",
    location: candidate.location || "",
    work_auth: candidate.workAuth || candidate.work_auth || "",
    experience: candidate.experience || "",
    source: candidate.source || "",
    owner_id: candidate.ownerId || candidate.owner_id || "",
    collaborators: candidate.collaborators || [],
    added_date: candidate.addedDate || candidate.added_date || new Date().toISOString().split("T")[0],
    resume_path: candidate.resumePath || candidate.resume_path || null,
    updated_at: new Date().toISOString(),
  };
  if (!isNew) row.id = candidate.id;
  const { data, error } = await supabase.from("candidates").upsert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateCandidateStage(id, stage) {
  const { error } = await supabase
    .from("candidates")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function addCandidateNote(candidateId, note) {
  const row = {
    candidate_id: candidateId,
    author: note.author,
    author_id: note.authorId,
    text: note.text,
    date: note.date,
  };
  const { data, error } = await supabase.from("candidate_notes").insert(row).select().single();
  if (error) throw error;
  return data;
}

// ── JOB ORDERS ────────────────────────────────────────────────────
export async function fetchJobs() {
  const { data, error } = await supabase
    .from("jobs")
    .select("*, job_notes(*), candidate_jobs(candidate_id)")
    .order("priority", { ascending: true });
  if (error) throw error;
  return data.map((j) => ({
    id: j.id,
    title: j.title,
    client: j.client,
    spoc: j.spoc,
    location: j.location,
    salary: j.salary,
    priority: j.priority,
    status: j.status,
    jd: j.jd,
    submitted: j.submitted,
    interviewed: j.interviewed,
    offers: j.offers,
    // camelCase aliases
    empType: j.emp_type,
    reqDate: j.req_date,
    assignedRecruiters: j.assigned_recruiters || [],
    // nested
    notes: j.job_notes || [],
    submittedCandidates: (j.candidate_jobs || []).map((r) => r.candidate_id),
  }));
}

export async function upsertJob(job) {
  const isNew = !job.id || typeof job.id === "number";
  const row = {
    title: job.title,
    client: job.client,
    spoc: job.spoc || "",
    location: job.location || "",
    salary: job.salary || "",
    priority: job.priority || "P1",
    status: job.status || "Open – Sourcing",
    jd: job.jd || "",
    submitted: job.submitted || 0,
    interviewed: job.interviewed || 0,
    offers: job.offers || 0,
    emp_type: job.empType || job.emp_type || "Full-Time",
    req_date: job.reqDate || job.req_date || null,
    assigned_recruiters: job.assignedRecruiters || job.assigned_recruiters || [],
    updated_at: new Date().toISOString(),
  };
  if (!isNew) row.id = job.id;
  const { data, error } = await supabase.from("jobs").upsert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateJobStatus(id, status) {
  const { error } = await supabase
    .from("jobs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function addJobNote(jobId, note) {
  const row = {
    job_id: jobId,
    author: note.author,
    author_id: note.authorId,
    text: note.text,
    date: note.date,
  };
  const { data, error } = await supabase.from("job_notes").insert(row).select().single();
  if (error) throw error;
  return data;
}

// ── CANDIDATE ↔ JOB ───────────────────────────────────────────────
export async function submitCandidateToJob(candidateId, jobId) {
  const { error } = await supabase
    .from("candidate_jobs")
    .upsert({ candidate_id: candidateId, job_id: jobId });
  if (error) throw error;
  await updateCandidateStage(candidateId, "Submitted");
}

export async function removeCandidateFromJob(candidateId, jobId) {
  const { error } = await supabase
    .from("candidate_jobs")
    .delete()
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId);
  if (error) throw error;
}

// ── REALTIME ──────────────────────────────────────────────────────
export function subscribeToChanges(onCandidateChange, onJobChange) {
  const candChannel = supabase
    .channel("candidates-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "candidates" }, onCandidateChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "candidate_notes" }, onCandidateChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "candidate_jobs" }, onCandidateChange)
    .subscribe();
  const jobChannel = supabase
    .channel("jobs-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, onJobChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "job_notes" }, onJobChange)
    .subscribe();
  return () => {
    supabase.removeChannel(candChannel);
    supabase.removeChannel(jobChannel);
  };
}

// ── AUTH ──────────────────────────────────────────────────────────
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ── ACTIVITY TIMELINE ─────────────────────────────────────────────
export async function logActivity(candidateId, type, actorId, actorName, detail, meta={}) {
  const { error } = await supabase.from("candidate_activity").insert({
    candidate_id: candidateId, type, actor_id: actorId, actor_name: actorName, detail, meta,
  });
  if (error) console.error("Activity log error:", error);
}

export async function fetchActivity(candidateId) {
  const { data, error } = await supabase
    .from("candidate_activity")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// ── SCORECARDS ────────────────────────────────────────────────────
export async function fetchScorecards(candidateId) {
  const { data, error } = await supabase
    .from("scorecards")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function upsertScorecard(scorecard) {
  const isNew = !scorecard.id;
  const row = {
    candidate_id: scorecard.candidateId || scorecard.candidate_id,
    job_id: scorecard.jobId || scorecard.job_id || null,
    recruiter_id: scorecard.recruiterId || scorecard.recruiter_id,
    recruiter_name: scorecard.recruiterName || scorecard.recruiter_name,
    interview_type: scorecard.interviewType || scorecard.interview_type,
    rating: scorecard.rating,
    strengths: scorecard.strengths || "",
    concerns: scorecard.concerns || "",
    recommendation: scorecard.recommendation,
    notes: scorecard.notes || "",
    updated_at: new Date().toISOString(),
  };
  if (!isNew) row.id = scorecard.id;
  const { data, error } = await supabase.from("scorecards").upsert(row).select().single();
  if (error) throw error;
  return data;
}

export async function deleteScorecard(id) {
  const { error } = await supabase.from("scorecards").delete().eq("id", id);
  if (error) throw error;
}
