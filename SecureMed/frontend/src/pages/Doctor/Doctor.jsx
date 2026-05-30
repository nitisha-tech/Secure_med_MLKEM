import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Bell, AlertTriangle, FileText, Shield, History, User,
  LogOut, Search, RefreshCw, Eye, Clock, CheckCircle,
  XCircle, ChevronRight, Download, ChevronDown, Sparkles,
  UserCheck, Users, Plus, Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getProfile, discoverRecords, getMyRequests,
  createRequest, getLogs,getMyLogs, getApprovedPatients,
} from "../../services/api";
import { logout } from "../../services/auth";
import { useRecordViewer } from "./RecordViewer";

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

const STATUS_PILL = {
  pending:  "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function Pill({ status }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_PILL[status] || "bg-gray-100 text-gray-600"}`}>
      {status || "unknown"}
    </span>
  );
}

function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function Empty({ icon: Icon = FileText, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-gray-400">
      <Icon className="w-8 h-8 mb-2 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
      <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600 font-bold leading-none">×</button>
      )}
    </div>
  );
}

function guessMime(fileName = "") {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  return {
    pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }[ext] || "application/octet-stream";
}

// ─── Search bar with mode selector ───────────────────────────────────────────

const SEARCH_MODES = [
  { key: "patientId",  label: "Patient ID",   placeholder: "PAT-ABC123",         hint: "Exact match e.g. PAT-AB12CD" },
  { key: "patient",    label: "Name / Email", placeholder: "Priya Sharma…",      hint: "Partial name or email" },
  { key: "department", label: "Department",   placeholder: "Cardiology…",        hint: "Department name" },
  { key: "title",      label: "Record Title", placeholder: "Blood test, X-Ray…", hint: "Record title or type" },
];

