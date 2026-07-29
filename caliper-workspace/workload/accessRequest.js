'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class AccessRequestWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.txIndex = 0;
    }

    async submitTransaction() {
        this.txIndex++;
        const logId = `accesslog_bench_${Date.now()}_${this.txIndex}`;

        const args = {
            contractId: 'healthcareLogs',
            contractFunction: 'LogAccessRequest',
            contractArguments: [
                logId,
                `doctor_${this.txIndex}`,
                'Dr. Benchmark',
                `record_${this.txIndex}`,
                `patient_${this.txIndex}`,
                'pending'
            ],
            readOnly: false
        };

        await this.sutAdapter.sendRequests(args);
    }
}

function createWorkloadModule() {
    return new AccessRequestWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
