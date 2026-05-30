'use strict';

const { Contract } = require('fabric-contract-api');

class HealthcareLogs extends Contract {

    // ─────────────────────────────────────────
    // UPLOAD
    // Stores metadata only.
    // encryptedCID = CP-ABE ciphertext of IPFS CID.
    // No plain CID, no file data, no crypto logic.
    // ─────────────────────────────────────────

    async UploadRecord(ctx, recordID, uploaderID, department, accessPolicy, encryptedCID) {

        // Prevent duplicate records
        const existing = await ctx.stub.getState(recordID);
        if (existing && existing.length > 0) {
            throw new Error(`Record "${recordID}" already exists on the ledger.`);
        }

        // Validate required fields
        if (!recordID || !uploaderID || !department || !accessPolicy || !encryptedCID) {
            throw new Error('All fields are required: recordID, uploaderID, department, accessPolicy, encryptedCID');
        }

        const record = {
            docType: 'record',

            recordID,

            uploaderID,

            department,

            accessPolicy,

            encryptedCID,

            txID: ctx.stub.getTxID(),

            mspId: ctx.clientIdentity.getMSPID(),

            createdAt: Math.floor(Date.now() / 1000),

            updatedAt: Math.floor(Date.now() / 1000),

            isDeleted: false
        };

        await ctx.stub.putState(recordID, Buffer.from(JSON.stringify(record)));

        // Emit event so backend can listen for uploads
        ctx.stub.setEvent(
            'RecordUploaded',
            Buffer.from(JSON.stringify({ recordID, uploaderID, department }))
        );

        return JSON.stringify(record);
    }

    // ─────────────────────────────────────────
    // LOG ACCESS REQUEST
    // Called whenever a doctor requests, is granted,
    // or is denied access to a record.
    // logID must be unique — use MongoDB _id from AccessRequest.
    // ─────────────────────────────────────────

