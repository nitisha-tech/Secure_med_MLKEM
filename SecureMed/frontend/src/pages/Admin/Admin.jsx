import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:5000";
const getToken = () => localStorage.getItem("token");
const authHeader = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` });

// ═══════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════
const Badge = ({ label, color = "gray" }) => {
  const s = {
    green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    red: "bg-red-50 text-red-600 ring-1 ring-red-200",
    yellow: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    gray: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
    teal: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
    purple: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${s[color] || s.gray}`}>{label}</span>;
};
const Pill = ({ v }) => {
  if (["Active", "Approved", "Success", "granted"].includes(v)) return <Badge label={v} color="green" />;
  if (["Denied", "Inactive", "Suspended", "Rejected"].includes(v)) return <Badge label={v} color="red" />;
  if (["Pending", "pending"].includes(v)) return <Badge label={v} color="yellow" />;
  if (["On Leave"].includes(v)) return <Badge label={v} color="purple" />;
  return <Badge label={v} color="gray" />;
};
const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
        <button onClick={onClose} className="text-slate-300 hover:text-slate-600 text-xl leading-none transition-colors">✕</button>
      </div>
      <div className="px-6 py-5 max-h-[80vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);
const TH = ({ cols }) => (
  <thead>
    <tr className="bg-slate-50 border-b border-slate-100">
      {cols.map(c => <th key={c} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{c}</th>)}
    </tr>
  </thead>
);
const TR = ({ children, i = 0 }) => <tr className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${i % 2 === 1 ? "bg-slate-50/30" : ""}`}>{children}</tr>;
const TD = ({ children, mono }) => <td className={`px-4 py-3 text-sm ${mono ? "font-mono text-xs text-slate-400" : "text-slate-700"}`}>{children}</td>;
const TCard = ({ children }) => <div className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm overflow-hidden">{children}</div>;
const TabBar = ({ tabs, active, onChange }) => (
  <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl mb-6 w-fit flex-wrap">
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${active === t.id ? "bg-white text-teal-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
        <span>{t.icon}</span>{t.label}
        {t.badge > 0 && <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">{t.badge}</span>}
      </button>
    ))}
  </div>
);
const PageHeader = ({ title, sub, action }) => (
  <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
    <div><h2 className="text-lg font-bold text-slate-800">{title}</h2>{sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}</div>
    {action}
  </div>
);
const Empty = ({ msg }) => (
  <div className="text-center py-14 bg-white rounded-2xl ring-1 ring-slate-100 text-slate-400 text-sm">{msg}</div>
);
const Spinner = () => (
  <div className="text-center py-14 text-slate-400 text-sm animate-pulse">Loading…</div>
);

// ═══════════════════════════════════════════════════════════════
// PAGE 1 — DASHBOARD
// ═══════════════════════════════════════════════════════════════
const PageDashboard = ({ setPage, doctorCount, pendingCount, logCount }) => (
  <div className="space-y-6">
    <div className="flex items-end justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-xs text-slate-400 mt-0.5">SecureMed admin overview</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setPage("people")} className="text-xs font-semibold px-4 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 hover:ring-teal-300 hover:text-teal-700 transition-all">People →</button>
        <button onClick={() => setPage("security")} className="text-xs font-semibold px-4 py-2 rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm">Security →</button>
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[
        { icon: "🩺", label: "Active Doctors", value: doctorCount, color: "text-teal-600", bg: "bg-teal-50", ring: "ring-teal-100" },
        { icon: "📋", label: "Pending Applications", value: pendingCount, color: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-100" },
        { icon: "📜", label: "Blockchain Events", value: logCount, color: "text-blue-600", bg: "bg-blue-50", ring: "ring-blue-100" },
        { icon: "🔒", label: "Encryption", value: "AES-256", color: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-100" },
      ].map(({ icon, label, value, color, bg, ring }) => (
        <div key={label} className="bg-white rounded-2xl p-5 ring-1 ring-slate-100 shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow">
          <div className={`w-11 h-11 rounded-xl ${bg} ring-1 ${ring} flex items-center justify-center text-xl flex-shrink-0`}>{icon}</div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value ?? "—"}</p>
          </div>
        </div>
      ))}
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[
        { icon: "🔐", label: "TLS 1.3", val: "In Transit", sub: "All API traffic encrypted", color: "text-emerald-600" },
        { icon: "🏥", label: "System Uptime", val: "99.98%", sub: "Last 30 days", color: "text-blue-600" },
        { icon: "🗄️", label: "Retention", val: "7 Years", sub: "Regulatory policy enforced", color: "text-slate-600" },
      ].map(({ icon, label, val, sub, color }) => (
        <div key={label} className="bg-white rounded-2xl p-5 ring-1 ring-slate-100 shadow-sm flex items-center gap-4">
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`text-base font-bold mt-0.5 ${color}`}>{val}</p>
            <p className="text-[11px] text-slate-400">{sub}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// PAGE 2 — PEOPLE
// ═══════════════════════════════════════════════════════════════

const TabDoctors = ({ onCountChange }) => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(null);
  const [confirm, setConfirm] = useState(null); // { doc, action: "suspend"|"reinstate" }

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/admin/doctors`, { headers: authHeader() });
      const data = await res.json();
      if (res.ok) {
        const docs = (data.data || []).map((d) => ({
          id: d._id,
          name: d.name,
          email: d.email,
          spec: d.specialization || "—",
          dept: d.department || "—",
          license: d.medicalId || "—",
          status: d.status || "Active",
        }));
        setDoctors(docs);
        onCountChange?.(docs.filter((d) => d.status === "Active").length);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const applyStatus = async (doc, nextStatus) => {
    try {
      const res = await fetch(`${API}/api/admin/doctors/${doc.id}/status`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.message || "Failed");

      const updated = doctors.map((d) =>
        d.id === doc.id ? { ...d, status: nextStatus } : d
      );
      setDoctors(updated);
      onCountChange?.(updated.filter((d) => d.status === "Active").length);
      setConfirm(null);
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Doctors" sub={`${doctors.length} doctors on record`} />
      {doctors.length === 0
        ? <Empty msg="No approved doctors yet." />
        : (
          <TCard>
            <table className="w-full">
              <TH cols={["Name & Email", "Specialization", "Department", "Status", "Actions"]} />
              <tbody>{doctors.map((d, i) => (
                <TR key={d.id} i={i}>
                  <TD>
                    <div className="font-semibold text-slate-800">{d.name}</div>
                    <div className="text-[11px] text-slate-400">{d.email}</div>
                  </TD>
                  <TD>{d.spec}</TD>
                  <TD>{d.dept}</TD>
                  <TD><Pill v={d.status} /></TD>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {/* View */}
                      <button
                        title="View details"
                        onClick={() => setView(d)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-all text-sm"
                      >👁</button>

                      {/* Suspend — only when Active */}
                      {d.status !== "Suspended" && (
                        <button
                          title="Suspend account"
                          onClick={() => setConfirm({ doc: d, action: "suspend" })}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-all text-sm"
                        >🚫</button>
                      )}

                      {/* Reinstate — only when Suspended */}
                      {d.status === "Suspended" && (
                        <button
                          title="Reinstate account"
                          onClick={() => setConfirm({ doc: d, action: "reinstate" })}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-emerald-50 hover:text-emerald-600 transition-all text-sm"
                        >✅</button>
                      )}
                    </div>
                  </td>
                </TR>
              ))}</tbody>
            </table>
          </TCard>
        )}

      {/* View modal */}
      {view && (
        <Modal title={`Doctor — ${view.name}`} onClose={() => setView(null)}>
          <div className="space-y-3 text-sm">
            {[["Email", view.email], ["Specialization", view.spec],
            ["Department", view.dept], ["License", view.license]].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-slate-400">{k}</span>
                <span className="font-medium text-slate-800">{v || "—"}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span className="text-slate-400">Status</span>
              <Pill v={view.status} />
            </div>
          </div>
          <button
            onClick={() => setView(null)}
            className="mt-5 w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors"
          >Close</button>
        </Modal>
      )}

      {/* Confirm modal */}
      {confirm && (
        <Modal
          title={confirm.action === "suspend" ? "Suspend Doctor" : "Reinstate Doctor"}
          onClose={() => setConfirm(null)}
        >
          <p className="text-sm text-slate-600 mb-1">
            {confirm.action === "suspend"
              ? <>Suspend <strong>{confirm.doc.name}</strong>? They will be blocked from logging in immediately.</>
              : <>Reinstate <strong>{confirm.doc.name}</strong>? They will regain full access.</>
            }
          </p>

          {/* Status badge preview */}
          <div className="flex items-center gap-2 my-4 p-3 bg-slate-50 rounded-xl">
            <Pill v={confirm.doc.status} />
            <span className="text-slate-400 text-xs">→</span>
            <Pill v={confirm.action === "suspend" ? "Suspended" : "Active"} />
          </div>

          <div className="flex gap-3 mt-2">
            <button
              onClick={() => setConfirm(null)}
              className="flex-1 py-2.5 border rounded-xl text-slate-500 text-sm font-semibold hover:bg-slate-50"
            >Cancel</button>
            <button
              onClick={() => applyStatus(confirm.doc, confirm.action === "suspend" ? "Suspended" : "Active")}
              className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-colors ${confirm.action === "suspend"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
                }`}
            >
              {confirm.action === "suspend" ? "Confirm Suspend" : "Confirm Reinstate"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

const TabApplications = ({ onApproved }) => {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appA, setAppA] = useState(null);
  const [appR, setAppR] = useState(null);
  const [rNote, setRNote] = useState("");

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/auth/applications/pending`, { headers: authHeader() });
      const data = await res.json();
      if (res.ok) {
        setApps((data.applications || []).map(a => ({
          ...a,
          id: a._id || a.id,
          spec: a.specialization || a.spec,
          dept: a.department || a.dept,
        })));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const handleApprove = async (app) => {
    const appId = app.id || app._id;
    try {
      const res = await fetch(`${API}/api/auth/applications/${appId}/approve`, {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ approvedBy: "Admin" }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ ${app.name} approved!`);

        setApps(prev => prev.filter(a => (a.id || a._id) !== appId));
        onApproved?.();
        setAppA(null);
      } else {
        alert(data.message || "Failed to approve");
      }
    } catch (e) { alert("Server error: " + e.message); }
  };

  const handleReject = async (app) => {
    const appId = app.id || app._id;
    try {
      const res = await fetch(`${API}/api/auth/applications/${appId}/reject`, {
        method: "POST", headers: authHeader(),
        body: JSON.stringify({ reason: rNote || "Not approved", rejectedBy: "Admin" }),
      });
      if (res.ok) {
        alert(`Rejected ${app.name}`);
        setApps(prev => prev.filter(a => (a.id || a._id) !== appId));
        setAppR(null); setRNote("");
      } else { alert("Failed to reject"); }
    } catch (e) { alert("Server error: " + e.message); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Pending Applications" sub={`${apps.length} awaiting review`} />
      {apps.length === 0
        ? <Empty msg="No pending applications." />
        : (
          <div className="space-y-4">
            {apps.map(a => (
              <div key={a.id} className="bg-white rounded-2xl p-6 ring-1 ring-slate-100 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-bold flex items-center justify-center flex-shrink-0 text-lg">
                    {a.name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-lg text-slate-800">{a.name}</div>
                    <div className="text-sm text-slate-500">{a.email}</div>
                    <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                      <div><span className="text-slate-400">Specialization: </span><span className="font-medium">{a.specialization || a.spec}</span></div>
                      <div><span className="text-slate-400">Department: </span><span className="font-medium">{a.department || a.dept}</span></div>
                      <div><span className="text-slate-400">License: </span><span className="font-medium">{a.medicalId || a.license}</span></div>
                      {a.experience && <div><span className="text-slate-400">Experience: </span><span className="font-medium">{a.experience}</span></div>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button onClick={() => setAppA(a)} className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700">Approve</button>
                    <button onClick={() => setAppR(a)} className="bg-rose-50 text-rose-600 px-5 py-2 rounded-xl text-sm font-semibold ring-1 ring-rose-200 hover:bg-rose-100">Reject</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {appA && (
        <Modal title="Approve Doctor" onClose={() => setAppA(null)}>
          <p className="mb-6 text-sm text-slate-600">Approve <strong>{appA.name}</strong>? This creates their account and enrolls them on the blockchain.</p>
          <div className="flex gap-3">
            <button onClick={() => setAppA(null)} className="flex-1 py-3 border rounded-xl text-slate-500 text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button onClick={() => handleApprove(appA)} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700">Confirm Approval</button>
          </div>
        </Modal>
      )}

      {appR && (
        <Modal title="Reject Application" onClose={() => { setAppR(null); setRNote(""); }}>
          <p className="mb-4 text-sm text-slate-600">Reject <strong>{appR.name}</strong>?</p>
          <textarea value={rNote} onChange={e => setRNote(e.target.value)}
            placeholder="Reason (optional)"
            className="w-full h-24 border border-slate-200 rounded-2xl p-4 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none" />
          <div className="flex gap-3">
            <button onClick={() => { setAppR(null); setRNote(""); }} className="flex-1 py-3 border rounded-xl text-slate-500 text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button onClick={() => handleReject(appR)} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-semibold text-sm hover:bg-rose-700">Confirm Rejection</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

const PagePeople = ({ onApproved, onDoctorCountChange }) => {
  const [tab, setTab] = useState("applications");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetch(`${API}/api/auth/applications/pending`, { headers: authHeader() })
      .then(r => r.json())
      .then(d => setPendingCount((d.applications || []).length))
      .catch(() => { });
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">People</h1>
        <p className="text-xs text-slate-400 mt-0.5">Manage doctors and applications</p>
      </div>
      <TabBar active={tab} onChange={setTab} tabs={[
        { id: "applications", icon: "📋", label: "Approve Applications", badge: pendingCount },
        { id: "doctors", icon: "🩺", label: "Active Doctors" },
      ]} />
      {tab === "applications" && (
        <TabApplications onApproved={() => { onApproved?.(); setPendingCount(p => Math.max(0, p - 1)); }} />
      )}
      {tab === "doctors" && <TabDoctors onCountChange={onDoctorCountChange} />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// PAGE 3 — SECURITY: blockchain logs from /api/admin/logs
// ═══════════════════════════════════════════════════════════════
const ACTION_COLOR = {
  // existing
  ACCESS_REQUEST: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  ACCESS_GRANTED: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  ACCESS_DENIED: "bg-red-50 text-red-600 ring-1 ring-red-100",
  // add these
  AUTH_LOGIN: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
  AUTH_REGISTER: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  AUTH_LOGOUT: "bg-rose-50 text-rose-600 ring-1 ring-rose-200",
  RECORD_UPLOAD: "bg-teal-50 text-teal-700 ring-1 ring-teal-100",
  RECORD_VIEW: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  DOCTOR_RECORD_VIEW: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
  ACCOUNT_APPROVED: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  ACCOUNT_REJECTED: "bg-red-50 text-red-600 ring-1 ring-red-100",
  ACCOUNT_SUSPENDED: "bg-orange-50 text-orange-700 ring-1 ring-orange-100",
  REKEY_GENERATED: "bg-purple-50 text-purple-700 ring-1 ring-purple-100",
};

const ACTION_ICON = {
  // existing
  ACCESS_REQUEST: "🔑",
  ACCESS_GRANTED: "✅",
  ACCESS_DENIED: "🚫",
  // add these
  AUTH_LOGIN: "🔐",
  AUTH_REGISTER: "👤",
  AUTH_LOGOUT: "🚪",
  RECORD_UPLOAD: "📤",
  RECORD_VIEW: "👁",
  DOCTOR_RECORD_VIEW: "🩺",
  ACCOUNT_APPROVED: "✅",
  ACCOUNT_REJECTED: "❌",
  ACCOUNT_SUSPENDED: "⚠️",
  REKEY_GENERATED: "🔄",
};

const MetaRow = ({ label, value }) => {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-3 text-xs">
      <span className="text-slate-400 shrink-0 w-28">{label}</span>
      <span className="font-mono text-slate-700 break-all">{String(value)}</span>
    </div>
  );
};

const BlockDetailModal = ({ log, onClose }) => {
  const meta = log.meta?.meta || log.meta || {};

  const META_LABELS = {
    recordId: "Record ID",
    recordTitle: "Record Title",
    department: "Department",
    requestId: "Request ID",
    patientId: "Patient ID",
    patientName: "Patient Name",
    doctorId: "Doctor ID",
    doctorName: "Doctor Name",
    targetId: "Target ID",
    targetName: "Target Name",
    targetRole: "Target Role",
    email: "Email",
    reason: "Reason",
    resultCount: "Result Count",
    ipfsCid: "IPFS CID",
  };

  return (
    <Modal title="Blockchain Block Detail" onClose={onClose}>
      {/* Action + actor header */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${ACTION_COLOR[log.action] || "bg-slate-100 text-slate-500"}`}>
          {log.action?.replace(/_/g, " ")}
        </span>
        <span className="text-xs font-semibold text-slate-600">{log.actor}</span>
        {log.role && <Badge label={log.role} color="gray" />}
      </div>

      {/* Detail sentence */}
      <p className="text-sm text-slate-700 mb-5 leading-relaxed">{log.detail}</p>

      {/* Core block fields */}
      <div className="bg-slate-50 rounded-xl p-4 space-y-2.5 mb-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Block Fields</p>
        <MetaRow label="Event ID" value={log.id} />
        <MetaRow label="TX Hash" value={log.hash} />
        <MetaRow label="Timestamp" value={log.time} />
        <MetaRow label="Actor" value={log.actor} />
        <MetaRow label="Actor Role" value={log.role} />
        <MetaRow label="Action" value={log.action} />
      </div>

      {/* Meta payload */}
      {Object.keys(meta).length > 0 && (
        <div className="bg-blue-50 rounded-xl p-4 space-y-2.5 mb-4">
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-3">Event Metadata</p>
          {Object.entries(meta).map(([k, v]) => (
            <MetaRow key={k} label={META_LABELS[k] || k} value={typeof v === "object" ? JSON.stringify(v) : v} />
          ))}
        </div>
      )}

      {/* Raw JSON toggle */}
      <details className="mt-2">
        <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-600 select-none">
          View raw JSON
        </summary>
        <pre className="mt-2 text-[10px] bg-slate-900 text-emerald-400 rounded-xl p-4 overflow-x-auto leading-relaxed">
          {JSON.stringify({ ...log, meta }, null, 2)}
        </pre>
      </details>

      <button
        onClick={onClose}
        className="mt-5 w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors"
      >Close</button>
    </Modal>
  );
};

const TabAuditLogs = ({ onLogCount }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null); // log clicked for detail modal

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(
          `${API}/api/admin/logs${filter !== "All" ? `?action=${filter}` : ""}`,
          { headers: authHeader() }
        );
        if (res.ok) {
          const data = await res.json();
          const raw = data.data || data.logs || [];
          setLogs(raw);
          onLogCount?.(raw.length);
        } else {
          const err = await res.json();
          setError(err.message || "Failed to fetch logs");
          onLogCount?.(0);
        }
      } catch {
        setError("Could not connect to server");
        onLogCount?.(0);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [onLogCount, filter]);

  const FILTERS = [
    "All", "RECORD_UPLOAD", "ACCESS_REQUEST", "ACCESS_GRANTED",
    "ACCESS_DENIED", "AUTH_LOGIN", "AUTH_LOGOUT", "AUTH_REGISTER",
    "ACCOUNT_APPROVED", "ACCOUNT_REJECTED", "ACCOUNT_SUSPENDED",
  ];

  const data = filter === "All" ? logs : logs.filter(l => l.action === filter);

  return (
    <div>
      <PageHeader
        title="Blockchain Audit Logs"
        sub="Click any event to inspect its full block data"
        action={
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-[11px] px-3 py-1.5 rounded-xl font-semibold transition-all ${filter === f
                    ? "bg-teal-600 text-white shadow-sm"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 hover:ring-teal-300"
                  }`}>
                {f === "All" ? "All" : f.replace(/^(RECORD_|AUTH_|ACCOUNT_)/, "").replace(/_/g, " ")}
              </button>
            ))}
          </div>
        }
      />

      {loading && <Spinner />}

      {!loading && error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-sm text-rose-700">
          ⚠️ {error}. Make sure you are logged in as admin and the backend is running.
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <Empty msg="No blockchain events found." />
      )}

      {!loading && !error && data.length > 0 && (
        <div className="space-y-3">
          {data.map((l, i) => (
            <div
              key={l.id || i}
              onClick={() => setSelected(l)}
              className="bg-white rounded-2xl p-5 ring-1 ring-slate-100 shadow-sm flex items-start gap-4 cursor-pointer hover:ring-teal-200 hover:shadow-md transition-all group"
            >
              <div className="text-2xl flex-shrink-0 mt-0.5">
                {ACTION_ICON[l.action] || "⚡"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${ACTION_COLOR[l.action] || "bg-slate-100 text-slate-500"}`}>
                    {l.action?.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs font-semibold text-slate-600">{l.actor}</span>
                  {l.role && <Badge label={l.role} color="gray" />}
                </div>
                <p className="text-sm text-slate-700">{l.detail}</p>

                {/* Show key meta fields inline as pills */}
                {(() => {
                  const meta = l.meta?.meta || l.meta || {};
                  const pills = [
                    meta.patientName && `👤 ${meta.patientName}`,
                    meta.doctorName && `🩺 ${meta.doctorName}`,
                    meta.department && `🏥 ${meta.department}`,
                    meta.recordTitle && `📄 ${meta.recordTitle}`,
                  ].filter(Boolean);
                  return pills.length > 0 ? (
                    <div className="flex gap-2 flex-wrap mt-2">
                      {pills.map(p => (
                        <span key={p} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{p}</span>
                      ))}
                    </div>
                  ) : null;
                })()}

                {l.hash && (
                  <p className="text-[11px] text-slate-400 font-mono mt-1.5 truncate">
                    🔗 {l.hash.substring(0, 48)}…
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className="text-[11px] text-slate-400 whitespace-nowrap">{l.time}</span>
                <span className="text-[10px] text-teal-500 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                  View block →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <p className="mt-4 text-xs text-slate-400 text-right">
          {data.length} event{data.length !== 1 ? "s" : ""} · Retained 7 years per policy
        </p>
      )}

      {selected && (
        <BlockDetailModal log={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};

const TabSettings = () => (
  <div>
    <div className="mb-5"><h2 className="text-lg font-bold text-slate-800">System Settings</h2><p className="text-xs text-slate-400 mt-0.5">Security, privacy and system info</p></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="bg-white rounded-2xl p-6 ring-1 ring-slate-100 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 pb-4 mb-4 border-b border-slate-50">🔐 Encryption Stack</h3>
        <div className="space-y-3 text-sm">
          {[
            ["Record Encryption", "AES-256-GCM at rest"],
            ["Key Exchange", "ML-KEM-768 (FIPS 203)"],
            ["Access Control", "CP-ABE policy-based"],
            ["In Transit", "TLS 1.3"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between items-center">
              <span className="text-slate-500">{k}</span>
              <span className="font-semibold text-emerald-600 text-xs bg-emerald-50 px-2.5 py-1 rounded-lg">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl p-6 ring-1 ring-slate-100 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 pb-4 mb-4 border-b border-slate-50">👥 Role-Based Access</h3>
        <div className="space-y-3">
          {[
            { name: "Admin", desc: "Full system access", color: "blue" },
            { name: "Doctor", desc: "Own patients & records only", color: "teal" },
            { name: "Patient", desc: "Own records only", color: "gray" },
          ].map(r => (
            <div key={r.name} className="flex items-center gap-2">
              <Badge label={r.name} color={r.color} />
              <span className="text-[11px] text-slate-400">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl p-6 ring-1 ring-slate-100 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 pb-4 mb-4 border-b border-slate-50">🏥 Blockchain Info</h3>
        <div className="space-y-2 text-sm">
          {[
            ["Network", "Hyperledger Fabric"],
            ["Channel", "mychannel"],
            ["Chaincode", "healthcareLogs"],
            ["Storage", "IPFS (encrypted CID)"],
            ["Retention", "7 Years regulatory"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-slate-400">{k}</span>
              <span className="font-medium text-slate-700">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const PageSecurity = ({ onLogCount }) => {
  const [tab, setTab] = useState("logs");
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Security & Operations</h1>
        <p className="text-xs text-slate-400 mt-0.5">Blockchain audit logs and system configuration</p>
      </div>
      <TabBar active={tab} onChange={setTab} tabs={[
        { id: "logs", icon: "📜", label: "Blockchain Logs" },
        { id: "settings", icon: "⚙️", label: "Settings" },
      ]} />
      {tab === "logs" && <TabAuditLogs onLogCount={onLogCount} />}
      {tab === "settings" && <TabSettings />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SHELL
// ═══════════════════════════════════════════════════════════════
const NAV = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "people", icon: "👥", label: "People" },
  { id: "security", icon: "🔐", label: "Security & Ops" },
];

export default function HealthcareAdminDashboard() {
  const [page, setPage] = useState("dashboard");
  const [doctorCount, setDoctorCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [logCount, setLogCount] = useState(0);

  useEffect(() => {
    // pending count for dashboard
    fetch(`${API}/api/auth/applications/pending`, { headers: authHeader() })
      .then(r => r.json())
      .then(d => setPendingCount((d.applications || []).length))
      .catch(() => { });
    fetch(`${API}/api/admin/doctors`, {
      headers: authHeader(),
    })
      .then((r) => r.json())
      .then((d) => {
        const docs = d.data || [];
        setDoctorCount(
          docs.filter((doc) => doc.status === "Active").length
        );
      })
      .catch(() => { });
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <aside className="w-60 bg-white border-r border-slate-100 flex flex-col shadow-sm flex-shrink-0">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-100">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white text-sm font-bold shadow-sm">H</div>
          <div><p className="text-sm font-bold text-slate-800 leading-none">SecureMed</p><p className="text-[10px] text-slate-400 mt-0.5">Admin Portal</p></div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest px-3 mb-3">Navigation</p>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${page === n.id ? "bg-teal-50 text-teal-700 ring-1 ring-teal-100 shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
              <span className={`text-base transition-transform ${page === n.id ? "scale-110" : ""}`}>{n.icon}</span>
              <span className="flex-1 text-left truncate">{n.label}</span>
              {page === n.id && <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[11px] font-bold">
              A
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">
                Admin
              </p>

              <p className="text-[10px] text-slate-400">
                Super Admin
              </p>
            </div>
          </div>

          <button
            onClick={async () => {
              try {
                await fetch(`${API}/api/auth/logout`, {
                  method: "POST",
                  headers: authHeader(),
                });
              } catch { /* fire and forget */ }
              localStorage.removeItem("token");
              localStorage.removeItem("user");
              window.location.href = "/";
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-50 text-rose-600 text-sm font-semibold ring-1 ring-rose-200 hover:bg-rose-100 transition-all"
          >
            <span>↩</span>
            Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-100 flex items-center px-6 shadow-sm flex-shrink-0 z-10">
          <p className="text-sm font-semibold text-slate-500 capitalize">{NAV.find(n => n.id === page)?.label}</p>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[11px] font-bold shadow-sm">A</div>
              <div><p className="text-xs font-semibold text-slate-700 leading-none">Admin</p><p className="text-[10px] text-slate-400">Super Admin</p></div>
            </div>
            <button
              onClick={async () => {
                try {
                  await fetch(`${API}/api/auth/logout`, { method: "POST", headers: authHeader() });
                } catch { /* fire and forget */ }
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                window.location.href = "/";
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-semibold ring-1 ring-rose-200 hover:bg-rose-100 transition-all"
            >
              <span>↩</span> Logout
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">
          {page === "dashboard" && (
            <PageDashboard setPage={setPage} doctorCount={doctorCount} pendingCount={pendingCount} logCount={logCount} />
          )}
          {page === "people" && (
            <PagePeople
              onApproved={() => setPendingCount(p => Math.max(0, p - 1))}
              onDoctorCountChange={setDoctorCount}
            />
          )}
          {page === "security" && <PageSecurity onLogCount={setLogCount} />}
        </main>
      </div>
    </div>
  );
}