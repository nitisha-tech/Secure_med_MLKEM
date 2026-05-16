/**
 * AccessRequests.jsx
 *
 * SECURITY FLOW — what happens when patient clicks Approve:
 *
 *  1. Patient pastes sk (Kyber768 secret key, base64) into modal input
 *  2. clientSideRekey() calls /api/pre/rekey (Python kyber-py, same lib as encrypt):
 *       ss        = Kyber768.decaps(sk_owner, ct_kem)   — recover file key
 *       ss_t, ct2 = Kyber768.encaps(pk_doctor)          — new KEM for doctor
 *       capsule   = AES-GCM.enc(ss_t, ss)               — wrap file key
 *  3. Only { ct_kem2, key_capsule, kc_nonce, kc_tag } goes to backend
 *  4. Backend stores the bundle in IPFS — it never stores sk_owner
 *
 *  Network payload: zero key material, only re-encrypted ciphertext
 */

import { useState, useEffect, useRef } from "react";
import { getRequests, approveRequest, rejectRequest } from "../../services/api";
import { clientSideRekey } from "../../services/preService.browser";

const STATUS_STYLES = {
  pending:  { bg: "#fef3c7", color: "#92400e", label: "Pending"  },
  approved: { bg: "#d1fae5", color: "#065f46", label: "Approved" },
  rejected: { bg: "#fee2e2", color: "#991b1b", label: "Rejected" },
};
const FILTERS = [
  { key: "all",      label: "All"      },
  { key: "pending",  label: "Pending"  },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 99,
      fontSize: 12, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function EmptyState() {
  return (
    <tr>
      <td colSpan={5} style={{ padding: "60px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
        No access requests found.
      </td>
    </tr>
  );
}

// ─── ApproveModal ─────────────────────────────────────────────────────────────

function ApproveModal({ request, onConfirm, onCancel }) {
  const [skPre,   setSkPre]   = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error,   setError]   = useState("");
  const [busy,    setBusy]    = useState(false);
  const [stage,   setStage]   = useState("idle"); // idle | rekeying | uploading
  const inputRef              = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => setSkPre(""); // wipe on unmount
  }, []);

  const handleConfirm = async () => {
    // ── FIX: was `skOwner` (undefined). The sk value lives in `raw`. ──────────
    const raw = skPre.trim();
    if (!raw) {
      setError("Please paste your secret key to proceed.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");

    try {
      // ── Rekey: Python decaps ct_kem with sk_owner, encaps for doctor ──────
      // Server fetches doctor's current pkPre from DB using requestId —
      // pk_doctor is never trusted from the browser.
      setStage("rekeying");
      const rekeyBundle = await clientSideRekey(raw, request.ctKem, request._id);

      // Wipe input immediately after rekey, before any network call
      setSkPre("");

      // ── Only ciphertext bundle goes to backend — no key material ──────────
      setStage("uploading");
      await approveRequest(request._id, rekeyBundle);

      onConfirm(); // parent updates row status
    } catch (err) {
      const msg = err?.message || "";
      if (
        msg.toLowerCase().includes("decaps") ||
        msg.toLowerCase().includes("secret key") ||
        msg.toLowerCase().includes("invalid") ||
        msg.toLowerCase().includes("key")
      ) {
        setError("Invalid secret key — check you pasted the correct key and try again.");
      } else if (msg.toLowerCase().includes("request")) {
        setError("Request error — " + msg);
      } else {
        setError("Approval failed — please try again.");
      }
      setSkPre("");
      setBusy(false);
      setStage("idle");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !busy) handleConfirm();
    if (e.key === "Escape" && !busy) onCancel();
  };

  const stageLabel = {
    idle:      "Approve access",
    rekeying:  "Computing re-encryption key…",
    uploading: "Uploading secure bundle…",
  }[stage];

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="approve-modal-title"
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #e8eaed",
        padding: "24px 24px 20px", width: "100%", maxWidth: 460,
        boxSizing: "border-box",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: "#d1fae5",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l3.5 3.5L13 4.5" stroke="#059669" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 id="approve-modal-title" style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#111" }}>
            Approve access
          </h2>
        </div>

        {/* Context */}
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px", lineHeight: 1.55 }}>
          Granting{" "}
          <strong style={{ color: "#374151" }}>
            {request.doctorName || request.organization || "this doctor"}
          </strong>
          {" "}access to{" "}
          <strong style={{ color: "#374151" }}>
            {request.recordTitle || request.record || "your medical record"}
          </strong>.
        </p>

        {/* Security badge */}
        <div style={{
          margin: "0 0 16px", padding: "8px 12px",
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          borderRadius: 8, fontSize: 12, color: "#166534", lineHeight: 1.5,
        }}>
          🔒 Re-encryption is computed server-side using the same post-quantum library
          that encrypted your file. Your secret key is sent over TLS only and never stored.
        </div>

        {/* sk input */}
        <div style={{ marginBottom: 18 }}>
          <label htmlFor="skPre-input" style={{
            display: "block", fontSize: 11, fontWeight: 600, color: "#9ca3af",
            textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6,
          }}>
            Your secret key (skPre)
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="skPre-input"
              ref={inputRef}
              type={showKey ? "text" : "password"}
              value={skPre}
              onChange={(e) => { setSkPre(e.target.value); setError(""); }}
              placeholder="Paste your secret key here…"
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              disabled={busy}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "9px 72px 9px 12px", fontSize: 13, fontFamily: "monospace",
                border: `1px solid ${error ? "#fca5a5" : "#e8eaed"}`,
                borderRadius: 8, outline: "none", color: "#111",
                background: busy ? "#f9fafb" : "#fff",
              }}
            />
            <button type="button" onClick={() => setShowKey(v => !v)} disabled={busy}
              style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                fontSize: 11, fontWeight: 600, color: "#6b7280",
                background: "none", border: "none",
                cursor: busy ? "default" : "pointer", padding: "2px 4px",
              }}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          {!error && (
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "6px 0 0", lineHeight: 1.45 }}>
              The key shown at registration. Never stored — paste from your password manager.
            </p>
          )}
          {error && (
            <p style={{ fontSize: 11, color: "#dc2626", margin: "6px 0 0", fontWeight: 500 }}>
              {error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div style={{
          display: "flex", gap: 8, justifyContent: "flex-end",
          paddingTop: 16, borderTop: "1px solid #f0f0ee",
        }}>
          <button type="button" onClick={onCancel} disabled={busy}
            style={{
              padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: "#fff", color: "#374151", border: "1px solid #e8eaed",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button type="button" onClick={handleConfirm}
            disabled={busy || !skPre.trim()}
            style={{
              padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: busy || !skPre.trim() ? "#9ca3af" : "#059669",
              color: "#fff", border: "none",
              cursor: busy || !skPre.trim() ? "not-allowed" : "pointer",
              transition: "background 0.15s", minWidth: 210,
            }}
          >
            {busy ? stageLabel : "Approve access"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AccessRequests() {
  const [requests,        setRequests]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [filter,          setFilter]          = useState("all");
  const [actioningId,     setActioningId]     = useState(null);
  const [pendingApproval, setPendingApproval] = useState(null);

  useEffect(() => {
    getRequests()
      .then(res => setRequests(res.data || []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, []);

  const handleApproveClick = (req) => {
    if (actioningId) return;
    setPendingApproval(req);
  };

  // Modal passes no key out — only signals success
  const handleModalConfirm = () => {
    const id = pendingApproval._id;
    setPendingApproval(null);
    setRequests(prev => prev.map(r => r._id === id ? { ...r, status: "approved" } : r));
  };

  const handleReject = async (id) => {
    setActioningId(id);
    try {
      await rejectRequest(id);
      setRequests(prev => prev.map(r => r._id === id ? { ...r, status: "rejected" } : r));
    } catch { /* surface via toast if needed */ }
    finally { setActioningId(null); }
  };

  const counts = {
    all:      requests.length,
    pending:  requests.filter(r => r.status === "pending").length,
    approved: requests.filter(r => r.status === "approved").length,
    rejected: requests.filter(r => r.status === "rejected").length,
  };
  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {pendingApproval && (
        <ApproveModal
          request={pendingApproval}
          onConfirm={handleModalConfirm}
          onCancel={() => !actioningId && setPendingApproval(null)}
        />
      )}

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Total",    value: counts.all,      color: "#374151" },
          { label: "Pending",  value: counts.pending,  color: "#d97706" },
          { label: "Approved", value: counts.approved, color: "#059669" },
          { label: "Rejected", value: counts.rejected, color: "#dc2626" },
        ].map(c => (
          <div key={c.label} style={{
            flex: 1, minWidth: 110, background: "#fff",
            borderRadius: 14, border: "1px solid #e8eaed", padding: "16px 20px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              {c.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: c.color, marginTop: 4, letterSpacing: "-0.5px" }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e8eaed", overflow: "hidden" }}>
        {/* Filters */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0ee", display: "flex", gap: 6 }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: "5px 14px", borderRadius: 99, fontSize: 13, fontWeight: 500,
              cursor: "pointer", border: "1px solid",
              borderColor: filter === f.key ? "#10b981" : "#e8eaed",
              background:  filter === f.key ? "#ecfdf5" : "#fff",
              color:       filter === f.key ? "#059669" : "#6b7280",
              transition: "all 0.15s",
            }}>
              {f.label}
              {counts[f.key] > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 11, fontWeight: 700,
                  background: filter === f.key ? "#059669" : "#f3f4f6",
                  color:      filter === f.key ? "#fff" : "#374151",
                  borderRadius: 99, padding: "1px 6px",
                }}>
                  {counts[f.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f0f0ee" }}>
                {["Requester", "Doctor / Org", "Record", "Status", "Actions"].map(h => (
                  <th key={h} style={{
                    padding: "11px 20px", textAlign: "left", fontSize: 11,
                    fontWeight: 600, color: "#9ca3af", textTransform: "uppercase",
                    letterSpacing: "0.07em", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: "60px 0", textAlign: "center", color: "#9ca3af" }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <EmptyState />
              ) : (
                filtered.map((req, i) => {
                  const isActioning = actioningId === req._id;
                  const isPending   = !req.status || req.status === "pending";
                  return (
                    <tr key={req._id}
                      style={{ borderBottom: i < filtered.length - 1 ? "1px solid #f9fafb" : "none", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "14px 20px" }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>{req.requesterName || req.name || "—"}</div>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>{req.requesterEmail || req.email || ""}</div>
                      </td>
                      <td style={{ padding: "14px 20px", fontSize: 14, color: "#374151" }}>{req.doctorName || req.organization || "—"}</td>
                      <td style={{ padding: "14px 20px", fontSize: 14, color: "#374151" }}>{req.recordTitle || req.record || "Medical Record"}</td>
                      <td style={{ padding: "14px 20px" }}><StatusBadge status={req.status || "pending"} /></td>
                      <td style={{ padding: "14px 20px" }}>
                        {isPending ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => handleApproveClick(req)} disabled={isActioning}
                              style={{
                                padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                                background: isActioning ? "#9ca3af" : "#059669",
                                color: "#fff", border: "none", cursor: isActioning ? "not-allowed" : "pointer",
                              }}
                              onMouseEnter={e => { if (!isActioning) e.currentTarget.style.opacity = "0.85"; }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                            >
                              {isActioning ? "…" : "Approve"}
                            </button>
                            <button onClick={() => handleReject(req._id)} disabled={isActioning}
                              style={{
                                padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                                background: "#fff", color: "#374151", border: "1px solid #e8eaed",
                                cursor: isActioning ? "not-allowed" : "pointer",
                              }}
                              onMouseEnter={e => { if (isActioning) return; e.currentTarget.style.background = "#fee2e2"; e.currentTarget.style.color = "#991b1b"; e.currentTarget.style.borderColor = "#fca5a5"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#374151"; e.currentTarget.style.borderColor = "#e8eaed"; }}
                            >
                              {isActioning ? "…" : "Reject"}
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 13, color: "#9ca3af" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}