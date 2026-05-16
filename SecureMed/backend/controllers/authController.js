// backend/controllers/authController.js
import User              from "../models/user.js";
import bcrypt            from "bcrypt";
import jwt               from "jsonwebtoken";
import DoctorApplication from "../models/DoctorApplication.js";

/* ================= REGISTER ================= */
export const register = async (req, res) => {
  try {
    const {
      name, email, password, role, pkPre,
      medicalId, specialization, department,
      phone, experience, hospital,
    } = req.body;

    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "Name, email, password and role are required" });

    if (role === "patient" && !pkPre)
      return res.status(400).json({ message: "pkPre (Kyber768 public key) is required" });

    const existingUser = await User.findOne({ email });
    const existingApp  = await DoctorApplication.findOne({ email, status: "Pending" });
    if (existingUser) return res.status(400).json({ message: "User with this email already exists" });
    if (existingApp)  return res.status(400).json({ message: "A registration request for this email is already pending" });

    const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));

    if (role === "patient") {
      const newUser = new User({
        name, email, password: hashedPassword,
        role: "patient",
        phone:      phone      || null,
        department: department || null,
        pkPre,
      });
      await newUser.save();
      return res.status(201).json({
        message:   "Patient account created successfully",
        patientId: newUser.patientId,
        user: { id: newUser._id, name, email, role: "patient" },
      });
    }

    if (role === "doctor") {
      if (!medicalId || !specialization || !department)
        return res.status(400).json({ message: "Medical ID, specialization and department are required" });

      const newApplication = new DoctorApplication({
        name, email, password: hashedPassword,
        medicalId, specialization, department,
        phone:      phone      || null,
        experience: experience || null,
        hospital:   hospital   || "City General Hospital",
        pkPre:      pkPre      || null,
        status:     "Pending",
      });
      await newApplication.save();
      return res.status(201).json({ message: "Doctor registration submitted. Awaiting admin approval." });
    }

    return res.status(400).json({ message: "Invalid role" });

  } catch (err) {
    console.error("❌ Register error:", err);
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
};

/* ================= GET PENDING APPLICATIONS ================= */
export const getPendingApplications = async (req, res) => {
  try {
    const applications = await DoctorApplication.find({ status: "Pending" })
      .select("-password").sort({ submittedAt: -1 });
    res.json({ success: true, count: applications.length, applications });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch applications", error: err.message });
  }
};

/* ================= APPROVE DOCTOR ================= */
export const approveDoctor = async (req, res) => {
  try {
    // ── 1. Find and validate the application ─────────────────────────────────
    const application = await DoctorApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }
    if (application.status !== "Pending") {
      return res.status(400).json({ message: "Application already processed" });
    }

    // ── 2. Guard: don't create a duplicate User ───────────────────────────────
    // This is the most common cause of silent 500s — admin double-clicks approve,
    // or the application was previously approved and the User already exists.
    const existingUser = await User.findOne({ email: application.email });
    if (existingUser) {
      // Already approved — just mark the application and return success
      // so the server.js post-approval Fabric hook can still run.
      console.log(`ℹ️  User already exists for ${application.email} — marking application approved`);
      application.status     = "Approved";
      application.approvedBy = req.body.approvedBy || "Admin";
      application.approvedAt = new Date();
      await application.save();
      return res.json({
        message:  `Doctor ${application.name} approved (user already existed)`,
        doctorId: existingUser._id,
      });
    }

    // ── 3. Create the User doc ────────────────────────────────────────────────
    const newDoctor = new User({
      name:           application.name,
      email:          application.email,
      password:       application.password,   // already hashed at registration time
      role:           "doctor",
      medicalId:      application.medicalId      || null,
      specialization: application.specialization || null,
      department:     application.department     || null,
      phone:          application.phone          || null,
      experience:     application.experience     || null,
      hospital:       application.hospital       || null,
      pkPre:          application.pkPre          || null,
      // patientId pre-save hook skips doctors automatically (role !== "patient")
    });

    await newDoctor.save();
    console.log(`✅ Doctor User created: ${newDoctor._id} (${newDoctor.email})`);

    // ── 4. Mark application approved ─────────────────────────────────────────
    application.status     = "Approved";
    application.approvedBy = req.body.approvedBy || "Admin";
    application.approvedAt = new Date();
    await application.save();

    // ── 5. Respond — server.js post-approval hook fires after this ────────────
    return res.json({
      message:  `Doctor ${application.name} approved successfully`,
      doctorId: newDoctor._id,
    });

  } catch (err) {
    // Log the FULL error so we can actually see what went wrong
    console.error("❌ approveDoctor error:", err.message);
    console.error(err.stack);
    return res.status(500).json({ message: "Approval failed", error: err.message });
  }
};

/* ================= REJECT DOCTOR ================= */
export const rejectDoctor = async (req, res) => {
  try {
    const application = await DoctorApplication.findById(req.params.id);
    if (!application)
      return res.status(404).json({ message: "Application not found" });
    if (application.status !== "Pending")
      return res.status(400).json({ message: "Application already processed" });

    application.status          = "Rejected";
    application.rejectionReason = req.body.reason     || "Not approved by admin";
    application.rejectedBy      = req.body.rejectedBy || "Admin";
    await application.save();

    res.json({ message: `Application from ${application.name} rejected` });
  } catch (err) {
    console.error("❌ rejectDoctor error:", err.message);
    res.status(500).json({ message: "Rejection failed", error: err.message });
  }
};

/* ================= LOGIN ================= */
export const login = async (req, res) => {
  try {
    const { loginIdentifier, email, password, role } = req.body;
    const identifier = (loginIdentifier || email || "").trim();

    if (!identifier || !password || !role)
      return res.status(400).json({ message: "Email/Name, password and role are required" });

    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const user = await User.findOne({
      $or: [
        { email:     identifier.toLowerCase() },
        { name:      { $regex: new RegExp(`^${escape(identifier)}$`, "i") } },
        { patientId: identifier.toUpperCase() },
      ],
    });

    if (!user)              return res.status(400).json({ message: "Invalid credentials" });
    if (user.role !== role) return res.status(403).json({ message: "Invalid role selected" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id:        user._id,
        name:      user.name,
        email:     user.email,
        role:      user.role,
        patientId: user.patientId || null,
        hasPkPre:  !!user.pkPre,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Login failed", error: err.message });
  }
};