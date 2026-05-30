'use strict';

const FabricCAServices = require('fabric-ca-client');
const { Wallets }      = require('fabric-network');
const path = require('path');
const fs   = require('fs');

// ─────────────────────────────────────────────
// PATHS — same constants as Doc_function.js
// ─────────────────────────────────────────────

const CONNECTION_PROFILE_PATH = '/home/nitisha/fabric-dev/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json';
const WALLET_PATH = path.resolve(__dirname, 'wallet');

async function enrollAdmin() {
    // 1. Load connection profile
    if (!fs.existsSync(CONNECTION_PROFILE_PATH)) {
        throw new Error(`Connection profile not found: ${CONNECTION_PROFILE_PATH}`);
    }
    const ccp = JSON.parse(fs.readFileSync(CONNECTION_PROFILE_PATH, 'utf8'));

    // 2. Build CA client from first CA in the profile
    const caInfo = Object.values(ccp.certificateAuthorities)[0];
    const caTLSCACerts = caInfo.tlsCACerts.pem;
    const ca = new FabricCAServices(
        caInfo.url,
        { trustedRoots: caTLSCACerts, verify: false },
        caInfo.caName
    );

    // 3. Open wallet
    const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);
    console.log(`[Wallet] Using wallet at: ${WALLET_PATH}`);

    // 4. Check if admin already enrolled
    const existing = await wallet.get('admin');
    if (existing) {
        console.log('[enrollAdmin] Admin identity already exists in wallet. Skipping.');
        return;
    }

    // 5. Enroll admin with CA
    const enrollment = await ca.enroll({
        enrollmentID: 'admin',
        enrollmentSecret: 'adminpw'
    });

    // 6. Get MSP ID from connection profile
    const orgName  = Object.keys(ccp.organizations)[0];
    const mspId    = ccp.organizations[orgName].mspid;

    // 7. Build X.509 identity and store in wallet
    const x509Identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey:  enrollment.key.toBytes()
        },
        mspId: mspId,
        type: 'X.509'
    };

    await wallet.put('admin', x509Identity);
    console.log(`[enrollAdmin] Admin enrolled successfully. MSP: ${mspId}`);
    console.log(`[enrollAdmin] Identity stored in wallet at: ${WALLET_PATH}`);
}

enrollAdmin().catch(err => {
    console.error('[enrollAdmin] FAILED:', err.message);
    process.exit(1);
});
