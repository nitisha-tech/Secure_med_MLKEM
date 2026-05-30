// backend/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import jwt from "jsonwebtoken";
import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

import recordRoutes from "./routes/recordRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import requestRoutes from "./routes/requestRoutes.js";
import logRoutes from "./routes/logRoutes.js";
import Record from "./models/Record.js";
import {
  register, login,
  getPendingApplications,
  approveDoctor, rejectDoctor,
} from "./controllers/authController.js";

import { issueAttributeKey, preRekey } from "./services/preService.js";
import { log, ACTIONS, logEvent } from "./services/blockchainLogger.js";

import DoctorApplication from "./models/DoctorApplication.js";
import AccessRequest from "./models/AccessRequest.js";
import User from "./models/user.js";

// fabricClient uses require() — bridge into ESM
const require = createRequire(import.meta.url);
const fabricClient = require("../../fabric/Doc_function.js");

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

/* ─── AUTH MIDDLEWARE ─────────────────────────────── */

async function authenticateToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided" });
  try {
    const decoded = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password").lean();
    if (!user)
      return res.status(401).json({ message: "User no longer exists" });
    if (user.status === "Suspended")
      return res.status(403).json({ message: "Account suspended. Contact administrator." });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

/* ─── AUTH ROUTES ─────────────────────────────────── */

// Register — log to blockchain after success
app.post("/api/auth/register", async (req, res, next) => {
  // Call original register, capture the response via a wrapper
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.user) {
      log.register(body.user);
    }
    return originalJson(body);
  };
  return register(req, res, next);
});

