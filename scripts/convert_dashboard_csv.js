#!/usr/bin/env node
/**
 * convert_dashboard_csv.js
 * Converts the dashboard CSV exports (enterprise / mobile / ics) into the
 * JSON format consumed by the frontend (graph.json, graph_extended.json,
 * techniques.json, tactics.json, groups.json, malware.json, campaigns.json,
 * procedures.json, relationships.json, graph_edges.json).
 *
 * Usage:  node scripts/convert_dashboard_csv.js
 */

const fs   = require("fs");
const path = require("path");

// ── Paths ──────────────────────────────────────────────────────────────────
const CSV_DIR = "C:/Users/nafiz/Downloads/dashboard_data/dashboard_data";
const OUT_DIR = path.join(__dirname, "../frontend/data_processed");

const DATASETS = ["enterprise", "mobile", "ics"];

// ── Helpers ────────────────────────────────────────────────────────────────
function parseCSV(filepath) {
  const raw  = fs.readFileSync(filepath, "utf8");
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = splitCSVLine(line);
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj;
  });
}

function splitCSVLine(line) {
  // Simple CSV split – handles quoted fields
  const result = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; }
    else if (c === "," && !inQuote) { result.push(cur.trim()); cur = ""; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}

function pipe(arr) {
  // "a | b | c"  →  ["a","b","c"]
  if (!arr) return [];
  return arr.split("|").map(s => s.trim()).filter(Boolean);
}

function write(filename, data) {
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  const count = Array.isArray(data) ? data.length
    : (data.nodes ? `${data.nodes.length} nodes / ${data.edges.length} edges` : "object");
  console.log(`  ✓ ${filename}  (${count})`);
}

// Domain shortname → full domain identifier used by the existing domain filter
const DOMAIN_MAP = {
  "enterprise-attack": "enterprise-attack",
  "mobile-attack":     "mobile-attack",
  "ics-attack":        "ics-attack",
};

// ── Load ALL CSVs ──────────────────────────────────────────────────────────
console.log("Loading CSVs…");
const allNodes = [];
const allEdges = [];

DATASETS.forEach(ds => {
  const nodes = parseCSV(path.join(CSV_DIR, `${ds}_dashboard_nodes.csv`));
  const edges = parseCSV(path.join(CSV_DIR, `${ds}_dashboard_edges.csv`));
  allNodes.push(...nodes);
  allEdges.push(...edges);
  console.log(`  ${ds}: ${nodes.length} nodes, ${edges.length} edges`);
});

// Deduplicate by id (combined may overlap with individual)
const nodeMap = new Map();
allNodes.forEach(n => { if (n.id && !nodeMap.has(n.id)) nodeMap.set(n.id, n); });
const edgeMap = new Map();
allEdges.forEach(e => { if (e.id && !edgeMap.has(e.id)) edgeMap.set(e.id, e); });

const nodes = [...nodeMap.values()];
const edges = [...edgeMap.values()];
console.log(`Deduplicated: ${nodes.length} nodes, ${edges.length} edges`);

// ── Separate by type ───────────────────────────────────────────────────────
const byType = {};
nodes.forEach(n => {
  const t = n.type || "unknown";
  if (!byType[t]) byType[t] = [];
  byType[t].push(n);
});
console.log("Node types:", Object.keys(byType).map(k => `${k}(${byType[k].length})`).join(", "));

const tactics     = byType["x-mitre-tactic"]    || [];
const techniques  = byType["attack-pattern"]     || [];
const groups      = byType["intrusion-set"]      || [];
const malwareArr  = [...(byType["malware"] || []), ...(byType["tool"] || [])];
const campaignsArr = byType["campaign"]          || [];
const mitigations = byType["course-of-action"]  || [];

// ── Build relationship lookups ─────────────────────────────────────────────
// group/malware/campaign  →  techniques they "use"
const entityTechMap   = {};  // sourceId → [targetId, ...]
const techniqueEdgesArr = []; // subtechnique-of edges for graph_edges.json

edges.forEach(e => {
  if (e.type === "uses") {
    if (!entityTechMap[e.source]) entityTechMap[e.source] = [];
    entityTechMap[e.source].push(e.target);
  }
});

// ── Index helpers ──────────────────────────────────────────────────────────
const techById   = new Map(techniques.map(t => [t.id, t]));
const groupById  = new Map(groups.map(g => [g.id, g]));
const mwById     = new Map(malwareArr.map(m => [m.id, m]));
const campById   = new Map(campaignsArr.map(c => [c.id, c]));
const tacticById = new Map(tactics.map(t => [t.id, t]));

