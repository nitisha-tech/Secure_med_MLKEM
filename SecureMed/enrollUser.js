'use strict';

const FabricCAServices = require('fabric-ca-client');
const { Wallets }      = require('fabric-network');
const path = require('path');
const fs   = require('fs');

// ─────────────────────────────────────────────
// PATHS
// ─────────────────────────────────────────────

const CONNECTION_PROFILE_PATH = '/home/nitisha/fabric-dev/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json';
const WALLET_PATH = path.resolve(__dirname, 'wallet');

/**
 * Register and enroll a user into the wallet.
 * @param {string} userId      - Unique user ID (e.g. "patient001", "doctor001")
 * @param {string} role        - "patient" or "doctor"
 * @param {string} department  - e.g. "cardiology", "general"
 */
async function enrollUser(userId, role, department) {
    // 1. Load connection profile
    if (!fs.existsSync(CONNECTION_PROFILE_PATH)) {
        throw new Error(`Connection profile not found: ${CONNECTION_PROFILE_PATH}`);
    }
    const ccp = JSON.parse(fs.readFileSync(CONNECTION_PROFILE_PATH, 'utf8'));

    // 2. Build CA client
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

    // 4. Check user doesn't already exist
    const existingUser = await wallet.get(userId);
    if (existingUser) {
        console.log(`[enrollUser] "${userId}" already exists in wallet. Skipping.`);
        return;
    }

    // 5. Admin must exist to register a new user
    const adminIdentity = await wallet.get('admin');
    if (!adminIdentity) {
        throw new Error(
            'Admin identity not found in wallet.\n' +
            'Run enrollAdmin.js before enrolling users.'
        );
    }

    // 6. Build admin user context for CA registration
    const orgName  = Object.keys(ccp.organizations)[0];
    const mspId    = ccp.organizations[orgName].mspid;

    const provider  = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, 'admin');

    // 7. Register user with attributes
    const secret = await ca.register(
        {
            affiliation: 'org1.department1',
            enrollmentID: userId,
            role: 'client',
            attrs: [
                { name: 'role',       value: role,       ecert: true },
                { name: 'department', value: department, ecert: true }
            ]
        },
        adminUser
    );

    // 8. Enroll user with the one-time secret
    const enrollment = await ca.enroll({
        enrollmentID: userId,
        enrollmentSecret: secret
    });

    // 9. Store identity in wallet
    const x509Identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey:  enrollment.key.toBytes()
        },
        mspId: mspId,
        type: 'X.509'
    };

    await wallet.put(userId, x509Identity);
    console.log(`[enrollUser] "${userId}" enrolled. Role: ${role}, Dept: ${department}`);
    console.log(`[enrollUser] Identity stored in wallet at: ${WALLET_PATH}`);
}

// ─────────────────────────────────────────────
// CLI usage:
// node enrollUser.js patient001 patient cardiology
// node enrollUser.js doctor001 doctor cardiology
// ─────────────────────────────────────────────
const [userId, role, department] = process.argv.slice(2);

if (!userId || !role || !department) {
    console.error('Usage: node enrollUser.js <userId> <role> <department>');
    console.error('Example: node enrollUser.js doctor001 doctor cardiology');
    process.exit(1);
}

enrollUser(userId, role, department).catch(err => {
    console.error('[enrollUser] FAILED:', err.message);
    process.exit(1);
});

module.exports = { enrollUser };
