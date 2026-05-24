// modules/graphRenderer.js
// Cytoscape initialization, view builders, rendering, mode/context switching.

import { state, MODE_NODE_TYPES, NODE_TYPE_TO_MODE, WORKFLOW_TACTIC_SEQUENCE, LAYOUT_PRESETS } from "./state.js";
import {
  getLayoutOptions,
  updateStatusChipText,
  updateModeTabsUI,
  syncWorkspaceViewForMode,
  getModeLabel,
} from "./ui.js";
import {
  isParentTechnique,
  isSubTechnique,
  getChildSubtechniques,
  getParentTechnique,
  getTacticsForTechnique,
  getTechniquesForTactic,
} from "./graphQueries.js";
import {
  openDetailsPanel,
  closeDetailsPanel,
  restoreDetailsPanel,
  renderTechniqueDetails,
  renderTacticDetails,
  renderGroupDetails,
  renderMalwareDetails,
  renderCampaignDetails,
  renderProcedureDetails,
  buildBadge,
  truncateText,
} from "./detailsPanel.js";
import {
  matchesDomainFilter,
  matchesPhaseFilter,
  matchesPlatformFilter,
  sortTechniqueNodes,
  sortEdgesByTechniquePreference,
} from "./search.js";
// renderWorkflowView and setWorkflowAnchor imported inside function bodies to break circular init
// They are only called after all modules have loaded.

// --- Minimap ---
let minimapInitialized = false;
function ensureMinimapInitialized() {
  if (minimapInitialized || !state.cy || typeof state.cy.navigator !== "function") return;
  const container = document.getElementById("minimap");
  if (!container) return;
  try {
    state.cy.navigator({
      container: "#minimap",
      viewLiveFramerate: 0,
      thumbnailEventFramerate: 30,
      thumbnailLiveFramerate: false,
      dblClickDelay: 200,
      removeCustomContainer: false,
      rerenderDelay: 100,
    });
    minimapInitialized = true;
  } catch (_) {}
}

// --- Node Info Card (compact top-right overlay) ---

function buildNodeInfoHTML(nodeData, nodeId) {
  const name = nodeData.name || nodeData.label || nodeId;
  const attackId = nodeData.attack_id || "";
  const t = nodeData.node_type;
  const badgeLabel = t === "technique" && nodeData.is_subtechnique ? "Sub-technique" : null;
  const badge = buildBadge(t, badgeLabel);
  const desc = truncateText(nodeData.description || "", 200);

  let metaLines = "";

  if (t === "technique") {
    const tactics = getTacticsForTechnique(nodeId);
    const tacticChips = tactics.slice(0, 3)
      .map(tac => `<span class="value-chip nic-chip">${tac.attack_id || tac.label}</span>`)
      .join("");
    if (tacticChips) metaLines += `<div class="nic-meta-row">${tacticChips}</div>`;

    const parent = getParentTechnique(nodeId);
    if (parent) {
      metaLines += `<div class="nic-meta-line">Part of: <span class="nic-meta-val">${parent.attack_id || ""} ${parent.label || ""}</span></div>`;
    }
    const ctx = state.techniqueContextIndex?.[nodeId];
    if (ctx) {
      const parts = [];
      if (ctx.groups?.length) parts.push(`${ctx.groups.length} group${ctx.groups.length > 1 ? "s" : ""}`);
      if (ctx.malware?.length) parts.push(`${ctx.malware.length} malware`);
      if (parts.length) metaLines += `<div class="nic-meta-line">Used by: <span class="nic-meta-val">${parts.join(", ")}</span></div>`;
    }

  } else if (t === "tactic") {
    const techs = getTechniquesForTactic(nodeId);
    if (techs.length) metaLines += `<div class="nic-meta-line"><span class="nic-meta-val">${techs.length} technique${techs.length > 1 ? "s" : ""}</span></div>`;

  } else if (t === "group") {
    const record = state.entityData?.group?.[nodeId] || nodeData;
    const aliases = record.aliases?.slice(0, 3) || [];
    if (aliases.length) {
      metaLines += `<div class="nic-meta-row">${aliases.map(a => `<span class="value-chip nic-chip">${a}</span>`).join("")}</div>`;
    }
    const motivations = [record.primary_motivation, ...(record.secondary_motivations || [])].filter(Boolean).slice(0, 2);
    if (motivations.length) metaLines += `<div class="nic-meta-line">Motivation: <span class="nic-meta-val">${motivations.join(", ")}</span></div>`;
    if (record.techniques?.length) metaLines += `<div class="nic-meta-line"><span class="nic-meta-val">${record.techniques.length} observed technique${record.techniques.length > 1 ? "s" : ""}</span></div>`;

  } else if (t === "malware") {
    const record = state.entityData?.malware?.[nodeId] || nodeData;
    const types = record.malware_types?.slice(0, 3) || [];
    if (types.length) {
      metaLines += `<div class="nic-meta-row">${types.map(a => `<span class="value-chip nic-chip">${a}</span>`).join("")}</div>`;
    }
    const platforms = record.platforms?.slice(0, 3) || [];
    if (platforms.length) metaLines += `<div class="nic-meta-line">Platforms: <span class="nic-meta-val">${platforms.join(", ")}</span></div>`;

  } else if (t === "campaign") {
    const record = state.entityData?.campaign?.[nodeId] || nodeData;
    const timeline = [record.first_seen, record.last_seen].filter(Boolean).map(d => d.split("T")[0]);
    if (timeline.length) metaLines += `<div class="nic-meta-line">Active: <span class="nic-meta-val">${timeline.join(" → ")}</span></div>`;

  } else if (t === "procedure") {
    const record = state.entityData?.procedure?.[nodeId] || nodeData;
    if (record.source_name) metaLines += `<div class="nic-meta-line">Entity: <span class="nic-meta-val">${record.source_name}</span></div>`;
    if (record.target_name) metaLines += `<div class="nic-meta-line">Technique: <span class="nic-meta-val">${record.target_attack_id || ""} ${record.target_name || ""}</span></div>`;
  }

  return `
    <div class="nic-header">
      ${attackId ? `<span class="nic-id">${attackId}</span>` : ""}
      <div class="nic-badges">${badge}</div>
    </div>
    <div class="nic-name">${name}</div>
    ${metaLines ? `<div class="nic-meta">${metaLines}</div>` : ""}
    <p class="nic-desc">${desc}</p>
    <button class="nic-full-details" type="button">View Full Details →</button>
  `;
}

function showNodeInfoCard(nodeData, nodeId, onFullDetails) {
  const card = document.getElementById("node-info-card");
  if (!card) return;
  card.innerHTML = buildNodeInfoHTML(nodeData, nodeId);
  card.classList.remove("is-hidden");
  card.removeAttribute("aria-hidden");
  const btn = card.querySelector(".nic-full-details");
  if (btn && onFullDetails) {
    btn.addEventListener("click", () => {
      hideNodeInfoCard();
      onFullDetails();
    });
  }
}

function hideNodeInfoCard() {
  const card = document.getElementById("node-info-card");
  if (!card) return;
  card.classList.add("is-hidden");
  card.setAttribute("aria-hidden", "true");
  card.innerHTML = "";
}

// --- Position Cache ---
// Keyed by view key string (e.g. "default", "tactic:TA0043", "techniqueExpanded:T1591")
// Each entry: { positions: { nodeId: {x,y} }, zoom, pan }
const positionCache = new Map();
let activeViewKey = null;

