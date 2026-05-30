import { useState, useEffect, useCallback } from "react";
import { getMyLogs } from "../../services/api";

function ChainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
    </svg>
  );
}

const ACTION_STYLES = {
  AUTH_LOGIN:         { bg: "#f1f5f9", color: "#475569" },
  AUTH_REGISTER:      { bg: "#dbeafe", color: "#1d4ed8" },
  RECORD_UPLOAD:      { bg: "#ccfbf1", color: "#0f766e" },
  RECORD_VIEW:        { bg: "#e0f2fe", color: "#0369a1" },
  RECORD_DELETE:      { bg: "#fef3c7", color: "#92400e" },
  ACCESS_REQUEST:     { bg: "#fef9c3", color: "#854d0e" },
  ACCESS_GRANTED:     { bg: "#d1fae5", color: "#065f46" },
  ACCESS_DENIED:      { bg: "#fee2e2", color: "#991b1b" },
  REKEY_GENERATED:    { bg: "#ede9fe", color: "#5b21b6" },
  PRESCRIPTION_ADD:   { bg: "#fce7f3", color: "#9d174d" },
  DOCTOR_RECORD_VIEW: { bg: "#e0e7ff", color: "#3730a3" },
};

const ACTION_ICON = {
  AUTH_LOGIN:         "🔐",
  AUTH_REGISTER:      "👤",
  RECORD_UPLOAD:      "📤",
  RECORD_VIEW:        "👁",
  RECORD_DELETE:      "🗑",
  ACCESS_REQUEST:     "🔑",
  ACCESS_GRANTED:     "✅",
  ACCESS_DENIED:      "🚫",
  REKEY_GENERATED:    "🔄",
  PRESCRIPTION_ADD:   "💊",
  DOCTOR_RECORD_VIEW: "🩺",
};

function getActionStyle(action) {
  return ACTION_STYLES[action] || { bg: "#f3f4f6", color: "#374151" };
}

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

