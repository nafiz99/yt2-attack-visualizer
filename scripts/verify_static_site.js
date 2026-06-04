const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(repoRoot, "frontend");
const indexPath = path.join(frontendRoot, "index.html");
const requiredFiles = [
  "index.html",
  "styles.css",
  "main.js",
  "modules/state.js",
  "modules/dataLoader.js",
  "data_processed/graph.json",
  "data_processed/graph_extended.json",
  "data_processed/techniques.json",
  "data_processed/tactics.json",
  "data_processed/groups.json",
  "data_processed/malware.json",
  "data_processed/campaigns.json",
  "data_processed/procedures.json",
];

function fail(message) {
  console.error(`Static site verification failed: ${message}`);
  process.exit(1);
}

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(frontendRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`missing frontend/${relativePath}`);
  }
}


const indexHtml = fs.readFileSync(indexPath, "utf8");
if (!indexHtml.includes('type="module" src="main.js')) {
  fail("frontend/index.html does not load main.js with a relative module path");
}
if (!indexHtml.includes('href="styles.css')) {
  fail("frontend/index.html does not load styles.css with a relative path");
}

for (const relativePath of requiredFiles.filter((file) => file.endsWith(".json"))) {
  const absolutePath = path.join(frontendRoot, relativePath);
  try {
    JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    fail(`invalid JSON in frontend/${relativePath}: ${error.message}`);
  }
}

console.log("Static site verification passed.");