function makeViewKey(viewType, pivotId) {
  return pivotId ? `${viewType}:${pivotId}` : viewType;
}

function savePositionsToCache(viewKey) {
  if (!state.cy || !viewKey) return;
  const positions = {};
  state.cy.nodes().forEach(node => {
    positions[node.id()] = { ...node.position() };
  });
  positionCache.set(viewKey, {
    positions,
    zoom: state.cy.zoom(),
    pan: { ...state.cy.pan() },
  });
}

export function clearPositionCache() {
  positionCache.clear();
}

// --- Navigation History ---
// Each entry is a view snapshot: { viewType, pivotId, selectedId, zoom, pan }
// viewType: 'default' | 'tactic' | 'techniqueExpanded' | 'contextEntity' | 'highlight'
// pivotId: the node used to build the view (tactic/technique/entity), null for default
// selectedId: the node highlighted/selected in the view
// zoom/pan: camera state captured after animation settles

const navHistory = [];
let navIndex = -1;
let navSuppressRecord = false;

// Tracks what the current view looks like (set before each render)
let pendingNavSnapshot = null;

function updateNavButtons() {
  const backBtn = document.getElementById("navBack");
  const fwdBtn = document.getElementById("navForward");
  if (backBtn) backBtn.disabled = navIndex <= 0;
  if (fwdBtn)  fwdBtn.disabled  = navIndex >= navHistory.length - 1;
}

// Call this BEFORE rendering to declare what the upcoming view will be.
// The snapshot is committed to history after a short delay (so zoom/pan settle).
export function declareNavSnapshot(viewType, pivotId, selectedId) {
  if (navSuppressRecord) return;
  pendingNavSnapshot = { viewType, pivotId, selectedId };
  // Commit after animation (layout + animate ~600ms)
  setTimeout(() => {
    if (!pendingNavSnapshot) return;
    const snap = {
      ...pendingNavSnapshot,
      zoom: state.cy ? state.cy.zoom() : 1,
      pan: state.cy ? { ...state.cy.pan() } : { x: 0, y: 0 },
    };
    pendingNavSnapshot = null;
    // Deduplicate: if same viewType+pivotId+selectedId as current, just update zoom/pan
    const current = navHistory[navIndex];
    if (current && current.viewType === snap.viewType &&
        current.pivotId === snap.pivotId && current.selectedId === snap.selectedId) {
      navHistory[navIndex] = snap;
      return;
    }
    navHistory.splice(navIndex + 1);
    navHistory.push(snap);
    navIndex = navHistory.length - 1;
    updateNavButtons();
  }, 650);
}

function restoreNavSnapshot(snap) {
  if (!snap || !state.cy) return;
  navSuppressRecord = true;

  const done = () => {
    navSuppressRecord = false;
    updateNavButtons();
  };

  if (snap.viewType === 'default') {
    // resetToDefaultView sets activeViewKey internally, cache will be used
    resetToDefaultView();
    setTimeout(() => {
      if (snap.zoom) state.cy.zoom(snap.zoom);
      if (snap.pan)  state.cy.pan(snap.pan);
      if (snap.selectedId) {
        state.cy.elements().removeClass("faded selected-node connected-node highlighted-edge");
        const n = state.cy.getElementById(snap.selectedId);
        if (n?.length) n.addClass("selected-node");
      }
      done();
    }, 400);
    return;
  }

  if (snap.viewType === 'highlight') {
    if (!snap.pivotId) {
      resetToDefaultView();
    } else {
      const pivotNode = state.nodeMap[snap.pivotId];
      if (pivotNode && pivotNode.node_type === 'tactic') {
        activeViewKey = makeViewKey('tactic', snap.pivotId);
        const view = buildTacticView(snap.pivotId);
        renderElements(view.elements,
          `Tactic view loaded. Nodes: ${view.nodesCount}, Edges: ${view.edgesCount}`, {});
      } else if (pivotNode) {
        activeViewKey = makeViewKey('techniqueExpanded', snap.pivotId);
        const view = buildTechniqueExpandedView(snap.pivotId);
        renderElements(view.elements,
          `Technique expanded view loaded. Nodes: ${view.nodesCount}, Edges: ${view.edgesCount}`, {});
      }
    }
    setTimeout(() => {
      if (snap.selectedId) highlightWithinCurrentView(snap.selectedId);
      if (snap.zoom) state.cy.zoom(snap.zoom);
      if (snap.pan)  state.cy.pan(snap.pan);
      done();
    }, 400);
    return;
  }

  if (snap.viewType === 'tactic' && snap.pivotId) {
    const tacticNode = state.nodeMap[snap.pivotId];
    if (tacticNode) {
      activeViewKey = makeViewKey('tactic', snap.pivotId);
      const view = buildTacticView(snap.pivotId);
      renderElements(view.elements,
        `Tactic view loaded. Nodes: ${view.nodesCount}, Edges: ${view.edgesCount}`,
        { selectedId: snap.selectedId });
    }
    setTimeout(() => {
      if (snap.zoom) state.cy.zoom(snap.zoom);
      if (snap.pan)  state.cy.pan(snap.pan);
      done();
    }, 400);
    return;
  }

  if (snap.viewType === 'techniqueExpanded' && snap.pivotId) {
    activeViewKey = makeViewKey('techniqueExpanded', snap.pivotId);
    const view = buildTechniqueExpandedView(snap.pivotId);
    renderElements(view.elements,
      `Technique expanded view loaded. Nodes: ${view.nodesCount}, Edges: ${view.edgesCount}`,
      { selectedId: snap.selectedId });
    setTimeout(() => {
      if (snap.zoom) state.cy.zoom(snap.zoom);
      if (snap.pan)  state.cy.pan(snap.pan);
      done();
    }, 400);
    return;
  }

  if (snap.viewType === 'contextEntity' && snap.pivotId) {
    const matchedNode = state.nodeMap[snap.pivotId];
    if (matchedNode) {
      const derivedMode = NODE_TYPE_TO_MODE[matchedNode.node_type];
      if (derivedMode) setActiveMode(derivedMode, { skipReset: true });
      activeViewKey = makeViewKey('contextEntity', snap.pivotId);
      const view = buildContextEntityView(snap.pivotId, matchedNode.node_type);
      if (view) {
        renderElements(view.elements,
          `${matchedNode.node_type} neighborhood loaded. Nodes: ${view.nodesCount}, Edges: ${view.edgesCount}`,
          { selectedId: snap.selectedId });
      }
    }
    setTimeout(() => {
      if (snap.zoom) state.cy.zoom(snap.zoom);
      if (snap.pan)  state.cy.pan(snap.pan);
      done();
    }, 400);
    return;
  }

  // Fallback
  done();
}

export function navigateBack() {
  if (navIndex <= 0) return;
  navIndex--;
  restoreNavSnapshot(navHistory[navIndex]);
}

export function navigateForward() {
  if (navIndex >= navHistory.length - 1) return;
  navIndex++;
  restoreNavSnapshot(navHistory[navIndex]);
}

// --- Node Map Hydration ---

export function hydrateNodeMap(data) {
  state.nodeMap = {};
  data.nodes.forEach(n => {
    state.nodeMap[n.id] = n;
  });
}

// --- Element Builders ---

