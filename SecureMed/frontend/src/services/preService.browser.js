/**
 * preService.browser.js
 *
 * SECURITY MODEL — sk never leaves the browser:
 *
 * Patient rekey:
 *   sk_owner → /api/pre/rekey (TLS only, never stored)
 *   Python ML_KEM_768 decaps ct_kem → recovers ss → encaps for doctor
 *   Reason: Python encrypted the file, so Python must decap to recover ss.
 *
 * Doctor decrypt:
 *   ml_kem768.decapsulate(ct_kem2, sk_doctor) — runs entirely in browser
 *   Works because Python now uses ML_KEM_768 (FIPS 203), which is fully
 *   interoperable with @noble/post-quantum ml_kem768.
 *   sk_doctor NEVER leaves the browser.
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

// ─── Keygen ───────────────────────────────────────────────────────────────────

export function browserKeygen() {
  const { publicKey: pk, secretKey: sk } = ml_kem768.keygen();
  return { pkB64: b64e(pk), skB64: b64e(sk) };
}

// ─── Patient rekey ────────────────────────────────────────────────────────────
// Delegates to Python — same lib that encrypted the file.
// sk_owner sent over TLS only, never stored.

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
      requestId,
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

// ─── Doctor decrypt ───────────────────────────────────────────────────────────
// Runs ENTIRELY in the browser — sk_doctor never leaves the device.
// Works because Python now uses ML_KEM_768 (FIPS 203), interoperable with Noble.
//
// Flow:
//   1. ml_kem768.decapsulate(ct_kem2, sk_doctor) → ss_transit
//   2. AES-GCM.dec(ss_transit, key_capsule)      → ss (file key)
//   3. AES-GCM.dec(ss, ct_file)                  → plaintext

export async function doctorDecrypt(skDoctorB64, bundle) {
  console.group("🔬 doctorDecrypt");

  const skDoctor = b64d(skDoctorB64);
  const ct_kem2  = b64d(bundle.ct_kem2);

  console.log("sk bytes:", skDoctor.length, "| ct_kem2 bytes:", ct_kem2.length);

  if (skDoctor.length !== 2400) {
    console.groupEnd();
    throw new Error(`Invalid sk length: ${skDoctor.length} (expect 2400)`);
  }
  if (ct_kem2.length !== 1088) {
    console.groupEnd();
    throw new Error(`Invalid ct_kem2 length: ${ct_kem2.length} (expect 1088)`);
  }

  // Step 1: Noble decapsulates ML_KEM_768-produced ct_kem2 ✅ (interoperable)
  let ssTransit;
  try {
    ssTransit = ml_kem768.decapsulate(ct_kem2, skDoctor);
    console.log("✅ Step 1: ssTransit recovered", ssTransit.length, "bytes");
  } catch (e) {
    console.groupEnd();
    throw new Error("Decapsulation failed: " + e.message);
  } finally {
    skDoctor.fill(0);
  }

  // Step 2: unwrap file key
  let ss;
  try {
    ss = await aesGcmDecrypt(
      ssTransit,
      b64d(bundle.key_capsule),
      b64d(bundle.kc_nonce),
      b64d(bundle.kc_tag),
    );
    console.log("✅ Step 2: file key recovered", ss.length, "bytes");
  } catch (e) {
    ssTransit.fill(0);
    console.groupEnd();
    throw new Error("Key unwrap failed — wrong secret key or corrupted bundle.");
  }
  ssTransit.fill(0);

  // Step 3: decrypt file
  let plaintext;
  try {
    plaintext = await aesGcmDecrypt(
      ss,
      b64d(bundle.ct_file),
      b64d(bundle.nonce),
      b64d(bundle.tag),
    );
    console.log("✅ Step 3: plaintext recovered", plaintext.length, "bytes");
  } catch (e) {
    ss.fill(0);
    console.groupEnd();
    throw new Error("File decryption failed — bundle may be corrupt.");
  }
  ss.fill(0);

  console.log("✅ doctorDecrypt SUCCESS");
  console.groupEnd();
  return plaintext;
}