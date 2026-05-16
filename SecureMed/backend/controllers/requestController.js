// backend/controllers/requestController.js
import AccessRequest from "../models/AccessRequest.js";
import Record        from "../models/Record.js";
import { preReencrypt } from "../services/preService.js";
import { fetchEncryptedBundle, uploadReencryptedBundle, gatewayUrl } from "../services/ipfsService.js";

// ── POST /api/requests ────────────────────────────────────────────────────────
export const createRequest = async (req, res) => {
  try {
    const { recordId } = req.body;
    const doctor       = req.user;

    if (!doctor.pkPre)
      return res.status(400).json({ success: false, message: "PRE public key not set. Update your profile first." });

    const record = await Record.findById(recordId);
    if (!record)
      return res.status(404).json({ success: false, message: "Record not found" });

    const existing = await AccessRequest.findOne({ doctorId: doctor._id.toString(), recordId, status: "pending" });
    if (existing)
      return res.status(409).json({ success: false, message: "Request already pending" });

    const newRequest = new AccessRequest({
      doctorId:       doctor._id.toString(),
      doctorFabricId: doctor.fabricUserId || null,
      doctorName:     doctor.name,
      pkDoctor:       doctor.pkPre,
      recordId,
      fabricRecordId: record.fabricRecordId,
      patientId:      record.userId,
    });
    await newRequest.save();
    res.status(201).json({ success: true, data: newRequest });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /api/requests — patient sees incoming requests ────────────────────────
export const getRequests = async (req, res) => {
  try {
    const requests = await AccessRequest.find({ patientId: req.user._id.toString() }).sort({ requestedAt: -1 });

    // Enrich pending requests with ctKem so patient browser can run clientSideRekey
    const enriched = await Promise.all(requests.map(async (r) => {
      const obj = r.toObject();
      if (r.status === "pending") {
        const record = await Record.findById(r.recordId).select("ipfsCid pkOwner").lean();
        if (record) {
          try {
            const bundle = await fetchEncryptedBundle(record.ipfsCid);
            obj.ctKem   = bundle.ct_kem;
            obj.pkOwner = record.pkOwner;
          } catch { /* IPFS unreachable in dev */ }
        }
      }
      return obj;
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── POST /api/requests/:id/approve ───────────────────────────────────────────
// Browser ran clientSideRekey() — receives { ct_kem2, key_capsule, kc_nonce, kc_tag }
// No private key ever reaches the server.
export const approveRequest = async (req, res) => {
  try {
    const { ct_kem2, key_capsule, kc_nonce, kc_tag } = req.body;

    if (!ct_kem2 || !key_capsule || !kc_nonce || !kc_tag)
      return res.status(400).json({
        success: false,
        message: "Re-encryption bundle required: { ct_kem2, key_capsule, kc_nonce, kc_tag }",
      });

    const accessReq = await AccessRequest.findById(req.params.id);
    if (!accessReq) return res.status(404).json({ success: false, message: "Request not found" });
    if (accessReq.patientId !== req.user._id.toString()) return res.status(403).json({ success: false, message: "Forbidden" });
    if (accessReq.status !== "pending") return res.status(400).json({ success: false, message: "Request already resolved" });

    const record = await Record.findById(accessReq.recordId);
    if (!record) return res.status(404).json({ success: false, message: "Record not found" });

    const bundle     = await fetchEncryptedBundle(record.ipfsCid);
    const reencBundle = await preReencrypt({ ct_kem2, key_capsule, kc_nonce, kc_tag }, bundle, record.pkOwner);
    const reencCid   = await uploadReencryptedBundle(reencBundle, `reenc_${accessReq.doctorId}_${record._id}`);

    accessReq.status     = "approved";
    accessReq.reencCid   = reencCid;
    accessReq.pkOwner    = record.pkOwner;
    accessReq.resolvedAt = new Date();
    await accessReq.save();

    res.json({ success: true, message: "Access approved", data: { reencCid, ipfsUrl: gatewayUrl(reencCid) } });
  } catch (error) {
    console.error("❌ Approve Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── POST /api/requests/:id/reject ─────────────────────────────────────────────
export const rejectRequest = async (req, res) => {
  try {
    const accessReq = await AccessRequest.findById(req.params.id);
    if (!accessReq) return res.status(404).json({ success: false, message: "Request not found" });
    if (accessReq.patientId !== req.user._id.toString()) return res.status(403).json({ success: false, message: "Forbidden" });

    accessReq.status     = "rejected";
    accessReq.resolvedAt = new Date();
    await accessReq.save();
    res.json({ success: true, message: "Request rejected" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /api/requests/:id/fetch ───────────────────────────────────────────────
// Returns FULL re-encrypted IPFS bundle so doctor's browser can decrypt it.
// Server fetches ciphertext only — no decryption, no private key involved.
export const fetchApprovedBundle = async (req, res) => {
  try {
    const accessReq = await AccessRequest.findById(req.params.id);
    if (!accessReq) return res.status(404).json({ success: false, message: "Request not found" });
    if (accessReq.doctorId !== req.user._id.toString()) return res.status(403).json({ success: false, message: "Forbidden" });
    if (accessReq.status !== "approved") return res.status(403).json({ success: false, message: "Request not yet approved" });

    // Fetch the full re-encrypted bundle from IPFS
    const bundle = await fetchEncryptedBundle(accessReq.reencCid);
 console.log('bundle keys:', Object.keys(bundle));
console.log('ct_kem2:', bundle.ct_kem2?.substring(0, 30));
console.log('key_capsule:', bundle.key_capsule?.substring(0, 30));
console.log('kc_nonce:', bundle.kc_nonce?.substring(0, 30));
console.log('kc_tag:', bundle.kc_tag?.substring(0, 30));
console.log('ct_file:', bundle.ct_file?.substring(0, 30));
console.log('nonce:', bundle.nonce?.substring(0, 30));
console.log('tag:', bundle.tag?.substring(0, 30));
    // Get record metadata for filename / mime
    const record = await Record.findById(accessReq.recordId).select("fileName type").lean();

    res.json({
      success: true,
      data: {
        // KEM re-encryption fields (doctor decaps with their sk)
        ct_kem2:     bundle.ct_kem2,
        key_capsule: bundle.key_capsule,
        kc_nonce:    bundle.kc_nonce,
        kc_tag:      bundle.kc_tag,
        // Encrypted file
        ct_file: bundle.ct_file,
        nonce:   bundle.nonce,
        tag:     bundle.tag,
        // Metadata
        fileName: record?.fileName || "medical-record",
        mimeType: guessMime(record?.fileName || ""),
      },
    });
  } catch (error) {
    console.error("❌ Fetch bundle error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /api/requests/mine ────────────────────────────────────────────────────
export const getDoctorRequests = async (req, res) => {
  try {
    const requests = await AccessRequest.find({ doctorId: req.user._id.toString() }).sort({ requestedAt: -1 });
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

function guessMime(fileName = "") {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  return { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }[ext] || "application/octet-stream";
}
// ── POST /api/requests/:id/reset — admin/patient resets a bad approved bundle
// Used when reencCid points to a stale or cryptographically incorrect bundle.
export const resetRequest = async (req, res) => {
  try {
    const accessReq = await AccessRequest.findById(req.params.id);
    if (!accessReq)
      return res.status(404).json({ success: false, message: "Request not found" });
    if (accessReq.patientId !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Forbidden" });

    accessReq.status     = "pending";
    accessReq.reencCid   = null;
    accessReq.pkOwner    = null;
    accessReq.resolvedAt = null;
    await accessReq.save();

    res.json({ success: true, message: "Request reset to pending — patient can re-approve" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};