export function buildNodeElement(node) {
  let label = `${node.attack_id || "NO-ID"} - ${node.label}`;
  if (node.node_type === "technique" && !node.is_subtechnique) {
    const subCount = getChildSubtechniques(node.id).length;
    if (subCount > 0) label += ` [+${subCount}]`;
  }
  const isContextNode = node.default_visible === false;
  const contextState = state.highlightNewEntities && isContextNode ? "highlight" : "default";
  return {
    data: {
      id: node.id,
      label,
      attack_id: node.attack_id,
      node_type: node.node_type,
      is_subtechnique: node.is_subtechnique || false,
      context_state: contextState,
    },
  };
}

export function buildEdgeElement(
  edge,
  overrideType = null,
  overrideSource = null,
  overrideTarget = null
) {
  return {
    data: {
      id: `${overrideSource || edge.source}->${overrideTarget || edge.target}->${overrideType || edge.type}`,
      source: overrideSource || edge.source,
      target: overrideTarget || edge.target,
      type: overrideType || edge.type,
    },
  };
}

// --- View Builders ---

export function buildAttackDefaultView(limit = state.nodeSampleLimit) {
  // Default view: show ALL tactics for the active domain.
  // Techniques are explored by clicking a tactic node (drill-down).
  // This avoids large layout performance issues while still loading all data.

  // Collect tactic nodes that belong to the active domain.
  // Tactic nodes themselves don't carry a domain field in graph.json, so we
  // derive domain membership from the tactic-technique edges: a tactic belongs
  // to a domain if at least one of its connected techniques belongs to that domain.
  const tacticDomainSet = new Map(); // tacticId → Set of domains
  state.graphDataRef.edges.forEach(edge => {
    if (edge.type !== "tactic-technique") return;
    const techDomains = state.techniqueMap[edge.target]?.domains || [];
    if (!tacticDomainSet.has(edge.source)) tacticDomainSet.set(edge.source, new Set());
    techDomains.forEach(d => tacticDomainSet.get(edge.source).add(d));
  });

  const activeDomain = state.activeDomainFilter; // always a specific domain now

  const tacticNodes = Object.values(state.nodeMap).filter(n => {
    if (n.node_type !== "tactic") return false;
    const domains = tacticDomainSet.get(n.id);
    return domains && domains.has(activeDomain);
  });

  if (!tacticNodes.length) return { elements: [], nodesCount: 0, edgesCount: 0 };

  // Build phase order map (used for "phase" sort and as fallback)
  const phaseOrder = new Map();
  WORKFLOW_TACTIC_SEQUENCE.forEach((p, i) => {
    if (p.domain === activeDomain && !phaseOrder.has(p.shortname + activeDomain)) {
      phaseOrder.set(p.shortname + activeDomain, i);
    }
  });

  // Technique count per tactic (for "signal" sort)
  const techCountPerTactic = new Map();
  state.graphDataRef.edges.forEach(edge => {
    if (edge.type !== "tactic-technique") return;
    techCountPerTactic.set(edge.source, (techCountPerTactic.get(edge.source) || 0) + 1);
  });

  const so = state.activeSortOrder;
  tacticNodes.sort((a, b) => {
    if (so === "alpha") return (a.label || "").localeCompare(b.label || "");
    if (so === "attack") {
      const idCmp = (a.attack_id || "").localeCompare(b.attack_id || "");
      return idCmp !== 0 ? idCmp : (a.label || "").localeCompare(b.label || "");
    }
    if (so === "signal") {
      const diff = (techCountPerTactic.get(b.id) || 0) - (techCountPerTactic.get(a.id) || 0);
      return diff !== 0 ? diff : (a.label || "").localeCompare(b.label || "");
    }
    // "phase" (default): kill-chain order
    const ia = phaseOrder.get((a.shortname || "") + activeDomain) ?? 999;
    const ib = phaseOrder.get((b.shortname || "") + activeDomain) ?? 999;
    return ia - ib;
  });

  const nodeElements = tacticNodes.map(n => buildNodeElement(n));
  // No edges between tactics in the default view — they're standalone overview nodes

  return {
    elements: nodeElements,
    nodesCount: nodeElements.length,
    edgesCount: 0,
  };
}

export function buildTechniqueFocusedView(limitOverride) {
  // Collect ALL unique parent techniques matching filters, then sort for display.
  // Sort controls visual ordering of the same node set — not which nodes are selected.
  const limit = limitOverride ?? state.nodeSampleLimit;

  const seenTech = new Set();
  const candidateNodes = [];

  state.graphDataRef.edges.forEach(edge => {
    if (edge.type !== "tactic-technique") return;
    if (!isParentTechnique(edge.target)) return;
    if (!matchesDomainFilter(edge.target)) return;
    if (!matchesPhaseFilter(edge.target)) return;
    if (!matchesPlatformFilter(edge.target)) return;
    if (seenTech.has(edge.target)) return;
    seenTech.add(edge.target);
    const node = state.nodeMap[edge.target];
    if (node) candidateNodes.push(node);
  });

  if (!candidateNodes.length) return { elements: [], nodesCount: 0, edgesCount: 0 };

  // Sort the full candidate set — sort purely reorders, does not change which nodes appear
  const sortedNodes = sortTechniqueNodes(candidateNodes);
  const techniqueIds = new Set(sortedNodes.map(n => n.id));
  const nodeElements = sortedNodes.map(buildNodeElement);

  // Include subtechnique-of edges between visible techniques
  const edgeElements = [];
  state.graphDataRef.edges.forEach(edge => {
    if (edge.type !== "subtechnique-of") return;
    if (techniqueIds.has(edge.source) && techniqueIds.has(edge.target)) {
      edgeElements.push(buildEdgeElement(edge));
    }
  });

  return {
    elements: [...nodeElements, ...edgeElements],
    nodesCount: nodeElements.length,
    edgesCount: edgeElements.length,
  };
}

export function buildContextDefaultView(nodeType, limit = state.nodeSampleLimit) {
  if (!nodeType) return buildAttackDefaultView(limit);

  const candidates = state.graphDataRef.nodes.filter(node => node.node_type === nodeType);
  if (!candidates.length) return buildAttackDefaultView(limit);

  // Overview: show ONLY the entity nodes, no connections — same clean pattern as tactics overview.
  // Sort by active sort order, then cap for performance.
  const sorted = candidates.slice().sort((a, b) => {
    if (state.activeSortOrder === "alpha") {
      return (a.label || "").localeCompare(b.label || "");
    }
    if (state.activeSortOrder === "attack") {
      const idCmp = (a.attack_id || "").localeCompare(b.attack_id || "");
      return idCmp !== 0 ? idCmp : (a.label || "").localeCompare(b.label || "");
    }
    if (state.activeSortOrder === "signal") {
      const getCount = n => (state.entityData?.[n.node_type]?.[n.id]?.techniques || []).length;
      return getCount(b) - getCount(a);
    }
    // phase / default: alphabetical by label
    return (a.label || "").localeCompare(b.label || "");
  });
  const displayNodes = sorted.slice(0, Math.min(sorted.length, limit));
  return {
    elements: displayNodes.map(buildNodeElement),
    nodesCount: displayNodes.length,
    edgesCount: 0,
  };
}

