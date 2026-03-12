import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hshhhrkkbzgvmlyuwhtj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzaGhocmtrYnpndm1seXV3aHRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzQ4MjIsImV4cCI6MjA4ODg1MDgyMn0.W8Ff6YaUMnxSNyhLTlyLtjvfYCwPLBespxxU7xKVjgg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    ...c,
    ownerId: c.owner_id || c.ownerId,
    notes: c.candidate_notes || [],
    submittedTo: (c.candidate_jobs || []).map((r) => r.job_id),
    collaborators: c.collaborators || [],
    skills: c.skills || [],
  }));
}

export async function upsertCandidate(candidate) {
  const { notes, submittedTo, candidate_notes, candidate_jobs, ownerId, ...row } = candidate;
  const { data, error } = await supabase
    .from("candidates")
    .upsert({ ...row, owner_id: ownerId || row.owner_id, updated_at: new Date().toISOString() })
    .select()
    .single();
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
  const { data, error } = await supabase
    .from("candidate_notes")
    .insert({ candidate_id: candidateId, ...note })
    .select()
    .single();
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
    ...j,
    notes: j.job_notes || [],
    submittedCandidates: (j.candidate_jobs || []).map((r) => r.candidate_id),
    assignedRecruiters: j.assigned_recruiters || [],
  }));
}

export async function upsertJob(job) {
  const { notes, submittedCandidates, job_notes, candidate_jobs, ...row } = job;
  const { data, error } = await supabase
    .from("jobs")
    .upsert({
      ...row,
      assigned_recruiters: row.assignedRecruiters || [],
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
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
  const { data, error } = await supabase
    .from("job_notes")
    .insert({ job_id: jobId, ...note })
    .select()
    .single();
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
