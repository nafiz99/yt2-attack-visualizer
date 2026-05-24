// modules/workflowEngine.js
// Workflow mode: kill chain analysis, neighbor graph building, timeline rendering.

import {
  state,
  WORKFLOW_TACTIC_SEQUENCE,
} from "./state.js";

// --- Domain-aware phase helpers ---

/** Returns only the phases that belong to the currently active domain. */
function getActiveDomainSequence() {
  const domain = state.activeDomainFilter || "enterprise-attack";
  return WORKFLOW_TACTIC_SEQUENCE.filter(p => p.domain === domain);
}

/**
 * Returns a shortname → phase map for the active domain only.
 * Each phase carries a `localIndex` (0-based position within that domain's sequence).
 */
function getActiveDomainPhaseLookup() {
  const seq = getActiveDomainSequence();
  const lookup = {};
  seq.forEach((p, i) => {
    if (!lookup[p.shortname]) lookup[p.shortname] = { ...p, localIndex: i };
  });
  return lookup;
}

/** Clear the per-technique phase cache — must be called whenever the active domain changes. */
export function clearTechniquePhaseLookup() {
  Object.keys(state.techniquePhaseLookup).forEach(k => delete state.techniquePhaseLookup[k]);
}
import { setIconButtonLabel, updateStatusChipText } from "./ui.js";
import { getTacticsForTechnique } from "./graphQueries.js";
import {
  openDetailsPanel,
  closeDetailsPanel,
  resetDetailsPanelContent,
  renderTechniqueDetails,
  buildWorkflowContextChips,
  getTechniqueContextCounts,
  summarizeContextCounts,
  summarizeEntitySupport,
} from "./detailsPanel.js?v=39";
// setActiveMode is imported from graphRenderer — circular but safe (only called inside functions)
import { setActiveMode } from "./graphRenderer.js?v=67";

const RECENT_ANCHORS_KEY = "yt2_recent_anchors";
const RECENT_ANCHORS_MAX = 8;

// --- DOM References ---
const workflowPanel = document.getElementById("workflowPanel");
const workflowTimeline = document.getElementById("workflowPhaseTimeline");
const workflowPhaseList = document.getElementById("workflowPhaseList");
const workflowAnchorDetails = document.getElementById("workflowAnchorDetails");
const workflowEmptyState = document.getElementById("workflowEmptyState");
const workflowPhasePlaceholder = document.getElementById("workflowPhasePlaceholder");
const workflowTimelineToggleButton = document.getElementById("workflowTimelineToggle");

// --- Recent Anchors ---

function loadRecentAnchors() {
  try { return JSON.parse(localStorage.getItem(RECENT_ANCHORS_KEY) || "[]"); }
  catch { return []; }
}

function saveRecentAnchor(techId) {
  const technique = state.techniqueMap[techId];
  if (!technique) return;
  const prev = loadRecentAnchors().filter(a => a.techId !== techId);
  const next = [{ techId, name: technique.name, attack_id: technique.attack_id || "" }, ...prev]
    .slice(0, RECENT_ANCHORS_MAX);
  try { localStorage.setItem(RECENT_ANCHORS_KEY, JSON.stringify(next)); } catch {}
  renderRecentAnchors();
}

export function renderRecentAnchors() {
  const container = document.getElementById("recentAnchorsList");
  const section = document.getElementById("recentAnchorsSection");
  if (!container) return;
  const anchors = loadRecentAnchors();
  if (!anchors.length) {
    section?.classList.add("is-hidden");
    return;
  }
  section?.classList.remove("is-hidden");
  container.innerHTML = anchors.map(a => `
    <div class="recent-anchor-wrap">
      <button class="recent-anchor-chip" type="button"
              data-recent-anchor-id="${a.techId}"
              title="${a.name}">
        <span class="recent-id">${a.attack_id}</span>
        <span class="recent-name">${a.name}</span>
      </button>
      <button class="recent-anchor-remove" type="button"
              data-remove-anchor-id="${a.techId}"
              aria-label="Remove ${a.name} from recent"
              title="Remove">
        <span class="material-symbols-rounded" aria-hidden="true">close</span>
      </button>
    </div>
  `).join("");

  // Remove-chip handler
  container.querySelectorAll(".recent-anchor-remove").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.dataset.removeAnchorId;
      const updated = loadRecentAnchors().filter(a => a.techId !== id);
      try { localStorage.setItem(RECENT_ANCHORS_KEY, JSON.stringify(updated)); } catch {}
      renderRecentAnchors();
    });
  });
}

// --- Tactic Metadata Hydration ---

export function hydrateWorkflowTacticMetadata() {
  WORKFLOW_TACTIC_SEQUENCE.forEach(phase => {
    // Try to find a tactic record that matches both shortname and domain;
    // fall back to shortname-only match for backwards compatibility.
    const allTactics = Object.values(state.tacticMap);
    const tacticRecord =
      allTactics.find(t => t.shortname === phase.shortname && (t.domains || []).includes(phase.domain)) ||
      state.tacticShortnameMap[phase.shortname];
    if (tacticRecord) {
      phase.tactic_id  = tacticRecord.stix_id;
      phase.attack_id  = tacticRecord.attack_id;
      phase.description= tacticRecord.description;
      phase.label      = tacticRecord.name || phase.label;
    }
  });
}

