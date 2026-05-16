// backend/models/Record.js
import mongoose from "mongoose";

const recordSchema = new mongoose.Schema({
  title:    { type: String, required: true, trim: true },
  type:     { type: String, required: true, trim: true },
  fileName: { type: String, required: true },

  // ── IPFS ──────────────────────────────────────────────────────────────────
  ipfsCid:  { type: String, required: true },

  // ── Blockchain ────────────────────────────────────────────────────────────
  fabricRecordId: { type: String, default: null },
  encryptedCID:   { type: String, default: null },
  accessPolicy:   { type: String, default: null },

  // ── PRE ───────────────────────────────────────────────────────────────────
  capsule: { type: String, default: null },

  // ── Ownership ─────────────────────────────────────────────────────────────
  userId:           { type: String, required: true, index: true }, // MongoDB _id
  patientId:        { type: String, default: null,  index: true }, // PAT-XXXXXX — denormalized for fast lookup
  uploaderFabricId: { type: String, default: null },
  pkOwner:          { type: String, default: null },

  // department denormalized so /discover can filter without joining User
  department: { type: String, default: null, index: true },

  uploadedAt: { type: Date, default: Date.now, index: true },
});

export default mongoose.model("Record", recordSchema);