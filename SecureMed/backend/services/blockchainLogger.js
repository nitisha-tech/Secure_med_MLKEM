/**
 * blockchainLogger.js
 *
 * Central service for writing audit events to Hyperledger Fabric.
 * Every user action — login, upload, access request, approval, etc. —
 * goes through here so the ledger has a complete immutable trail.
 *
 * Usage (from any route or controller):
 *   import { logEvent, ACTIONS } from './services/blockchainLogger.js';
 *   await logEvent({ actor, actorId, role: 'patient', action: ACTIONS.RECORD_UPLOAD, detail: '...', meta: { recordId } });
 *
 * Failures are caught and logged to console only — never let a logging
 * failure break the actual API response.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fabricClient = require('../../../fabric/Doc_function.js');

// ─────────────────────────────────────────────
// ACTION CONSTANTS
// Keep in sync with healthcareLogs.js chaincode
// ─────────────────────────────────────────────
export const ACTIONS = {
    // Auth
    AUTH_REGISTER: 'AUTH_REGISTER',
    AUTH_LOGIN: 'AUTH_LOGIN',
    AUTH_LOGOUT: 'AUTH_LOGOUT',

    // Account lifecycle (admin)
    ACCOUNT_APPROVED: 'ACCOUNT_APPROVED',
    ACCOUNT_REJECTED: 'ACCOUNT_REJECTED',
    ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
    ACCOUNT_REINSTATED: 'ACCOUNT_REINSTATED',

    // Records (patient)
    RECORD_UPLOAD: 'RECORD_UPLOAD',
    RECORD_VIEW: 'RECORD_VIEW',
    RECORD_DOWNLOAD: 'RECORD_DOWNLOAD',
    RECORD_DELETE: 'RECORD_DELETE',

    // Access flow (doctor ↔ patient)
    ACCESS_REQUEST: 'ACCESS_REQUEST',
    ACCESS_GRANTED: 'ACCESS_GRANTED',
    ACCESS_DENIED: 'ACCESS_DENIED',

    // Doctor actions
    DOCTOR_RECORD_VIEW: 'DOCTOR_RECORD_VIEW',
    DOCTOR_RECORD_DL: 'DOCTOR_RECORD_DL',
    PRESCRIPTION_ADD: 'PRESCRIPTION_ADD',

    // Admin management
    DOCTOR_SUSPENDED: 'DOCTOR_SUSPENDED',
    DOCTOR_REINSTATED: 'DOCTOR_REINSTATED',
    PATIENT_SUSPENDED: 'PATIENT_SUSPENDED',
    PATIENT_REINSTATED: 'PATIENT_REINSTATED',
    ADMIN_ACTION: 'ADMIN_ACTION',

    RECORD_HISTORY_VIEW: 'RECORD_HISTORY_VIEW',
    EMERGENCY_ACCESS: 'EMERGENCY_ACCESS',
    REKEY_GENERATED: 'REKEY_GENERATED',
    CPABE_DECRYPT_SUCCESS: 'CPABE_DECRYPT_SUCCESS',
    CPABE_DECRYPT_FAILED: 'CPABE_DECRYPT_FAILED',
};

// ─────────────────────────────────────────────
// UNIQUE ID GENERATOR
// Combines timestamp + random suffix for uniqueness
// without needing an extra npm package.
// ─────────────────────────────────────────────
function makeEventId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─────────────────────────────────────────────
// MAIN LOGGER
// Fire-and-forget from routes — never awaited in
// the critical path so a Fabric hiccup never
// blocks the HTTP response.
// ─────────────────────────────────────────────

/**
 * Log an event to the blockchain.
 *
 * @param {object}  p
 * @param {string}  p.actor    - Display name of the user e.g. "Dr. Fatima Zaidi"
 * @param {string}  p.actorId  - MongoDB _id of the user (string)
 * @param {string}  p.role     - "patient" | "doctor" | "admin" | "system"
 * @param {string}  p.action   - One of ACTIONS.*
 * @param {string}  p.detail   - Human-readable sentence
 * @param {object}  [p.meta]   - Extra data: { recordId, requestId, targetName, ... }
 * @param {boolean} [p.await_]  - Set true if you need to await the ledger write
 *                               (e.g. for tests). Default: fire-and-forget.
 */
export async function logEvent({ actor, actorId, role, action, detail, meta = {}, await_ = false }) {
    const eventId = makeEventId();

    const write = fabricClient.logEvent({
        eventId,
        actor: actor || 'Unknown',
        actorId: actorId || 'unknown',
        role: role || 'system',
        action,
        detail: detail || '',
        meta,
    }).catch(err => {
        // Never throw — logging must never break business logic
        console.error(`[BlockchainLogger] Failed to write event ${action}:`, err.message);
    });

    if (await_) await write;
}

// ─────────────────────────────────────────────
// CONVENIENCE WRAPPERS
// Thin helpers so routes don't have to build the
// full object every time.
// ─────────────────────────────────────────────