export function buildTacticView(tacticId) {
  const tacticNode = state.nodeMap[tacticId];
  const techniqueNodes = sortTechniqueNodes(getTechniquesForTactic(tacticId));
  const edges = state.graphDataRef.edges.filter(
    edge =>
      edge.type === "tactic-technique" &&
      edge.source === tacticId &&
      isParentTechnique(edge.target)
  );
  const nodes = [tacticNode, ...techniqueNodes].filter(Boolean);
  return {
    elements: [...nodes.map(buildNodeElement), ...edges.map(edge => buildEdgeElement(edge))],
    nodesCount: nodes.length,
    edgesCount: edges.length,
  };
}

export function buildTechniqueExpandedView(parentTechniqueId) {
  const parentTechnique = state.nodeMap[parentTechniqueId];
  const tacticNodes = getTacticsForTechnique(parentTechniqueId);
  const childSubtechniques = getChildSubtechniques(parentTechniqueId);
  const tacticEdges = state.graphDataRef.edges.filter(
    edge => edge.type === "tactic-technique" && edge.target === parentTechniqueId
  );
  const displaySubEdges = childSubtechniques.map(child => ({
    source: parentTechniqueId,
    target: child.id,
    type: "contains-subtechnique",
  }));
  const nodes = [...tacticNodes, parentTechnique, ...childSubtechniques].filter(Boolean);
  return {
    elements: [
      ...nodes.map(buildNodeElement),
      ...tacticEdges.map(edge => buildEdgeElement(edge)),
      ...displaySubEdges.map(edge => buildEdgeElement(edge)),
    ],
    nodesCount: nodes.length,
    edgesCount: tacticEdges.length + displaySubEdges.length,
  };
}

export function buildContextEntityView(entityId, entityType) {
  const rootNode = state.nodeMap[entityId] || state.allNodeMap[entityId];
  if (!rootNode) return null;

  // Accept both legacy typed edges AND the "uses" type written by the CSV converter.
  const edgeTypeMap = {
    group:     ["group-technique",    "uses"],
    malware:   ["malware-technique",  "uses"],
    campaign:  ["campaign-technique", "uses", "campaign-group", "campaign-malware"],
    procedure: ["procedure-technique","uses", "procedure-group", "procedure-malware", "procedure-campaign"],
  };
  const allowedTypes = new Set(edgeTypeMap[entityType] || ["uses"]);

  // Gather all edges that originate from this entity and lead to known nodes
  const relevantEdges = state.graphDataRef.edges.filter(edge => {
    if (edge.source !== entityId) return false;
    if (!allowedTypes.has(edge.type)) return false;
    // For "uses" edges, verify target is a technique (not another entity)
    if (edge.type === "uses") {
      const tgt = state.nodeMap[edge.target] || state.allNodeMap[edge.target];
      return tgt && (tgt.node_type === "technique" || tgt.node_type === "tactic");
    }
    return true;
  });

  const nodeIds = new Set([entityId]);
  relevantEdges.forEach(edge => nodeIds.add(edge.target));

  // Also add tactic nodes that own the techniques so the graph has context
  relevantEdges.forEach(edge => {
    const techId = edge.target;
    state.graphDataRef.edges.forEach(e2 => {
      if (e2.type === "tactic-technique" && e2.target === techId) nodeIds.add(e2.source);
    });
  });

  const nodes = Array.from(nodeIds)
    .map(id => state.nodeMap[id] || state.allNodeMap[id])
    .filter(Boolean);

  // Build tactic→technique edges for context
  const tacticEdges = [];
  relevantEdges.forEach(edge => {
    const techId = edge.target;
    state.graphDataRef.edges.forEach(e2 => {
      if (e2.type === "tactic-technique" && e2.target === techId && nodeIds.has(e2.source)) {
        tacticEdges.push(e2);
      }
    });
  });

  const allEdges = [...relevantEdges, ...tacticEdges];
  return {
    elements: [...nodes.map(buildNodeElement), ...allEdges.map(edge => buildEdgeElement(edge))],
    nodesCount: nodes.length,
    edgesCount: allEdges.length,
  };
}

export function buildModeAwareDefaultView(limitOverride) {
  const limit = limitOverride ?? state.nodeSampleLimit;
  if (state.activeMode === "techniques") return buildTechniqueFocusedView(limit);
  const targetType = MODE_NODE_TYPES[state.activeMode];
  if (state.activeMode === "attack" || !targetType) return buildAttackDefaultView(limit);
  return buildContextDefaultView(targetType, limit);
}

const CONTEXT_OVERLAY_CONFIG = [
  { nodeType: "group", edgeTypes: ["group-technique", "uses"], perTechnique: 2 },
  { nodeType: "malware", edgeTypes: ["malware-technique", "uses"], perTechnique: 2 },
  { nodeType: "campaign", edgeTypes: ["campaign-technique"], perTechnique: 2 },
  { nodeType: "procedure", edgeTypes: ["procedure-technique"], perTechnique: 1 },
];

function buildContextOverlays({ techniqueIds, nodeIds, nodeElements, limit }) {
  if (!techniqueIds.size || !state.graphDataExtended) return [];
  const overlayEdges = [];
  const maxNewNodes = Math.max(2, Math.floor(limit * 0.4));
  let nodesAdded = 0;
  CONTEXT_OVERLAY_CONFIG.forEach(config => {
    if (nodesAdded >= maxNewNodes) return;
    const perTypeCap = Math.max(1, Math.floor(maxNewNodes / CONTEXT_OVERLAY_CONFIG.length));
    let perTypeAdded = 0;
    const perTechniqueCounts = new Map();
    state.graphDataRef.edges.forEach(edge => {
      if (nodesAdded >= maxNewNodes || perTypeAdded >= perTypeCap) return;
      if (!config.edgeTypes.includes(edge.type)) return;
      if (!techniqueIds.has(edge.target)) return;
      const contextNode = state.nodeMap[edge.source] || state.allNodeMap[edge.source];
      if (!contextNode || contextNode.node_type !== config.nodeType) return;
      const used = perTechniqueCounts.get(edge.target) || 0;
      if (used >= config.perTechnique) return;
      if (!nodeIds.has(contextNode.id)) {
        nodeElements.push(buildNodeElement(contextNode));
        nodeIds.add(contextNode.id);
        nodesAdded += 1;
        perTypeAdded += 1;
        if (nodesAdded >= maxNewNodes) return;
      }
      perTechniqueCounts.set(edge.target, used + 1);
      overlayEdges.push(buildEdgeElement(edge));
    });
  });
  return overlayEdges;
}


// --- Rendering ---

