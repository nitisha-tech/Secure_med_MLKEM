
# benchmark.py
# Run from: /mnt/d/SecureMedBlock/pre_service/
# Requirements: pip install requests
# Make sure pre_service.py is running: python3.10 pre_service.py

import requests
import time
import os
import json
import base64
import hmac
import hashlib
import statistics

BASE_URL = "http://localhost:5001"
RUNS = 100  # number of iterations per operation for averaging

def b64e(b): return base64.b64encode(b).decode()
def b64d(s): return base64.b64decode(s)

def measure(fn, runs=RUNS):
    """Run fn() `runs` times, return avg, min, max, stdev in ms."""
    times = []
    result = None
    for _ in range(runs):
        t0 = time.perf_counter()
        result = fn()
        t1 = time.perf_counter()
        times.append((t1 - t0) * 1000)
    return result, {
        'avg':   round(statistics.mean(times), 3),
        'min':   round(min(times), 3),
        'max':   round(max(times), 3),
        'stdev': round(statistics.stdev(times), 3)
    }

# ─────────────────────────────────────────────
# TABLE 1 — COMPUTATION COST
# ─────────────────────────────────────────────

print("\n" + "="*60)
print("  TABLE 1 — COMPUTATION COST")
print("="*60)

# 1. ML-KEM-768 KeyGen
def do_keygen():
    r = requests.post(f"{BASE_URL}/pre/keygen")
    return r.json()

keygen_result, keygen_stats = measure(do_keygen)
pk = keygen_result['pk']
sk = keygen_result['sk']
print(f"\n[1] ML-KEM-768 KeyGen         : {keygen_stats}")

# 2. AES-256-GCM Encryption (using 1KB payload for baseline)
sample_plaintext = b64e(os.urandom(1024))  # 1KB

def do_encrypt():
    r = requests.post(f"{BASE_URL}/pre/encrypt", json={
        'pk': pk,
        'plaintext': sample_plaintext
    })
    return r.json()

encrypt_result, encrypt_stats = measure(do_encrypt)
ct_kem  = encrypt_result['ct_kem']
ct_file = encrypt_result['ct_file']
nonce   = encrypt_result['nonce']
tag     = encrypt_result['tag']
print(f"[2] AES-256-GCM Encryption    : {encrypt_stats}")

# 3. ReKey Generation
def do_rekey():
    # Generate a doctor keypair first (done outside timing loop for fairness)
    r = requests.post(f"{BASE_URL}/pre/keygen")
    pk_doctor = r.json()['pk']
    r2 = requests.post(f"{BASE_URL}/pre/rekey", json={
        'sk_owner':  sk,
        'pk_doctor': pk_doctor,
        'ct_kem':    ct_kem
    })
    return r2.json()

# For rekey: generate doctor keys outside the timed loop
doctor_keys_pool = []
print("\n  [Preparing doctor keys for ReKey benchmark...]")
for _ in range(RUNS):
    r = requests.post(f"{BASE_URL}/pre/keygen")
    doctor_keys_pool.append(r.json())

def do_rekey_timed():
    """Only times the rekey operation itself, not doctor keygen."""
    dk = doctor_keys_pool.pop()
    r = requests.post(f"{BASE_URL}/pre/rekey", json={
        'sk_owner':  sk,
        'pk_doctor': dk['pk'],
        'ct_kem':    ct_kem
    })
    return r.json()

rekey_result, rekey_stats = measure(do_rekey_timed, runs=RUNS)
ct_kem2     = rekey_result['ct_kem2']
key_capsule = rekey_result['key_capsule']
kc_nonce    = rekey_result['kc_nonce']
kc_tag      = rekey_result['kc_tag']
print(f"[3] ReKey Generation          : {rekey_stats}")

# 4. Re-encryption (proxy passthrough — measures proxy overhead)
def do_reencrypt():
    r = requests.post(f"{BASE_URL}/pre/reencrypt", json={
        'ct_kem2':     ct_kem2,
        'key_capsule': key_capsule,
        'kc_nonce':    kc_nonce,
        'kc_tag':      kc_tag,
        'ct_file':     ct_file,
        'nonce':       nonce,
        'tag':         tag,
        'pk_owner':    pk
    })
    return r.json()

_, reencrypt_stats = measure(do_reencrypt)
print(f"[4] Re-encryption (Proxy)     : {reencrypt_stats}")