function LogRow({ log, isLast, expanded, onToggle }) {
  const style = getActionStyle(log.action);
  const meta  = log.meta?.meta || log.meta || {};

  const pills = [
    meta.patientName && `👤 ${meta.patientName}`,
    meta.recordTitle && `📄 ${meta.recordTitle}`,
    meta.department  && `🏥 ${meta.department}`,
    meta.doctorName  && `🩺 ${meta.doctorName}`,
  ].filter(Boolean);

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid #f3f4f6" }}>

      {/* Main row — clickable */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", gap: 16, padding: "16px 20px",
          cursor: "pointer", transition: "background 0.1s",
          background: expanded ? "#fafafa" : "transparent",
        }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "#fafafa"; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "transparent"; }}
      >
        {/* Timeline icon */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4, gap: 4, flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: style.bg, color: style.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>
            {ACTION_ICON[log.action] || "⚡"}
          </div>
          {!isLast && <div style={{ width: 1, flex: 1, minHeight: 12, background: "#e8eaed" }} />}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{
              padding: "2px 10px", borderRadius: 99,
              fontSize: 11, fontWeight: 700,
              background: style.bg, color: style.color,
              letterSpacing: "0.04em",
            }}>
              {log.action?.replace(/_/g, " ")}
            </span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>{log.time}</span>
          </div>

          <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{log.detail}</div>

          {/* Inline meta pills */}
          {pills.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {pills.map(p => (
                <span key={p} style={{
                  fontSize: 10, background: "#f3f4f6", color: "#6b7280",
                  padding: "2px 8px", borderRadius: 99,
                }}>{p}</span>
              ))}
            </div>
          )}

          {log.hash && (
            <div style={{
              marginTop: 6, fontSize: 11, color: "#9ca3af", fontFamily: "monospace",
              background: "#f9fafb", borderRadius: 6, padding: "3px 8px",
              display: "inline-block", maxWidth: "100%",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              🔗 {log.hash?.substring(0, 52)}…
            </div>
          )}
        </div>

        {/* Expand chevron */}
        <div style={{ color: "#d1d5db", fontSize: 12, flexShrink: 0, paddingTop: 4, transition: "transform 0.15s", transform: expanded ? "rotate(180deg)" : "none" }}>▼</div>
      </div>

      {/* Expanded block detail */}
      {expanded && (
        <div style={{ padding: "0 20px 20px 68px", background: "#f8fafc" }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

            {/* Block fields */}
            <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e8eaed" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                Block Fields
              </div>
              {[
                ["Event ID",  log.id],
                ["TX Hash",   log.hash],
                ["Timestamp", log.time],
                ["Action",    log.action],
              ].map(([label, val]) => val ? (
                <div key={label} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 12 }}>
                  <span style={{ color: "#94a3b8", minWidth: 72, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontFamily: "monospace", color: "#374151", wordBreak: "break-all" }}>{val}</span>
                </div>
              ) : null)}
            </div>

            {/* Event metadata */}
            {Object.keys(meta).length > 0 && (
              <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #bfdbfe" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                  Event Metadata
                </div>
                {Object.entries(meta).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 12 }}>
                    <span style={{ color: "#94a3b8", minWidth: 80, flexShrink: 0 }}>{META_LABELS[k] || k}</span>
                    <span style={{ fontFamily: "monospace", color: "#374151", wordBreak: "break-all" }}>
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Raw JSON toggle */}
          <details>
            <summary style={{ fontSize: 11, color: "#94a3b8", cursor: "pointer", userSelect: "none" }}>
              View raw JSON
            </summary>
            <pre style={{
              marginTop: 8, fontSize: 10, background: "#0f172a", color: "#34d399",
              borderRadius: 10, padding: 14, overflowX: "auto", lineHeight: 1.6,
            }}>
              {JSON.stringify(log, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default function BlockchainLogs() {
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyLogs();
      setLogs(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const actionCounts = logs.reduce((acc, log) => {
    acc[log.action] = (acc[log.action] || 0) + 1;
    return acc;
  }, {});

  const topActions = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{
          flex: 1, minWidth: 110, background: "#fff",
          borderRadius: 14, border: "1px solid #e8eaed", padding: "16px 20px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Total Events
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#111", marginTop: 4 }}>
            {loading ? "—" : logs.length}
          </div>
        </div>

        {!loading && topActions.map(([action, count]) => {
          const s = getActionStyle(action);
          return (
            <div key={action} style={{
              flex: 1, minWidth: 110, background: "#fff",
              borderRadius: 14, border: "1px solid #e8eaed", padding: "16px 20px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {action.replace(/_/g, " ")}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginTop: 4 }}>
                {count}
              </div>
            </div>
          );
        })}
      </div>

      {/* Timeline card */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e8eaed", overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid #f0f0ee",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "#ecfdf5", color: "#059669",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ChainIcon />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>Blockchain Activity</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                Click any event to inspect its full block data
              </div>
            </div>
          </div>
          <button
            onClick={load}
            style={{
              fontSize: 12, color: "#6b7280", background: "none", border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
            Loading logs…
          </div>
        ) : error ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#dc2626", fontSize: 13 }}>
            {error}
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
            No blockchain activity recorded yet.
          </div>
        ) : (
          logs.map((log, i) => (
            <LogRow
              key={log.id || i}
              log={log}
              isLast={i === logs.length - 1}
              expanded={expanded === (log.id || i)}
              onToggle={() => setExpanded(prev => prev === (log.id || i) ? null : (log.id || i))}
            />
          ))
        )}
      </div>

      {!loading && logs.length > 0 && (
        <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "right" }}>
          {logs.length} event{logs.length !== 1 ? "s" : ""} · Immutable Fabric ledger · Retained 7 years
        </p>
      )}
    </div>
  );
}