export function renderElements(elements, statusText, options = {}) {
  if (!state.cy) return;
  const { layoutOverrides = null, selectedId = null, preservePositions = false, viewKey = null } = options;

  // Resolve effective view key: explicit option > activeViewKey declared before this call
  const effectiveViewKey = viewKey || activeViewKey;
  activeViewKey = null; // consume it

  // Helper: apply cached or previous positions to the current graph, place new nodes near neighbors
  function applyPositions(knownPositions, fallbackPan) {
    const nodesNeedingPlacement = [];
    const jitter = () => Math.random() * 24 - 12;
    state.cy.nodes().forEach(node => {
      const stored = knownPositions[node.id()];
      if (stored) {
        node.position(stored);
      } else {
        nodesNeedingPlacement.push(node);
      }
    });
    nodesNeedingPlacement.forEach(node => {
      const anchoredPositions = [];
      node.connectedEdges().forEach(edge => {
        const neighborId = edge.data("source") === node.id() ? edge.data("target") : edge.data("source");
        if (neighborId && knownPositions[neighborId]) anchoredPositions.push(knownPositions[neighborId]);
      });
      if (anchoredPositions.length) {
        const avg = anchoredPositions.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
        node.position({ x: avg.x / anchoredPositions.length + jitter(), y: avg.y / anchoredPositions.length + jitter() });
      } else {
        node.position({ x: -(fallbackPan?.x ?? 0) + jitter(), y: -(fallbackPan?.y ?? 0) + jitter() });
      }
    });
  }

  // --- Branch 1: preservePositions (filter/mode change keeping current layout) ---
  if (preservePositions) {
    const previousPositions = {};
    state.cy.nodes().forEach(node => { previousPositions[node.id()] = { ...node.position() }; });
    const previousPan  = { ...state.cy.pan() };
    const previousZoom = state.cy.zoom();

    const nodeElementMap = new Map();
    const edgeElementMap = new Map();
    elements.forEach(el => {
      if (!el?.data) return;
      if (el.data.source === undefined && el.data.target === undefined) nodeElementMap.set(el.data.id, el);
      else edgeElementMap.set(el.data.id, el);
    });

    state.cy.batch(() => {
      const retainedNodeIds = new Set();
      const nodesToRemove = [];
      state.cy.nodes().forEach(node => {
        const tmpl = nodeElementMap.get(node.id());
        if (!tmpl) { nodesToRemove.push(node); return; }
        retainedNodeIds.add(node.id());
        node.data({ ...tmpl.data });
      });
      nodesToRemove.forEach(n => n.remove());

      nodeElementMap.forEach((el, id) => {
        if (!retainedNodeIds.has(id)) state.cy.add(el);
      });

      const edgesToRemove = [];
      state.cy.edges().forEach(edge => {
        const tmpl = edgeElementMap.get(edge.id());
        if (!tmpl) { edgesToRemove.push(edge); return; }
        edge.data({ ...tmpl.data });
      });
      edgesToRemove.forEach(e => e.remove());
      edgeElementMap.forEach((el, id) => {
        if (!state.cy.getElementById(id).length) state.cy.add(el);
      });

      applyPositions(previousPositions, previousPan);
      state.cy.zoom(previousZoom);
      state.cy.pan(previousPan);
      state.cy.elements().removeClass("selected-node");
      if (selectedId) {
        const sel = state.cy.getElementById(selectedId);
        if (sel?.length) {
          sel.addClass("selected-node");
          state.cy.animate({ center: { eles: sel }, zoom: Math.min(1.6, Math.max(0.6, state.cy.zoom())) }, { duration: 400, easing: "ease-out" });
        }
      }
    });
    // Update cache for this view (positions may have shifted slightly)
    if (effectiveViewKey) savePositionsToCache(effectiveViewKey);
    updateStatusChipText(statusText);
    return;
  }

  // --- Branch 2: cached positions available for this view key ---
  const cached = effectiveViewKey ? positionCache.get(effectiveViewKey) : null;
  if (cached) {
    state.cy.elements().remove();
    state.cy.add(elements);
    state.cy.nodes().unselectify();
    if (!elements.length) { updateStatusChipText(statusText); return; }

    state.cy.batch(() => {
      applyPositions(cached.positions, cached.pan);
      state.cy.zoom(cached.zoom);
      state.cy.pan(cached.pan);
      state.cy.elements().removeClass("selected-node");
      if (selectedId) {
        const sel = state.cy.getElementById(selectedId);
        if (sel?.length) {
          sel.addClass("selected-node");
          state.cy.animate({ center: { eles: sel }, zoom: Math.min(1.6, Math.max(0.6, state.cy.zoom())) }, { duration: 400, easing: "ease-out" });
        }
      }
    });
    updateStatusChipText(statusText);
    return;
  }

  // --- Branch 3: fresh layout (no cache yet) ---
  state.cy.elements().remove();
  state.cy.add(elements);
  state.cy.nodes().unselectify();
  if (!elements.length) { updateStatusChipText(statusText); return; }

  // If layoutOverrides specifies a different layout engine (e.g. "grid" vs current preset "cose"),
  // use it standalone — don't merge with preset options that belong to a different engine.
  const currentPresetName = (LAYOUT_PRESETS[state.activeLayoutPreset] || LAYOUT_PRESETS.cose).name;
  const layoutOptions = (layoutOverrides && layoutOverrides.name && layoutOverrides.name !== currentPresetName)
    ? layoutOverrides
    : getLayoutOptions(layoutOverrides || {});
  const fitPadding = elements.length <= 6 ? 20 : 60;

  state.cy.one("layoutstop", () => {
    if (selectedId) {
      const selected = state.cy.getElementById(selectedId);
      if (selected?.length) {
        selected.addClass("selected-node");
        state.cy.animate(
          { center: { eles: selected }, zoom: Math.min(1.6, Math.max(0.6, state.cy.zoom())) },
          { duration: 500, easing: "ease-out" }
        );
      }
    } else {
      // Fit immediately then animate for smoothness
      state.cy.fit(state.cy.elements(), fitPadding);
      state.cy.animate(
        { fit: { eles: state.cy.elements(), padding: fitPadding } },
        { duration: 400, easing: "ease-in-out" }
      );
    }
    // Save positions after animation settles
    if (effectiveViewKey) {
      setTimeout(() => savePositionsToCache(effectiveViewKey), 600);
    }
  });

  state.cy.layout(layoutOptions).run();
  updateStatusChipText(statusText);
}

export function highlightWithinCurrentView(nodeId) {
  if (!state.cy) return;
  state.cy.elements().removeClass("faded selected-node connected-node highlighted-edge");
  const node = state.cy.getElementById(nodeId);
  if (!node || node.empty()) return;
  node.addClass("selected-node");
  const connectedEdges = node.connectedEdges();
  const connectedNodes = node.connectedNodes().difference(node);
  connectedEdges.addClass("highlighted-edge");
  connectedNodes.addClass("connected-node");
  state.cy.animate(
    { center: { eles: node }, zoom: Math.min(1.6, Math.max(0.6, state.cy.zoom())) },
    { duration: 450, easing: "ease-out" }
  );
}

function clearGraphSelection() {
  if (!state.cy) return;
  state.cy.elements().removeClass("faded selected-node connected-node highlighted-edge");
  hideNodeInfoCard();
}

// --- Focus / Navigation ---

