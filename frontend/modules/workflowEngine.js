// modules/workflowEngine.js
// Workflow mode: kill chain analysis, neighbor graph building, timeline rendering.

import {
  state,
  WORKFLOW_TACTIC_SEQUENCE,
  WORKFLOW_PHASE_LOOKUP,
  WORKFLOW_COLUMN_CARD_LIMIT,
} from "./state.js";
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
} from "./detailsPanel.js";
// setActiveMode is imported from graphRenderer — circular but safe (only called inside functions)
import { setActiveMode } from "./graphRenderer.js";

// --- DOM References ---
const workflowPanel = document.getElementById("workflowPanel");
const workflowTimeline = document.getElementById("workflowPhaseTimeline");
const workflowPhaseList = document.getElementById("workflowPhaseList");
const workflowAnchorDetails = document.getElementById("workflowAnchorDetails");
const workflowEmptyState = document.getElementById("workflowEmptyState");
const workflowPhasePlaceholder = document.getElementById("workflowPhasePlaceholder");
const workflowTimelineToggleButton = document.getElementById("workflowTimelineToggle");

// --- Tactic Metadata Hydration ---

export function hydrateWorkflowTacticMetadata() {
  WORKFLOW_TACTIC_SEQUENCE.forEach(phase => {
    const tacticRecord = state.tacticShortnameMap[phase.shortname];
    if (tacticRecord) {
      phase.tactic_id = tacticRecord.stix_id;
      phase.attack_id = tacticRecord.attack_id;
      phase.description = tacticRecord.description;
      phase.label = tacticRecord.name || phase.label;
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

  const rawPhases = (technique.kill_chain_phases || [])
    .map(phase => (phase.phase_name || "").toLowerCase())
    .filter(Boolean)
    .map(name => WORKFLOW_PHASE_LOOKUP[name])
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);

  let phases = rawPhases;
  if (!phases.length && technique.is_subtechnique && depth < 3) {
    const parentId = state.subtechParentLookup[techId];
    if (parentId) phases = getTechniquePhaseInfo(parentId, depth + 1).phases;
  }

  if (!phases.length) {
    const tacticNodes = getTacticsForTechnique(techId);
    phases = (tacticNodes || [])
      .map(node => (node && node.shortname ? WORKFLOW_PHASE_LOOKUP[node.shortname] : null))
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);
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
      if (delta > 0 && delta <= 4) {
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
  if (activePhases !== undefined) state.workflowTimelineHighlights = activePhases || [];
  const activeSet = new Set(state.workflowTimelineHighlights.map(phase => phase.shortname));
  const hasHighlights = activeSet.size > 0;
  const shouldShowFullChain = state.workflowTimelineExpanded || !hasHighlights;
  let phasesToRender = shouldShowFullChain
    ? WORKFLOW_TACTIC_SEQUENCE
    : WORKFLOW_TACTIC_SEQUENCE.filter(phase => activeSet.has(phase.shortname));
  if (!phasesToRender.length) phasesToRender = WORKFLOW_TACTIC_SEQUENCE;

  const markup = phasesToRender
    .map((phase, index) => {
      const isActive = activeSet.has(phase.shortname);
      const isSelected = state.activeWorkflowPhaseIndex === phase.index;
      const classes = ["timeline-phase"];
      if (isActive) classes.push("is-active");
      if (isSelected) classes.push("is-selected");
      const arrow =
        index < phasesToRender.length - 1
          ? `<div class="timeline-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14"></path>
                <path d="m13 6 6 6-6 6"></path>
              </svg>
            </div>`
          : "";
      const rawIndex = Number.isFinite(phase.index) ? phase.index + 1 : index + 1;
      const number = String(rawIndex).padStart(2, "0");
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
          ${arrow}
        </div>
      `;
    })
    .join("");
  workflowTimeline.innerHTML = markup;

  if (workflowTimelineToggleButton) {
    const hiddenCount = Math.max(WORKFLOW_TACTIC_SEQUENCE.length - phasesToRender.length, 0);
    workflowTimelineToggleButton.classList.toggle("is-hidden", !hasHighlights);
    workflowTimelineToggleButton.setAttribute(
      "aria-pressed",
      state.workflowTimelineExpanded ? "true" : "false"
    );
    const toggleLabel = state.workflowTimelineExpanded
      ? "Collapse to Anchored Phases"
      : hiddenCount > 0
      ? `Show Full Chain (${hiddenCount} hidden)`
      : "Show Full Chain";
    setIconButtonLabel(workflowTimelineToggleButton, toggleLabel);
  }
}

function setTimelineVisibility(visible) {
  if (workflowTimeline) {
    if (!visible) workflowTimeline.innerHTML = "";
    workflowTimeline.classList.toggle("is-hidden", !visible);
  }
  if (workflowTimelineToggleButton) {
    workflowTimelineToggleButton.classList.toggle("is-hidden", !visible);
  }
}

// --- Workflow View ---

export function renderWorkflowView() {
  if (!workflowPanel) return;
  const workflowActive = state.activeMode === "workflow";
  workflowPanel.classList.toggle("is-hidden", !workflowActive);
  if (!workflowActive) return;

  const anchorId = state.activeWorkflowTechniqueId;
  const anchorTechnique = anchorId ? state.techniqueMap[anchorId] : null;
  const anchorEntry = anchorId ? ensureWorkflowTechnique(anchorId) : null;
  const highlightedPhases = anchorEntry && anchorEntry.phases ? anchorEntry.phases : [];
  setTimelineVisibility(Boolean(anchorTechnique));

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

  const detailNodeId = anchorTechnique?.stix_id || anchorTechnique?.id;
  if (detailNodeId) renderTechniqueDetails(anchorTechnique, detailNodeId);
  updateStatusChipText(
    `Workflow anchored on ${anchorTechnique.attack_id || ""} ${anchorTechnique.name}`
  );
}

export function renderWorkflowPhaseDetails() {
  if (!workflowPhaseList) return;
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
  let anchorPhases = anchorEntry.phases || [];
  if (!anchorPhases.length) {
    const fallbackIndex = Number.isFinite(anchorEntry.primaryIndex) ? anchorEntry.primaryIndex : 0;
    const fallbackPhase = WORKFLOW_TACTIC_SEQUENCE[fallbackIndex] || WORKFLOW_TACTIC_SEQUENCE[0];
    anchorPhases = fallbackPhase ? [fallbackPhase] : [];
    anchorEntry.phases = anchorPhases;
  }

  const anchorPhaseIndices = anchorPhases.length ? anchorPhases.map(p => p.index) : [0];
  const minAnchor = Math.min(...anchorPhaseIndices);
  const maxAnchor = Math.max(...anchorPhaseIndices);
  const neighbors = {
    predecessors: buildNeighborArray(anchorEntry.predecessors),
    successors: buildNeighborArray(anchorEntry.successors),
    parallels: buildNeighborArray(anchorEntry.parallels),
  };

  return WORKFLOW_TACTIC_SEQUENCE.map(phase => {
    const idx = phase.index;
    const isAnchorPhase = anchorPhaseIndices.includes(idx);
    const state_ = isAnchorPhase ? "anchor" : idx < minAnchor ? "before" : "after";
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
        .filter(item => item.phaseInfo.phases.some(p => p.index === idx))
        .slice(0, WORKFLOW_COLUMN_CARD_LIMIT)
        .map(item => createTechniqueWorkflowModel(item.techId, "parallel", item.bucket))
        .filter(Boolean);
    }

    if (state_ === "before") {
      column.preceding = neighbors.predecessors
        .filter(item => item.phaseInfo.phases.some(p => p.index === idx))
        .slice(0, WORKFLOW_COLUMN_CARD_LIMIT)
        .map(item => createTechniqueWorkflowModel(item.techId, "preceding", item.bucket))
        .filter(Boolean);
    }

    if (state_ === "after") {
      column.succeeding = neighbors.successors
        .filter(item => item.phaseInfo.phases.some(p => p.index === idx))
        .slice(0, WORKFLOW_COLUMN_CARD_LIMIT)
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
    .slice(0, WORKFLOW_COLUMN_CARD_LIMIT)
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
    : "Not mapped to ATT&CK phases";
  const contextSummary = summarizeContextCounts(getTechniqueContextCounts(technique.stix_id));
  return `
    <div class="workflow-anchor-card">
      <small>Anchored Technique</small>
      <h3>${technique.attack_id || "NO-ID"} · ${technique.name}</h3>
      <div class="workflow-anchor-meta">
        <span>${phaseLabels}</span>
        <span>${contextSummary}</span>
      </div>
      ${buildWorkflowContextChips(technique.stix_id)}
      <div class="workflow-card-actions">
        <button type="button" class="ghost-btn" data-focus-node-id="${technique.stix_id}">
          Show in Graph
        </button>
      </div>
    </div>
  `;
}

function renderWorkflowPhaseColumn(column) {
  if (!column || !column.phase) return "";
  const sections = [];
  if (column.anchorTechniques.length) {
    sections.push(buildWorkflowSection("Anchored Technique", column.anchorTechniques));
  }
  if (column.preceding.length) {
    sections.push(buildWorkflowSection("Likely preceding steps", column.preceding));
  } else if (column.state === "before") {
    sections.push(buildPhaseEmptyState("No strong upstream techniques detected in this phase."));
  }
  if (column.parallels.length) {
    sections.push(buildWorkflowSection("Parallel options", column.parallels));
  }
  if (column.succeeding.length) {
    sections.push(buildWorkflowSection("Likely downstream steps", column.succeeding));
  } else if (column.state === "after" && !column.anchorTechniques.length) {
    sections.push(buildPhaseEmptyState("No downstream links surfaced yet."));
  }
  if (column.fallback.length) {
    sections.push(buildWorkflowSection("Common ATT&CK techniques", column.fallback));
  }
  const body = sections.length
    ? sections.join("")
    : buildPhaseEmptyState("No signals available for this phase.");
  return `
    <div class="workflow-phase-column" data-phase-state="${column.state}">
      <div class="workflow-phase-header">
        <p class="phase-metadata">Phase ${column.phase.index + 1}</p>
        <h4>${column.phase.label}</h4>
      </div>
      <div class="workflow-phase-body">${body}</div>
    </div>
  `;
}

function buildWorkflowSection(title, techniques) {
  if (!techniques || !techniques.length) return "";
  return `
    <div class="workflow-phase-section">
      <p class="phase-section-title">${title}</p>
      ${techniques.map(renderWorkflowTechniqueCard).join("")}
    </div>
  `;
}

function buildPhaseEmptyState(copy) {
  return `<div class="workflow-phase-empty">${copy}</div>`;
}

function renderWorkflowTechniqueCard(model) {
  if (!model || !model.technique) return "";
  const technique = model.technique;
  const entitySummary = summarizeEntitySupport(model.entities || {});
  const metaParts = [];
  if (model.weight) {
    metaParts.push(
      `<span class="workflow-card-weight">${model.weight} signal${model.weight > 1 ? "s" : ""}</span>`
    );
  }
  if (entitySummary) metaParts.push(`<span>${entitySummary}</span>`);
  const metaMarkup = metaParts.length
    ? `<div class="workflow-card-meta">${metaParts.join("")}</div>`
    : "";
  return `
    <article class="workflow-tech-card" data-tech-id="${model.techId}">
      <header>
        <h5>${technique.name}</h5>
        <span class="attack-id">${technique.attack_id || "NO-ID"}</span>
      </header>
      ${buildWorkflowContextChips(model.techId)}
      ${metaMarkup}
      <div class="workflow-card-actions">
        <button type="button" class="primary-btn" data-tech-anchor-id="${model.techId}">Explore Branch</button>
        <button type="button" class="ghost-btn" data-focus-node-id="${model.techId}">Show in Graph</button>
      </div>
    </article>
  `;
}