// ── 1. tactics.json ────────────────────────────────────────────────────────
const tacticsOut = tactics.map(t => ({
  stix_id:     t.id,
  attack_id:   t.external_id,
  name:        t.name,
  shortname:   slugify(t.name),
  description: "",
  domains:     pipe(t.domains),
}));

// ── 2. techniques.json ─────────────────────────────────────────────────────
const subtechOf = new Map(); // child id → parent id
edges.forEach(e => {
  if (e.type === "subtechnique-of") subtechOf.set(e.source, e.target);
});

// Build shortname→tactic map per domain for fast lookup
// tacticByShortnameDomain["initial-access|enterprise-attack"] = tacticNode
const tacticByShortnameDomain = new Map();
tactics.forEach(t => {
  pipe(t.domains).forEach(domain => {
    tacticByShortnameDomain.set(`${slugify(t.name)}|${domain}`, t);
  });
  // also plain shortname as fallback
  if (!tacticByShortnameDomain.has(slugify(t.name))) {
    tacticByShortnameDomain.set(slugify(t.name), t);
  }
});

const techniquesOut = techniques.map(t => {
  // PRIMARY: use the "tactics" column (pipe-separated shortnames like "initial-access | execution")
  const tacticShortnames = pipe(t.tactics || "");
  const techDomains      = pipe(t.domains);
  const domain           = techDomains[0] || "enterprise-attack";

  const kill_chain_phases = tacticShortnames.map(shortname => {
    // slugify the tactic shortname (it may already be slug-form or space-form)
    const slug = shortname.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const killChainName = domainToKillChainName(domain);
    return { kill_chain_name: killChainName, phase_name: slug };
  });

  return {
    stix_id:          t.id,
    attack_id:        t.external_id,
    name:             t.name,
    description:      "",
    is_subtechnique:  subtechOf.has(t.id),
    domains:          techDomains,
    platforms:        pipe(t.platforms),
    kill_chain_phases,
  };
});

// ── 3. groups.json ─────────────────────────────────────────────────────────
const groupsOut = groups.map(g => {
  const techIds = entityTechMap[g.id] || [];
  const linkedTechs = techIds
    .filter(tid => techById.has(tid))
    .map(tid => {
      const t = techById.get(tid);
      return { stix_id: t.id, attack_id: t.external_id, name: t.name };
    });
  return {
    stix_id:    g.id,
    attack_id:  g.external_id,
    name:       g.name,
    aliases:    [],
    description:"",
    primary_motivation: null,
    secondary_motivations: [],
    techniques: linkedTechs,
  };
});

// ── 4. malware.json ────────────────────────────────────────────────────────
const malwareOut = malwareArr.map(m => {
  const techIds = entityTechMap[m.id] || [];
  const linkedTechs = techIds
    .filter(tid => techById.has(tid))
    .map(tid => {
      const t = techById.get(tid);
      return { stix_id: t.id, attack_id: t.external_id, name: t.name };
    });
  return {
    stix_id:      m.id,
    attack_id:    m.external_id,
    name:         m.name,
    aliases:      [],
    description:  "",
    malware_types:[],
    is_family:    null,
    platforms:    pipe(m.platforms),
    capabilities: [],
    techniques:   linkedTechs,
  };
});

// ── 5. campaigns.json ──────────────────────────────────────────────────────
const campaignsOut = campaignsArr.map(c => {
  const techIds = entityTechMap[c.id] || [];
  const linkedTechs = techIds
    .filter(tid => techById.has(tid))
    .map(tid => {
      const t = techById.get(tid);
      return { stix_id: t.id, attack_id: t.external_id, name: t.name };
    });
  return {
    stix_id:     c.id,
    attack_id:   c.external_id,
    name:        c.name,
    description: "",
    first_seen:  null,
    last_seen:   null,
    techniques:  linkedTechs,
  };
});

// ── 6. procedures.json ─────────────────────────────────────────────────────
const proceduresOut = edges
  .filter(e => e.type === "uses" && techById.has(e.target))
  .map(e => {
    const src  = nodeMap.get(e.source);
    const tgt  = techById.get(e.target);
    if (!src || !tgt) return null;
    return {
      stix_id:          e.id,
      relationship_type:"uses",
      source_ref:       e.source,
      source_type:      src.type === "intrusion-set" ? "group" : src.type === "malware" ? "malware" : src.type,
      source_name:      src.name,
      target_ref:       e.target,
      target_type:      "technique",
      target_name:      tgt.name,
      target_attack_id: tgt.external_id,
      description:      "",
      external_references: [],
    };
  })
  .filter(Boolean);