// --- Sub-technique Parent Lookup ---

export function buildSubtechParentLookup(sourceGraph) {
  Object.keys(state.subtechParentLookup).forEach(key => delete state.subtechParentLookup[key]);
  if (!sourceGraph || !Array.isArray(sourceGraph.edges)) return;
  sourceGraph.edges.forEach(edge => {
    if (edge.type === "subtechnique-of") {
      state.subtechParentLookup[edge.source] = edge.target;
    }
  });
}

// --- Phase Info ---

export function getTechniquePhaseInfo(techId, depth = 0) {
  if (!techId) return { phases: [], primaryIndex: null };
  if (state.techniquePhaseLookup[techId]) return state.techniquePhaseLookup[techId];

  const technique = state.techniqueMap[techId];
  if (!technique) {
    state.techniquePhaseLookup[techId] = { phases: [], primaryIndex: null };
    return state.techniquePhaseLookup[techId];
  }

  const domainLookup = getActiveDomainPhaseLookup();

  const rawPhases = (technique.kill_chain_phases || [])
    .map(phase => (phase.phase_name || "").toLowerCase())
    .filter(Boolean)
    .map(name => domainLookup[name])
    .filter(Boolean)
    .sort((a, b) => a.localIndex - b.localIndex);

  let phases = rawPhases;
  if (!phases.length && technique.is_subtechnique && depth < 3) {
    const parentId = state.subtechParentLookup[techId];
    if (parentId) phases = getTechniquePhaseInfo(parentId, depth + 1).phases;
  }

  if (!phases.length) {
    const tacticNodes = getTacticsForTechnique(techId);
    phases = (tacticNodes || [])
      .map(node => (node && node.shortname ? domainLookup[node.shortname] : null))
      .filter(Boolean)
      .sort((a, b) => a.localIndex - b.localIndex);
  }

  const dedupedPhases = [];
  const seen = new Set();
  phases.forEach(phase => {
    if (!phase || seen.has(phase.shortname)) return;
    seen.add(phase.shortname);
    dedupedPhases.push(phase);
  });

  const info = {
    phases: dedupedPhases,
    primaryIndex: dedupedPhases.length ? dedupedPhases[0].index : null,
  };
  state.techniquePhaseLookup[techId] = info;
  return info;
}

// --- Workflow Technique Index ---

export function ensureWorkflowTechnique(techId) {
  const phaseInfo = getTechniquePhaseInfo(techId);
  if (!state.workflowTechniqueIndex[techId]) {
    state.workflowTechniqueIndex[techId] = {
      phases: phaseInfo.phases,
      primaryIndex: phaseInfo.primaryIndex,
      predecessors: {},
      successors: {},
      parallels: {},
    };
  } else {
    state.workflowTechniqueIndex[techId].phases = phaseInfo.phases;
    state.workflowTechniqueIndex[techId].primaryIndex = phaseInfo.primaryIndex;
  }
  return state.workflowTechniqueIndex[techId];
}

// --- Phase Technique Catalog ---

