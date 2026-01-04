const fs = require("fs");
const path = require("path");
require("dotenv").config();

const requiredVars = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
  "FIREBASE_APPCHECK_SITE_KEY",
];

const missing = requiredVars.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const configEntries = [
  ["apiKey", "FIREBASE_API_KEY"],
  ["authDomain", "FIREBASE_AUTH_DOMAIN"],
  ["projectId", "FIREBASE_PROJECT_ID"],
  ["storageBucket", "FIREBASE_STORAGE_BUCKET"],
  ["messagingSenderId", "FIREBASE_MESSAGING_SENDER_ID"],
  ["appId", "FIREBASE_APP_ID"],
  ["measurementId", "FIREBASE_MEASUREMENT_ID"],
];

const configLines = configEntries
  .filter(([, envKey]) => process.env[envKey])
  .map(([key, envKey]) => `  ${key}: "${process.env[envKey]}",`);

const output = [
  "window.FIREBASE_CONFIG = {",
  ...configLines,
  "};",
  "",
  `window.FIREBASE_APPCHECK_SITE_KEY = \"${process.env.FIREBASE_APPCHECK_SITE_KEY}\";`,
  "",
].join("\n");

const targetPath = path.resolve(__dirname, "..", "frontend", "js", "firebase-config.js");
fs.writeFileSync(targetPath, output, "utf8");
console.log(`Wrote ${targetPath}`);
