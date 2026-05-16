// backend/routes/recordRoutes.js
import express from "express";
import { getApprovedPatients } from "../controllers/recordController.js";
import {
  uploadRecord,
  getRecords,
  decryptRecord,
  discoverRecords,
} from "../controllers/recordController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/upload",       protect, uploadRecord);
router.get("/",              protect, getRecords);
router.post("/discover",     protect, discoverRecords);
router.get("/approved-patients", protect, getApprovedPatients);
router.post("/:id/decrypt",  protect, decryptRecord);   // ← patient self-decrypt

export default router;