export function focusNodeById(nodeId, options = {}) {
  const { forceExpand = false } = options;
  let matchedNode = state.nodeMap[nodeId];
  if (!matchedNode && state.allNodeMap[nodeId]) {
    setContextMode(true, { skipReset: true });
    matchedNode = state.nodeMap[nodeId];
  }
  if (!matchedNode) return;

  // Don't auto-open the details panel — info card handles disclosure
  state.detailsPanelManuallyHidden = false;

  if (matchedNode.node_type === "tactic") {
    declareNavSnapshot('tactic', nodeId, nodeId);
    activeViewKey = makeViewKey('tactic', nodeId);
    const tacticView = buildTacticView(nodeId);
    renderElements(
      tacticView.elements,
      `Tactic view loaded. Nodes: ${tacticView.nodesCount}, Edges: ${tacticView.edgesCount}`,
      { selectedId: nodeId }
    );
    renderTacticDetails(matchedNode, nodeId, { openPanel: false });
    showNodeInfoCard(matchedNode, nodeId, () => renderTacticDetails(matchedNode, nodeId));
    return;
  }

  if (["group", "malware", "campaign", "procedure"].includes(matchedNode.node_type) && !state.useContextEntities) {
    setContextMode(true, { skipReset: true });
    matchedNode = state.nodeMap[nodeId];
  }

  if (["group", "malware", "campaign", "procedure"].includes(matchedNode.node_type)) {
    declareNavSnapshot('contextEntity', nodeId, nodeId);
    activeViewKey = makeViewKey('contextEntity', nodeId);
    const derivedMode = NODE_TYPE_TO_MODE[matchedNode.node_type];
    if (derivedMode) setActiveMode(derivedMode, { skipReset: true });
    const contextView = buildContextEntityView(nodeId, matchedNode.node_type);
    if (contextView) {
      renderElements(
        contextView.elements,
        `${matchedNode.node_type.charAt(0).toUpperCase() + matchedNode.node_type.slice(1)} neighborhood loaded. Nodes: ${contextView.nodesCount}, Edges: ${contextView.edgesCount}`,
        { selectedId: nodeId }
      );
    }
    const renderFull = () => {
      if (matchedNode.node_type === "group") renderGroupDetails(matchedNode, nodeId);
      else if (matchedNode.node_type === "malware") renderMalwareDetails(matchedNode, nodeId);
      else if (matchedNode.node_type === "campaign") renderCampaignDetails(matchedNode, nodeId);
      else if (matchedNode.node_type === "procedure") renderProcedureDetails(matchedNode, nodeId);
    };
    // populate panel silently (no open), show card — full details only on button click
    if (matchedNode.node_type === "group") renderGroupDetails(matchedNode, nodeId, { openPanel: false });
    else if (matchedNode.node_type === "malware") renderMalwareDetails(matchedNode, nodeId, { openPanel: false });
    else if (matchedNode.node_type === "campaign") renderCampaignDetails(matchedNode, nodeId, { openPanel: false });
    else if (matchedNode.node_type === "procedure") renderProcedureDetails(matchedNode, nodeId, { openPanel: false });
    showNodeInfoCard(matchedNode, nodeId, renderFull);
    return;
  }

  if (!forceExpand && !state.useFullChain && matchedNode.node_type === "technique") {
    const nodeInGraph = state.cy && state.cy.getElementById(nodeId).length > 0;
    if (nodeInGraph) {
      // Determine the pivot of the current view so we can restore it on back
      const currentSnap = navHistory[navIndex];
      const pivotId = currentSnap ? currentSnap.pivotId : null;
      declareNavSnapshot('highlight', pivotId, nodeId);
      highlightWithinCurrentView(nodeId);
      showNodeInfoCard(matchedNode, nodeId, () => renderTechniqueDetails(matchedNode, nodeId, { openPanel: true }));
      return;
    }
    // Node not in current view — fall through to render a view containing it
  }

  if (matchedNode.is_subtechnique) {
    const parent = getParentTechnique(nodeId);
    const pivotId = parent ? parent.id : nodeId;
    declareNavSnapshot('techniqueExpanded', pivotId, nodeId);
    activeViewKey = makeViewKey('techniqueExpanded', pivotId);
    const expandedView = buildTechniqueExpandedView(pivotId);
    renderElements(
      expandedView.elements,
      `Technique expanded view loaded. Nodes: ${expandedView.nodesCount}, Edges: ${expandedView.edgesCount}`,
      { selectedId: nodeId }
    );
    renderTechniqueDetails(matchedNode, nodeId, { openPanel: false });
    showNodeInfoCard(matchedNode, nodeId, () => renderTechniqueDetails(matchedNode, nodeId, { openPanel: true }));
    return;
  }

  declareNavSnapshot('techniqueExpanded', nodeId, nodeId);
  activeViewKey = makeViewKey('techniqueExpanded', nodeId);
  const expandedView = buildTechniqueExpandedView(nodeId);
  renderElements(
    expandedView.elements,
    `Technique expanded view loaded. Nodes: ${expandedView.nodesCount}, Edges: ${expandedView.edgesCount}`,
    { selectedId: nodeId }
  );
  renderTechniqueDetails(matchedNode, nodeId, { openPanel: false });
  showNodeInfoCard(matchedNode, nodeId, () => renderTechniqueDetails(matchedNode, nodeId, { openPanel: true }));
}

// --- Single-tap Preview (info card + highlight only, no navigation) ---

export function previewNodeById(nodeId) {
  const matchedNode = state.nodeMap[nodeId] || state.allNodeMap[nodeId];
  if (!matchedNode) return;

  // Highlight node in current view without navigating
  highlightWithinCurrentView(nodeId);

  // Show info card with a callback that opens full details on button press
  const openFull = () => focusNodeById(nodeId, { forceExpand: true });

  if (matchedNode.node_type === "tactic") {
    renderTacticDetails(matchedNode, nodeId, { openPanel: false });
    showNodeInfoCard(matchedNode, nodeId, () => renderTacticDetails(matchedNode, nodeId));
  } else if (matchedNode.node_type === "technique") {
    renderTechniqueDetails(matchedNode, nodeId, { openPanel: false });
    showNodeInfoCard(matchedNode, nodeId, () => renderTechniqueDetails(matchedNode, nodeId, { openPanel: true }));
  } else if (matchedNode.node_type === "group") {
    renderGroupDetails(matchedNode, nodeId, { openPanel: false });
    showNodeInfoCard(matchedNode, nodeId, openFull);
  } else if (matchedNode.node_type === "malware") {
    renderMalwareDetails(matchedNode, nodeId, { openPanel: false });
    showNodeInfoCard(matchedNode, nodeId, openFull);
  } else if (matchedNode.node_type === "campaign") {
    renderCampaignDetails(matchedNode, nodeId, { openPanel: false });
    showNodeInfoCard(matchedNode, nodeId, openFull);
  } else if (matchedNode.node_type === "procedure") {
    renderProcedureDetails(matchedNode, nodeId, { openPanel: false });
    showNodeInfoCard(matchedNode, nodeId, openFull);
  } else {
    showNodeInfoCard(matchedNode, nodeId, openFull);
  }
}

// --- Mode / Context Switching ---

export function setContextMode(enable, options = {}) {
  if (!state.graphDataExtended) return;
  const { skipReset = false } = options;
  if (state.useContextEntities === enable) {
    updateModeTabsUI();
    if (!skipReset) resetToDefaultView();
    return;
  }
  state.useContextEntities = enable;
  state.graphDataRef = state.useContextEntities ? state.graphDataExtended : state.graphDataCore;
  hydrateNodeMap(state.graphDataRef);
  updateModeTabsUI();
  if (!skipReset) resetToDefaultView();
}

export function setActiveMode(mode, options = {}) {
  const { skipReset = false } = options;
  const isWorkflowMode = mode === "workflow";
  const isContextGraphMode = Boolean(MODE_NODE_TYPES[mode]);
  const isAttackMode = mode === "attack";
  const isTechniqueMode = mode === "techniques";
  if (!isWorkflowMode && !isAttackMode && !isTechniqueMode && !isContextGraphMode) return;
  if (isContextGraphMode && !state.graphDataExtended) return;

  state.activeMode = mode;
  updateModeTabsUI();
  syncWorkspaceViewForMode();

  if (isContextGraphMode && !state.useContextEntities) {
    setContextMode(true, { skipReset: true });
  }

  const dataReady = Boolean(state.graphDataRef?.nodes && state.graphDataRef?.edges);
  if (!dataReady) return;

  if (isWorkflowMode) {
    if (!skipReset) {
      // Dynamic import to break circular dependency at module init time
      import("./workflowEngine.js?v=46").then(({ renderWorkflowView }) => renderWorkflowView());
    }
    return;
  }

  if (!skipReset) resetToDefaultView();
}

