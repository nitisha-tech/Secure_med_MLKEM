
# comm_cost.py
# Run: python3.10 comm_cost.py
# Make sure pre_service.py is running on port 5001

import requests, base64, os, json

BASE_URL = "http://localhost:5001"

def b64e(b): return base64.b64encode(b).decode()
def b64d(s): return base64.b64decode(s)

FILE_SIZE = 1024  # 1KB baseline — represents small medical metadata

print("=" * 60)
print("  COMMUNICATION COST CALCULATION")
print("=" * 60)

# Step 1 — Generate patient keypair
r = requests.post(f"{BASE_URL}/pre/keygen")
patient = r.json()
pk_patient = patient['pk']
sk_patient = patient['sk']

pk_bytes = len(b64d(pk_patient))
sk_bytes = len(b64d(sk_patient))
print(f"\n[Fixed Sizes]")
print(f"  Public Key (pk)       : {pk_bytes} bytes ({pk_bytes*8} bits)")
print(f"  Secret Key (sk)       : {sk_bytes} bytes ({sk_bytes*8} bits)")

# Step 2 — Generate doctor keypair
r2 = requests.post(f"{BASE_URL}/pre/keygen")
doctor = r2.json()
pk_doctor = doctor['pk']

# Step 3 — UPLOAD PHASE: encrypt a 1KB file
plaintext_1kb = b64e(os.urandom(FILE_SIZE))

r3 = requests.post(f"{BASE_URL}/pre/encrypt", json={
    'pk': pk_patient,
    'plaintext': plaintext_1kb
})
enc = r3.json()

ct_kem_bytes   = len(b64d(enc['ct_kem']))
ct_file_bytes  = len(b64d(enc['ct_file']))
nonce_bytes    = len(b64d(enc['nonce']))
tag_bytes      = len(b64d(enc['tag']))

print(f"\n[Upload Phase — /pre/encrypt with 1KB file]")
print(f"  ct_kem                : {ct_kem_bytes} bytes  (ML-KEM-768 fixed)")
print(f"  ct_file               : {ct_file_bytes} bytes  (AES-GCM ciphertext)")
print(f"  nonce                 : {nonce_bytes} bytes")
print(f"  tag                   : {tag_bytes} bytes")

total_upload = pk_bytes + ct_kem_bytes + ct_file_bytes + nonce_bytes + tag_bytes
print(f"\n  ► Total Upload Phase  : {total_upload} bytes ({total_upload*8} bits)")
print(f"    = pk({pk_bytes}) + ct_kem({ct_kem_bytes}) + ct_file({ct_file_bytes}) + nonce({nonce_bytes}) + tag({tag_bytes})")

# Step 4 — ACCESS PHASE: rekey + reencrypt
r4 = requests.post(f"{BASE_URL}/pre/rekey", json={
    'sk_owner':  sk_patient,
    'pk_doctor': pk_doctor,
    'ct_kem':    enc['ct_kem']
})
rekey = r4.json()

ct_kem2_bytes      = len(b64d(rekey['ct_kem2']))
key_capsule_bytes  = len(b64d(rekey['key_capsule']))
kc_nonce_bytes     = len(b64d(rekey['kc_nonce']))
kc_tag_bytes       = len(b64d(rekey['kc_tag']))

r5 = requests.post(f"{BASE_URL}/pre/reencrypt", json={
    'ct_kem2':     rekey['ct_kem2'],
    'key_capsule': rekey['key_capsule'],
    'kc_nonce':    rekey['kc_nonce'],
    'kc_tag':      rekey['kc_tag'],
    'ct_file':     enc['ct_file'],
    'nonce':       enc['nonce'],
    'tag':         enc['tag'],
    'pk_owner':    pk_patient
})
reenc = r5.json()

print(f"\n[Access Phase — /pre/rekey + /pre/reencrypt]")
print(f"  INPUT  sk_owner       : {sk_bytes} bytes")
print(f"  INPUT  pk_doctor      : {pk_bytes} bytes")
print(f"  INPUT  ct_kem         : {ct_kem_bytes} bytes")
print(f"  OUTPUT ct_kem2        : {ct_kem2_bytes} bytes  (new KEM ciphertext for doctor)")
print(f"  OUTPUT key_capsule    : {key_capsule_bytes} bytes  (AES-wrapped shared secret)")
print(f"  OUTPUT kc_nonce       : {kc_nonce_bytes} bytes")
print(f"  OUTPUT kc_tag         : {kc_tag_bytes} bytes")
print(f"  PASS   ct_file        : {ct_file_bytes} bytes  (unchanged)")
print(f"  PASS   nonce+tag      : {nonce_bytes + tag_bytes} bytes")

total_access = (sk_bytes + pk_bytes + ct_kem_bytes +
                ct_kem2_bytes + key_capsule_bytes +
                kc_nonce_bytes + kc_tag_bytes +
                ct_file_bytes + nonce_bytes + tag_bytes)

print(f"\n  ► Total Access Phase  : {total_access} bytes ({total_access*8} bits)")

print(f"\n{'='*60}")
print(f"  FINAL SUMMARY")
print(f"{'='*60}")
print(f"  KEM Ciphertext (ct_kem)     : {ct_kem_bytes} bytes ({ct_kem_bytes*8} bits)")
print(f"  Public Key Size             : {pk_bytes} bytes ({pk_bytes*8} bits)")
print(f"  AES-GCM Overhead            : {nonce_bytes+tag_bytes} bytes ({(nonce_bytes+tag_bytes)*8} bits)")
print(f"  Re-encryption Capsule       : {ct_kem2_bytes+key_capsule_bytes+kc_nonce_bytes+kc_tag_bytes} bytes")
print(f"  Total Upload Phase (1KB)    : {total_upload} bytes ({total_upload*8} bits)")
print(f"  Total Access Phase (1KB)    : {total_access} bytes ({total_access*8} bits)")