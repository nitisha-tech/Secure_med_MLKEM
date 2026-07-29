'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class UploadRecordWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.txIndex = 0;
    }

    async submitTransaction() {
        this.txIndex++;
        const recordId = `record_bench_${Date.now()}_${this.txIndex}`;

        const args = {
            contractId: 'healthcareLogs',
            contractFunction: 'UploadRecord',
            contractArguments: [
                recordId,
                `patient_${this.txIndex}`,
                'cardiology',
                'dept::cardiology AND role::doctor',
                `encryptedCID_benchmark_${this.txIndex}`
            ],
            readOnly: false
        };

        await this.sutAdapter.sendRequests(args);
    }
}

function createWorkloadModule() {
    return new UploadRecordWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
