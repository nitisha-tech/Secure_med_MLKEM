const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
    const ccpPath = '/home/nitisha/fabric-dev/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.yaml';
    const walletPath = '/home/nitisha/SecureMedBlock/SecureMed/wallet';
    
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    const gateway = new Gateway();
    
    await gateway.connect(require(ccpPath), {
        wallet,
        identity: 'admin',
        discovery: { enabled: true, asLocalhost: true }
    });

    const network = await gateway.getChannel('mychannel');
    const contract = network.getContract('healthcareLogs');

    const operations = [
        { name: 'LogEvent', fn: async (i) => contract.submitTransaction(
            'LogEvent', `evt_${Date.now()}_${i}`, 'BenchUser',
            `uid_${i}`, 'patient', 'BENCHMARK', 'test', '{}') },
        { name: 'UploadRecord', fn: async (i) => contract.submitTransaction(
            'UploadRecord', `rec_${Date.now()}_${i}`, `pat_${i}`,
            'cardiology', 'dept::cardiology', `cid_${i}`) },
        { name: 'GetRecord', fn: async (i) => contract.evaluateTransaction(
            'GetRecord', `rec_bench_0`) },
    ];

    for (const op of operations) {
        const times = [];
        const start = Date.now();
        for (let i = 0; i < 20; i++) {
            const t0 = Date.now();
            try { await op.fn(i); } catch(e) {}
            times.push(Date.now() - t0);
        }
        const total = (Date.now() - start) / 1000;
        const avg = times.reduce((a,b)=>a+b,0)/times.length;
        console.log(`${op.name}: avg=${avg.toFixed(1)}ms  TPS=${(20/total).toFixed(2)}`);
    }

    gateway.disconnect();
}

main().catch(console.error);
