// backend/server.js
import dotenv from "dotenv";
dotenv.config();

import express    from "express";
import mongoose   from "mongoose";
import cors       from "cors";
import jwt        from "jsonwebtoken";
import { execFile } from "child_process";
import path       from "path";
import { fileURLToPath } from "url";

import recordRoutes  from "./routes/recordRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import requestRoutes from "./routes/requestRoutes.js";
import logRoutes     from "./routes/logRoutes.js";

import {
  register, login,
  getPendingApplications,
  approveDoctor, rejectDoctor
} from "./controllers/authController.js";

import { issueAttributeKey, preRekey } from "./services/preService.js";
import DoctorApplication from "./models/DoctorApplication.js";
import AccessRequest     from "./models/AccessRequest.js";
import User              from "./models/user.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENROLL_SCRIPT = path.resolve(__dirname, "..", "enrollUser.js");

const app = express();

/* ─── MIDDLEWARE ──────────────────────────────────── */
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "50mb" }));

/* ─── DATABASE ────────────────────────────────────── */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.error("DB Error ❌", err));

/* ─── AUTH ROUTES ─────────────────────────────────── */
app.post("/api/auth/register", register);
app.post("/api/auth/login",    login);

app.post("/api/auth/register-key", async (req, res) => {
  try {
    const { userId, pkPre } = req.body;
    if (!userId || !pkPre)
      return res.status(400).json({ message: "userId and pkPre required" });
    await User.findByIdAndUpdate(userId, { pkPre });
    res.json({ success: true, message: "PRE public key registered" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ─── ADMIN — Doctor application routes ──────────── */
app.get("/api/auth/applications/pending", getPendingApplications);

app.post("/api/auth/applications/:id/approve", async (req, res) => {
  try {
    await approveDoctor(req, res);

    setImmediate(async () => {
      try {
        const application = await DoctorApplication.findById(req.params.id);
        if (!application || application.status !== "Approved") return;

        const doctorUser = await User.findOne({ email: application.email });
        if (!doctorUser) return;

        const fabricUserId = `doctor_${doctorUser._id.toString()}`;

        execFile("node", [ENROLL_SCRIPT, fabricUserId, "doctor", application.department],
          { cwd: path.resolve(__dirname, "..") },
          async (err, stdout, stderr) => {
            if (err) { console.error("❌ Fabric enroll failed:", stderr); return; }
            console.log("✅ Fabric identity enrolled:", stdout.trim());

            const attrs = [
              `department::${application.department.toLowerCase()}`,
              "role::doctor"
            ];
            const { sk_abe } = await issueAttributeKey(fabricUserId, attrs);

            await User.findByIdAndUpdate(doctorUser._id, {
              fabricUserId,
              fabricEnrolled: true,
              skAbe: sk_abe
            });
            await DoctorApplication.findByIdAndUpdate(application._id, { fabricUserId });

            console.log(`✅ Doctor ${doctorUser.name} fully provisioned`);
            console.log(`   Fabric ID: ${fabricUserId}`);
            console.log(`   ABE attrs: ${attrs.join(", ")}`);
          }
        );
      } catch (postErr) {
        console.error("❌ Post-approval setup failed:", postErr.message);
      }
    });

  } catch (err) {
    if (!res.headersSent)
      res.status(500).json({ message: "Approval failed", error: err.message });
  }
});

app.post("/api/auth/applications/:id/reject", rejectDoctor);

/* ─── PRE REKEY PROXY ─────────────────────────────────────────────────────────
   Patient browser POSTs { sk_owner, ct_kem, requestId } here.
   sk_owner travels over TLS only — never logged, never stored.

   CRITICAL: pk_doctor is NOT trusted from the browser. Instead we fetch the
   doctor's CURRENT pkPre from the User collection via the AccessRequest.
   This prevents stale-pk mismatch when a doctor's keypair was regenerated
   after the access request was originally created.

   Python kyber-py performs both decaps and encaps — same library that did
   encaps at upload time — guaranteeing correct shared secret recovery.
   Returns { ct_kem2, key_capsule, kc_nonce, kc_tag } to the browser.
────────────────────────────────────────────────────────────────────────────── */
function authenticateToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided" });
  try {
    req.user = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

app.post("/api/pre/rekey", authenticateToken, async (req, res) => {
  if (req.user.role !== "patient")
    return res.status(403).json({ message: "Only patients can rekey" });

  try {
    const { sk_owner, ct_kem, requestId } = req.body;

    if (!sk_owner || !ct_kem || !requestId)
      return res.status(400).json({ message: "sk_owner, ct_kem and requestId are required" });

    // ── Fetch the access request to get the doctor's ID ───────────────────────
    const accessReq = await AccessRequest.findById(requestId).lean();
    if (!accessReq)
      return res.status(404).json({ message: "Access request not found" });
    if (accessReq.patientId !== req.user.id)
      return res.status(403).json({ message: "This request does not belong to you" });
    if (accessReq.status !== "pending")
      return res.status(400).json({ message: "Request is not pending" });

    // ── Fetch doctor's CURRENT pkPre — never trust pk from browser ────────────
    const doctor = await User.findById(accessReq.doctorId).select("pkPre name").lean();
    console.log(`Doctor pkPre in DB (first 40): ${doctor?.pkPre?.substring(0, 40)}`);
    console.log(`Doctor pkPre in DB (first 40): ${doctor?.pkPre?.substring(0, 40)}`);
    if (!doctor?.pkPre)
      return res.status(400).json({ message: "Doctor does not have a PRE public key set" });

    console.log(`✅ Rekey: patient=${req.user.id} → doctor=${doctor.name} (${accessReq.doctorId})`);
    console.log(`   Using doctor's CURRENT pkPre (first 20): ${doctor.pkPre.substring(0, 20)}...`);

    // ── Delegate to Python — same library that encrypted the file ─────────────
    const result = await preRekey(sk_owner, doctor.pkPre, ct_kem);

    // Also update AccessRequest.pkDoctor to stay in sync with current pk
    await AccessRequest.findByIdAndUpdate(requestId, { pkDoctor: doctor.pkPre });

    res.json(result); // { ct_kem2, key_capsule, kc_nonce, kc_tag }
  } catch (err) {
    console.error("❌ Rekey error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ─── FEATURE ROUTES ──────────────────────────────── */
app.use("/api/profile",  profileRoutes);
app.use("/api/records",  recordRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/logs",     logRoutes);

/* ─── START ───────────────────────────────────────── */
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   PRE service: ${process.env.PRE_SERVICE_URL || "http://localhost:5001"}`);
});