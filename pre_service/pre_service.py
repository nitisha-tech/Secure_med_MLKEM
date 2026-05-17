"""
SecureMed PQ-PRE Microservice
==============================
Post-Quantum Proxy Re-Encryption using:
  - ML-KEM-768 (FIPS 203 / NIST standard) for Key Encapsulation
  - AES-256-GCM for symmetric file encryption
  - HMAC-SHA256 for CP-ABE policy key derivation

IMPORTANT: Uses kyber_py.ml_kem.ML_KEM_768 (FIPS 203 compliant),
NOT kyber_py.kyber.Kyber768 (pre-standardisation draft).
ML_KEM_768 is fully interoperable with @noble/post-quantum ml_kem768,
allowing sk to stay in the browser for all operations.
"""

import os, json, base64, hashlib, hmac
from flask import Flask, request, jsonify

from kyber_py.ml_kem import ML_KEM_768          # ← FIPS 203, interop with Noble
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes

app = Flask(__name__)

KEYS_DIR = os.path.join(os.path.dirname(__file__), 'keys')
os.makedirs(KEYS_DIR, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def b64e(b: bytes) -> str:
    return base64.b64encode(b).decode()

def b64d(s: str) -> bytes:
    return base64.b64decode(s)

def aes_gcm_encrypt(key: bytes, plaintext: bytes) -> dict:
    nonce  = get_random_bytes(16)
    cipher = AES.new(key[:32], AES.MODE_GCM, nonce=nonce)
    ct, tag = cipher.encrypt_and_digest(plaintext)
    return {
        'nonce':      b64e(nonce),
        'ciphertext': b64e(ct),
        'tag':        b64e(tag)
    }

def aes_gcm_decrypt(key: bytes, bundle: dict) -> bytes:
    nonce  = b64d(bundle['nonce'])
    ct     = b64d(bundle['ciphertext'])
    tag    = b64d(bundle['tag'])
    cipher = AES.new(key[:32], AES.MODE_GCM, nonce=nonce)
    return cipher.decrypt_and_verify(ct, tag)

def load_master_secret() -> bytes:
    path = os.path.join(KEYS_DIR, 'master_secret.bin')
    if not os.path.exists(path):
        raise RuntimeError("Master secret not found. Run cpabe_setup.py first.")
    with open(path, 'rb') as f:
        return f.read()

def derive_policy_key(attributes: list, master_secret: bytes) -> bytes:
    attr_string = "|".join(sorted(attributes))
    return hmac.new(master_secret, attr_string.encode(), hashlib.sha256).digest()

# ─────────────────────────────────────────────────────────────────────────────
# HEALTH
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status':  'ok',
        'service': 'SecureMed PQ-PRE',
        'scheme':  'ML-KEM-768 (FIPS 203) + AES-256-GCM',
        'pq':      True
    })

# ─────────────────────────────────────────────────────────────────────────────
# PQ-PRE — KEYGEN
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/pre/keygen', methods=['POST'])
def pre_keygen():
    try:
        pk, sk = ML_KEM_768.keygen()
        return jsonify({ 'pk': b64e(pk), 'sk': b64e(sk) })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# PQ-PRE — ENCRYPT
