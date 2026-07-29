
'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class GetHistoryWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.txIndex = 0;
        this.recordIds = [];
    }

    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex,
                                    roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers,
            roundIndex, roundArguments, sutAdapter, sutContext);

        // Pre-create records to get history for
        for (let i = 0; i < 10; i++) {
            const recordId = `record_history_${workerIndex}_${i}`;
            this.recordIds.push(recordId);
            try {
                await this.sutAdapter.sendRequests({
                    contractId: 'healthcareLogs',
                    contractFunction: 'UploadRecord',
                    contractArguments: [
                        recordId,
                        `patient_${i}`,
                        'cardiology',
                        'dept::cardiology AND role::doctor',
                        `encryptedCID_hist_${i}`
                    ],
                    readOnly: false
                });
            } catch (e) {
                // Record may already exist — ignore
            }
        }
    }

    async submitTransaction() {
        this.txIndex++;
        const recordId = this.recordIds[this.txIndex % this.recordIds.length];

        const args = {
            contractId: 'healthcareLogs',
            contractFunction: 'GetRecordHistory',
            contractArguments: [recordId],
            readOnly: true
        };

        await this.sutAdapter.sendRequests(args);
    }
}

function createWorkloadModule() {
    return new GetHistoryWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;