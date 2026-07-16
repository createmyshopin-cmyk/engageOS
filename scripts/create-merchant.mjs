/**
 * One-time script: hashes the provided password with Argon2id
 * and prints the INSERT SQL to run in Supabase SQL Editor.
 *
 * Usage:  node scripts/create-merchant.mjs
 */

import { hash } from "@node-rs/argon2";

const NAME = "mekkadans";
const EMAIL = "admin@mekkadans.com";
const PASSWORD = "Merchant@123";
const ROLE = "owner";

const passwordHash = await hash(PASSWORD, {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
});

// Escape single quotes in hash for SQL safety
const safeHash = passwordHash.replace(/'/g, "''");

console.log("\n=== Run this SQL in your Supabase SQL Editor ===\n");
console.log(`-- Step 1: Run migration 0006 if not done yet`);
console.log(`-- (paste supabase/migrations/0006_merchants_auth.sql first)\n`);
console.log(`-- Step 2: Find the business_id for mekkadans`);
console.log(`SELECT id, name FROM businesses WHERE slug = 'mekkadans';\n`);
console.log(`-- Step 3: Insert merchant account (replace <BUSINESS_ID> with the UUID from step 2)`);
console.log(`INSERT INTO merchants (business_id, name, email, password_hash, role, status)`);
console.log(`VALUES (`);
console.log(`  (SELECT id FROM businesses WHERE slug = 'mekkadans'),`);
console.log(`  '${NAME}',`);
console.log(`  '${EMAIL}',`);
console.log(`  '${safeHash}',`);
console.log(`  '${ROLE}',`);
console.log(`  'active'`);
console.log(`);\n`);
console.log("=== Login Credentials ===");
console.log(`Email:    ${EMAIL}`);
console.log(`Password: ${PASSWORD}`);
console.log(`URL:      http://localhost:3000/m/login\n`);
