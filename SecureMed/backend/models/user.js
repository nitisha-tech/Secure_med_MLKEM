// backend/models/user.js
import mongoose from "mongoose";

function generatePatientId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  let id = "PAT-";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const userSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  username:       { type: String, unique: true, sparse: true, trim: true, lowercase: true },
  email:          { type: String, required: true, unique: true, lowercase: true },
  password:       { type: String, required: true },
  role:           { type: String, enum: ["patient", "doctor", "admin"], required: true },

  // ── Patient-only fields ───────────────────────────────────────────────────
  // patientId is ONLY set for patients. Doctors and admins never get this field.
  // sparse:true means the unique index only covers documents WHERE the field exists.
  // By never setting it on doctors (undefined, not null), the index never sees them.
  patientId: {
    type:   String,
    unique: true,
    sparse: true,   // only indexes docs where field exists — undefined is ignored
    index:  true,
  },
  status: {
  type: String,
  enum: ["Active", "Suspended", "On Leave"],
  default: "Active",
},
  // ── Doctor-only fields ────────────────────────────────────────────────────
  medicalId:      String,   // unique per doctor, enforced at application level
  specialization: String,
  hospital:       String,
  experience:     String,

  // ── Shared fields ─────────────────────────────────────────────────────────
  department: String,
  phone:      String,

  // ── Fabric ────────────────────────────────────────────────────────────────
  fabricUserId:   { type: String, default: null },
  fabricEnrolled: { type: Boolean, default: false },

  // ── PRE public key (browser-generated, only pk stored) ───────────────────
  pkPre: { type: String, default: null },

  // ── CP-ABE attribute key ──────────────────────────────────────────────────
  skAbe: { type: String, default: null },

}, {
  timestamps: true,
  // Never store undefined fields — keeps doctor docs clean with no patientId key at all
  minimize: false,
});

// ── Pre-save: generate patientId for patients only ────────────────────────────
// Async hook — do NOT use next(), just return or throw (Mongoose 6+)
userSchema.pre("save", async function () {
  // Doctors and admins: explicitly unset patientId so the field doesn't exist
  // in the document at all (undefined ≠ null — sparse index ignores undefined)
  if (this.role !== "patient") {
    this.patientId = undefined;
    return;
  }

  // Patient already has a patientId — nothing to do
  if (this.patientId) return;

  // Generate a unique patientId for new patients
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generatePatientId();
    const existing  = await mongoose.models.User.findOne({ patientId: candidate });
    if (!existing) {
      this.patientId = candidate;
      return;
    }
  }

  throw new Error("Failed to generate unique patientId — please retry");
});

const User = mongoose.model("User", userSchema);
export default User;