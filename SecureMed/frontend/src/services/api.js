// src/services/api.js
const API_BASE = "http://localhost:5000/api";

const apiCall = async (endpoint, options = {}) => {
  const token = localStorage.getItem("token");
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...options,
    });
  } catch {
    throw new Error("Network error — is the backend running?");
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`Non-JSON response (status ${response.status})`); }
  if (!response.ok) throw new Error(data.message || "API Error");
  return data;
};

export const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

// ── Auth ──────────────────────────────────────────────────────────────────────
export const loginUser    = (payload) => apiCall("/auth/login",    { method: "POST", body: JSON.stringify(payload) });
export const registerUser = (payload) => apiCall("/auth/register", { method: "POST", body: JSON.stringify(payload) });

// ── Records ───────────────────────────────────────────────────────────────────
export const uploadRecord  = (data) => apiCall("/records/upload",  { method: "POST", body: JSON.stringify(data) });
export const getRecords    = ()     => apiCall("/records");
export const deleteRecord  = (id)   => apiCall(`/records/${id}`,   { method: "DELETE" });
export const decryptRecord = (id, body) => apiCall(`/records/${id}/decrypt`, { method: "POST", body: JSON.stringify(body) });

// ── Doctor — discover ─────────────────────────────────────────────────────────
// mode: "patientId" | "patient" | "department" | "title"
export const discoverRecords    = (mode, query) => apiCall("/records/discover",          { method: "POST", body: JSON.stringify({ mode, query }) });
export const getApprovedPatients = ()            => apiCall("/records/approved-patients");

// ── Requests ──────────────────────────────────────────────────────────────────
export const getRequests   = ()     => apiCall("/requests");
export const createRequest = (data) => apiCall("/requests",         { method: "POST", body: JSON.stringify(data) });

// rekeyBundle = { ct_kem2, key_capsule, kc_nonce, kc_tag } — no sk ever here
export const approveRequest = (id, rekeyBundle) =>
  apiCall(`/requests/${id}/approve`, { method: "POST", body: JSON.stringify(rekeyBundle) });
export const rejectRequest  = (id) => apiCall(`/requests/${id}/reject`, { method: "POST" });
export const getMyRequests  = ()   => apiCall("/requests/mine");
export const fetchRecord    = (id) => apiCall(`/requests/${id}/fetch`);

// ── Logs ──────────────────────────────────────────────────────────────────────
export const getLogs     = () => apiCall("/logs");           // MongoDB logs (keep if needed)
export const getMyLogs   = () => apiCall("/my/logs");        // Blockchain activity log

// ── Profile ───────────────────────────────────────────────────────────────────
export const getProfile = () => apiCall("/profile");

// ── Admin ─────────────────────────────────────────────────────────────────────
export const getPendingApplications = ()   => apiCall("/auth/applications/pending");
export const approveApplication     = (id) => apiCall(`/auth/applications/${id}/approve`, { method: "POST" });
export const rejectApplication      = (id, reason) =>
  apiCall(`/auth/applications/${id}/reject`, {
    method: "POST", body: JSON.stringify({ reason: reason || "Not approved by admin", rejectedBy: "Admin" }),
  });
  export const resetRequest = (id) =>
  apiCall(`/requests/${id}/reset`, { method: "POST" });