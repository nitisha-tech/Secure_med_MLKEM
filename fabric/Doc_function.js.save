'use strict';

const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs   = require('fs');

// ─────────────────────────────────────────────
// PATHS
// ─────────────────────────────────────────────

const CONNECTION_PROFILE_PATH = '/home/nitisha/fabric-dev/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json';
const WALLET_PATH    = path.resolve(__dirname, '..', 'SecureMed', 'wallet');
const CHANNEL_NAME   = 'mychannel';
const CHAINCODE_NAME = 'healthcareLogs';
const ADMIN_ID       = 'admin'; // wallet identity used for admin queries

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function loadConnectionProfile() {
    if (!fs.existsSync(CONNECTION_PROFILE_PATH)) {
        throw new Error(
            `Connection profile not found at: ${CONNECTION_PROFILE_PATH}\n` +
            `Make sure your Fabric test network is running.`
        );
    }
    return JSON.parse(fs.readFileSync(CONNECTION_PROFILE_PATH, 'utf8'));
}

async function buildGateway(userId) {
    const ccp    = loadConnectionProfile();
    const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);

    const identity = await wallet.get(userId);
    if (!identity) {
        throw new Error(
            `Identity "${userId}" not found in wallet at ${WALLET_PATH}.\n` +
            `Run enrollAdmin.js first, then enrollUser.js for this user.`
        );
    }

    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity: userId,
        discovery: { enabled: true, asLocalhost: true },
    });

    return gateway;
}

async function getContract(userId) {
    const gateway = await buildGateway(userId);
    const network  = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME);
    return { gateway, contract };
}

// ─────────────────────────────────────────────
// RAW INVOKE / QUERY
// ─────────────────────────────────────────────

async function invoke(userId, fnName, ...args) {
    let gateway;
    try {
        const { gateway: gw, contract } = await getContract(userId);
        gateway = gw;
        console.log(`[Fabric] INVOKE  ${fnName}`, args);
        const result = await contract.submitTransaction(fnName, ...args);
        console.log(`[Fabric] SUCCESS ${fnName}`);
        return result && result.length ? result.toString() : null;
    } catch (err) {
        console.error(`[Fabric] INVOKE ERROR ${fnName}:`, err.message);
        throw err;
    } finally {
        if (gateway) gateway.disconnect();
    }
}

async function query(userId, fnName, ...args) {
    let gateway;
    try {
        const { gateway: gw, contract } = await getContract(userId);
        gateway = gw;
        console.log(`[Fabric] QUERY   ${fnName}`, args);
        const result = await contract.evaluateTransaction(fnName, ...args);
        console.log(`[Fabric] SUCCESS ${fnName}`);
        return JSON.parse(result.toString());
    } catch (err) {
        console.error(`[Fabric] QUERY ERROR ${fnName}:`, err.message);
        throw err;
    } finally {
        if (gateway) gateway.disconnect();
    }
}

// ─────────────────────────────────────────────
// LOGGING API
// ─────────────────────────────────────────────

/**
 * Write any activity event to the ledger.
 * Called by blockchainLogger.js — never call directly from routes.
 *
 * @param {object} p
 * @param {string} p.eventId  - unique id (use nanoid / uuid)
 * @param {string} p.actor    - display name
 * @param {string} p.actorId  - MongoDB _id string
 * @param {string} p.role     - patient | doctor | admin | system
 * @param {string} p.action   - ACTION constant from blockchainLogger.js
 * @param {string} p.detail   - human-readable sentence
 * @param {object} p.meta     - extra data (recordId, requestId, etc.)
 */
async function logEvent({ eventId, actor, actorId, role, action, detail, meta = {} }) {
    return await invoke(
        ADMIN_ID,
        'LogEvent',
        eventId,
        actor,
        actorId,
        role,
        action,
        detail,
        JSON.stringify(meta)
    );
}

/**
 * Fetch all events from the ledger (admin dashboard).
 * @param {string} actionFilter - "All" or a specific ACTION string
 */
async function getAllEvents(actionFilter = 'All') {
    return await query(ADMIN_ID, 'GetAllEvents', actionFilter);
}

/**
 * Fetch all events for a specific user (their activity log).
 * @param {string} actorId - MongoDB _id of the user
 */
async function getEventsByActor(actorId) {
    return await query(ADMIN_ID, 'GetEventsByActor', actorId);
}

// ─────────────────────────────────────────────
// RECORD API (unchanged)
// ─────────────────────────────────────────────

async function uploadRecord({ userId, recordID, uploaderID, department, accessPolicy, encryptedCID }) {
    return await invoke(userId, 'UploadRecord', recordID, uploaderID, department, accessPolicy, encryptedCID);
}

async function queryByDepartment({ userId, department, requestTimestamp }) {
    return await query(userId, 'QueryByDepartment', department, String(requestTimestamp));
}

async function getRecord({ userId, recordID }) {
    return await query(userId, 'GetRecord', recordID);
}

async function recordExists({ userId, recordID }) {
    return await query(userId, 'RecordExists', recordID);
}
async function getRecordHistory({ userId, recordID }) {

    return await query(
        userId,
        'GetRecordHistory',
        recordID
    );
}
async function deleteRecord({
    userId,
    recordID,
    requestingUserID
}) {

    return await invoke(
        userId,
        'DeleteRecord',
        recordID,
        requestingUserID
    );
}
// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
    invoke,
    query,
    logEvent,
    getAllEvents,
    getEventsByActor,
    uploadRecord,
    queryByDepartment,
    getRecord,
    recordExists,
    getRecordHistory,
    deleteRecord
};
