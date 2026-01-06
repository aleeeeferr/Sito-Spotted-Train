const fs = require("fs");
const path = require("path");
require("dotenv").config();

const defaults = {
  TRAINS_ENDPOINT: "http://localhost:4000/api/trains",
  UNICO_API_ENDPOINT: "https://example.com/unico/getTariffa",
  UNICO_PREFETCH_ENDPOINT: "https://example.com/unico/prefetch",
};

const entries = [
  ["TRAINS_ENDPOINT", "TRAINS_ENDPOINT"],
  ["UNICO_API_ENDPOINT", "UNICO_API_ENDPOINT"],
  ["UNICO_PREFETCH_ENDPOINT", "UNICO_PREFETCH_ENDPOINT"],
];

const lines = entries.map(([windowKey, envKey]) => {
  const value = process.env[envKey] || defaults[envKey] || "";
  return `window.${windowKey} = "${value}";`;
});

const output = `${lines.join("\n")}\n`;
const targetPath = path.resolve(__dirname, "..", "frontend", "js", "app-config.js");

fs.writeFileSync(targetPath, output, "utf8");
console.log(`Wrote ${targetPath}`);