export function buildPhaseTechniqueCatalog() {
  Object.keys(state.phaseTechniqueCatalog).forEach(key => {
    state.phaseTechniqueCatalog[key] = [];
  });
  Object.keys(state.techniqueMap).forEach(techId => {
    const info = getTechniquePhaseInfo(techId);
    if (!info.phases.length) return;
    info.phases.forEach(phase => {
      if (!state.phaseTechniqueCatalog[phase.shortname]) {
        state.phaseTechniqueCatalog[phase.shortname] = [];
      }
      if (!state.techniqueMap[techId].is_subtechnique) {
        state.phaseTechniqueCatalog[phase.shortname].push(techId);
      }
    });
    ensureWorkflowTechnique(techId);
  });
  Object.keys(state.phaseTechniqueCatalog).forEach(key => {
    const deduped = Array.from(new Set(state.phaseTechniqueCatalog[key] || []));
    deduped.sort((a, b) => {
      const nameA = (state.techniqueMap[a]?.name || "").toLowerCase();
      const nameB = (state.techniqueMap[b]?.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
    state.phaseTechniqueCatalog[key] = deduped;
  });
}

// --- Neighbor Graph ---

export function buildWorkflowNeighborGraph({ groups = [], malware = [], campaigns = [] }) {
  Object.values(state.workflowTechniqueIndex).forEach(entry => {
    entry.predecessors = {};
    entry.successors = {};
    entry.parallels = {};
  });
  const entityBuckets = [
    { type: "group", records: groups },
    { type: "malware", records: malware },
    { type: "campaign", records: campaigns },
  ];
  entityBuckets.forEach(bucket =>
    bucket.records.forEach(record => processEntityWorkflow(record, bucket.type))
  );
}

function processEntityWorkflow(record, entityType) {
  const rawList = (record.techniques || []).map(item => item.stix_id).filter(Boolean);
  const uniqueTechIds = Array.from(new Set(rawList));
  if (uniqueTechIds.length < 2) return;

  const orderedTechniques = uniqueTechIds
    .map(id => ({ techId: id, ...getTechniquePhaseInfo(id) }))
    .filter(item => item.primaryIndex !== null)
    .sort((a, b) => a.primaryIndex - b.primaryIndex || a.techId.localeCompare(b.techId));

  if (!orderedTechniques.length) return;

  const seenDirectional = new Set();
  const seenParallel = new Set();

  for (let i = 0; i < orderedTechniques.length; i++) {
    for (let j = i + 1; j < orderedTechniques.length; j++) {
      const current = orderedTechniques[i];
      const next = orderedTechniques[j];
      const delta = next.primaryIndex - current.primaryIndex;
      if (delta === 0) {
        const parallelKey = [current.techId, next.techId].sort().join("::");
        if (seenParallel.has(parallelKey)) continue;
        seenParallel.add(parallelKey);
        registerParallelWorkflowLink(current.techId, next.techId, entityType, record);
        continue;
      }
      const reach = state.workflowPhaseReach || 4;
      if (delta > 0 && delta <= reach) {
        const directionalKey = `${current.techId}->${next.techId}`;
        if (seenDirectional.has(directionalKey)) continue;
        seenDirectional.add(directionalKey);
        registerWorkflowLink(current.techId, next.techId, delta, entityType, record);
      }
    }
  }
}

function registerWorkflowLink(sourceId, targetId, phaseDelta, entityType, entityRecord) {
  const sourceEntry = ensureWorkflowTechnique(sourceId);
  const targetEntry = ensureWorkflowTechnique(targetId);
  const forwardBucket = getOrCreateNeighborBucket(sourceEntry.successors, targetId);
  forwardBucket.weight += 1;
  forwardBucket.phaseDeltas.add(phaseDelta);
  incrementEntitySupport(forwardBucket, entityType, entityRecord);
  const backwardBucket = getOrCreateNeighborBucket(targetEntry.predecessors, sourceId);
  backwardBucket.weight += 1;
  backwardBucket.phaseDeltas.add(phaseDelta);
  incrementEntitySupport(backwardBucket, entityType, entityRecord);
}

function registerParallelWorkflowLink(firstId, secondId, entityType, entityRecord) {
  const firstEntry = ensureWorkflowTechnique(firstId);
  const secondEntry = ensureWorkflowTechnique(secondId);
  const firstBucket = getOrCreateNeighborBucket(firstEntry.parallels, secondId);
  firstBucket.weight += 1;
  incrementEntitySupport(firstBucket, entityType, entityRecord);
  const secondBucket = getOrCreateNeighborBucket(secondEntry.parallels, firstId);
  secondBucket.weight += 1;
  incrementEntitySupport(secondBucket, entityType, entityRecord);
}

function getOrCreateNeighborBucket(collection, key) {
  if (!collection[key]) {
    collection[key] = {
      weight: 0,
      phaseDeltas: new Set(),
      entities: {
        group: { count: 0, samples: [] },
        malware: { count: 0, samples: [] },
        campaign: { count: 0, samples: [] },
      },
    };
  }
  return collection[key];
}

function incrementEntitySupport(bucket, entityType, entityRecord) {
  if (!bucket.entities[entityType]) {
    bucket.entities[entityType] = { count: 0, samples: [] };
  }
  bucket.entities[entityType].count += 1;
  if (entityRecord && entityRecord.name && bucket.entities[entityType].samples.length < 3) {
    bucket.entities[entityType].samples.push(entityRecord.name);
  }
}

// --- Workflow Anchor ---

export function setWorkflowAnchor(techId, options = {}) {
  if (!techId || !state.techniqueMap[techId]) return;
  state.activeWorkflowTechniqueId = techId;
  state.activeWorkflowPhaseIndex = null;
  state.workflowTimelineExpanded = false;
  state.activeActorId = null;
  state.actorPhaseMap = {};
  saveRecentAnchor(techId);
  // Sync actor select back to empty
  const actorSel = document.getElementById("wfActorSelect");
  if (actorSel && actorSel.value !== "") {
    actorSel.value = "";
    actorSel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (options.updateSearchInput !== false) {
    const searchInput = document.getElementById("search");
    if (searchInput) {
      const technique = state.techniqueMap[techId];
      searchInput.value = `${technique.attack_id || ""} ${technique.name || ""}`.trim();
    }
  }
  if (state.activeMode !== "workflow") {
    setActiveMode("workflow", { skipReset: true });
  }
  renderWorkflowView();
}

// --- Timeline ---

export function renderWorkflowTimeline(activePhases) {
  if (!workflowTimeline) return;
  // In actor mode, use the actor-specific timeline renderer
  if (state.activeActorId) {
    _renderActorTimeline(state.actorPhaseMap);
    return;
  }
  if (activePhases !== undefined) state.workflowTimelineHighlights = activePhases || [];
  const activeSet = new Set(state.workflowTimelineHighlights.map(phase => phase.shortname));
  const hasHighlights = activeSet.size > 0;
  const shouldShowFullChain = state.workflowTimelineExpanded || !hasHighlights;
  // Always restrict to the active domain so Enterprise/Mobile/ICS phases don't bleed into each other
  const domainSeq = getActiveDomainSequence();
  let phasesToRender = shouldShowFullChain
    ? domainSeq
    : domainSeq.filter(phase => activeSet.has(phase.shortname));
  if (!phasesToRender.length) phasesToRender = domainSeq;

  const markup = phasesToRender
    .map((phase, index) => {
      const isActive = activeSet.has(phase.shortname);
      const isSelected = state.activeWorkflowPhaseIndex === phase.index;
      const classes = ["timeline-phase"];
      if (isActive) classes.push("is-active");
      if (isSelected) classes.push("is-selected");
      // Use loop index (domain-local position) so numbering always starts at 01 per domain
      const number = String(index + 1).padStart(2, "0");
      const arrow =
        index < phasesToRender.length - 1
          ? `<span class="timeline-arrow" aria-hidden="true">
              <span class="material-symbols-rounded">arrow_forward</span>
            </span>`
          : "";
      return `
        <div class="timeline-item">
          <div
            class="${classes.join(" ")}"
            data-phase-index="${phase.index}"
            role="button"
            tabindex="0"
            aria-pressed="${isSelected ? "true" : "false"}"
          >
            <span class="timeline-phase-number">Phase ${number}</span>
            <span class="timeline-phase-label">${phase.label}</span>
          </div>
        </div>
        ${arrow}
      `;
    })
    .join("");
  workflowTimeline.innerHTML = markup;

  // Sync sidebar wfFullChainToggle select to match state
  const wfFullChainToggle = document.getElementById("wfFullChainToggle");
  if (wfFullChainToggle) {
    const nextVal = state.workflowTimelineExpanded ? "full" : "anchored";
    if (wfFullChainToggle.value !== nextVal) {
      wfFullChainToggle.value = nextVal;
      // Notify the custom chip-select wrapper to re-sync its trigger label
      wfFullChainToggle.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

function setTimelineVisibility(visible) {
  if (workflowTimeline) {
    if (!visible) workflowTimeline.innerHTML = "";
    workflowTimeline.classList.toggle("is-hidden", !visible);
  }
}

// --- Workflow View ---

export function renderWorkflowView() {
  if (!workflowPanel) return;
  const workflowActive = state.activeMode === "workflow";
  workflowPanel.classList.toggle("is-hidden", !workflowActive);
  if (!workflowActive) return;

  // Actor profile mode takes over the entire view
  if (state.activeActorId) {
    _renderActorProfileView();
    return;
  }

  const anchorId = state.activeWorkflowTechniqueId;
  const anchorTechnique = anchorId ? state.techniqueMap[anchorId] : null;
  const anchorEntry = anchorId ? ensureWorkflowTechnique(anchorId) : null;
  const highlightedPhases = anchorEntry && anchorEntry.phases ? anchorEntry.phases : [];
  setTimelineVisibility(Boolean(anchorTechnique));

  renderRecentAnchors();

  if (!anchorTechnique) {
    closeDetailsPanel();
    resetDetailsPanelContent();
    if (workflowAnchorDetails) workflowAnchorDetails.innerHTML = "";
    if (workflowPhaseList) {
      workflowPhaseList.innerHTML = "";
      workflowPhaseList.classList.add("is-hidden");
    }
    if (workflowPhasePlaceholder) workflowPhasePlaceholder.classList.add("is-hidden");
    if (workflowEmptyState) workflowEmptyState.classList.remove("is-hidden");
    updateStatusChipText("Workflow mode ready. Search a technique to begin.");
    return;
  }

  renderWorkflowTimeline(highlightedPhases);
  if (workflowEmptyState) workflowEmptyState.classList.add("is-hidden");
  if (workflowAnchorDetails) {
    workflowAnchorDetails.innerHTML = buildWorkflowAnchorCard(anchorTechnique);
  }

  const columns = buildWorkflowPhaseModel(anchorId, anchorEntry);
  state.workflowPhaseColumns = new Map();
  columns.forEach(column => {
    if (column && column.phase) state.workflowPhaseColumns.set(column.phase.index, column);
  });
  renderWorkflowPhaseDetails();

  // Refresh panel content if already open; never force-open it on filter/search changes
  const detailNodeId = anchorTechnique?.stix_id || anchorTechnique?.id;
  if (detailNodeId) renderTechniqueDetails(anchorTechnique, detailNodeId, { openPanel: state.isDetailsPanelOpen });
  updateStatusChipText(
    `Workflow anchored on ${anchorTechnique.attack_id || ""} ${anchorTechnique.name}`
  );
}

export function renderWorkflowPhaseDetails() {
  if (!workflowPhaseList) return;
  if (state.activeActorId) {
    _renderActorPhaseDetails(state.actorPhaseMap);
    _renderActorTimeline(state.actorPhaseMap);
    return;
  }
  const hasColumns = state.workflowPhaseColumns && state.workflowPhaseColumns.size;
  const hasSelection =
    Number.isFinite(state.activeWorkflowPhaseIndex) &&
    state.workflowPhaseColumns.has(state.activeWorkflowPhaseIndex);

  if (!hasColumns || !hasSelection) {
    workflowPhaseList.innerHTML = "";
    workflowPhaseList.classList.add("is-hidden");
    if (workflowPhasePlaceholder) workflowPhasePlaceholder.classList.remove("is-hidden");
    return;
  }

  const column = state.workflowPhaseColumns.get(state.activeWorkflowPhaseIndex);
  if (!column) {
    workflowPhaseList.innerHTML = "";
    workflowPhaseList.classList.add("is-hidden");
    if (workflowPhasePlaceholder) workflowPhasePlaceholder.classList.remove("is-hidden");
    return;
  }

  if (workflowPhasePlaceholder) workflowPhasePlaceholder.classList.add("is-hidden");
  workflowPhaseList.classList.remove("is-hidden");
  workflowPhaseList.innerHTML = renderWorkflowPhaseColumn(column);
}

// --- Phase Model ---

export function buildWorkflowPhaseModel(anchorId, anchorEntry) {
  anchorEntry = anchorEntry || ensureWorkflowTechnique(anchorId);
  const domainSeq = getActiveDomainSequence();

  let anchorPhases = anchorEntry.phases || [];
  if (!anchorPhases.length) {
    // Fall back to first phase in the active domain
    const fallbackPhase = domainSeq[0] || WORKFLOW_TACTIC_SEQUENCE[0];
    anchorPhases = fallbackPhase ? [fallbackPhase] : [];
    anchorEntry.phases = anchorPhases;
  }

  // Use localIndex (position within domain) for before/after comparisons
  const anchorLocalIndices = anchorPhases
    .map(p => (Number.isFinite(p.localIndex) ? p.localIndex : domainSeq.findIndex(d => d.shortname === p.shortname)))
    .filter(i => i >= 0);
  const minAnchor = anchorLocalIndices.length ? Math.min(...anchorLocalIndices) : 0;
  const anchorShortnames = new Set(anchorPhases.map(p => p.shortname));

  const neighbors = {
    predecessors: buildNeighborArray(anchorEntry.predecessors),
    successors: buildNeighborArray(anchorEntry.successors),
    parallels: buildNeighborArray(anchorEntry.parallels),
  };

  return domainSeq.map((phase, localIdx) => {
    const isAnchorPhase = anchorShortnames.has(phase.shortname);
    const state_ = isAnchorPhase ? "anchor" : localIdx < minAnchor ? "before" : "after";
    const column = {
      phase,
      state: state_,
      anchorTechniques: [],
      preceding: [],
      succeeding: [],
      parallels: [],
      fallback: [],
    };

    if (isAnchorPhase) {
      column.anchorTechniques.push(createTechniqueWorkflowModel(anchorId, "anchor"));
      column.parallels = neighbors.parallels
        .filter(item => item.phaseInfo.phases.some(p => p.shortname === phase.shortname))
        .slice(0, state.workflowCardLimit)
        .map(item => createTechniqueWorkflowModel(item.techId, "parallel", item.bucket))
        .filter(Boolean);
    }

    if (state_ === "before") {
      column.preceding = neighbors.predecessors
        .filter(item => item.phaseInfo.phases.some(p => p.shortname === phase.shortname))
        .slice(0, state.workflowCardLimit)
        .map(item => createTechniqueWorkflowModel(item.techId, "preceding", item.bucket))
        .filter(Boolean);
    }

    if (state_ === "after") {
      column.succeeding = neighbors.successors
        .filter(item => item.phaseInfo.phases.some(p => p.shortname === phase.shortname))
        .slice(0, state.workflowCardLimit)
        .map(item => createTechniqueWorkflowModel(item.techId, "succeeding", item.bucket))
        .filter(Boolean);
    }

    if (
      !column.anchorTechniques.length &&
      !column.preceding.length &&
      !column.succeeding.length &&
      !column.parallels.length
    ) {
      column.fallback = buildFallbackTechniques(phase.shortname, { exclude: new Set([anchorId]) });
    }

    return column;
  });
}

function buildNeighborArray(neighborMap = {}) {
  return Object.entries(neighborMap).map(([techId, bucket]) => ({
    techId,
    bucket,
    phaseInfo: getTechniquePhaseInfo(techId),
  }));
}

function createTechniqueWorkflowModel(techId, relation, bucket = null) {
  const technique = state.techniqueMap[techId];
  if (!technique) return null;
  return { techId, technique, relation, weight: bucket?.weight || 0, entities: bucket?.entities || {} };
}

function buildFallbackTechniques(phaseShortname, options = {}) {
  const exclude = options.exclude || new Set();
  const pool = state.phaseTechniqueCatalog[phaseShortname] || [];
  // Import getTechniqueUsageScore lazily to avoid circular issues
  return pool
    .filter(id => !exclude.has(id))
    .sort((a, b) => _getUsageScore(b) - _getUsageScore(a))
    .slice(0, state.workflowCardLimit)
    .map(id => createTechniqueWorkflowModel(id, "reference"))
    .filter(Boolean);
}

function _getUsageScore(techId) {
  const context = state.techniqueContextIndex[techId] || {};
  const g = (context.groups || []).length;
  const m = (context.malware || []).length;
  const c = (context.campaigns || []).length;
  const p = (context.procedures || []).length;
  return g * 4 + m * 3 + c * 2 + p + 1;
}

// --- Workflow HTML Rendering ---

function buildWorkflowAnchorCard(technique) {
  const phaseInfo = getTechniquePhaseInfo(technique.stix_id);
  const phaseLabels = phaseInfo.phases.length
    ? phaseInfo.phases.map(phase => phase.label).join(", ")
    : "Phase not mapped";
  const contextSummary = summarizeContextCounts(getTechniqueContextCounts(technique.stix_id));
  return `
    <div class="workflow-anchor-card">
      <small>Anchor</small>
      <h3>${technique.name}<span style="font-family:var(--font-mono);font-weight:400;font-size:12px;color:var(--text-muted);margin-left:10px;">${technique.attack_id || ""}</span></h3>
      <div class="workflow-anchor-meta">
        <span>${phaseLabels}</span>
        ${contextSummary ? `<span style="color:var(--text-muted)">·</span><span>${contextSummary}</span>` : ""}
      </div>
      ${buildWorkflowContextChips(technique.stix_id)}
      <div class="workflow-card-actions">
        <button type="button" class="primary-btn" data-show-details-id="${technique.stix_id}">Show Details</button>
        <button type="button" class="ghost-btn" data-focus-node-id="${technique.stix_id}">Show in Graph</button>
      </div>
    </div>
  `;
}

function renderWorkflowPhaseColumn(column) {
  if (!column || !column.phase) return "";
  const mainSections = [];
  let parallelSection = "";
  if (column.anchorTechniques.length) {
    mainSections.push(buildWorkflowSection("Anchored Technique", column.anchorTechniques));
  }
  if (column.preceding.length) {
    mainSections.push(buildWorkflowSection("Likely preceding steps", column.preceding));
  } else if (column.state === "before") {
    mainSections.push(buildPhaseEmptyState("No strong upstream techniques detected in this phase."));
  }
  if (column.parallels.length) {
    parallelSection = buildWorkflowSection("Parallel options", column.parallels, "parallel");
  }
  if (column.succeeding.length) {
    mainSections.push(buildWorkflowSection("Likely downstream steps", column.succeeding));
  } else if (column.state === "after" && !column.anchorTechniques.length) {
    mainSections.push(buildPhaseEmptyState("No downstream links surfaced yet."));
  }
  if (column.fallback.length) {
    mainSections.push(buildWorkflowSection("Common ATT&CK techniques", column.fallback));
  }
  const mainBody = mainSections.length
    ? mainSections.join("")
    : buildPhaseEmptyState("No signals available for this phase.");
  const stateLabel = column.state === "anchor" ? "Anchor" : column.state === "before" ? "Upstream" : "Downstream";
  return `
    <div class="workflow-phase-column" data-phase-state="${column.state}">
      <div class="workflow-phase-header">
        <p class="phase-metadata">${stateLabel} · Phase ${column.phase.index + 1}</p>
        <h4>${column.phase.label}</h4>
      </div>
      <div class="workflow-phase-body">
        <div class="workflow-phase-main">${mainBody}</div>
        ${parallelSection ? `<div class="workflow-phase-side">${parallelSection}</div>` : ""}
      </div>
    </div>
  `;
}

function buildWorkflowSection(title, techniques, variant = "default") {
  if (!techniques || !techniques.length) return "";
  const sectionClasses = ["workflow-phase-section"];
  if (variant === "parallel") sectionClasses.push("workflow-phase-section--parallel");
  const content =
    variant === "parallel"
      ? `<div class="workflow-parallel-grid">${techniques.map(renderWorkflowTechniqueCard).join("")}</div>`
      : techniques.map(renderWorkflowTechniqueCard).join("");
  const count = techniques.length;
  return `
    <div class="${sectionClasses.join(" ")}">
      <p class="phase-section-title">${title}<span style="margin-left:8px;opacity:0.5;font-weight:400;">${count}</span></p>
      ${content}
    </div>
  `;
}

function buildPhaseEmptyState(copy) {
  return `<div class="workflow-phase-empty">${copy}</div>`;
}

function renderWorkflowTechniqueCard(model) {
  if (!model || !model.technique) return "";
  const technique = model.technique;
  const isCompact = state.workflowCardDetail === "compact";

  const contextChips = state.workflowShowContextChips
    ? buildWorkflowContextChips(model.techId)
    : "";

  let metaMarkup = "";
  if (!isCompact) {
    const entitySummary = summarizeEntitySupport(model.entities || {});
    const metaParts = [];
    if (model.weight) metaParts.push(`<span class="workflow-card-weight">${model.weight}×</span>`);
    if (entitySummary) metaParts.push(`<span>${entitySummary}</span>`);
    if (metaParts.length) metaMarkup = `<div class="workflow-card-meta">${metaParts.join("")}</div>`;
  }

  const actions = isCompact
    ? `<div class="workflow-card-actions">
        <button type="button" class="primary-btn" data-tech-anchor-id="${model.techId}">Anchor</button>
       </div>`
    : `<div class="workflow-card-actions">
        <button type="button" class="primary-btn" data-tech-anchor-id="${model.techId}">Anchor</button>
        <button type="button" class="ghost-btn" data-focus-node-id="${model.techId}">Graph</button>
       </div>`;

  return `
    <article
      class="workflow-tech-card${isCompact ? " workflow-tech-card--compact" : ""}"
      data-tech-id="${model.techId}"
      data-show-details-id="${model.techId}"
    >
      <header>
        <h5>${technique.name}</h5>
        <span class="attack-id">${technique.attack_id || ""}</span>
      </header>
      ${contextChips}
      ${metaMarkup}
      ${actions}
    </article>
  `;
}

// --- Threat Actor Kill Chain Profile ---

export function setThreatActorProfile(groupId) {
  if (!groupId) {
    clearThreatActorProfile();
    return;
  }
  const group = state.entityData.group[groupId];
  if (!group) return;

  state.activeActorId = groupId;
  state.activeWorkflowTechniqueId = null;
  state.activeWorkflowPhaseIndex = null;

  // Build { shortname: [techId, ...] } map — direct group techniques + campaign-attributed techniques
  const phaseMap = {};
  const addTech = (stix_id) => {
    if (!stix_id) return;
    const phaseInfo = getTechniquePhaseInfo(stix_id);
    phaseInfo.phases.forEach(phase => {
      if (!phaseMap[phase.shortname]) phaseMap[phase.shortname] = [];
      if (!phaseMap[phase.shortname].includes(stix_id))
        phaseMap[phase.shortname].push(stix_id);
    });
  };

  (group.techniques || []).forEach(tech => addTech(tech.stix_id));

  // Include techniques from campaigns attributed to this group
  Object.values(state.entityData.campaign || {}).forEach(campaign => {
    const linkedToGroup = (campaign.groups || []).some(g => g.stix_id === group.stix_id);
    if (!linkedToGroup) return;
    (campaign.techniques || []).forEach(tech => addTech(tech.stix_id));
  });

  state.actorPhaseMap = phaseMap;

  const totalTechs = new Set(Object.values(phaseMap).flat()).size;

  // Clear search input
  const searchInput = document.getElementById("search");
  if (searchInput) searchInput.value = "";

  renderWorkflowView();
  updateStatusChipText(`Actor profile: ${group.name} · ${totalTechs} techniques`);
}

export function clearThreatActorProfile() {
  state.activeActorId = null;
  state.actorPhaseMap = {};
  const actorSel = document.getElementById("wfActorSelect");
  if (actorSel && actorSel.value !== "") {
    actorSel.value = "";
    actorSel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  renderWorkflowView();
}

function _renderActorProfileView() {
  if (!workflowPanel) return;
  workflowPanel.classList.remove("is-hidden");
  const group = state.entityData.group[state.activeActorId];
  if (!group) return;

  if (workflowEmptyState) workflowEmptyState.classList.add("is-hidden");
  setTimelineVisibility(true);

  if (workflowAnchorDetails) {
    workflowAnchorDetails.innerHTML = _buildActorAnchorCard(group, state.actorPhaseMap);
  }

  _renderActorTimeline(state.actorPhaseMap);
  _renderActorPhaseDetails(state.actorPhaseMap);
}

function _buildActorAnchorCard(group, phaseMap) {
  const phaseCoverage = Object.keys(phaseMap).filter(k => phaseMap[k].length).length;
  const techCount = new Set(Object.values(phaseMap).flat()).size;
  const attackId = group.attack_id || "";
  const aliases = (group.aliases || []).filter(a => a !== group.name).slice(0, 3).join(", ");
  return `
    <div class="workflow-anchor-card workflow-actor-card">
      <small>Threat Actor</small>
      <h3>${group.name}<span style="font-family:var(--font-mono);font-weight:400;font-size:12px;color:var(--text-muted);margin-left:10px;">${attackId}</span></h3>
      <div class="workflow-anchor-meta">
        <span>${techCount} technique${techCount !== 1 ? "s" : ""}</span>
        <span style="color:var(--text-muted)">·</span>
        <span>${phaseCoverage} phase${phaseCoverage !== 1 ? "s" : ""}</span>
        ${aliases ? `<span style="color:var(--text-muted)">·</span><span style="color:var(--text-soft)">${aliases}</span>` : ""}
      </div>
      <div class="workflow-card-actions">
        <button type="button" class="ghost-btn" data-clear-actor-profile="true">Clear Profile</button>
      </div>
    </div>
  `;
}

function _renderActorTimeline(phaseMap) {
  if (!workflowTimeline) return;
  const domainSequence = getActiveDomainSequence();
  const counts = domainSequence.map(p => (phaseMap[p.shortname] || []).length);
  const maxCount = Math.max(...counts, 1);

  workflowTimeline.innerHTML = domainSequence.map((phase, localIdx) => {
    const count = counts[localIdx];
    const isSelected = state.activeWorkflowPhaseIndex === phase.index;
    const classes = ["timeline-phase"];
    if (count > 0) {
      classes.push("is-active");
      classes.push(`actor-intensity-${Math.ceil((count / maxCount) * 3)}`); // 1–3
    }
    if (isSelected) classes.push("is-selected");
    const number = String(localIdx + 1).padStart(2, "0");
    return `
      <div class="timeline-item">
        <div class="${classes.join(" ")}"
          data-phase-index="${phase.index}"
          role="button" tabindex="0"
          aria-pressed="${isSelected ? "true" : "false"}"
        >
          <span class="timeline-phase-number">Phase ${number}${count > 0 ? ` · ${count}` : ""}</span>
          <span class="timeline-phase-label">${phase.label}</span>
        </div>
      </div>
    `;
  }).join("");
}

function _renderActorPhaseDetails(phaseMap) {
  if (!workflowPhaseList) return;
  if (!Number.isFinite(state.activeWorkflowPhaseIndex)) {
    workflowPhaseList.innerHTML = "";
    workflowPhaseList.classList.add("is-hidden");
    if (workflowPhasePlaceholder) workflowPhasePlaceholder.classList.remove("is-hidden");
    return;
  }
  if (workflowPhasePlaceholder) workflowPhasePlaceholder.classList.add("is-hidden");

  const phase = WORKFLOW_TACTIC_SEQUENCE[state.activeWorkflowPhaseIndex];
  if (!phase) return;
  const techIds = (phaseMap[phase.shortname] || [])
    .sort((a, b) => _getUsageScore(b) - _getUsageScore(a));

  const limit = (state.workflowCardLimit || 5) * 2;
  const cards = techIds.slice(0, limit).map(techId => {
    const tech = state.techniqueMap[techId];
    if (!tech) return "";
    return renderWorkflowTechniqueCard({ techId, technique: tech, relation: "actor", weight: 0, entities: {} });
  }).join("");

  workflowPhaseList.classList.remove("is-hidden");
  workflowPhaseList.innerHTML = `
    <div class="workflow-phase-column" data-phase-state="anchor">
      <div class="workflow-phase-header">
        <p class="phase-metadata">Actor · Phase ${phase.index + 1}</p>
        <h4>${phase.label}</h4>
      </div>
      <div class="workflow-phase-section">
        <p class="phase-section-title">Used by this actor <span style="opacity:0.5;font-weight:400;">${techIds.length}</span></p>
        ${cards || buildPhaseEmptyState("No recorded techniques for this actor in this phase.")}
      </div>
    </div>
  `;
}

// --- "Who Uses This?" Panel ---

const whoUsesPanel     = document.getElementById("whoUsesPanel");
const whoUsesPanelBody = document.getElementById("whoUsesPanelBody");

export function showWhoUsesPanel(techId, anchorEl) {
  if (!whoUsesPanel || !whoUsesPanelBody) return;

  const tech      = state.techniqueMap[techId];
  const context   = state.techniqueContextIndex[techId] || {};
  // Each entry is { id: stix_id, label: name, attack_id }
  const groups    = context.groups    || [];
  const malware   = context.malware   || [];
  const campaigns = context.campaigns || [];

  const titleEl    = whoUsesPanel.querySelector(".who-uses-title");
  const subtitleEl = whoUsesPanel.querySelector(".who-uses-subtitle");
  if (titleEl)    titleEl.textContent = tech?.name || techId;
  if (subtitleEl) subtitleEl.textContent = tech?.attack_id || "";

  const sortedGroups    = [...groups].sort((a, b) => (a.label || "").localeCompare(b.label || ""));
  const sortedMalware   = [...malware].sort((a, b) => (a.label || "").localeCompare(b.label || ""));
  const sortedCampaigns = [...campaigns].sort((a, b) => (a.label || "").localeCompare(b.label || ""));

  const rows = [];

  sortedGroups.slice(0, 8).forEach(entry => {
    if (!entry?.label) return;
    rows.push(
      `<button type="button" class="who-uses-row" data-actor-profile-id="${entry.id}">` +
        `<span class="who-uses-badge who-uses-badge--group">Group</span>` +
        `<span class="who-uses-name">${entry.label}</span>` +
        `<span class="who-uses-id">${entry.attack_id || ""}</span>` +
      `</button>`
    );
  });

  sortedMalware.slice(0, 6).forEach(entry => {
    if (!entry?.label) return;
    rows.push(
      `<div class="who-uses-row who-uses-row--static">` +
        `<span class="who-uses-badge who-uses-badge--malware">Malware</span>` +
        `<span class="who-uses-name">${entry.label}</span>` +
        `<span class="who-uses-id">${entry.attack_id || ""}</span>` +
      `</div>`
    );
  });

  sortedCampaigns.slice(0, 4).forEach(entry => {
    if (!entry?.label) return;
    rows.push(
      `<div class="who-uses-row who-uses-row--static">` +
        `<span class="who-uses-badge who-uses-badge--campaign">Campaign</span>` +
        `<span class="who-uses-name">${entry.label}</span>` +
        `<span class="who-uses-id">${entry.attack_id || ""}</span>` +
      `</div>`
    );
  });

  if (!rows.length) {
    whoUsesPanelBody.innerHTML = `<p class="who-uses-empty">No recorded usage data for this technique.</p>`;
  } else {
    const total = groups.length + malware.length + campaigns.length;
    const overflowNote = total > rows.length
      ? `<p class="who-uses-overflow">Showing ${rows.length} of ${total} — open Details for full list</p>`
      : "";
    whoUsesPanelBody.innerHTML = rows.join("") + overflowNote;
  }

  whoUsesPanel.classList.remove("is-hidden");

  const rect = anchorEl ? anchorEl.getBoundingClientRect() : null;
  if (rect) {
    const panelW = whoUsesPanel.offsetWidth  || 300;
    const panelH = whoUsesPanel.offsetHeight || 320;
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer right of card; fall back to left; then just clamp inside viewport
    let left = rect.right + 10;
    if (left + panelW > vw - margin) left = rect.left - panelW - 10;
    left = Math.max(margin, Math.min(left, vw - panelW - margin));

    let top = rect.top;
    if (top + panelH > vh - margin) top = vh - panelH - margin;
    top = Math.max(margin, top);

    whoUsesPanel.style.left      = left + "px";
    whoUsesPanel.style.top       = top  + "px";
    whoUsesPanel.style.transform = "";
  } else {
    whoUsesPanel.style.left      = "50%";
    whoUsesPanel.style.top       = "50%";
    whoUsesPanel.style.transform = "translate(-50%,-50%)";
  }
}

export function hideWhoUsesPanel() {
  if (!whoUsesPanel) return;
  whoUsesPanel.classList.add("is-hidden");
  whoUsesPanel.style.transform = "";
}
