// backend/models/AccessRequest.js
import mongoose from "mongoose";

const accessRequestSchema = new mongoose.Schema({
  // Doctor info
  doctorId: { type: String, required: true },  // MongoDB _id
  doctorFabricId: { type: String },                  // Fabric wallet identity
  doctorName: { type: String, required: true },
  pkDoctor: { type: String, required: true },  // Doctor PRE public key (base64)
  doctorSpecialization: { type: String, default: null },
  doctorDepartment: { type: String, default: null },
  doctorHospital: { type: String, default: null },
  doctorEmail: { type: String, default: null },

  // Record being requested
  recordId: { type: String, required: true },  // MongoDB Record _id
  fabricRecordId: { type: String },                  // Fabric ledger record ID
  recordTitle: { type: String, default: null },
  patientName: { type: String, default: null },
  // Patient who owns the record
  patientId: { type: String, required: true },  // MongoDB _id

  // Status lifecycle
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },

  // Filled on approval
  reencCid: { type: String, default: null },  // IPFS CID of re-encrypted bundle
  pkOwner: { type: String, default: null },  // Patient PRE public key (for cfrag verify)

  requestedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null }
});

export default mongoose.model("AccessRequest", accessRequestSchema);