/**
 * reset_test_data.js
 * Wipes all users, records, access requests and doctor applications
 * so you can start fresh with the browser-keygen system.
 *
 * Place in backend/ and run:  node reset_test_data.js
 *
 * Does NOT touch the admin account (role: "admin").
 */
import mongoose from "mongoose";
import dotenv   from "dotenv";
dotenv.config();

const URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/test";
await mongoose.connect(URI);
console.log("Connected:", URI);

const db = mongoose.connection.db;

// Collections to clean
const ops = [
  db.collection("users").deleteMany({ role: { $in: ["patient", "doctor"] } }),
  db.collection("records").deleteMany({}),
  db.collection("accessrequests").deleteMany({}),
  db.collection("doctorapplications").deleteMany({}),
];

const [users, records, requests, apps] = await Promise.all(ops);
console.log(`✅ Deleted ${users.deletedCount} patients/doctors`);
console.log(`✅ Deleted ${records.deletedCount} records`);
console.log(`✅ Deleted ${requests.deletedCount} access requests`);
console.log(`✅ Deleted ${apps.deletedCount} doctor applications`);

// Fix patientId index while we're here
try {
  await db.collection("users").dropIndex("patientId_1");
  console.log("✅ Dropped old patientId index");
} catch (e) {
  console.log("ℹ️  patientId index already clean");
}
await db.collection("users").createIndex(
  { patientId: 1 },
  { unique: true, sparse: true, name: "patientId_1" }
);
console.log("✅ Recreated patientId index (unique + sparse)");

await mongoose.disconnect();
console.log("\n✅ Done. Now re-register patient and doctor fresh.");