// ── 7. relationships.json ──────────────────────────────────────────────────
const relationshipsOut = edges.map(e => ({
  source: e.source,
  target: e.target,
  type:   e.type,
}));

// ── 8. graph_edges.json ────────────────────────────────────────────────────
const graphEdgesOut = edges
  .filter(e => e.type === "subtechnique-of")
  .map(e => ({ source: e.source, target: e.target, type: e.type }));

// ── 9. graph.json (tactic+technique nodes only, default_visible) ──────────
// Mirrors the existing structure: tactics + parent techniques visible by default
const graphNodes = [];
const graphEdgesCore = [];

// All tactics
tactics.forEach(t => {
  graphNodes.push({
    id:              t.id,
    label:           t.name,
    attack_id:       t.external_id,
    node_type:       "tactic",
    shortname:       slugify(t.name),
    description:     "",
    default_visible: true,
  });
});

// Techniques: default_visible = true for parent techniques (not subtechniques)
techniques.forEach(t => {
  const isSub = subtechOf.has(t.id);
  graphNodes.push({
    id:              t.id,
    label:           t.name,
    attack_id:       t.external_id,
    node_type:       "technique",
    shortname:       slugify(t.name),
    description:     "",
    default_visible: !isSub,
  });
});

// subtechnique-of edges from CSV
edges.forEach(e => {
  if (e.type === "subtechnique-of") {
    graphEdgesCore.push({ source: e.source, target: e.target, type: "subtechnique-of" });
  }
});

// Derive tactic-technique edges from the techniques' kill_chain_phases
// (populated above from the "tactics" column on each technique node)
const seenTacticTech = new Set();
techniquesOut.forEach(t => {
  const domain = (t.domains || [])[0] || "enterprise-attack";
  t.kill_chain_phases.forEach(kcp => {
    // Find the tactic node matching this slug + domain
    const tac =
      tacticByShortnameDomain.get(`${kcp.phase_name}|${domain}`) ||
      tacticByShortnameDomain.get(kcp.phase_name);
    if (!tac) return;
    const key = `${tac.id}|${t.stix_id}`;
    if (!seenTacticTech.has(key)) {
      graphEdgesCore.push({ source: tac.id, target: t.stix_id, type: "tactic-technique" });
      seenTacticTech.add(key);
    }
  });
});

// ── 10. graph_extended.json (all node types) ───────────────────────────────
const extNodes = [...graphNodes];
const extEdges = [...graphEdgesCore];

// Add group / malware / campaign / mitigation nodes
[...groups, ...malwareArr, ...campaignsArr, ...mitigations].forEach(n => {
  extNodes.push({
    id:          n.id,
    label:       n.name,
    attack_id:   n.external_id,
    node_type:   csvTypeToNodeType(n.type),
    description: "",
  });
});

// Add uses edges
edges.filter(e => e.type === "uses").forEach(e => {
  extEdges.push({ source: e.source, target: e.target, type: "uses" });
});
// Add mitigates edges
edges.filter(e => e.type === "mitigates").forEach(e => {
  extEdges.push({ source: e.source, target: e.target, type: "mitigates" });
});
// Add procedure edges
edges.filter(e => e.type === "procedure-technique").forEach(e => {
  extEdges.push({ source: e.source, target: e.target, type: "procedure-technique" });
});

// ── Write all files ────────────────────────────────────────────────────────
console.log("\nWriting output files…");
write("tactics.json",          tacticsOut);
write("techniques.json",       techniquesOut);
write("groups.json",           groupsOut);
write("malware.json",          malwareOut);
write("campaigns.json",        campaignsOut);
write("procedures.json",       proceduresOut);
write("relationships.json",    relationshipsOut);
write("graph_edges.json",      graphEdgesOut);
write("graph.json",            { nodes: graphNodes,  edges: graphEdgesCore });
write("graph_extended.json",   { nodes: extNodes,    edges: extEdges });

console.log("\nDone.");

// ── Utility functions ──────────────────────────────────────────────────────
function slugify(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function domainToKillChainName(domain) {
  const map = {
    "enterprise-attack": "mitre-attack",
    "mobile-attack":     "mitre-mobile-attack",
    "ics-attack":        "mitre-ics-attack",
  };
  return map[domain] || "mitre-attack";
}

function csvTypeToNodeType(type) {
  const map = {
    "intrusion-set":    "group",
    "malware":          "malware",
    "tool":             "malware",   // tools treated as malware/software in the graph
    "campaign":         "campaign",
    "course-of-action": "mitigation",
    "attack-pattern":   "technique",
    "x-mitre-tactic":   "tactic",
  };
  return map[type] || type;
}