export function resetToDefaultView(options = {}) {
  const { preservePositions = false } = options;
  if (!state.graphDataRef?.nodes || !state.graphDataRef?.edges) return;
  if (state.activeMode === "workflow") {
    if (!preservePositions) {
      state.activeWorkflowTechniqueId = null;
      const searchInput = document.getElementById("search");
      if (searchInput) searchInput.value = "";
    }
    import("./workflowEngine.js?v=46").then(({ renderWorkflowView }) => renderWorkflowView());
    return;
  }
  declareNavSnapshot('default', null, null);
  activeViewKey = makeViewKey('default', `${state.activeMode !== 'attack' ? state.activeMode : 'attack'}:${state.activeDomainFilter || 'enterprise-attack'}:sort-${state.activeSortOrder}`);
  const view = buildModeAwareDefaultView();
  const domainLabel = state.activeDomainFilter === "enterprise-attack" ? "Enterprise"
    : state.activeDomainFilter === "mobile-attack" ? "Mobile"
    : state.activeDomainFilter === "ics-attack" ? "ICS" : "";
  const baseLabel =
    state.activeMode === "attack" ? `${domainLabel} tactics overview` : `${getModeLabel()} spotlight view`;
  const statusText =
    view.nodesCount > 0
      ? `${baseLabel} loaded. Nodes: ${view.nodesCount}, Edges: ${view.edgesCount}`
      : "No nodes match the current filter combination.";
  // Overview default view (attack / group / malware / campaign / procedure modes with no connections):
  // manually place disconnected nodes in a grid. On reset, reuse cached positions so layout is stable.
  const isOverviewMode = !preservePositions && view.elements.length && view.edgesCount === 0;
  if (isOverviewMode) {
    const capturedViewKey = activeViewKey;
    activeViewKey = null; // consume

    // Validate that cached positions are actually spread out (not all stacked).
    // If nodes all ended up at the same spot on a previous run the cache entry is bad — evict it.
    const _cacheRaw = capturedViewKey ? positionCache.get(capturedViewKey) : null;
    const _cacheIsSpread = (() => {
      if (!_cacheRaw) return false;
      const vals = Object.values(_cacheRaw.positions || {});
      if (vals.length < 2) return true;
      const xs = vals.map(p => p.x), ys = vals.map(p => p.y);
      return (Math.max(...xs) - Math.min(...xs)) > 120 ||
             (Math.max(...ys) - Math.min(...ys)) > 120;
    })();
    if (_cacheRaw && !_cacheIsSpread) positionCache.delete(capturedViewKey); // evict bad entry
    const cachedView = _cacheIsSpread ? _cacheRaw : null;

    // If we already laid out this view with valid positions, restore from cache
    if (cachedView) {
      state.cy.elements().remove();
      state.cy.add(view.elements);
      state.cy.nodes().unselectify();
      state.cy.elements().removeClass("selected-node faded highlighted-edge connected-node");
      state.cy.batch(() => {
        state.cy.nodes().forEach(node => {
          const pos = cachedView.positions[node.id()];
          if (pos) node.position(pos);
        });
        state.cy.zoom(cachedView.zoom);
        state.cy.pan(cachedView.pan);
      });
      updateStatusChipText(statusText);
      closeDetailsPanel();
      const searchInput = document.getElementById("search");
      if (searchInput) searchInput.value = "";
      return;
    }

    // Fresh grid layout — use a two-frame delay so the canvas has correct dimensions
    const doGridLayout = (vk) => {
      state.cy.elements().remove();
      state.cy.add(view.elements);
      state.cy.nodes().unselectify();
      state.cy.elements().removeClass("selected-node faded highlighted-edge connected-node");

      const cyEl = document.getElementById("cy");
      // Use clientWidth/Height; fallback to window dimensions minus sidebar
      const rawW = (cyEl && cyEl.clientWidth > 50) ? cyEl.clientWidth : (window.innerWidth - 280);
      const rawH = (cyEl && cyEl.clientHeight > 50) ? cyEl.clientHeight : (window.innerHeight - 80);
      const W = rawW - 80;
      const H = rawH - 60;
      const n = state.cy.nodes().length;
      const cols = Math.max(1, Math.ceil(Math.sqrt(n * (W / Math.max(H, 1)))));
      const rows = Math.ceil(n / cols);
      const spacingX = Math.max(200, W / cols);
      const spacingY = Math.max(120, H / Math.max(rows, 1));
      const startX = spacingX * 0.5 + 40;
      const startY = spacingY * 0.5 + 40;

      state.cy.nodes().forEach((node, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        node.position({ x: startX + col * spacingX, y: startY + row * spacingY });
      });

      requestAnimationFrame(() => {
        state.cy.fit(state.cy.elements(), 60);
        // Save after fit so zoom/pan are correct
        setTimeout(() => { if (vk) savePositionsToCache(vk); }, 200);
      });
    };

    // Give the DOM time to settle — first try after two rAFs, then confirm canvas has real
    // dimensions; if still zero (panel transition in progress) retry with a short timeout.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById("cy");
      if (el && el.clientWidth > 50) {
        doGridLayout(capturedViewKey);
      } else {
        setTimeout(() => doGridLayout(capturedViewKey), 120);
      }
    }));

    updateStatusChipText(statusText);
    closeDetailsPanel();
    const searchInput = document.getElementById("search");
    if (searchInput) searchInput.value = "";
    return;
  }

  renderElements(view.elements, statusText, { preservePositions });
  if (!preservePositions) {
    closeDetailsPanel();
    const searchInput = document.getElementById("search");
    if (searchInput) searchInput.value = "";
  }
}

// --- Cytoscape Style Definition ---

