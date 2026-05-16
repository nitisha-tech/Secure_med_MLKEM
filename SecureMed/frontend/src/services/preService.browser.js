/**
 * preService.browser.js
 * Runs entirely in the patient/doctor browser.
 * sk_owner is sent over TLS to /api/pre/rekey for the rekey step only,
 * and is never stored server-side.
 */

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

const API_BASE = "http://localhost:5000/api";  // Express, NOT Vite

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function aesGcmDecrypt(keyBytes, ciphertext, nonce, tag) {
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  const key = await crypto.subtle.importKey(
    "raw", keyBytes.slice(0, 32), { name: "AES-GCM" }, false, ["decrypt"]
  );
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 }, key, combined
    )
  );
}

export function b64e(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function b64d(str) {
  const s = atob(str);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

// ─── Keygen (used at registration) ───────────────────────────────────────────

export function browserKeygen() {
  const { publicKey: pk, secretKey: sk } = ml_kem768.keygen();
  return { pkB64: b64e(pk), skB64: b64e(sk) };
}

// ─── Client-side rekey ────────────────────────────────────────────────────────
// Sends sk_owner + ct_kem + requestId to the backend proxy.
// The server fetches the doctor's CURRENT pkPre from the database —
// pk_doctor is never trusted from the browser, preventing stale-pk mismatches.
// Python kyber-py performs decaps+encaps (same lib as upload-time encrypt).

export async function clientSideRekey(skOwnerB64, ctKemB64, requestId) {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Not authenticated — please log in again");

  const res = await fetch(`${API_BASE}/pre/rekey`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      sk_owner:  skOwnerB64,
      ct_kem:    ctKemB64,
      requestId, // server uses this to look up the doctor's current pk from DB
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Rekey request failed" }));
    throw new Error(err.message || `Rekey failed (${res.status})`);
  }

  const data = await res.json();
  if (!data.ct_kem2 || !data.key_capsule || !data.kc_nonce || !data.kc_tag)
    throw new Error("Rekey response missing required fields");

  return data; // { ct_kem2, key_capsule, kc_nonce, kc_tag }
}

// ─── Doctor decrypt (runs entirely in browser, no network call) ───────────────

export async function doctorDecrypt(skDoctorB64, bundle) {
  console.group("🔬 doctorDecrypt debug");

  console.log("sk length (b64 chars):", skDoctorB64?.length);
  console.log("sk first 20 chars:", skDoctorB64?.substring(0, 20));
  console.log("bundle fields:", Object.keys(bundle));
  console.log("ct_kem2 length (b64):", bundle.ct_kem2?.length);
  console.log("key_capsule length (b64):", bundle.key_capsule?.length);
  console.log("kc_nonce length (b64):", bundle.kc_nonce?.length);
  console.log("kc_tag length (b64):", bundle.kc_tag?.length);
  console.log("ct_file length (b64):", bundle.ct_file?.length);
  console.log("nonce length (b64):", bundle.nonce?.length);
  console.log("tag length (b64):", bundle.tag?.length);

  const skDoctor = b64d(skDoctorB64);
  console.log("sk decoded bytes:", skDoctor.length, "(expect 2400 for Kyber768)");

  const ct_kem2 = b64d(bundle.ct_kem2);
  console.log("ct_kem2 decoded bytes:", ct_kem2.length, "(expect 1088 for Kyber768)");

  if (skDoctor.length !== 2400) {
    console.groupEnd();
    throw new Error(`sk wrong length: ${skDoctor.length} (expect 2400)`);
  }
  if (ct_kem2.length !== 1088) {
    console.groupEnd();
    throw new Error(`ct_kem2 wrong length: ${ct_kem2.length} (expect 1088)`);
  }

  // Step 1: decapsulate — note: ML-KEM never throws on wrong key (implicit rejection)
  // it returns garbage silently, which is why Step 2 fails if sk is wrong
  console.log("Step 1: decapsulate(ct_kem2, skDoctor)...");
  let ssTransit;
  try {
    ssTransit = ml_kem768.decapsulate(ct_kem2, skDoctor);
    console.log("✅ ssTransit length:", ssTransit.length, "(expect 32)");
    console.log("ssTransit first 8 bytes:", Array.from(ssTransit.slice(0, 8)));
  } catch (e) {
    console.error("❌ decapsulate threw:", e.message);
    console.groupEnd();
    throw e;
  } finally {
    skDoctor.fill(0);
  }

  // Step 2: unwrap file key from capsule
  console.log("Step 2: AES-GCM decrypt key_capsule...");
  let ss;
  try {
    ss = await aesGcmDecrypt(
      ssTransit,
      b64d(bundle.key_capsule),
      b64d(bundle.kc_nonce),
      b64d(bundle.kc_tag),
    );
    console.log("✅ ss (file key) length:", ss.length, "(expect 32)");
    console.log("ss first 8 bytes:", Array.from(ss.slice(0, 8)));
  } catch (e) {
    console.error("❌ Step 2 FAILED:", e.message);
    console.error("Most likely cause: sk_doctor does not match the pk_doctor used in rekey.");
    console.error("Make sure you are entering the sk that corresponds to your CURRENT registered pk.");
    console.groupEnd();
    ssTransit.fill(0);
    throw new Error("Decryption failed: your secret key does not match the key used when access was approved. Please re-enter the correct key.");
  }
  ssTransit.fill(0);

  // Step 3: decrypt file
  console.log("Step 3: AES-GCM decrypt ct_file...");
  let plaintext;
  try {
    plaintext = await aesGcmDecrypt(
      ss,
      b64d(bundle.ct_file),
      b64d(bundle.nonce),
      b64d(bundle.tag),
    );
    console.log("✅ plaintext length:", plaintext.length, "bytes");
  } catch (e) {
    console.error("❌ Step 3 FAILED:", e.message);
    console.groupEnd();
    ss.fill(0);
    throw new Error("Decryption failed at file layer — the re-encryption bundle may be corrupt.");
  }
  ss.fill(0);

  console.log("✅ doctorDecrypt SUCCESS");
  console.groupEnd();
  return plaintext;
}