// Login — log to blockchain after success
app.post("/api/auth/login", async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.user) {
      log.login(body.user);
    }
    return originalJson(body);
  };
  return login(req, res, next);
});
// Logout — log to blockchain
app.post("/api/auth/logout", authenticateToken, async (req, res) => {
  try {
    log.logout({
      name:  req.user.name,
      _id:   req.user._id,
      role:  req.user.role,
    });
    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
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

/* ─── ADMIN — Doctor applications ────────────────── */
app.get("/api/auth/applications/pending", getPendingApplications);

// Approve doctor — log account approval + kick off Fabric provisioning
app.post("/api/auth/applications/:id/approve", authenticateToken, async (req, res) => {
  try {
    await approveDoctor(req, res);

    setImmediate(async () => {
      try {
        const application = await DoctorApplication.findById(req.params.id);
        if (!application || application.status !== "Approved") return;

        const doctorUser = await User.findOne({ email: application.email });
        if (!doctorUser) return;

        // ── Blockchain: log approval ──────────────────────────────────────────
        const admin = await User.findById(req.user._id).select("name _id").lean();
        log.accountApproved(
          admin ?? { name: "Admin", _id: req.user._id },
          doctorUser.name,
          doctorUser._id.toString()
        );

        // ── Fabric identity enrollment ────────────────────────────────────────
        const fabricUserId = `doctor_${doctorUser._id.toString()}`;

        execFile("node", [ENROLL_SCRIPT, fabricUserId, "doctor", application.department],
          { cwd: path.resolve(__dirname, "..") },
          async (err, stdout, stderr) => {
            if (err) { console.error("❌ Fabric enroll failed:", stderr); return; }
            console.log("✅ Fabric identity enrolled:", stdout.trim());

            const attrs = [
              `department::${application.department.toLowerCase()}`,
              "role::doctor",
            ];
            const { sk_abe } = await issueAttributeKey(fabricUserId, attrs);

            await User.findByIdAndUpdate(doctorUser._id, {
              fabricUserId,
              fabricEnrolled: true,
              skAbe: sk_abe,
            });
            await DoctorApplication.findByIdAndUpdate(application._id, { fabricUserId });

            console.log(`✅ Doctor ${doctorUser.name} fully provisioned`);
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

// Reject doctor — log rejection
app.post("/api/auth/applications/:id/reject", authenticateToken, async (req, res) => {
  try {
    const application = await DoctorApplication.findById(req.params.id).lean();
    await rejectDoctor(req, res);

    if (application) {
      const admin = await User.findById(req.user._id).select("name _id").lean();
      log.accountRejected(
        admin ?? { name: "Admin", _id: req.user._id },
        application.name,
        application._id.toString(),
        req.body.reason || "Not approved"
      );
    }
  } catch (err) {
    if (!res.headersSent)
      res.status(500).json({ message: err.message });
  }
});
app.get("/api/records/:id/history", authenticateToken, async (req, res) => {

  try {

    const record = await Record.findById(req.params.id)
      .select("userId")
      .lean();

    if (!record)
      return res.status(404).json({
        message: "Record not found"
      });

    const isOwner =
      record.userId.toString() === req.user._id;

    if (!isOwner && req.user.role !== "admin") {

      return res.status(403).json({
        message: "Access denied"
      });
    }

    const user = await User.findById(req.user._id)
      .select("fabricUserId")
      .lean();

    const history = await fabricClient.getRecordHistory({
      userId: user.fabricUserId,
      recordID: req.params.id
    });
    history.sort((a, b) => b.timestamp - a.timestamp);

    res.json({
      success: true,
      data: history
    });

  } catch (err) {

    res.status(500).json({
      message: err.message
    });
  }
});
/* ─── ADMIN — Suspend / Reinstate ────────────────── */
/* ─── ADMIN — FETCH DOCTORS ─────────────────────── */

// Get all doctors
app.get("/api/admin/doctors", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Admin only" });

    const doctors = await User.find({ role: "doctor" })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: doctors,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Get all patients
app.get("/api/admin/patients", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Admin only" });

    const patients = await User.find({ role: "patient" })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: patients,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Suspend or reinstate a doctor
app.post("/api/admin/doctors/:id/status", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Admin only" });

    const { status } = req.body; // "Suspended" | "Active"
    const doctor = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).lean();

    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    const admin = await User.findById(req.user._id).select("name _id").lean();
    if (status === "Suspended") {
      log.accountSuspended(admin, doctor.name, doctor._id.toString(), "doctor");
    } else {
      log.accountReinstated(admin, doctor.name, doctor._id.toString(), "doctor");
    }

    res.json({ success: true, doctor });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Suspend or reinstate a patient
app.post("/api/admin/patients/:id/status", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Admin only" });

    const { status } = req.body; // "Suspended" | "Active"
    const patient = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).lean();

    if (!patient) return res.status(404).json({ message: "Patient not found" });

    const admin = await User.findById(req.user._id).select("name _id").lean();
    if (status === "Suspended") {
      log.accountSuspended(admin, patient.name, patient._id.toString(), "patient");
    } else {
      log.accountReinstated(admin, patient.name, patient._id.toString(), "patient");
    }

    res.json({ success: true, patient });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ─── ADMIN LOGS — from Hyperledger Fabric ───────── */
app.get("/api/admin/logs", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ success: false, message: "Admin only" });

    // actionFilter from query param: ?action=RECORD_UPLOAD or omit for All
    const actionFilter = req.query.action || "All";

    // Pull from ledger directly
    const events = await fabricClient.getAllEvents(actionFilter);
    events.sort((a, b) => b.timestamp - a.timestamp);
    // Map on-chain shape → unified log shape for the frontend
    const data = events.map((e) => ({
      id: e.eventId,
      action: e.action,
      actor: e.actor,
      role: e.role,
      detail: e.detail,
      time: new Date(e.timestamp * 1000).toLocaleString("en-IN"),
      hash: e.eventId,           // on-chain key — serves as immutable reference
      meta: e.meta || {},
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error("ADMIN LOG ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ─── USER ACTIVITY LOG (doctor / patient self) ───── */
app.get("/api/my/logs", authenticateToken, async (req, res) => {
  try {
    const events = await fabricClient.getEventsByActor(req.user._id);
    events.sort((a, b) => b.timestamp - a.timestamp);
    const data = events.map((e) => ({
      id: e.eventId,
      action: e.action,
      actor: e.actor,
      detail: e.detail,
      time: new Date(e.timestamp * 1000).toLocaleString("en-IN"),
      hash: e.eventId,
      meta: e.meta || {},
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ─── PRE REKEY PROXY ─────────────────────────────── */
app.post("/api/pre/rekey", authenticateToken, async (req, res) => {
  if (req.user.role !== "patient")
    return res.status(403).json({ message: "Only patients can rekey" });

  try {
    const { sk_owner, ct_kem, requestId } = req.body;

    if (!sk_owner || !ct_kem || !requestId)
      return res.status(400).json({ message: "sk_owner, ct_kem and requestId are required" });

    const accessReq = await AccessRequest.findById(requestId).lean();
    if (!accessReq)
      return res.status(404).json({ message: "Access request not found" });
    if (String(accessReq.patientId) !== String(req.user._id))
      return res.status(403).json({ message: "This request does not belong to you" });
    if (accessReq.status !== "pending")
      return res.status(400).json({ message: "Request is not pending" });

    const doctor = await User.findById(accessReq.doctorId).select("pkPre name").lean();
    if (!doctor?.pkPre)
      return res.status(400).json({ message: "Doctor does not have a PRE public key set" });

    console.log(`✅ Rekey: patient=${req.user._id} → doctor=${doctor.name} (${accessReq.doctorId})`);

    const result = await preRekey(sk_owner, doctor.pkPre, ct_kem);
    const patient = await User.findById(req.user._id)
      .select("name _id")
      .lean();

    await logEvent({

      actor: patient.name,

      actorId: patient._id.toString(),

      role: "patient",

      action: ACTIONS.REKEY_GENERATED,

      detail: `${patient.name} generated proxy re-encryption key for Dr. ${doctor.name}`,

      meta: {
        requestId,
        doctorId: doctor._id?.toString(),
        doctorName: doctor.name,
        recordId: accessReq.recordId.toString()
      }
    });
    await AccessRequest.findByIdAndUpdate(requestId, { pkDoctor: doctor.pkPre });

    res.json(result);
  } catch (err) {
    console.error("❌ Rekey error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ─── FEATURE ROUTES ──────────────────────────────── */
app.use("/api/profile", profileRoutes);
app.use("/api/records", recordRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/logs", logRoutes);

/* ─── START ───────────────────────────────────────── */
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   PRE service: ${process.env.PRE_SERVICE_URL || "http://localhost:5001"}`);
});