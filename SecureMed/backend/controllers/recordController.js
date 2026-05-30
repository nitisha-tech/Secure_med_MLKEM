// backend/controllers/recordController.js
import { v4 as uuidv4 } from "uuid";
import Record            from "../models/Record.js";
import User              from "../models/user.js";
import AccessRequest     from "../models/AccessRequest.js";
import { preEncrypt, preDecrypt, cpAbeEncrypt, cpAbeDecrypt } from "../services/preService.js";
import { uploadEncryptedBundle, fetchEncryptedBundle, gatewayUrl } from "../services/ipfsService.js";
import { uploadRecord as fabricUpload, queryByDepartment } from "../services/fabricService.js";
import { log, logEvent, ACTIONS } from "../services/blockchainLogger.js";


// ── POST /api/records/upload ──────────────────────────────────────────────────
export const uploadRecord = async (req, res) => {
  try {
    const { title, type, accessPolicy, fileName, fileData } = req.body;

    if (!fileData || !fileName)
      return res.status(400).json({ success: false, message: "fileName and fileData are required" });
    if (!title || !type)
      return res.status(400).json({ success: false, message: "Title and type are required" });

    const user         = req.user;
    const userId       = user._id.toString();
    const pkOwner      = user.pkPre;
    const department   = user.department || type;

    if (!pkOwner)
      return res.status(400).json({ success: false, message: "PRE public key not set." });

    const fileBuffer = Buffer.from(fileData, "base64");
    const encResult  = await preEncrypt(pkOwner, fileBuffer);
    const ipfsCid    = await uploadEncryptedBundle(encResult, fileName);

    const policy       = accessPolicy || `department::${department}|role::doctor`;
    const encryptedCID = await cpAbeEncrypt(ipfsCid, policy);
    const fabricRecordId = uuidv4();

    await fabricUpload({
      userId:       user.fabricUserId || "admin",
      recordID:     fabricRecordId,
      uploaderID:   userId,
      department,
      accessPolicy: policy,
      encryptedCID,
    });

    const newRecord = new Record({
      title, type, fileName, ipfsCid, fabricRecordId, encryptedCID,
      accessPolicy: policy,
      capsule:      encResult.ct_kem,
      userId,
      patientId:        user.patientId   || null,  // ← denormalized
      department:       department,                 // ← denormalized
      uploaderFabricId: user.fabricUserId || "admin",
      pkOwner,
    });
    await newRecord.save();
    // ── Blockchain audit log ──────────────────────────────────────────────
    const uploader = await User.findById(userId).select("name _id role").lean();
    if (uploader) {
      log.recordUpload(
        uploader,
        newRecord.title,
        newRecord._id.toString(),
        newRecord.department
      );
    }
    res.status(201).json({
      success: true,
      message: "Record encrypted and stored",
      data: { title, fileName, ipfsCid, fabricRecordId, ipfsUrl: gatewayUrl(ipfsCid) },
    });

  } catch (error) {
    console.error("❌ Upload Error:", error.stack || error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /api/records ──────────────────────────────────────────────────────────
export const getRecords = async (req, res) => {
  try {
    const records = await Record.find({ userId: req.user._id.toString() }).sort({ uploadedAt: -1 });
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── POST /api/records/:id/decrypt — patient previews their own file ───────────
export const decryptRecord = async (req, res) => {
  try {
    const { skOwner } = req.body;
    if (!skOwner) return res.status(400).json({ success: false, message: "skOwner is required" });

    const record = await Record.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "Record not found" });
    if (record.userId !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Forbidden" });

    const bundle = await fetchEncryptedBundle(record.ipfsCid);
    const result = await preDecrypt(skOwner, bundle);

    res.json({ success: true, plaintext: result.plaintext, fileName: record.fileName, mimeType: guessMime(record.fileName) });
    // ── Blockchain audit log ──────────────────────────────────────────────
    const viewer = await User.findById(req.user._id).select("name _id role").lean();
    if (viewer) {
      log.recordView(viewer, record.title, record._id.toString());
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── POST /api/records/discover ────────────────────────────────────────────────
//
// mode: "patientId"  — search by PAT-XXXXXX (exact match)
// mode: "patient"    — search by name / email (fuzzy)
// mode: "department" — Fabric + CP-ABE, fallback to MongoDB
// mode: "title"      — record title / type (fuzzy)
//
// All modes return uniform shape:
// { _id, title, type, fileName, department, uploadedAt,
//   patientId, patientName, patientEmail, userId }
//
export const discoverRecords = async (req, res) => {
  try {
    const { mode = "patientId", query = "" } = req.body;
    const user = req.user;

    if (!query.trim())
      return res.status(400).json({ success: false, message: "query is required" });

    // ── patientId — exact PAT-XXXXXX lookup ──────────────────────────────────
    if (mode === "patientId") {
      const patient = await User.findOne({
        role:      "patient",
        patientId: query.trim().toUpperCase(),
      }).select("_id name email patientId").lean();

      if (!patient) return res.json({ success: true, data: [], source: "mongodb" });

      const records = await Record.find({ userId: patient._id.toString() })
        .sort({ uploadedAt: -1 }).lean();

      return res.json({
        success: true,
        data:    records.map(r => ({ ...r, patientName: patient.name, patientEmail: patient.email })),
        patient: { name: patient.name, email: patient.email, patientId: patient.patientId },
        source:  "mongodb",
      });
    }

    // ── patient — fuzzy name / email ─────────────────────────────────────────
    if (mode === "patient") {
      const patients = await User.find({
        role: "patient",
        $or: [
          { name:  { $regex: query.trim(), $options: "i" } },
          { email: { $regex: query.trim(), $options: "i" } },
        ],
      }).select("_id name email patientId").lean();

      if (!patients.length) return res.json({ success: true, data: [], source: "mongodb" });

      const map     = Object.fromEntries(patients.map(p => [p._id.toString(), p]));
      const records = await Record.find({ userId: { $in: Object.keys(map) } })
        .sort({ uploadedAt: -1 }).lean();

      return res.json({
        success: true,
        data:    records.map(r => ({
          ...r,
          patientName:  map[r.userId]?.name      || "Unknown",
          patientEmail: map[r.userId]?.email     || "",
          patientId:    map[r.userId]?.patientId || null,
        })),
        source: "mongodb",
      });
    }

    // ── department — Fabric + CP-ABE, MongoDB fallback ───────────────────────
    if (mode === "department") {
      if (!user.skAbe) {
        // MongoDB fallback for dev / when CP-ABE key not issued
        const records = await Record.find({
          department: { $regex: query.trim(), $options: "i" },
        }).sort({ uploadedAt: -1 }).limit(100).lean();
        return res.json({ success: true, data: await enrichWithPatients(records), source: "mongodb-fallback" });
      }

      const attributes       = JSON.parse(Buffer.from(user.skAbe, "base64").toString());
      const requestTimestamp = Math.floor(Date.now() / 1000);

      const fabricRecords = await queryByDepartment({
        userId:           user.fabricUserId || "admin",
        department:       query.trim(),
        requestTimestamp,
      });

      const accessible = [];
      for (const rec of fabricRecords) {
        try {
          const cid      = await cpAbeDecrypt(rec.encryptedCID, attributes);
          const dbRecord = await Record.findOne({ fabricRecordId: rec.recordID }).lean();
          if (dbRecord) {
            const patient = await User.findById(dbRecord.userId).select("name email patientId").lean();
            accessible.push({ ...dbRecord, patientName: patient?.name || "Unknown", patientEmail: patient?.email || "", cid });
            // log once per discover call, not per record
          }
        } catch (_) { /* CP-ABE denied */ }
      }
        // ── Blockchain audit log ──────────────────────────────────────────────
        logEvent({
      actor:   user.name,
      actorId: user._id.toString(),
      role:    user.role || "doctor",
      action:  ACTIONS.DOCTOR_RECORD_VIEW,
      detail:  `Dr. ${user.name} queried ${accessible.length} record(s) in ${query.trim()}`,
      meta:    { department: query.trim(), resultCount: accessible.length },
    });
      return res.json({ success: true, data: accessible, source: "fabric" });
    
    
    }

    // ── title — fuzzy record title / type ────────────────────────────────────
    if (mode === "title") {
      const records = await Record.find({
        $or: [
          { title: { $regex: query.trim(), $options: "i" } },
          { type:  { $regex: query.trim(), $options: "i" } },
        ],
      }).sort({ uploadedAt: -1 }).limit(100).lean();

      return res.json({ success: true, data: await enrichWithPatients(records), source: "mongodb" });
    }

    return res.status(400).json({ success: false, message: `Unknown mode: ${mode}` });

  } catch (error) {
    console.error("❌ Discover error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /api/records/approved-patients ───────────────────────────────────────
// Returns all unique patients for whom this doctor has an approved request,
// with their accessible records and a "newRecords" flag if the patient
// uploaded new records since the approval date.
export const getApprovedPatients = async (req, res) => {
  try {
    const doctorId = req.user._id.toString();

    // All approved requests for this doctor
    const approvedRequests = await AccessRequest.find({
      doctorId, status: "approved",
    }).sort({ resolvedAt: -1 }).lean();

    if (!approvedRequests.length) return res.json({ success: true, data: [] });

    // Group by patientId — keep only the most recent approval per patient
    const patientMap = {};
    for (const req of approvedRequests) {
      if (!patientMap[req.patientId]) {
        patientMap[req.patientId] = {
          patientUserId: req.patientId,
          approvedAt:    req.resolvedAt,
          requests:      [],
        };
      }
      patientMap[req.patientId].requests.push(req);
    }

    const patientUserIds = Object.keys(patientMap);

    // Fetch patient User docs for name / patientId
    const patients = await User.find({ _id: { $in: patientUserIds } })
      .select("_id name email patientId department").lean();
    const userMap = Object.fromEntries(patients.map(p => [p._id.toString(), p]));

    // Fetch all records for these patients
    const allRecords = await Record.find({ userId: { $in: patientUserIds } })
      .sort({ uploadedAt: -1 }).lean();

    // Build per-patient result
    const result = patientUserIds.map(uid => {
      const info       = patientMap[uid];
      const user       = userMap[uid] || {};
      const records    = allRecords.filter(r => r.userId === uid);
      const approvedAt = info.approvedAt ? new Date(info.approvedAt) : new Date(0);

      // New records flag: any record uploaded AFTER the most recent approval
      // Only flag if the doctor doesn't already have an approved request for it
      const approvedRecordIds = new Set(info.requests.map(r => r.recordId));
      const newRecords = records.filter(
        r => new Date(r.uploadedAt) > approvedAt && !approvedRecordIds.has(r._id.toString())
      );

      return {
        patientUserId: uid,
        patientId:     user.patientId  || "—",
        patientName:   user.name       || "Unknown",
        patientEmail:  user.email      || "",
        department:    user.department || "—",
        hasNewRecords: newRecords.length > 0,
        newRecordCount: newRecords.length,
        approvedAt:    info.approvedAt,
        // Only return records the doctor actually has access to
        records: records.filter(r => approvedRecordIds.has(r._id.toString())).map(r => ({
          _id:        r._id,
          title:      r.title,
          type:       r.type,
          fileName:   r.fileName,
          department: r.department,
          uploadedAt: r.uploadedAt,
          reencCid:   info.requests.find(req => req.recordId === r._id.toString())?.reencCid || null,
          requestId:  info.requests.find(req => req.recordId === r._id.toString())?._id || null,
        })),
      };
    });

    res.json({ success: true, data: result });

  } catch (error) {
    console.error("❌ Approved patients error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function enrichWithPatients(records) {
  if (!records.length) return [];
  const uids     = [...new Set(records.map(r => r.userId).filter(Boolean))];
  const patients = await User.find({ _id: { $in: uids } }).select("_id name email patientId").lean();
  const map      = Object.fromEntries(patients.map(p => [p._id.toString(), p]));
  return records.map(r => ({
    ...r,
    patientName:  map[r.userId]?.name      || "Unknown",
    patientEmail: map[r.userId]?.email     || "",
    patientId:    r.patientId || map[r.userId]?.patientId || null,
  }));
}

function guessMime(fileName = "") {
  const ext = fileName.split(".").pop().toLowerCase();
  return { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }[ext] || "application/octet-stream";
}