export function getCytoscapeStyle() {
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "font-family": "Open Sans, Segoe UI, system-ui, sans-serif",
        "font-size": "11px",
        "font-weight": "600",
        "text-wrap": "wrap",
        "text-max-width": "150px",
        width: 38,
        height: 38,
        "background-color": "#1a72d4",
        color: "#ffffff",
        "text-outline-width": 2,
        "text-outline-color": "rgba(5, 12, 28, 0.65)",
        "border-width": 2,
        "border-color": "rgba(255, 255, 255, 0.35)",
        "shadow-blur": 14,
        "shadow-color": "rgba(0, 0, 0, 0.35)",
        "transition-property": "background-color, width, height, border-width, opacity",
        "transition-duration": "250ms",
      },
    },
    {
      selector: 'node[node_type = "tactic"]',
      style: {
        "background-color": "#0e7490",   // deep teal — distinct from all other node types
        shape: "round-rectangle",
        width: 56,
        height: 34,
        "font-size": "11px",
        "border-color": "rgba(0, 0, 0, 0.25)",
        "border-width": 1,
      },
    },
    {
      selector: 'node[node_type = "technique"][is_subtechnique = false]',
      style: { "background-color": "#1a72d4", "border-color": "rgba(26, 114, 212, 0.9)" },
    },
    {
      selector: 'node[node_type = "technique"][is_subtechnique = true]',
      style: { "background-color": "#4f9fdc", "border-color": "rgba(79, 159, 220, 0.9)" },
    },
    {
      selector: 'node[node_type = "technique"][is_subtechnique = false]',
      style: { "border-width": 3 },
    },
    {
      selector: 'node[node_type = "group"]',
      style: {
        "background-color": "#b5245e",   // vivid magenta-red — clearly different from amber tactic
        shape: "round-rectangle",
        width: 46,
        height: 32,
        "border-color": "rgba(255, 160, 200, 0.40)",
      },
    },
    {
      selector: 'node[node_type = "malware"]',
      style: {
        "background-color": "#2e9e6a",
        shape: "round-rectangle",
        width: 46,
        height: 32,
        "border-color": "rgba(255, 255, 255, 0.35)",
      },
    },
    {
      selector: 'node[node_type = "campaign"]',
      style: {
        "background-color": "#8855cc",
        shape: "round-rectangle",
        width: 46,
        height: 32,
        "border-color": "rgba(255, 255, 255, 0.35)",
      },
    },
    {
      selector: 'node[node_type = "procedure"]',
      style: {
        "background-color": "#90a4ae",
        shape: "diamond",
        width: 40,
        height: 40,
        "border-color": "rgba(255, 255, 255, 0.4)",
      },
    },
    {
      selector: 'node[context_state = "highlight"]',
      style: {
        "border-width": 4,
        "border-color": "#f5f5f5",
        "shadow-blur": 24,
        "shadow-color": "rgba(0, 201, 255, 0.6)",
      },
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": "rgba(255, 255, 255, 0.18)",
        "target-arrow-color": "rgba(255, 255, 255, 0.25)",
        "curve-style": "straight",
        "arrow-scale": 0.8,
        "line-cap": "round",
        "target-arrow-shape": "triangle",
        "transition-property": "line-color, width, opacity",
        "transition-duration": "200ms",
      },
    },
    {
      selector: 'edge[type = "tactic-technique"]',
      style: {
        width: 3,
        "line-color": "rgba(198, 63, 31, 0.8)",
        "target-arrow-color": "rgba(198, 63, 31, 0.9)",
        opacity: 0.85,
      },
    },
    {
      selector: 'edge[type = "contains-subtechnique"]',
      style: {
        width: 3,
        "line-color": "rgba(79, 159, 220, 0.9)",
        "target-arrow-color": "rgba(79, 159, 220, 0.9)",
        "line-style": "dashed",
        opacity: 1,
      },
    },
    {
      selector: 'edge[type = "subtechnique-of"]',
      style: {
        width: 3,
        "line-color": "rgba(79, 124, 172, 0.65)",
        "target-arrow-color": "rgba(79, 124, 172, 0.75)",
        opacity: 0.9,
      },
    },
    {
      // "uses" covers group/malware/campaign→technique in CSV-converted data
      selector: 'edge[type = "uses"]',
      style: {
        "line-color": "rgba(200, 120, 40, 0.85)",
        "target-arrow-color": "rgba(200, 120, 40, 0.85)",
        width: 2.5,
        "line-style": "solid",
      },
    },
    {
      selector: 'edge[type = "group-technique"]',
      style: {
        "line-color": "rgba(181, 36, 94, 0.9)",
        "target-arrow-color": "rgba(181, 36, 94, 0.9)",
        width: 3,
      },
    },
    {
      selector: 'edge[type = "malware-technique"]',
      style: {
        "line-color": "rgba(46, 158, 106, 0.9)",
        "target-arrow-color": "rgba(46, 158, 106, 0.9)",
        width: 3,
      },
    },
    {
      selector: 'edge[type = "campaign-technique"]',
      style: {
        "line-color": "rgba(136, 85, 204, 0.9)",
        "target-arrow-color": "rgba(136, 85, 204, 0.9)",
        width: 3,
      },
    },
    {
      selector: 'edge[type = "campaign-group"]',
      style: {
        "line-color": "rgba(160, 50, 50, 0.55)",
        "target-arrow-color": "rgba(160, 50, 50, 0.55)",
        "line-style": "dotted",
        width: 2,
      },
    },
    {
      selector: 'edge[type = "campaign-malware"]',
      style: {
        "line-color": "rgba(46, 158, 106, 0.65)",
        "target-arrow-color": "rgba(46, 158, 106, 0.65)",
        "line-style": "dotted",
        width: 2,
      },
    },
    {
      selector: 'edge[type = "procedure-technique"]',
      style: {
        "line-color": "rgba(144, 164, 174, 0.85)",
        "target-arrow-color": "rgba(144, 164, 174, 0.95)",
        "line-style": "dashed",
      },
    },
    {
      selector:
        'edge[type = "procedure-group"], edge[type = "procedure-malware"], edge[type = "procedure-campaign"]',
      style: {
        "line-color": "rgba(255, 255, 255, 0.45)",
        "target-arrow-color": "rgba(255, 255, 255, 0.55)",
        "line-style": "dashed",
      },
    },
    { selector: ".faded", style: { opacity: 0.12 } },
    {
      selector: ".selected-node",
      style: {
        // Visible on both light and dark backgrounds:
        // thick yellow ring + dark shadow for contrast
        "border-width": 4,
        "border-color": "#facc15",          // vivid yellow — stands out on any bg
        "shadow-blur": 16,
        "shadow-color": "rgba(0, 0, 0, 0.55)",
        "shadow-offset-x": 0,
        "shadow-offset-y": 2,
      },
    },
    {
      selector: ".connected-node",
      style: { "background-color": "#0156b3", width: 40, height: 40 },
    },
    {
      selector: ".highlighted-edge",
      style: {
        "line-color": "#0156b3",
        "target-arrow-color": "#0156b3",
        width: 5,
        opacity: 1,
      },
    },
  ];
}

// --- Cytoscape Initialization ---

export function initCytoscape(initialElements) {
  state.cy = cytoscape({
    container: document.getElementById("cy"),
    elements: initialElements,
    style: getCytoscapeStyle(),
    layout: getLayoutOptions(),
    minZoom: 0.25,
    maxZoom: 3,
    selectionType: "single",   // prevent multi-select box
    autoungrabify: false,
  });

  // Prevent Cytoscape's native click-to-select blue ring — we use our own selected-node class
  state.cy.nodes().unselectify();

  // Minimap is initialized lazily on first renderElements call (graph stage may be hidden at boot)

  let lastTappedNodeId = null;
  let tapTimeoutId = null;
  const DOUBLE_TAP_THRESHOLD = 350;

  state.cy.on("tap", "node", function (evt) {
    const nodeId = evt.target.id();

    // Double-tap → navigate into node (drill-down / expand)
    if (tapTimeoutId && lastTappedNodeId === nodeId) {
      clearTimeout(tapTimeoutId);
      tapTimeoutId = null;
      lastTappedNodeId = null;
      focusNodeById(nodeId, { forceExpand: true });
      return;
    }

    // Single-tap → preview only (info card + highlight, no navigation)
    lastTappedNodeId = nodeId;
    tapTimeoutId = setTimeout(() => {
      tapTimeoutId = null;
      lastTappedNodeId = null;
      previewNodeById(nodeId);
    }, DOUBLE_TAP_THRESHOLD);
  });

  state.cy.on("tap", function (evt) {
    if (evt.target === state.cy) {
      clearGraphSelection();
      closeDetailsPanel({ manual: true });
    }
  });

  return state.cy;
}
