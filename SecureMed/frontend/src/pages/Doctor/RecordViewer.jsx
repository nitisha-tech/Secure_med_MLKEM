/**
 * RecordViewer.jsx
 *
 * SECURITY FLOW:
 *   1. trigger(requestId, fileName) → fetchRecord(requestId) → encrypted IPFS bundle
 *   2. SkModal prompts doctor for skDoctor
 *   3. doctorDecrypt(skDoctor, bundle) runs in browser → plaintext bytes
 *   4. Blob URL created → shown in FilePanel (View + Download separately)
 *   5. Blob URL revoked on close
 *
 * skDoctor never leaves the browser.
 */

import { useState, useRef, useEffect } from "react";
import { Download, Eye, EyeOff, X, FileText, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { fetchRecord } from "../../services/api";
import { doctorDecrypt } from "../../services/preService.browser";

// ─── Mime helper ──────────────────────────────────────────────────────────────

function guessMime(fileName = "") {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  return {
    pdf:  "application/pdf",
    jpg:  "image/jpeg", jpeg: "image/jpeg",
    png:  "image/png",  gif: "image/gif", webp: "image/webp",
    txt:  "text/plain", csv: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }[ext] || "application/octet-stream";
}

// ─── SK input modal ───────────────────────────────────────────────────────────

function SkModal({ fileName, onConfirm, onCancel, errorMsg, busy }) {
  const [sk,   setSk]   = useState("");
  const [show, setShow] = useState(false);
  const inputRef        = useRef(null);

  useEffect(() => {
    // Small delay so the modal is visible before focus fires
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => { clearTimeout(t); setSk(""); };
  }, []);

  const submit = () => {
    const raw = sk.trim();
    if (!raw) return;
    onConfirm(raw);
    // Don't wipe sk here — parent will unmount this modal on success
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800 text-sm">Enter your secret key</h3>
            <p className="text-xs text-gray-400 truncate">{fileName}</p>
          </div>
        </div>

        {/* Security note */}
        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-4 text-xs text-green-700 leading-relaxed">
          🔒 Decryption runs in your browser. Your key never leaves your device.
        </div>

        {/* Input */}
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Your secret key (skDoctor)
        </label>
        <div className="relative mb-1">
          <input
            ref={inputRef}
            type={show ? "text" : "password"}
            value={sk}
            onChange={e => setSk(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !busy && sk.trim()) submit();
              if (e.key === "Escape" && !busy) onCancel();
            }}
            placeholder="Paste your secret key here…"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            disabled={busy}
            className={`w-full font-mono text-sm px-3 py-2.5 pr-10 border rounded-xl outline-none transition-colors bg-white disabled:bg-gray-50 ${
              errorMsg ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-blue-400"
            }`}
          />
          <button type="button" onClick={() => setShow(v => !v)} disabled={busy}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-4 leading-relaxed">
          This is the key shown to you at registration. It is never stored — paste it from your password manager.
        </p>

        {/* Error from parent (wrong key / decrypt failed) */}
        {errorMsg && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 mb-4 text-xs font-medium">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end border-t border-gray-100 pt-4">
          <button onClick={onCancel} disabled={busy}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !sk.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[130px] justify-center">
            {busy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Decrypting…
              </>
            ) : (
              "Decrypt & open"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading overlay ──────────────────────────────────────────────────────────

function LoadingOverlay({ label }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl px-8 py-6 flex items-center gap-4 shadow-2xl">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600 flex-shrink-0" />
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
    </div>
  );
}

// ─── File viewer ──────────────────────────────────────────────────────────────

function FilePanel({ blobUrl, mimeType, fileName, onClose }) {
  const isImage = mimeType?.startsWith("image/");
  const isPdf   = mimeType === "application/pdf";
  const isText  = mimeType?.startsWith("text/");

  // Revoke blob URL when panel unmounts
  useEffect(() => {
    return () => { try { URL.revokeObjectURL(blobUrl); } catch {} };
  }, [blobUrl]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0">
          <div className="min-w-0 mr-4">
            <h3 className="font-semibold text-gray-800 text-sm truncate">{fileName}</h3>
            <p className="text-xs text-gray-400">{mimeType}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Open in new tab */}
            <a href={blobUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> View
            </a>
            {/* Download */}
            <a href={blobUrl} download={fileName}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              <Download className="w-3.5 h-3.5" /> Download
            </a>
            <button onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto bg-gray-50 rounded-b-2xl min-h-0">
          {isPdf && (
            <iframe src={blobUrl} className="w-full h-full min-h-[75vh]" title={fileName} />
          )}
          {isImage && (
            <div className="flex items-center justify-center p-6 min-h-[60vh]">
              <img src={blobUrl} alt={fileName}
                className="max-w-full max-h-[78vh] rounded-xl shadow-lg object-contain" />
            </div>
          )}
          {isText && (
            <div className="p-6 min-h-[60vh]">
              <iframe src={blobUrl} className="w-full min-h-[55vh] bg-white rounded-xl border"
                title={fileName} />
            </div>
          )}
          {!isPdf && !isImage && !isText && (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-gray-400 p-6">
              <FileText className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium mb-1">Preview not available for this file type</p>
              <p className="text-xs text-center mb-4">Use the View or Download buttons above</p>
              <a href={blobUrl} download={fileName}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                <Download className="w-4 h-4" /> Download {fileName}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useRecordViewer() {
  // phase: idle | fetching | sk | decrypting | viewing | error
  const [phase,    setPhase]    = useState("idle");
  const [bundle,   setBundle]   = useState(null);
  const [blobUrl,  setBlobUrl]  = useState(null);
  const [meta,     setMeta]     = useState({ fileName: "", mimeType: "" });
  const [errMsg,   setErrMsg]   = useState("");
  const [skError,  setSkError]  = useState(""); // shown inside the modal

  const reset = () => {
    try { if (blobUrl) URL.revokeObjectURL(blobUrl); } catch {}
    setBlobUrl(null);
    setBundle(null);
    setPhase("idle");
    setErrMsg("");
    setSkError("");
  };

  /**
   * Start the view flow.
   * @param {string} requestId  - AccessRequest _id
   * @param {string} fileName   - hint for display + mime detection
   */
  const trigger = async (requestId, fileName = "record") => {
    reset();
    const mime = guessMime(fileName);
    setMeta({ fileName, mimeType: mime });
    setPhase("fetching");

    try {
      const res  = await fetchRecord(requestId);
      const data = res?.data || res;

      // Validate the bundle has the required fields
      if (!data?.ct_kem2 || !data?.ct_file) {
        throw new Error(
          "Incomplete bundle received from server. " +
          `Got keys: ${Object.keys(data || {}).join(", ")}`
        );
      }

      // Use server-provided filename/mime if available
      if (data.fileName) {
        setMeta({
          fileName: data.fileName,
          mimeType: data.mimeType || guessMime(data.fileName),
        });
      }

      setBundle(data);
      setPhase("sk"); // prompt doctor for their secret key
    } catch (err) {
      console.error("RecordViewer fetch error:", err);
      setErrMsg(err.message || "Failed to fetch the encrypted bundle from the server.");
      setPhase("error");
    }
  };

  const handleSkConfirm = async (skRaw) => {
    setSkError("");
    setPhase("decrypting"); // shows spinner inside the button

    try {
      const plaintext = await doctorDecrypt(skRaw, bundle);

      if (!plaintext || plaintext.length === 0) {
        throw new Error("Decryption returned empty result.");
      }

      const blob   = new Blob([plaintext], { type: meta.mimeType });
      const url    = URL.createObjectURL(blob);
      setBlobUrl(url);
      setPhase("viewing");
    } catch (err) {
      console.error("RecordViewer decrypt error:", err);
      // Go back to sk phase so the doctor can retry with the correct key
      setSkError("Decryption failed. Please check your secret key and try again.");
      setPhase("sk");
    }
  };

  const modals = (
    <>
      {phase === "fetching" && (
        <LoadingOverlay label="Fetching encrypted bundle…" />
      )}

      {(phase === "sk" || phase === "decrypting") && (
        <SkModal
          fileName={meta.fileName}
          onConfirm={handleSkConfirm}
          onCancel={reset}
          errorMsg={skError}
          busy={phase === "decrypting"}
        />
      )}

      {phase === "viewing" && blobUrl && (
        <FilePanel
          blobUrl={blobUrl}
          mimeType={meta.mimeType}
          fileName={meta.fileName}
          onClose={reset}
        />
      )}

      {phase === "error" && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-2">Failed to load record</h3>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed">{errMsg}</p>
            <button onClick={reset}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );

  return { trigger, modals };
}