export const log = {

    // ── Auth ──────────────────────────────────

    register: (user) => logEvent({
        actor: user.name, actorId: user._id?.toString(), role: user.role,
        action: ACTIONS.AUTH_REGISTER,
        detail: `${user.name} registered as ${user.role}`,
        meta: { email: user.email },
    }),

    login: (user) => logEvent({
        actor: user.name, actorId: user._id?.toString(), role: user.role,
        action: ACTIONS.AUTH_LOGIN,
        detail: `${user.name} logged in`,
        meta: { email: user.email },
    }),

    logout: (user) => logEvent({
        actor: user.name, actorId: user._id?.toString(), role: user.role,
        action: ACTIONS.AUTH_LOGOUT,
        detail: `${user.name} logged out`,
    }),

    // ── Account lifecycle ─────────────────────

    accountApproved: (admin, doctorName, doctorId) => logEvent({
        actor: admin.name, actorId: admin._id?.toString(), role: 'admin',
        action: ACTIONS.ACCOUNT_APPROVED,
        detail: `Admin approved Dr. ${doctorName}'s account`,
        meta: { doctorId, doctorName },
    }),

    accountRejected: (admin, doctorName, doctorId, reason) => logEvent({
        actor: admin.name, actorId: admin._id?.toString(), role: 'admin',
        action: ACTIONS.ACCOUNT_REJECTED,
        detail: `Admin rejected Dr. ${doctorName}'s application`,
        meta: { doctorId, doctorName, reason },
    }),

    accountSuspended: (admin, targetName, targetId, targetRole) => logEvent({
        actor: admin.name, actorId: admin._id?.toString(), role: 'admin',
        action: ACTIONS.ACCOUNT_SUSPENDED,
        detail: `Admin suspended ${targetRole} ${targetName}`,
        meta: { targetId, targetName, targetRole },
    }),

    accountReinstated: (admin, targetName, targetId, targetRole) => logEvent({
        actor: admin.name, actorId: admin._id?.toString(), role: 'admin',
        action: ACTIONS.ACCOUNT_REINSTATED,
        detail: `Admin reinstated ${targetRole} ${targetName}`,
        meta: { targetId, targetName, targetRole },
    }),

    // ── Patient — records ─────────────────────

    recordUpload: (patient, recordTitle, recordId, department) => logEvent({
        actor: patient.name, actorId: patient._id?.toString(), role: 'patient',
        action: ACTIONS.RECORD_UPLOAD,
        detail: `${patient.name} uploaded record "${recordTitle}" (${department})`,
        meta: { recordId, recordTitle, department },
    }),

    recordView: (patient, recordTitle, recordId) => logEvent({
        actor: patient.name, actorId: patient._id?.toString(), role: 'patient',
        action: ACTIONS.RECORD_VIEW,
        detail: `${patient.name} viewed their record "${recordTitle}"`,
        meta: { recordId, recordTitle },
    }),

    recordDownload: (patient, recordTitle, recordId) => logEvent({
        actor: patient.name, actorId: patient._id?.toString(), role: 'patient',
        action: ACTIONS.RECORD_DOWNLOAD,
        detail: `${patient.name} downloaded their record "${recordTitle}"`,
        meta: { recordId, recordTitle },
    }),

    recordDelete: (patient, recordTitle, recordId) => logEvent({
        actor: patient.name, actorId: patient._id?.toString(), role: 'patient',
        action: ACTIONS.RECORD_DELETE,
        detail: `${patient.name} deleted record "${recordTitle}"`,
        meta: { recordId, recordTitle },
    }),

    // ── Access flow ───────────────────────────

    accessRequest: (doctor, patientName, patientId, recordTitle, recordId, requestId) => logEvent({
        actor: doctor.name, actorId: doctor._id?.toString(), role: 'doctor',
        action: ACTIONS.ACCESS_REQUEST,
        detail: `Dr. ${doctor.name} requested access to "${recordTitle}" (patient: ${patientName})`,
        meta: { requestId, recordId, recordTitle, patientId, patientName },
    }),

    accessGranted: (patient, doctorName, doctorId, recordTitle, recordId, requestId) => logEvent({
        actor: patient.name, actorId: patient._id?.toString(), role: 'patient',
        action: ACTIONS.ACCESS_GRANTED,
        detail: `${patient.name} approved Dr. ${doctorName}'s access to "${recordTitle}"`,
        meta: { requestId, recordId, recordTitle, doctorId, doctorName },
    }),

    accessDenied: (patient, doctorName, doctorId, recordTitle, recordId, requestId) => logEvent({
        actor: patient.name, actorId: patient._id?.toString(), role: 'patient',
        action: ACTIONS.ACCESS_DENIED,
        detail: `${patient.name} rejected Dr. ${doctorName}'s access to "${recordTitle}"`,
        meta: { requestId, recordId, recordTitle, doctorId, doctorName },
    }),

    // ── Doctor actions ────────────────────────

    doctorRecordView: (doctor, patientName, recordTitle, recordId, requestId) => logEvent({
        actor: doctor.name, actorId: doctor._id?.toString(), role: 'doctor',
        action: ACTIONS.DOCTOR_RECORD_VIEW,
        detail: `Dr. ${doctor.name} viewed "${recordTitle}" (patient: ${patientName})`,
        meta: { requestId, recordId, recordTitle, patientName },
    }),

    doctorRecordDownload: (doctor, patientName, recordTitle, recordId, requestId) => logEvent({
        actor: doctor.name, actorId: doctor._id?.toString(), role: 'doctor',
        action: ACTIONS.DOCTOR_RECORD_DL,
        detail: `Dr. ${doctor.name} downloaded "${recordTitle}" (patient: ${patientName})`,
        meta: { requestId, recordId, recordTitle, patientName },
    }),

    prescriptionAdd: (doctor, patientName, patientId, recordTitle, recordId) => logEvent({
        actor: doctor.name, actorId: doctor._id?.toString(), role: 'doctor',
        action: ACTIONS.PRESCRIPTION_ADD,
        detail: `Dr. ${doctor.name} added prescription for ${patientName}`,
        meta: { recordId, recordTitle, patientId, patientName },
    }),
};