# 5. Decryption (owner decrypts their own file)
def do_decrypt():
    r = requests.post(f"{BASE_URL}/pre/decrypt-owner", json={
        'sk_owner': sk,
        'ct_kem':   ct_kem,
        'ct_file':  ct_file,
        'nonce':    nonce,
        'tag':      tag
    })
    return r.json()

_, decrypt_stats = measure(do_decrypt)
print(f"[5] Decryption                : {decrypt_stats}")

# 6. HMAC-SHA256 Policy Key Derivation (measured locally, no HTTP)
master_secret = os.urandom(32)
attributes    = ["dept::cardiology", "role::doctor"]

def do_hmac():
    attr_string = "|".join(sorted(attributes))
    return hmac.new(master_secret, attr_string.encode(), hashlib.sha256).digest()

_, hmac_stats = measure(do_hmac)
print(f"[6] HMAC-SHA256 Policy KeyDer : {hmac_stats}")

# 7. Hyperledger Fabric LogEvent Write
# Measured via your backend API — adjust port/route if different
BACKEND_URL = "http://localhost:5000"

def do_fabric_log():
    t0 = time.perf_counter()
    try:
        r = requests.post(f"{BACKEND_URL}/api/benchmark/log", json={
            'actor':   'BenchmarkUser',
            'actorId': 'bench-001',
            'role':    'patient',
            'action':  'BENCHMARK_TEST',
            'detail':  'Performance benchmark run'
        }, timeout=10)
        t1 = time.perf_counter()
        return (t1 - t0) * 1000
    except Exception as e:
        return None

print("\n  [Measuring Fabric LogEvent — 1 warmup + 20 timed runs]")

# Warmup run — not counted
do_fabric_log()

fabric_times = []
for i in range(20):
    ms = do_fabric_log()
    if ms:
        fabric_times.append(ms)
    print(f"    run {i+1}/20: {round(ms,1) if ms else 'FAILED'} ms")

# ─────────────────────────────────────────────
# TABLE 2 — FILE SIZE vs ENCRYPTION TIME
# ─────────────────────────────────────────────

print("\n" + "="*60)
print("  TABLE 2 — FILE SIZE vs ENCRYPTION / DECRYPTION / REKEY")
print("="*60)

FILE_SIZES = {
    '100 KB': 100  * 1024,
    '1 MB':   1    * 1024 * 1024,
    '5 MB':   5    * 1024 * 1024,
    '10 MB':  10   * 1024 * 1024,
}

TABLE2_RUNS = 10  # fewer runs — large files are slow

for label, size in FILE_SIZES.items():
    payload = b64e(os.urandom(size))

    # Encrypt
    enc_times = []
    enc_result = None
    for _ in range(TABLE2_RUNS):
        t0 = time.perf_counter()
        r = requests.post(f"{BASE_URL}/pre/encrypt", json={
            'pk': pk, 'plaintext': payload
        })
        enc_result = r.json()
        enc_times.append((time.perf_counter() - t0) * 1000)

    # Decrypt
    dec_times = []
    for _ in range(TABLE2_RUNS):
        t0 = time.perf_counter()
        requests.post(f"{BASE_URL}/pre/decrypt-owner", json={
            'sk_owner': sk,
            'ct_kem':   enc_result['ct_kem'],
            'ct_file':  enc_result['ct_file'],
            'nonce':    enc_result['nonce'],
            'tag':      enc_result['tag']
        })
        dec_times.append((time.perf_counter() - t0) * 1000)

    # ReKey (constant — proves independence from file size)
    dk = requests.post(f"{BASE_URL}/pre/keygen").json()
    rekey_times = []
    for _ in range(TABLE2_RUNS):
        t0 = time.perf_counter()
        requests.post(f"{BASE_URL}/pre/rekey", json={
            'sk_owner':  sk,
            'pk_doctor': dk['pk'],
            'ct_kem':    enc_result['ct_kem']
        })
        rekey_times.append((time.perf_counter() - t0) * 1000)

    print(f"\n  {label}:")
    print(f"    Encrypt : avg={round(statistics.mean(enc_times),1)} ms")
    print(f"    Decrypt : avg={round(statistics.mean(dec_times),1)} ms")
    print(f"    ReKey   : avg={round(statistics.mean(rekey_times),1)} ms  ← should stay ~constant")

print("\n" + "="*60)
print("  BENCHMARK COMPLETE")
print("="*60)