# Server encrypts file under patient's ML-KEM-768 public key.
#
# Flow:
#   KEM: encaps(pk_patient) → (ss, ct_kem)
#   DEM: AES-256-GCM(ss, file) → (ct_file, nonce, tag)
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/pre/encrypt', methods=['POST'])
def pre_encrypt():
    try:
        data      = request.json
        pk        = b64d(data['pk'])
        plaintext = b64d(data['plaintext'])

        ss, ct_kem = ML_KEM_768.encaps(pk)   # returns (ss, ct)
        enc        = aes_gcm_encrypt(ss, plaintext)

        return jsonify({
            'ct_kem':  b64e(ct_kem),
            'ct_file': enc['ciphertext'],
            'nonce':   enc['nonce'],
            'tag':     enc['tag']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# PQ-PRE — DECRYPT OWNER (Patient decrypts their own file)
#
# Flow:
#   1. decaps(sk_owner, ct_kem) → ss
#   2. AES-GCM.dec(ss, ct_file) → plaintext
#
# sk_owner sent over TLS, never stored.
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/pre/decrypt-owner', methods=['POST'])
def pre_decrypt_owner():
    try:
        data     = request.json
        sk_owner = b64d(data['sk_owner'])
        ct_kem   = b64d(data['ct_kem'])

        ss = ML_KEM_768.decaps(sk_owner, ct_kem)

        plaintext = aes_gcm_decrypt(ss, {
            'nonce':      data['nonce'],
            'ciphertext': data['ct_file'],
            'tag':        data['tag']
        })

        return jsonify({'plaintext': b64e(plaintext)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# PQ-PRE — REKEY (Patient generates re-encryption material)
#
# Flow:
#   1. decaps(sk_owner, ct_kem)        → ss  (recover file key)
#   2. encaps(pk_doctor)               → (ss_transit, ct_kem2)
#   3. AES-GCM.enc(ss_transit, ss)     → key_capsule
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/pre/rekey', methods=['POST'])
def pre_rekey():
    try:
        data       = request.json
        sk_patient = b64d(data['sk_owner'])
        pk_doctor  = b64d(data['pk_doctor'])
        ct_kem     = b64d(data['ct_kem'])

        ss = ML_KEM_768.decaps(sk_patient, ct_kem)

        ss_transit, ct_kem2 = ML_KEM_768.encaps(pk_doctor)

        key_capsule_bundle = aes_gcm_encrypt(ss_transit, ss)

        return jsonify({
            'ct_kem2':     b64e(ct_kem2),
            'key_capsule': key_capsule_bundle['ciphertext'],
            'kc_nonce':    key_capsule_bundle['nonce'],
            'kc_tag':      key_capsule_bundle['tag']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# PQ-PRE — REENCRYPT (Proxy passthrough)
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/pre/reencrypt', methods=['POST'])
def pre_reencrypt():
    try:
        data = request.json
        return jsonify({
            'ct_kem2':     data['ct_kem2'],
            'key_capsule': data['key_capsule'],
            'kc_nonce':    data['kc_nonce'],
            'kc_tag':      data['kc_tag'],
            'ct_file':     data['ct_file'],
            'nonce':       data['nonce'],
            'tag':         data['tag'],
            'pk_owner':    data['pk_owner']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# CP-ABE SIMULATION — ENCRYPT CID
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/cpabe/encrypt', methods=['POST'])
def cpabe_encrypt():
    try:
        data   = request.json
        cid    = data['cid'].encode()
        policy = data['policy']

        master     = load_master_secret()
        attributes = [a.strip() for a in policy.split('|')]
        aes_key    = derive_policy_key(attributes, master)
        enc        = aes_gcm_encrypt(aes_key, cid)

        bundle = {
            'nonce':      enc['nonce'],
            'ciphertext': enc['ciphertext'],
            'tag':        enc['tag'],
            'policy':     policy
        }

        return jsonify({ 'encrypted_cid': b64e(json.dumps(bundle).encode()) })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# CP-ABE SIMULATION — DECRYPT CID
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/cpabe/decrypt', methods=['POST'])
def cpabe_decrypt():
    try:
        data       = request.json
        enc_b64    = data['encrypted_cid']
        attributes = data['attributes']

        master = load_master_secret()
        bundle = json.loads(b64d(enc_b64).decode())

        policy_attrs = [a.strip() for a in bundle['policy'].split('|')]
        missing = [a for a in policy_attrs if a not in attributes]
        if missing:
            return jsonify({'error': f'Access denied — missing attributes: {missing}'}), 403

        aes_key   = derive_policy_key(policy_attrs, master)
        plaintext = aes_gcm_decrypt(aes_key, {
            'nonce':      bundle['nonce'],
            'ciphertext': bundle['ciphertext'],
            'tag':        bundle['tag']
        })

        return jsonify({'cid': plaintext.decode()})
    except Exception as e:
        return jsonify({'error': 'Decryption failed — attribute mismatch'}), 403

# ─────────────────────────────────────────────────────────────────────────────
# CP-ABE — ISSUE ATTRIBUTE KEY
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/cpabe/issue-key', methods=['POST'])
def issue_key():
    try:
        data       = request.json
        attributes = data['attributes']
        user_id    = data.get('userId', 'unknown')

        sk_abe = b64e(json.dumps(attributes).encode())
        print(f"[KeyAuthority] Issued attributes to {user_id}: {attributes}")

        return jsonify({
            'sk_abe':     sk_abe,
            'attributes': attributes,
            'userId':     user_id
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("=" * 60)
    print("  SecureMed Post-Quantum PRE Microservice")
    print("  KEM : ML-KEM-768 (FIPS 203 — interop with @noble/post-quantum)")
    print("  DEM : AES-256-GCM")
    print("  ABE : HMAC-SHA256 policy key derivation")
    print("  PQ  : YES — quantum-resistant file confidentiality")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5001, debug=False)