function SearchBar({ onSearch, loading }) {
  const [mode,  setMode]  = useState("patientId");
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);
  const dropRef = useRef(null);
  const current = SEARCH_MODES.find(m => m.key === mode);

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) onSearch(mode, query.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-stretch">
      <div className="relative" ref={dropRef}>
        <button type="button" onClick={() => setOpen(v => !v)}
          className="h-full flex items-center gap-2 px-4 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors whitespace-nowrap">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          {current.label}
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
            {SEARCH_MODES.map(m => (
              <button key={m.key} type="button"
                onClick={() => { setMode(m.key); setQuery(""); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${mode === m.key ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                <span className="block font-medium">{m.label}</span>
                <span className="block text-xs text-gray-400 mt-0.5">{m.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <input type="text" value={query} onChange={e => setQuery(e.target.value)}
        placeholder={current.placeholder}
        className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />

      <button type="submit" disabled={loading || !query.trim()}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
        {loading ? "Searching…" : "Search"}
      </button>
    </form>
  );
}

// ─── Approved patients panel ──────────────────────────────────────────────────

function ApprovedPatientsPanel({ onRequestNew, searchQuery }) {
  const [patients, setPatients] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [expanded, setExpanded] = useState({});

  // One useRecordViewer hook handles ALL records in this panel
  const { trigger, modals } = useRecordViewer();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getApprovedPatients();
      setPatients(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load approved patients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = patients.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.patientId?.toLowerCase().includes(q)    ||
      p.patientName?.toLowerCase().includes(q)  ||
      p.patientEmail?.toLowerCase().includes(q)
    );
  });

  const toggleExpand = (uid) =>
    setExpanded(prev => ({ ...prev, [uid]: !prev[uid] }));

  if (loading) return <Spinner label="Loading approved patients…" />;

  return (
    <div className="space-y-3">
      {/* Modals rendered here — covers fetching spinner, sk modal, file viewer */}
      {modals}

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {!visible.length ? (
        <Empty icon={UserCheck} message={
          patients.length
            ? "No approved patients match your search."
            : "No approved access yet. Once a patient approves your request, they appear here."
        } />
      ) : (
        visible.map(p => (
          <div key={p.patientUserId}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">

            {/* Patient header */}
            <div className="flex items-center gap-4 px-5 py-4 cursor-pointer select-none"
              onClick={() => toggleExpand(p.patientUserId)}>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                {p.patientName?.charAt(0).toUpperCase() || "P"}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 text-sm">{p.patientName}</span>
                  <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded-lg">
                    {p.patientId}
                  </span>
                  {p.hasNewRecords && (
                    <span className="flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      <Sparkles className="w-3 h-3" />
                      {p.newRecordCount} new record{p.newRecordCount > 1 ? "s" : ""} — request access to view
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {p.patientEmail}{p.department ? ` · ${p.department}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-gray-400">
                  {p.records?.length || 0} record{p.records?.length !== 1 ? "s" : ""}
                </span>
                <button type="button"
                  onClick={e => { e.stopPropagation(); onRequestNew(p); }}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Request more
                </button>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded[p.patientUserId] ? "rotate-180" : ""}`} />
              </div>
            </div>

            {/* Expanded records */}
            {expanded[p.patientUserId] && (
              <div className="border-t border-gray-50">
                {!p.records?.length ? (
                  <p className="px-5 py-4 text-sm text-gray-400 text-center">No records accessible yet.</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {["Title", "Type", "Department", "Uploaded", "Actions"].map(h => (
                          <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.records.map((rec, i) => (
                        <tr key={rec._id}
                          className={`border-b last:border-0 hover:bg-blue-50/30 transition-colors ${i % 2 === 1 ? "bg-gray-50/40" : ""}`}>
                          <td className="px-5 py-3 font-medium text-gray-800 text-sm">{rec.title}</td>
                          <td className="px-5 py-3 text-gray-500 text-sm">{rec.type}</td>
                          <td className="px-5 py-3 text-gray-500 text-sm">{rec.department || "—"}</td>
                          <td className="px-5 py-3 text-gray-400 text-xs">
                            {rec.uploadedAt
                              ? new Date(rec.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                              : "—"}
                          </td>
                          <td className="px-5 py-3">
                            {rec.requestId ? (
                              // trigger() handles everything: fetch bundle → sk modal → decrypt → view/download
                              <button
                                onClick={() => trigger(rec.requestId, rec.fileName || rec.title)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline">
                                <Eye className="w-3.5 h-3.5" /> View / Download
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))
      )}

      <div className="flex justify-end">
        <button onClick={load}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
    </div>
  );
}

// ─── Search results panel ─────────────────────────────────────────────────────

function SearchResultsPanel({ results, requested, onRequest, source }) {
  if (!results.length) return <Empty message="No records found. Try a different search." />;
  return (
    <div className="space-y-3">
      {source === "mongodb-fallback" && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Showing MongoDB results — Fabric / CP-ABE key not configured.
        </div>
      )}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {["Record", "Patient", "ID", "Type", "Department", "Uploaded", "Action"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((rec, i) => {
              const state = requested[rec._id];
              return (
                <tr key={rec._id}
                  className={`border-b last:border-0 hover:bg-gray-50 ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-3 font-medium text-gray-800 text-sm max-w-[160px] truncate">{rec.title || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-sm">{rec.patientName || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{rec.patientId || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-sm">{rec.type || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-sm">{rec.department || "—"}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {rec.uploadedAt
                      ? new Date(rec.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {state === "done" ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-semibold whitespace-nowrap">
                        <CheckCircle className="w-3.5 h-3.5" /> Requested
                      </span>
                    ) : state === "error" ? (
                      <span className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    ) : (
                      <button onClick={() => onRequest(rec)} disabled={state === "pending"}
                        className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50 whitespace-nowrap">
                        {state === "pending" ? "Requesting…" : "Request Access"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Medical Records tab ──────────────────────────────────────────────────────

function RecordsTab() {
  const [view,        setView]        = useState("approved");
  const [searchQuery, setSearchQuery] = useState("");
  const [results,     setResults]     = useState([]);
  const [source,      setSource]      = useState("");
  const [searching,   setSearching]   = useState(false);
  const [searchError, setSearchError] = useState("");
  const [requested,   setRequested]   = useState({});

  const handleRequest = async (record) => {
    setRequested(prev => ({ ...prev, [record._id]: "pending" }));
    try {
      await createRequest({ recordId: record._id, recordTitle: record.title });
      setRequested(prev => ({ ...prev, [record._id]: "done" }));
    } catch {
      setRequested(prev => ({ ...prev, [record._id]: "error" }));
    }
  };

  const handleSearch = async (mode, query) => {
    setSearchError("");
    setResults([]);

    if (mode === "patientId") {
      setSearchQuery(query);
      setView("approved");
      setSearching(true);
      try {
        const res  = await discoverRecords(mode, query);
        const data = res.data || [];
        if (data.length) {
          setResults(data);
          setSource(res.source || "");
          setView("both");
        }
      } catch (err) {
        setSearchError(err.message);
      } finally {
        setSearching(false);
      }
      return;
    }

    setSearchQuery("");
    setView("search");
    setSearching(true);
    try {
      const res = await discoverRecords(mode, query);
      setResults(res.data || []);
      setSource(res.source || "");
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleClearSearch = () => {
    setView("approved");
    setSearchQuery("");
    setResults([]);
    setSearchError("");
  };

  const handleRequestNewForPatient = (patient) =>
    handleSearch("patientId", patient.patientId);

  return (
    <div className="space-y-5">
      <SearchBar onSearch={handleSearch} loading={searching} />

      {(view !== "approved" || searchQuery) && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {view === "approved" && searchQuery && `Filtering approved patients by "${searchQuery}"`}
            {view === "search"   && "Search results"}
            {view === "both"     && `Approved patients matching "${searchQuery}" + backend results`}
          </p>
          <button onClick={handleClearSearch}
            className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      <ErrorBanner message={searchError} onDismiss={() => setSearchError("")} />

      {(view === "approved" || view === "both") && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-green-600" />
            <h3 className="text-sm font-semibold text-gray-700">Approved Patients</h3>
            <span className="text-xs text-gray-400">— patients who have granted you access</span>
          </div>
          <ApprovedPatientsPanel
            onRequestNew={handleRequestNewForPatient}
            searchQuery={searchQuery}
          />
        </div>
      )}

      {view === "both" && results.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Also found on server</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>
      )}

      {(view === "search" || view === "both") && (
        <div className="space-y-3">
          {view === "search" && (
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-700">Search Results</h3>
            </div>
          )}
          {searching ? <Spinner label="Searching…" /> : (
            <SearchResultsPanel
              results={results}
              requested={requested}
              onRequest={handleRequest}
              source={source}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── My Requests tab ──────────────────────────────────────────────────────────

function RequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  // useRecordViewer handles fetch → sk modal → decrypt → view/download
  const { trigger, modals } = useRecordViewer();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getMyRequests();
      setRequests(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* All modals (loading spinner, sk prompt, file viewer) */}
      {modals}

      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">All access requests you have submitted.</p>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {loading ? <Spinner /> : !requests.length ? (
        <Empty message="No requests yet." />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Record", "Patient", "Patient ID", "Date", "Status", "Action"].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((req, i) => (
                <tr key={req._id}
                  className={`border-b last:border-0 hover:bg-gray-50 ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-5 py-4 font-medium text-gray-800 text-sm">{req.recordTitle || "Record"}</td>
                  <td className="px-5 py-4 text-gray-500 text-sm">{req.patientName || "—"}</td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                      {req.patientId || "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">
                    {req.createdAt
                      ? new Date(req.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </td>
                  <td className="px-5 py-4"><Pill status={req.status} /></td>
                  <td className="px-5 py-4">
                    {req.status === "approved" && (
                      // trigger() fetches bundle → prompts for skDoctor → decrypts → opens viewer
                      <button
                        onClick={() => trigger(req._id, req.recordTitle || "record")}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                        <Eye className="w-3.5 h-3.5" /> View / Download
                      </button>
                    )}
                    {req.status === "pending" && (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <Clock className="w-3.5 h-3.5" /> Waiting
                      </span>
                    )}
                    {req.status === "rejected" && (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Logs tab ─────────────────────────────────────────────────────────────────

const ACTION_COLOR = {
  AUTH_LOGIN:         "bg-slate-100 text-slate-600",
  AUTH_REGISTER:      "bg-blue-100 text-blue-700",
  RECORD_UPLOAD:      "bg-teal-100 text-teal-700",
  RECORD_VIEW:        "bg-sky-100 text-sky-700",
  DOCTOR_RECORD_VIEW: "bg-indigo-100 text-indigo-700",
  ACCESS_REQUEST:     "bg-amber-100 text-amber-700",
  ACCESS_GRANTED:     "bg-green-100 text-green-700",
  ACCESS_DENIED:      "bg-red-100 text-red-700",
  REKEY_GENERATED:    "bg-purple-100 text-purple-700",
  PRESCRIPTION_ADD:   "bg-pink-100 text-pink-700",
};

const ACTION_ICON = {
  AUTH_LOGIN:         "🔐",
  AUTH_REGISTER:      "👤",
  RECORD_UPLOAD:      "📤",
  RECORD_VIEW:        "👁",
  DOCTOR_RECORD_VIEW: "🩺",
  ACCESS_REQUEST:     "🔑",
  ACCESS_GRANTED:     "✅",
  ACCESS_DENIED:      "🚫",
  REKEY_GENERATED:    "🔄",
  PRESCRIPTION_ADD:   "💊",
};

function LogsTab() {
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [expanded, setExpanded] = useState(null); // eventId of expanded row

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getMyLogs();
      setLogs(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load activity logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const META_LABELS = {
    recordId:    "Record ID",
    recordTitle: "Record Title",
    department:  "Department",
    requestId:   "Request ID",
    patientId:   "Patient ID",
    patientName: "Patient Name",
    doctorId:    "Doctor ID",
    doctorName:  "Doctor Name",
    email:       "Email",
    reason:      "Reason",
    ipfsCid:     "IPFS CID",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          Your immutable activity trail recorded on Hyperledger Fabric.
        </p>
        <button onClick={load}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {loading ? <Spinner /> : !logs.length ? (
        <Empty icon={History} message="No activity recorded yet." />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 divide-y overflow-hidden">
          {logs.map((log, i) => {
            const meta = log.meta?.meta || log.meta || {};
            const isOpen = expanded === (log.id || i);

            return (
              <div key={log.id || i}>
                {/* Row */}
                <div
                  onClick={() => setExpanded(isOpen ? null : (log.id || i))}
                  className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5 text-lg">
                    {ACTION_ICON[log.action] || "⚡"}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ACTION_COLOR[log.action] || "bg-gray-100 text-gray-500"}`}>
                        {log.action?.replace(/_/g, " ") || "EVENT"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{log.detail}</p>

                    {/* Inline meta pills */}
                    {(() => {
                      const pills = [
                        meta.patientName  && `👤 ${meta.patientName}`,
                        meta.recordTitle  && `📄 ${meta.recordTitle}`,
                        meta.department   && `🏥 ${meta.department}`,
                        meta.doctorName   && `🩺 ${meta.doctorName}`,
                      ].filter(Boolean);
                      return pills.length > 0 ? (
                        <div className="flex gap-2 flex-wrap mt-1.5">
                          {pills.map(p => (
                            <span key={p} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{p}</span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>

                  {/* Time + expand */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-gray-400 whitespace-nowrap">{log.time}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </div>

                {/* Expanded block detail */}
                {isOpen && (
                  <div className="px-6 pb-5 bg-slate-50 border-t border-slate-100">
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">

                      {/* Block fields */}
                      <div className="bg-white rounded-xl p-4 space-y-2 ring-1 ring-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Block Fields</p>
                        {[
                          ["Event ID",   log.id],
                          ["TX Hash",    log.hash],
                          ["Timestamp",  log.time],
                          ["Action",     log.action],
                        ].map(([label, val]) => val ? (
                          <div key={label} className="flex gap-3 text-xs">
                            <span className="text-slate-400 w-20 shrink-0">{label}</span>
                            <span className="font-mono text-slate-700 break-all">{val}</span>
                          </div>
                        ) : null)}
                      </div>

                      {/* Event metadata */}
                      {Object.keys(meta).length > 0 && (
                        <div className="bg-white rounded-xl p-4 space-y-2 ring-1 ring-blue-100">
                          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-3">Event Metadata</p>
                          {Object.entries(meta).map(([k, v]) => (
                            <div key={k} className="flex gap-3 text-xs">
                              <span className="text-slate-400 w-24 shrink-0">{META_LABELS[k] || k}</span>
                              <span className="font-mono text-slate-700 break-all">
                                {typeof v === "object" ? JSON.stringify(v) : String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Raw JSON */}
                    <details className="mt-3">
                      <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                        View raw JSON
                      </summary>
                      <pre className="mt-2 text-[10px] bg-slate-900 text-emerald-400 rounded-xl p-4 overflow-x-auto leading-relaxed">
                        {JSON.stringify(log, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && logs.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          {logs.length} event{logs.length !== 1 ? "s" : ""} · Immutable Fabric ledger
        </p>
      )}
    </div>
  );
}

// ─── Main DoctorDashboard ─────────────────────────────────────────────────────

const DoctorDashboard = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [doctor,    setDoctor]    = useState({ name: "", specialty: "", hospital: "" });
  const navigate = useNavigate();

  useEffect(() => {
    getProfile()
      .then(res => {
        const d = res?.data || {};
        setDoctor({
          name:      d.name              || "Doctor",
          specialty: d.specialization    || d.specialty || "",
          hospital:  d.hospital          || "",
        });
      })
      .catch(() => {});
  }, []);

  const handleLogout = () => logout(navigate);
  const initial = doctor.name?.trim().charAt(0).toUpperCase() || "D";

  const NAV_ITEMS = [
    { id: "dashboard", label: "Dashboard",        icon: Users         },
    { id: "records",   label: "Medical Records",  icon: FileText      },
    { id: "requests",  label: "My Requests",      icon: Shield        },
    { id: "emergency", label: "Emergency Access", icon: AlertTriangle },
    { id: "logs",      label: "Activity Logs",    icon: History       },
    { id: "profile",   label: "My Profile",       icon: User          },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* Sidebar */}
      <div className="w-64 bg-white border-r flex flex-col flex-shrink-0">
        <div className="p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white text-lg">🩺</div>
            <div>
              <h1 className="text-lg font-bold">SecureMed</h1>
              <p className="text-xs text-gray-400">Doctor Portal</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-3 overflow-y-auto">
          <nav className="space-y-0.5">
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === item.id ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"
                }`}>
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-3 border-t space-y-1">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{doctor.name || "—"}</p>
              <p className="text-xs text-gray-400 truncate">
                {[doctor.specialty, doctor.hospital].filter(Boolean).join(" · ") || "Doctor"}
              </p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-all">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b px-8 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            {NAV_ITEMS.find(n => n.id === activeTab)?.label || activeTab}
          </h2>
          <div className="flex items-center gap-6">
            <Bell className="w-5 h-5 text-gray-400" />
            <div className="text-right">
              <p className="font-medium text-sm">{doctor.name || "—"}</p>
              <p className="text-xs text-gray-400">Welcome back 👋</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-8 overflow-y-auto">

          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-5">
                {[
                  { label: "Medical Records", desc: "View approved patients & search records", icon: FileText, tab: "records",  color: "text-blue-600",   bg: "bg-blue-50"   },
                  { label: "My Requests",     desc: "Track your access request statuses",      icon: Shield,   tab: "requests", color: "text-purple-600", bg: "bg-purple-50" },
                  { label: "Activity Logs",   desc: "Your recent actions and events",          icon: History,  tab: "logs",     color: "text-green-600",  bg: "bg-green-50"  },
                ].map(card => (
                  <button key={card.tab} onClick={() => setActiveTab(card.tab)}
                    className="bg-white p-6 rounded-2xl shadow-sm ring-1 ring-slate-100 text-left hover:shadow-md transition-shadow group">
                    <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center mb-4`}>
                      <card.icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                    <p className="font-semibold text-gray-800 text-sm">{card.label}</p>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{card.desc}</p>
                    <div className={`flex items-center gap-1 mt-3 text-xs font-semibold ${card.color} opacity-0 group-hover:opacity-100 transition-opacity`}>
                      Open <ChevronRight className="w-3 h-3" />
                    </div>
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-6">
                <h3 className="font-semibold text-gray-700 mb-3 text-sm">How it works</h3>
                <ol className="text-sm text-gray-500 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>Search for a patient using their <strong>Patient ID</strong> (PAT-XXXXXX), name, or department in <strong>Medical Records</strong>.</li>
                  <li>Click <strong>Request Access</strong> on the record you need — the patient will see your request.</li>
                  <li>Once approved, the patient appears in your <strong>Approved Patients</strong> list with all accessible records.</li>
                  <li>Click <strong>View / Download</strong> on any record — you'll be prompted for your secret key to decrypt it locally in your browser.</li>
                  <li>A <span className="text-amber-600 font-medium">✦ new records</span> badge appears when the patient uploads more — click <strong>Request more</strong> to get access.</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === "records"   && <RecordsTab />}
          {activeTab === "requests"  && <RequestsTab />}
          {activeTab === "logs"      && <LogsTab />}

          {activeTab === "profile" && (
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 p-8 max-w-xl">
              <h2 className="text-xl font-bold mb-6">My Profile</h2>
              <div className="flex gap-5 mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                  {initial}
                </div>
                <div>
                  <p className="text-lg font-semibold">{doctor.name || "—"}</p>
                  <p className="text-gray-500 text-sm">{doctor.specialty}</p>
                  <p className="text-gray-400 text-sm">{doctor.hospital}</p>
                </div>
              </div>
              <button onClick={handleLogout}
                className="flex items-center gap-2 px-5 py-3 bg-red-50 text-red-600 rounded-xl font-semibold text-sm hover:bg-red-100 transition-colors">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          )}

          {activeTab === "emergency" && (
            <div className="bg-white p-10 text-center rounded-2xl ring-1 ring-slate-100 shadow-sm">
              <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">Emergency access coming soon.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorDashboard;