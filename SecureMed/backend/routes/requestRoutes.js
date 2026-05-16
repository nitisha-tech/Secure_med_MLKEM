// backend/routes/requestRoutes.js
import express from "express";
import {
  createRequest,
  getRequests,
  approveRequest,
  rejectRequest,
  fetchApprovedBundle,
  getDoctorRequests
} from "../controllers/requestController.js";
import { protect } from "../middleware/authMiddleware.js";
import { resetRequest } from "../controllers/requestController.js";

const router = express.Router();

router.post("/",              protect, createRequest);      // doctor sends request
router.get("/",               protect, getRequests);         // patient sees requests
router.get("/mine",           protect, getDoctorRequests);   // doctor sees their requests
router.post("/:id/approve",   protect, approveRequest);      // patient approves + PRE
router.post("/:id/reject",    protect, rejectRequest);       // patient rejects
router.get("/:id/fetch",      protect, fetchApprovedBundle); // doctor fetches bundle
router.post("/:id/reset", protect, resetRequest);
export default router;