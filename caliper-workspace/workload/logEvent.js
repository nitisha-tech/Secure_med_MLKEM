'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class LogEventWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.txIndex = 0;
    }

    async submitTransaction() {
        this.txIndex++;
        const eventId = `evt_${Date.now()}_${this.txIndex}`;

        const args = {
            contractId: 'healthcareLogs',
            contractFunction: 'LogEvent',
            contractArguments: [
                eventId,
                'BenchmarkUser',
                `user_${this.txIndex}`,
                'patient',
                'BENCHMARK_TEST',
                'Caliper benchmark run',
                '{}'
            ],
            readOnly: false
        };

        await this.sutAdapter.sendRequests(args);
    }
}

function createWorkloadModule() {
    return new LogEventWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
