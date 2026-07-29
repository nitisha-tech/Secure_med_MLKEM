# pure_benchmark_final.py
# Runs 3 sessions × 100 iterations each
# Reports session averages + final paper value automatically
# No Flask needed — pure crypto only

from kyber_py.ml_kem import ML_KEM_768
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
import time, statistics, hmac, hashlib

ITERATIONS_PER_SESSION = 100
SESSIONS = 3

def measure_sessions(fn, sessions=SESSIONS, runs=ITERATIONS_PER_SESSION):
    """
    Runs fn() in `sessions` separate sessions.
    Each session averages `runs` iterations.
    Returns session averages + final grand average.
    """
    session_avgs = []
    for s in range(sessions):
        times = []
        for _ in range(runs):
            t0 = time.perf_counter()
            fn()
            t1 = time.perf_counter()
            times.append((t1 - t0) * 1000)
        avg = round(statistics.mean(times), 3)
        session_avgs.append(avg)

    grand_avg = round(statistics.mean(session_avgs), 3)
    return session_avgs, grand_avg

def print_result(label, session_avgs, grand_avg):
    print(f"\n  {label}")
    for i, a in enumerate(session_avgs, 1):
        print(f"    Session {i}: {a} ms")
    print(f"    ► PAPER VALUE (avg of {SESSIONS} sessions): {grand_avg} ms")

# ── Setup keys once outside timing ───────────────────────
pk,  sk  = ML_KEM_768.keygen()
pk2, sk2 = ML_KEM_768.keygen()
ss,  ct_kem = ML_KEM_768.encaps(pk)
master = get_random_bytes(32)

print("=" * 58)
print("  TABLE 1 — PURE CRYPTO BENCHMARK")
print(f"  {SESSIONS} sessions × {ITERATIONS_PER_SESSION} iterations each")
print("=" * 58)

# 1. KeyGen
s, g = measure_sessions(lambda: ML_KEM_768.keygen())
print_result("[1] ML-KEM-768 KeyGen", s, g)
keygen_final = g

# 2. Full Encrypt (encaps + AES-GCM on 1KB)
pt_1kb = get_random_bytes(1024)
def full_encrypt():
    ss_, ct_ = ML_KEM_768.encaps(pk)
    c = AES.new(ss_[:32], AES.MODE_GCM)
    c.encrypt_and_digest(pt_1kb)
s, g = measure_sessions(full_encrypt)
print_result("[2] AES-256-GCM Encryption (1KB)", s, g)
encrypt_final = g

# 3. ReKey (decaps + encaps)
def rekey():
    ss_ = ML_KEM_768.decaps(sk, ct_kem)
    ML_KEM_768.encaps(pk2)
s, g = measure_sessions(rekey)
print_result("[3] ReKey Generation", s, g)
rekey_final = g

# 4. Re-encryption proxy (data passthrough only)
def reencrypt():
    _ = {
        'ct_kem2':     ct_kem,
        'key_capsule': ss,
        'nonce':       b'x' * 16,
        'tag':         b'x' * 16
    }
s, g = measure_sessions(reencrypt)
print_result("[4] Re-encryption (Proxy)", s, g)
reencrypt_final = g

# 5. Full Decrypt (decaps + AES-GCM)
c_ref = AES.new(ss[:32], AES.MODE_GCM)
ct_file, tag = c_ref.encrypt_and_digest(pt_1kb)
nonce = c_ref.nonce
def full_decrypt():
    ss_ = ML_KEM_768.decaps(sk, ct_kem)
    c = AES.new(ss_[:32], AES.MODE_GCM, nonce=nonce)
    c.decrypt_and_verify(ct_file, tag)
s, g = measure_sessions(full_decrypt)
print_result("[5] Decryption", s, g)
decrypt_final = g

# 6. HMAC
def do_hmac():
    hmac.new(master,
             b"dept::cardiology|role::doctor",
             hashlib.sha256).digest()
s, g = measure_sessions(do_hmac)
print_result("[6] HMAC Policy Derivation", s, g)
hmac_final = g






# ── Summary ───────────────────────────────────────────────
total = round(keygen_final + encrypt_final +
              rekey_final + decrypt_final, 3)

print("\n" + "=" * 58)
print("  FINAL PAPER VALUES — TABLE 1")
print("=" * 58)
print(f"  ML-KEM-768 KeyGen          : {keygen_final} ms")
print(f"  AES-256-GCM Encryption     : {encrypt_final} ms")
print(f"  ReKey Generation           : {rekey_final} ms")
print(f"  Re-encryption (Proxy)      : {reencrypt_final} ms")
print(f"  Decryption                 : {decrypt_final} ms")
print(f"  HMAC Policy Derivation     : {hmac_final} ms")

print(f"\n  Total per-user workflow    : {total} ms")
print("=" * 58)

# ── TABLE 2 ───────────────────────────────────────────────
print("\n" + "=" * 58)
print("  TABLE 2 — FILE SIZE vs TIME")
print(f"  {SESSIONS} sessions × 20 iterations each")
print("=" * 58)

FILE_SIZES = {
    '100 KB': 100  * 1024,
    '1 MB':   1    * 1024 * 1024,
    '5 MB':   5    * 1024 * 1024,
    '10 MB':  10   * 1024 * 1024,
}

for label, size in FILE_SIZES.items():
    pt = get_random_bytes(size)

    # Encrypt
    def enc():
        ss_, ct_ = ML_KEM_768.encaps(pk)
        c = AES.new(ss_[:32], AES.MODE_GCM)
        c.encrypt_and_digest(pt)
    _, enc_avg = measure_sessions(enc, sessions=SESSIONS, runs=20)

    # Decrypt
    ss_, ct_ = ML_KEM_768.encaps(pk)
    c_r = AES.new(ss_[:32], AES.MODE_GCM)
    ct_f, tg = c_r.encrypt_and_digest(pt)
    nn = c_r.nonce
    def dec():
        ss2 = ML_KEM_768.decaps(sk, ct_)
        c2 = AES.new(ss2[:32], AES.MODE_GCM, nonce=nn)
        c2.decrypt_and_verify(ct_f, tg)
    _, dec_avg = measure_sessions(dec, sessions=SESSIONS, runs=20)

    # ReKey
    _, rk_avg = measure_sessions(rekey, sessions=SESSIONS, runs=20)

    print(f"\n  {label}:")
    print(f"    Encrypt : {enc_avg} ms")
    print(f"    Decrypt : {dec_avg} ms")
    print(f"    ReKey   : {rk_avg} ms  <- should stay ~constant")

print("\n  BENCHMARK COMPLETE")
print("=" * 58)