    async LogAccessRequest(ctx, logID, doctorID, doctorName, recordID, patientID, status) {

        // Validate status
        const validStatuses = ['pending', 'approved', 'rejected'];
        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status "${status}". Must be one of: pending, approved, rejected`);
        }

        if (!logID || !doctorID || !doctorName || !recordID || !patientID) {
            throw new Error('All fields are required: logID, doctorID, doctorName, recordID, patientID, status');
        }

        const logKey = `accesslog_${logID}`;

        const logEntry = {
            docType: 'accessLog',
            logID,
            doctorID,
            doctorName,
            recordID,
            patientID,
            status,           // 'pending' | 'approved' | 'rejected'
            timestamp: Math.floor(Date.now() / 1000),
        };

        await ctx.stub.putState(logKey, Buffer.from(JSON.stringify(logEntry)));

        ctx.stub.setEvent(
            'AccessLogged',
            Buffer.from(JSON.stringify({ logID, doctorName, recordID, status }))
        );

        return JSON.stringify(logEntry);
    }


    async LogEvent(
        ctx,
        eventId,
        actor,
        actorId,
        role,
        action,
        detail,
        metaJSON
    ) {

        if (
            !eventId ||
            !actor ||
            !actorId ||
            !role ||
            !action
        ) {
            throw new Error('Missing required LogEvent fields.');
        }

        const meta = metaJSON
            ? JSON.parse(metaJSON)
            : {};

        const event = {

            docType: 'eventLog',

            eventId,

            actor,

            actorId,

            role,

            action,

            detail,

            meta,

            txID: ctx.stub.getTxID(),

            mspId: ctx.clientIdentity.getMSPID(),

            timestamp: Math.floor(Date.now() / 1000)
        };

        await ctx.stub.putState(
            `event_${eventId}`,
            Buffer.from(JSON.stringify(event))
        );

        ctx.stub.setEvent(
            'LedgerEventLogged',
            Buffer.from(JSON.stringify({
                eventId,
                actor,
                action
            }))
        );

        return JSON.stringify(event);
    }

    async GetAllEvents(ctx, actionFilter = 'All') {

        let queryString;

        if (actionFilter === 'All') {

            queryString = JSON.stringify({
                selector: {
                    docType: 'eventLog'
                }
            });

        } else {

            queryString = JSON.stringify({
                selector: {
                    docType: 'eventLog',
                    action: actionFilter
                }
            });
        }

        const iterator = await ctx.stub.getQueryResult(queryString);

        const results = [];

        while (true) {

            const res = await iterator.next();

            if (res.done) break;

            if (res.value && res.value.value) {

                try {

                    results.push(
                        JSON.parse(
                            res.value.value.toString('utf8')
                        )
                    );

                } catch (_) { }
            }
        }

        await iterator.close();

        return JSON.stringify(results);
    }
    async GetEventsByActor(ctx, actorId) {

        const queryString = JSON.stringify({
            selector: {
                docType: 'eventLog',
                actorId
            }
        });

        const iterator = await ctx.stub.getQueryResult(queryString);

        const results = [];

        while (true) {

            const res = await iterator.next();

            if (res.done) break;

            if (res.value && res.value.value) {

                try {

                    results.push(
                        JSON.parse(
                            res.value.value.toString('utf8')
                        )
                    );

                } catch (_) { }
            }
        }

        await iterator.close();

        return JSON.stringify(results);
    }
    async GetRecordHistory(ctx, recordID) {

        const iterator = await ctx.stub.getHistoryForKey(recordID);

        const results = [];

        while (true) {

            const res = await iterator.next();

            if (res.done) break;

            const tx = {

                txID: res.value.txId,

                timestamp: res.value.timestamp,

                isDelete: res.value.isDelete
            };

            if (!res.value.isDelete) {

                try {

                    tx.data = JSON.parse(
                        res.value.value.toString('utf8')
                    );

                } catch (_) { }
            }

            results.push(tx);
        }

        await iterator.close();

        return JSON.stringify(results);
    }
    // ─────────────────────────────────────────
    // GET ALL RECORDS (admin use)
    // Returns every upload record on the ledger.
    // Uses rich query — requires CouchDB.
    // ─────────────────────────────────────────

    async GetAllRecords(ctx) {
        const queryString = JSON.stringify({
            selector: { docType: 'record', isDeleted: false }
        });

        const iterator = await ctx.stub.getQueryResult(queryString);
        const results = [];

        while (true) {
            const res = await iterator.next();
            if (res.done) break;
            if (res.value && res.value.value) {
                try {
                    results.push(JSON.parse(res.value.value.toString('utf8')));
                } catch (_) { }
            }
        }

        await iterator.close();
        return JSON.stringify(results);
    }

    // ─────────────────────────────────────────
    // GET ALL ACCESS LOGS (admin use)
    // Returns every access log entry on the ledger.
    // ─────────────────────────────────────────

    async GetAllAccessLogs(ctx) {
        const queryString = JSON.stringify({
            selector: { docType: 'accessLog' }
        });

        const iterator = await ctx.stub.getQueryResult(queryString);
        const results = [];

        while (true) {
            const res = await iterator.next();
            if (res.done) break;
            if (res.value && res.value.value) {
                try {
                    results.push(JSON.parse(res.value.value.toString('utf8')));
                } catch (_) { }
            }
        }

        await iterator.close();
        return JSON.stringify(results);
    }

    // ─────────────────────────────────────────
    // GET SINGLE RECORD
    // ─────────────────────────────────────────

    async GetRecord(ctx, recordID) {
        const data = await ctx.stub.getState(recordID);
        if (!data || data.length === 0) {
            throw new Error(`Record "${recordID}" does not exist.`);
        }
        return data.toString();
    }

    // ─────────────────────────────────────────
    // QUERY BY DEPARTMENT
    // Returns all records where:
    //   department matches AND timestamp <= requestTimestamp
    // Requester then attempts CP-ABE decrypt of each encryptedCID.
    // Only records matching their attributes will succeed.
    // ─────────────────────────────────────────

    async QueryByDepartment(ctx, department, requestTimestamp) {
        const ts = parseInt(requestTimestamp);
        if (isNaN(ts)) {
            throw new Error('requestTimestamp must be a valid Unix timestamp integer.');
        }

        const queryString = JSON.stringify({
            selector: {
                docType: 'record',
                isDeleted: false,
                department: department,
                timestamp: { $lte: ts }
            }
        });

        const iterator = await ctx.stub.getQueryResult(queryString);
        const results = [];

        while (true) {
            const res = await iterator.next();
            if (res.done) break;
            if (res.value && res.value.value) {
                try {
                    const record = JSON.parse(res.value.value.toString('utf8'));
                    results.push(record);
                } catch (_) {
                    // Skip malformed records
                }
            }
        }

        await iterator.close();
        return JSON.stringify(results);
    }

    // ─────────────────────────────────────────
    // QUERY BY UPLOADER
    // Patient uses this to see all their own records
    // ─────────────────────────────────────────

    async QueryByUploader(ctx, uploaderID) {
        const queryString = JSON.stringify({
            selector: {
                docType: 'record',
                isDeleted: false,
                uploaderID: uploaderID
            }
        });

        const iterator = await ctx.stub.getQueryResult(queryString);
        const results = [];

        while (true) {
            const res = await iterator.next();
            if (res.done) break;
            if (res.value && res.value.value) {
                try {
                    results.push(JSON.parse(res.value.value.toString('utf8')));
                } catch (_) { }
            }
        }

        await iterator.close();
        return JSON.stringify(results);
    }

    // ─────────────────────────────────────────
    // RECORD EXISTS
    // Lightweight check before upload
    // ─────────────────────────────────────────

    async RecordExists(ctx, recordID) {
        const data = await ctx.stub.getState(recordID);
        return JSON.stringify(!!(data && data.length > 0));
    }

    // ─────────────────────────────────────────
    // DELETE RECORD
    // Only the original uploader can delete
    // ─────────────────────────────────────────

    async DeleteRecord(ctx, recordID, requestingUserID) {
        const data = await ctx.stub.getState(recordID);
        if (!data || data.length === 0) {
            throw new Error(`Record "${recordID}" does not exist.`);
        }

        const record = JSON.parse(data.toString());
        if (record.uploaderID !== requestingUserID) {
            throw new Error(`Access denied. Only the uploader can delete record "${recordID}".`);
        }

        record.isDeleted = true;

        record.deletedAt = Math.floor(Date.now() / 1000);

        record.deletedBy = requestingUserID;

        record.updatedAt = Math.floor(Date.now() / 1000);

        record.deleteTxID = ctx.stub.getTxID();

        await ctx.stub.putState(
            recordID,
            Buffer.from(JSON.stringify(record))
        );

        ctx.stub.setEvent(
            'RecordSoftDeleted',
            Buffer.from(JSON.stringify({
                recordID,
                deletedBy: requestingUserID
            }))
        );

        return JSON.stringify({ success: true, recordID });
    }
}

module.exports = HealthcareLogs;