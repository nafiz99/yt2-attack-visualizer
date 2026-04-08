let nodeMap = {};
let techniqueMap = {};
let tacticMap = {};
const tacticShortnameMap = {};
let useFullChain = true;
let graphDataRef = null;
let graphDataCore = null;
let graphDataExtended = null;
let allNodeMap = {};
let useContextEntities = false;
let entityData = {
  group: {},
  malware: {},
  campaign: {},
  procedure: {}
};
let techniqueContextIndex = {};
let cy = null;
let activeMode = "workflow";
let activeWorkflowTechniqueId = null;
let activeWorkflowPhaseIndex = null;
let activeDomainFilter = "all";
let activeFocusFilter = "balanced";
let nodeSampleLimit = 60;
let showProceduresInView = true;
let showCampaignLinks = true;
let highlightNewEntities = true;
let activePhaseFilter = "all";
let activeSortOrder = "phase";
let activeLayoutPreset = "cose";
const THEME_STORAGE_KEY = "yt2_theme_preference";
const themeToggleButton = document.getElementById("themeToggle");
const themeToggleText = themeToggleButton ? themeToggleButton.querySelector(".theme-toggle-text") : null;
const contextToggleButton = document.getElementById("contextToggle");
const modeTabsContainer = document.getElementById("modeTabs");
const domainFilterSelect = document.getElementById("domainFilter");
const focusFilterSelect = document.getElementById("focusFilter");
const advancedControls = document.getElementById("advancedControls");
const nodeSampleRange = document.getElementById("nodeSampleRange");
const nodeSampleValue = document.getElementById("nodeSampleValue");
const showProceduresToggle = document.getElementById("showProceduresToggle");
const showCampaignLinksToggle = document.getElementById("showCampaignLinksToggle");
const highlightNewEntitiesToggle = document.getElementById("highlightNewEntitiesToggle");
const phaseFilterSelect = document.getElementById("phaseFilter");
const sortOrderSelect = document.getElementById("sortOrder");
const layoutStrategySelect = document.getElementById("layoutStrategy");
const controlSummaryChips = document.getElementById("controlSummaryChips");
const DATA_PATH_CANDIDATES = (() => {
  if (typeof window.YT2_DATA_BASE_PATH === "string" && window.YT2_DATA_BASE_PATH.trim().length) {
    return [window.YT2_DATA_BASE_PATH.trim()];
  }
  return ["./data_processed", "../data_processed", "/data_processed"];
})();
const statusChip = document.getElementById("status");
const detailsPanel = document.getElementById("right");
const detailsOverlay = document.getElementById("detailsOverlay");
const detailsCloseButton = document.getElementById("detailsClose");
const detailsToggleButton = document.getElementById("detailsToggleButton");
const prefersDarkMedia = window.matchMedia("(prefers-color-scheme: dark)");
const legendToggleButton = document.getElementById("legendToggle");
const legendContainer = document.getElementById("graphLegend");
const graphContainer = document.getElementById("cy");
const legendWrapper = document.querySelector(".legend-wrapper");
const filtersToggle = document.getElementById("filtersToggle");
const filterOverlay = document.getElementById("filterOverlay");

function getSelectLabel(selectEl, fallback = "") {
  if (!selectEl) return fallback;
  const option =
    (selectEl.selectedOptions && selectEl.selectedOptions[0]) || selectEl.options?.[selectEl.selectedIndex];
  if (!option) return fallback;
  const text = option.textContent || option.innerText;
  return text ? text.trim() : fallback;
}

function updateControlSummaryChips() {
  if (!controlSummaryChips) return;
  const selectChips = controlSummaryChips.querySelectorAll("select");
  selectChips.forEach(select => {
    select.setAttribute("data-selected-label", getSelectLabel(select));
  });
}

updateControlSummaryChips();

function setIconButtonLabel(button, label) {
  if (!button || !label) return;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  const srText = button.querySelector(".sr-only");
  if (srText) {
    srText.textContent = label;
  }
  const visibleLabel = button.querySelector(".button-label");
  if (visibleLabel) {
    visibleLabel.textContent = label;
  }
}

const workflowPanel = document.getElementById("workflowPanel");
const workflowTimeline = document.getElementById("workflowPhaseTimeline");
const workflowPhaseList = document.getElementById("workflowPhaseList");
const workflowAnchorDetails = document.getElementById("workflowAnchorDetails");
const workflowEmptyState = document.getElementById("workflowEmptyState");
const workflowPhasePlaceholder = document.getElementById("workflowPhasePlaceholder");
const workflowBackToGraphButton = document.getElementById("workflowBackToGraph");
const workflowTimelineToggleButton = document.getElementById("workflowTimelineToggle");
const searchSuggestionsContainer = document.getElementById("searchSuggestions");
let currentTheme = "dark";
let detailsPanelManuallyHidden = false;
const detailsContainer = document.getElementById("details");
const defaultDetailsMarkup = detailsContainer ? detailsContainer.innerHTML : "";
let isDetailsPanelOpen = detailsPanel ? !detailsPanel.classList.contains("is-hidden") : false;

function showDetailsOverlayIfNeeded() {
  if (!detailsOverlay) return;
  detailsOverlay.classList.remove("is-hidden");
  detailsOverlay.setAttribute("aria-hidden", "false");
}

function hideDetailsOverlay() {
  if (!detailsOverlay) return;
  detailsOverlay.classList.add("is-hidden");
  detailsOverlay.setAttribute("aria-hidden", "true");
}

function resetDetailsPanelContent() {
  if (!detailsContainer) return;
  detailsContainer.innerHTML = defaultDetailsMarkup;
}

function syncDetailsToggle() {
  if (!detailsToggleButton || !detailsPanel) return;
  const isHidden = detailsPanel.classList.contains("is-hidden");
  const label = isHidden ? "Show Details" : "Hide Details";
  setIconButtonLabel(detailsToggleButton, label);
  detailsToggleButton.setAttribute("aria-pressed", isHidden ? "false" : "true");
  detailsToggleButton.classList.toggle("is-active", !isHidden);
}

function restoreDetailsPanel(options = {}) {
  if (!detailsPanel || !detailsContainer) return;
  if (detailsPanelManuallyHidden) return;
  resetDetailsPanelContent();
  if (detailsPanel.classList.contains("is-hidden")) {
    openDetailsPanel(options);
  } else {
    detailsPanel.classList.add("is-floating");
    showDetailsOverlayIfNeeded();
    syncDetailsToggle();
  }
}

function openDetailsPanel(options = {}) {
  if (!detailsPanel) return;
  detailsPanel.classList.add("is-floating");
  detailsPanel.classList.remove("is-hidden");
  detailsPanel.setAttribute("aria-hidden", "false");
  showDetailsOverlayIfNeeded();
  isDetailsPanelOpen = true;
  detailsPanelManuallyHidden = false;
  syncDetailsToggle();
}

function closeDetailsPanel(options = {}) {
  const { resetContent = true, manual = false } = options;
  if (resetContent) {
    resetDetailsPanelContent();
  }
  if (!detailsPanel) return;
  detailsPanel.classList.remove("is-floating");
  detailsPanel.classList.add("is-hidden");
  detailsPanel.setAttribute("aria-hidden", "true");
  hideDetailsOverlay();
  isDetailsPanelOpen = false;
  if (manual) {
    detailsPanelManuallyHidden = true;
  } else {
    detailsPanelManuallyHidden = false;
  }
  syncDetailsToggle();
}

if (detailsOverlay) {
  detailsOverlay.addEventListener("click", () => closeDetailsPanel({ manual: true }));
}

if (detailsCloseButton) {
  detailsCloseButton.addEventListener("click", () => closeDetailsPanel({ manual: true }));
}

if (detailsToggleButton) {
  detailsToggleButton.addEventListener("click", () => {
    if (detailsPanel?.classList.contains("is-hidden")) {
      openDetailsPanel();
    } else {
      closeDetailsPanel({ resetContent: false, manual: true });
    }
  });
}

syncDetailsToggle();

async function fetchJsonWithFallback(filename) {
  let lastError = null;
  for (const basePath of DATA_PATH_CANDIDATES) {
    if (!basePath) continue;
    const normalizedBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
    const url = `${normalizedBase}/${filename}`;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`Failed to load ${filename} from ${url}`, error);
    }
  }
  throw lastError || new Error(`Unable to load ${filename}`);
}

const MODE_NODE_TYPES = {
  groups: "group",
  malware: "malware",
  campaigns: "campaign",
  procedures: "procedure"
};

const MODE_LABELS = {
  attack: "Graph",
  workflow: "Workflow",
  groups: "Groups",
  malware: "Malware",
  campaigns: "Campaigns",
  procedures: "Procedures"
};

const NODE_TYPE_TO_MODE = {
  group: "groups",
  malware: "malware",
  campaign: "campaigns",
  procedure: "procedures"
};

const WORKFLOW_TACTIC_SEQUENCE = [
  { shortname: "reconnaissance", label: "Reconnaissance" },
  { shortname: "resource-development", label: "Resource Development" },
  { shortname: "initial-access", label: "Initial Access" },
  { shortname: "execution", label: "Execution" },
  { shortname: "persistence", label: "Persistence" },
  { shortname: "privilege-escalation", label: "Privilege Escalation" },
  { shortname: "defense-evasion", label: "Defense Evasion" },
  { shortname: "credential-access", label: "Credential Access" },
  { shortname: "discovery", label: "Discovery" },
  { shortname: "lateral-movement", label: "Lateral Movement" },
  { shortname: "collection", label: "Collection" },
  { shortname: "command-and-control", label: "Command and Control" },
  { shortname: "exfiltration", label: "Exfiltration" },
  { shortname: "impact", label: "Impact" }
].map((entry, index) => ({
  ...entry,
  index
}));

const WORKFLOW_PHASE_LOOKUP = WORKFLOW_TACTIC_SEQUENCE.reduce((acc, phase) => {
  acc[phase.shortname] = phase;
  return acc;
}, {});
const WORKFLOW_COLUMN_CARD_LIMIT = 4;

const techniquePhaseLookup = {};
const phaseTechniqueCatalog = {};
const workflowTechniqueIndex = {};
const subtechParentLookup = {};
let workflowPhaseColumns = new Map();
let workflowTimelineHighlights = [];
let workflowTimelineExpanded = false;
let searchSuggestions = [];
let activeSearchSuggestionIndex = -1;

if (nodeSampleRange) {
  nodeSampleLimit = Number(nodeSampleRange.value) || nodeSampleLimit;
}
if (nodeSampleValue) {
  nodeSampleValue.textContent = `${nodeSampleLimit} nodes`;
}

if (contextToggleButton) {
  contextToggleButton.disabled = true;
  contextToggleButton.setAttribute("aria-pressed", "false");
  contextToggleButton.setAttribute("aria-label", "Toggle contextual nodes");
}

function applyThemePreference(mode) {
  const body = document.body;
  if (!body) return;

  if (mode === "light") {
    body.classList.add("theme-light");
  } else {
    body.classList.remove("theme-light");
    mode = "dark";
  }

  currentTheme = mode;

  if (themeToggleButton) {
    themeToggleButton.setAttribute("data-theme", mode);
    themeToggleButton.setAttribute(
      "aria-label",
      `Switch to ${mode === "light" ? "dark" : "light"} mode`
    );
    if (themeToggleText) {
      themeToggleText.textContent = mode === "light" ? "Light" : "Dark";
    }
  }
}

const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
if (savedTheme) {
  applyThemePreference(savedTheme);
} else {
  applyThemePreference(prefersDarkMedia.matches ? "dark" : "light");
}

if (themeToggleButton) {
  themeToggleButton.addEventListener("click", () => {
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyThemePreference(nextTheme);
  });
}

if (prefersDarkMedia) {
  const respondToPrefChange = (event) => {
    if (!localStorage.getItem(THEME_STORAGE_KEY)) {
      applyThemePreference(event.matches ? "dark" : "light");
    }
  };

  if (prefersDarkMedia.addEventListener) {
    prefersDarkMedia.addEventListener("change", respondToPrefChange);
  } else if (prefersDarkMedia.addListener) {
    prefersDarkMedia.addListener(respondToPrefChange);
  }
}

if (legendToggleButton && legendContainer) {
  legendContainer.classList.add("is-hidden");
  legendToggleButton.setAttribute("aria-expanded", "false");
  const updateLegendButton = (isHidden) => {
    const label = isHidden ? "Show Legend" : "Hide Legend";
    setIconButtonLabel(legendToggleButton, label);
    legendToggleButton.classList.toggle("is-active", !isHidden);
  };
  updateLegendButton(true);
  legendToggleButton.addEventListener("click", () => {
    const nowHidden = legendContainer.classList.toggle("is-hidden");
    legendToggleButton.setAttribute("aria-expanded", nowHidden ? "false" : "true");
    updateLegendButton(nowHidden);
  });
}
const LAYOUT_PRESETS = {
  cose: {
    name: "cose",
    animate: true,
    animationDuration: 700,
    animationEasing: "ease-out",
    idealEdgeLength: 40,
    nodeOverlap: 18,
    refresh: 20,
    fit: true,
    padding: 30,
    randomize: false,
    componentSpacing: 80,
    nodeRepulsion: 550000,
    edgeElasticity: 120,
    nestingFactor: 1.5,
    gravity: 120,
    numIter: 1500,
    initialTemp: 160,
    coolingFactor: 0.9,
    minTemp: 1
  },
  concentric: {
    name: "concentric",
    animate: true,
    animationDuration: 600,
    fit: true,
    padding: 60,
    startAngle: (3 / 2) * Math.PI,
    sweep: undefined,
    concentric: node => node.degree(),
    levelWidth: nodes => (nodes.maxDegree() || 1) / 2
  },
  breadthfirst: {
    name: "breadthfirst",
    animate: true,
    animationDuration: 650,
    directed: true,
    spacingFactor: 1.15,
    nodeDimensionsIncludeLabels: true,
    fit: true,
    padding: 40,
    avoidOverlap: true
  }
};

function getLayoutOptions(overrides = {}) {
  const preset = LAYOUT_PRESETS[activeLayoutPreset] || LAYOUT_PRESETS.cose;
  return { ...preset, ...overrides };
}

Promise.all([
  fetchJsonWithFallback("graph.json"),
  fetchJsonWithFallback("graph_extended.json"),
  fetchJsonWithFallback("techniques.json"),
  fetchJsonWithFallback("tactics.json"),
  fetchJsonWithFallback("groups.json"),
  fetchJsonWithFallback("malware.json"),
  fetchJsonWithFallback("campaigns.json"),
  fetchJsonWithFallback("procedures.json")
])
  .then(([graphData, extendedGraph, techniques, tactics, groups, malware, campaigns, procedures]) => {
    graphDataCore = graphData;
    graphDataExtended = extendedGraph;
    graphDataRef = graphDataCore;
    buildSubtechParentLookup(graphDataCore);
    graphDataExtended.nodes.forEach(node => {
      allNodeMap[node.id] = node;
    });
    techniques.forEach(t => {
      techniqueMap[t.stix_id] = t;
    });

    // Keep the placeholder details panel visible by default so users see it in every mode.
    openDetailsPanel();

    tactics.forEach(t => {
      tacticMap[t.stix_id] = t;
      if (t.shortname) {
        tacticShortnameMap[t.shortname] = t;
      }
    });
    hydrateWorkflowTacticMetadata();

    function hydrateNodeMap(data) {
      nodeMap = {};
      data.nodes.forEach(n => {
        nodeMap[n.id] = n;
      });
    }

    hydrateNodeMap(graphDataRef);
    buildPhaseTechniqueCatalog();

    function getModeLabel() {
      return MODE_LABELS[activeMode] || activeMode.toUpperCase();
    }

    function updateModeTabsUI() {
      if (!modeTabsContainer) return;
      const tabs = modeTabsContainer.querySelectorAll(".mode-tab");
      tabs.forEach(tab => {
        const isActive = tab.getAttribute("data-mode") === activeMode;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      const filtersDisabled = activeMode === "workflow";
      const toggleFilterState = selectEl => {
        if (!selectEl) return;
        selectEl.disabled = filtersDisabled;
        selectEl.parentElement?.classList.toggle("is-disabled", filtersDisabled);
      };
      toggleFilterState(domainFilterSelect);
      toggleFilterState(focusFilterSelect);
      toggleFilterState(phaseFilterSelect);
      toggleFilterState(sortOrderSelect);
      if (contextToggleButton) {
        const disableContextToggle = activeMode === "workflow";
        contextToggleButton.disabled = disableContextToggle;
        contextToggleButton.setAttribute("aria-disabled", disableContextToggle ? "true" : "false");
      }
      updateControlSummaryChips();
    }

    function syncWorkspaceViewForMode() {
      const workflowActive = activeMode === "workflow";
      if (workflowPanel) {
        workflowPanel.classList.toggle("is-hidden", !workflowActive);
      }
      if (graphContainer) {
        graphContainer.classList.toggle("is-hidden", workflowActive);
      }
      if (legendWrapper) {
        legendWrapper.classList.toggle("is-hidden", workflowActive);
      }
    }

    function updateStatusChipText(baseText) {
      if (!statusChip) return;
      const contextNote = useContextEntities ? "Context: ON" : "Context: OFF";
      statusChip.innerText = `${baseText} • Mode: ${getModeLabel()} • ${contextNote}`;
    }

    function hydrateWorkflowTacticMetadata() {
      WORKFLOW_TACTIC_SEQUENCE.forEach(phase => {
        const tacticRecord = tacticShortnameMap[phase.shortname];
        if (tacticRecord) {
          phase.tactic_id = tacticRecord.stix_id;
          phase.attack_id = tacticRecord.attack_id;
          phase.description = tacticRecord.description;
          phase.label = tacticRecord.name || phase.label;
        }
      });
    }

    function buildSubtechParentLookup(sourceGraph) {
      Object.keys(subtechParentLookup).forEach(key => delete subtechParentLookup[key]);
      if (!sourceGraph || !Array.isArray(sourceGraph.edges)) return;
      sourceGraph.edges.forEach(edge => {
        if (edge.type === "subtechnique-of") {
          subtechParentLookup[edge.source] = edge.target;
        }
      });
    }

    function getTechniquePhaseInfo(techId, depth = 0) {
      if (!techId) {
        return { phases: [], primaryIndex: null };
      }
      if (techniquePhaseLookup[techId]) {
        return techniquePhaseLookup[techId];
      }
      const technique = techniqueMap[techId];
      if (!technique) {
        techniquePhaseLookup[techId] = { phases: [], primaryIndex: null };
        return techniquePhaseLookup[techId];
      }

      const rawPhases = (technique.kill_chain_phases || [])
        .map(phase => (phase.phase_name || "").toLowerCase())
        .filter(Boolean)
        .map(name => WORKFLOW_PHASE_LOOKUP[name])
        .filter(Boolean)
        .sort((a, b) => a.index - b.index);

      let phases = rawPhases;
      if (!phases.length && technique.is_subtechnique && depth < 3) {
        const parentId = subtechParentLookup[techId];
        if (parentId) {
          phases = getTechniquePhaseInfo(parentId, depth + 1).phases;
        }
      }

      if (!phases.length) {
        const tacticNodes = getTacticsForTechnique
          ? getTacticsForTechnique(techId)
          : [];
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
        primaryIndex: dedupedPhases.length ? dedupedPhases[0].index : null
      };
      techniquePhaseLookup[techId] = info;
      return info;
    }

    function ensureWorkflowTechnique(techId) {
      const phaseInfo = getTechniquePhaseInfo(techId);
      if (!workflowTechniqueIndex[techId]) {
        workflowTechniqueIndex[techId] = {
          phases: phaseInfo.phases,
          primaryIndex: phaseInfo.primaryIndex,
          predecessors: {},
          successors: {},
          parallels: {}
        };
      } else {
        workflowTechniqueIndex[techId].phases = phaseInfo.phases;
        workflowTechniqueIndex[techId].primaryIndex = phaseInfo.primaryIndex;
      }
      return workflowTechniqueIndex[techId];
    }

    function buildPhaseTechniqueCatalog() {
      Object.keys(phaseTechniqueCatalog).forEach(key => {
        phaseTechniqueCatalog[key] = [];
      });
      Object.keys(techniqueMap).forEach(techId => {
        const info = getTechniquePhaseInfo(techId);
        if (!info.phases.length) return;
        info.phases.forEach(phase => {
          if (!phaseTechniqueCatalog[phase.shortname]) {
            phaseTechniqueCatalog[phase.shortname] = [];
          }
          if (!techniqueMap[techId].is_subtechnique) {
            phaseTechniqueCatalog[phase.shortname].push(techId);
          }
        });
        ensureWorkflowTechnique(techId);
      });
      Object.keys(phaseTechniqueCatalog).forEach(key => {
        const deduped = Array.from(new Set(phaseTechniqueCatalog[key] || []));
        deduped.sort((a, b) => {
          const nameA = (techniqueMap[a]?.name || "").toLowerCase();
          const nameB = (techniqueMap[b]?.name || "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
        phaseTechniqueCatalog[key] = deduped;
      });
    }

    function buildWorkflowNeighborGraph({ groups = [], malware = [], campaigns = [] }) {
      Object.values(workflowTechniqueIndex).forEach(entry => {
        entry.predecessors = {};
        entry.successors = {};
        entry.parallels = {};
      });

      const entityBuckets = [
        { type: "group", records: groups },
        { type: "malware", records: malware },
        { type: "campaign", records: campaigns }
      ];

      entityBuckets.forEach(bucket => {
        bucket.records.forEach(record => processEntityWorkflow(record, bucket.type));
      });
    }

    function processEntityWorkflow(record, entityType) {
      const rawList = (record.techniques || []).map(item => item.stix_id).filter(Boolean);
      const uniqueTechIds = Array.from(new Set(rawList));
      if (uniqueTechIds.length < 2) return;

      const orderedTechniques = uniqueTechIds
        .map(id => {
          const info = getTechniquePhaseInfo(id);
          return {
            techId: id,
            primaryIndex: info.primaryIndex,
            phases: info.phases
          };
        })
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
            campaign: { count: 0, samples: [] }
          }
        };
      }
      return collection[key];
    }

    function incrementEntitySupport(bucket, entityType, entityRecord) {
      if (!bucket.entities[entityType]) {
        bucket.entities[entityType] = { count: 0, samples: [] };
      }
      bucket.entities[entityType].count += 1;
      if (
        entityRecord &&
        entityRecord.name &&
        bucket.entities[entityType].samples.length < 3
      ) {
        bucket.entities[entityType].samples.push(entityRecord.name);
      }
    }

    function buildEntityMap(items) {
      const map = {};
      items.forEach(item => {
        if (item.stix_id) {
          map[item.stix_id] = item;
        }
      });
      return map;
    }

    entityData.group = buildEntityMap(groups);
    entityData.malware = buildEntityMap(malware);
    entityData.campaign = buildEntityMap(campaigns);
    entityData.procedure = buildEntityMap(procedures);

    function ensureTechniqueContext(techId) {
      if (!techniqueContextIndex[techId]) {
        techniqueContextIndex[techId] = {
          groups: [],
          malware: [],
          campaigns: [],
          procedures: []
        };
      }
      return techniqueContextIndex[techId];
    }

    groups.forEach(group => {
      (group.techniques || []).forEach(tech => {
        if (!tech || !tech.stix_id) return;
        const ctx = ensureTechniqueContext(tech.stix_id);
        ctx.groups.push({
          id: group.stix_id,
          label: group.name,
          attack_id: group.attack_id
        });
      });
    });

    malware.forEach(item => {
      (item.techniques || []).forEach(tech => {
        if (!tech || !tech.stix_id) return;
        const ctx = ensureTechniqueContext(tech.stix_id);
        ctx.malware.push({
          id: item.stix_id,
          label: item.name,
          attack_id: item.attack_id
        });
      });
    });

    campaigns.forEach(campaign => {
      (campaign.techniques || []).forEach(tech => {
        if (!tech || !tech.stix_id) return;
        const ctx = ensureTechniqueContext(tech.stix_id);
        ctx.campaigns.push({
          id: campaign.stix_id,
          label: campaign.name,
          attack_id: campaign.attack_id
        });
      });
    });

    procedures.forEach(proc => {
      if (!proc.target_ref) return;
      const ctx = ensureTechniqueContext(proc.target_ref);
      ctx.procedures.push({
        id: proc.stix_id,
        label: `${proc.source_name || proc.source_ref || "Procedure"} → ${
          proc.target_name || techniqueMap[proc.target_ref]?.name || proc.target_ref
        }`,
        source_type: proc.source_type,
        description: proc.description
      });
    });

    buildWorkflowNeighborGraph({ groups, malware, campaigns });

    updateContextToggleLabel();
    updateModeTabsUI();
    syncWorkspaceViewForMode();
    if (activeMode === "workflow") {
      renderWorkflowView();
    }

    function isParentTechnique(nodeId) {
      const node = nodeMap[nodeId];
      return node && node.node_type === "technique" && !node.is_subtechnique;
    }

    function isSubTechnique(nodeId) {
      const node = nodeMap[nodeId];
      return node && node.node_type === "technique" && !!node.is_subtechnique;
    }

    function getChildSubtechniques(parentId) {
      const childEdges = graphDataRef.edges.filter(
        edge => edge.type === "subtechnique-of" && edge.target === parentId
      );

      return childEdges
        .map(edge => nodeMap[edge.source])
        .filter(Boolean);
    }

    function getParentTechnique(subId) {
      const parentEdge = graphDataRef.edges.find(
        edge => edge.type === "subtechnique-of" && edge.source === subId
      );

      return parentEdge ? nodeMap[parentEdge.target] : null;
    }

    function getTacticsForTechnique(techniqueId) {
      const tacticEdges = graphDataRef.edges.filter(
        edge => edge.type === "tactic-technique" && edge.target === techniqueId
      );

      return tacticEdges
        .map(edge => nodeMap[edge.source])
        .filter(Boolean);
    }

    function getTechniquesForTactic(tacticId) {
      const techniqueEdges = graphDataRef.edges.filter(
        edge => edge.type === "tactic-technique" && edge.source === tacticId
      );

      return techniqueEdges
        .map(edge => nodeMap[edge.target])
        .filter(node => node && isParentTechnique(node.id));
    }

    function getHierarchyInfo(nodeId) {
      const parentEdges = graphDataRef.edges.filter(
        edge => edge.source === nodeId && edge.type === "subtechnique-of"
      );

      const childEdges = graphDataRef.edges.filter(
        edge => edge.target === nodeId && edge.type === "subtechnique-of"
      );

      const parents = parentEdges
        .map(edge => nodeMap[edge.target])
        .filter(Boolean);

      const children = childEdges
        .map(edge => nodeMap[edge.source])
        .filter(Boolean);

      return { parents, children };
    }

    function formatNodeLinks(nodes = [], emptyCopy = "None") {
      if (!nodes.length) {
        return `<span class="small-muted">${emptyCopy}</span>`;
      }

      const links = nodes
        .filter(Boolean)
        .map(node => {
          const id = node.id || node.stix_id;
          if (!id) {
            return null;
          }
          const attackId =
            node.attack_id ??
            (nodeMap[id] ? nodeMap[id].attack_id : (allNodeMap[id] ? allNodeMap[id].attack_id : null)) ??
            "N/A";
          const label =
            node.label ||
            node.name ||
            (nodeMap[id] ? nodeMap[id].label : (allNodeMap[id] ? allNodeMap[id].label : id));

          return `<button type="button" class="node-link" data-node-id="${id}">
            ${attackId || "N/A"} - ${label}
          </button>`;
        })
        .filter(Boolean)
        .join("");

      return `<div class="node-link-list">${links}</div>`;
    }

    function formatValueChips(values = [], emptyCopy = "None") {
      if (!values || !values.length) {
        return `<span class="small-muted">${emptyCopy}</span>`;
      }

      return `<div class="chip-list">${values
        .map(value => `<span class="value-chip">${value}</span>`)
        .join("")}</div>`;
    }

    function buildDescriptionBlock(descriptionText) {
      const fallbackText = descriptionText || "No description available.";
      const hasExpandableDescription = descriptionText && descriptionText.length > 220;
      const shortDescription = hasExpandableDescription
        ? `${descriptionText.slice(0, 220)}...`
        : fallbackText;

      return `
        <div class="description-card${hasExpandableDescription ? " expandable" : ""}" ${
        hasExpandableDescription ? 'data-action="toggle-description" aria-expanded="false"' : ""
      }>
          <p class="description-preview${hasExpandableDescription ? "" : " full"}">${shortDescription}</p>
          <p class="description-full ${hasExpandableDescription ? "collapsed" : "expanded"}">${fallbackText}</p>
          ${
            hasExpandableDescription
              ? '<span class="description-hint">Click to read the full description</span>'
              : ""
          }
        </div>
      `;
    }

    const badgeClassMap = {
      tactic: "badge-tactic",
      technique: "badge-parent",
      group: "badge-group",
      malware: "badge-malware",
      campaign: "badge-campaign",
      procedure: "badge-procedure"
    };

    function buildBadge(type, labelOverride = null) {
      const badgeClass = badgeClassMap[type] || "badge";
      const label =
        labelOverride ||
        {
          tactic: "Tactic",
          technique: "Technique",
          group: "Group",
          malware: "Malware",
          campaign: "Campaign",
          procedure: "Procedure"
        }[type] ||
        type;

      return `<span class="badge ${badgeClass}">${label}</span>`;
    }

    function truncateText(text, limit = 200) {
      if (!text) return "No description available.";
      return text.length > limit ? `${text.slice(0, limit)}...` : text;
    }

    function getTechniqueContextCounts(techId) {
      const context = techniqueContextIndex[techId] || {};
      return {
        groups: (context.groups || []).length,
        malware: (context.malware || []).length,
        campaigns: (context.campaigns || []).length,
        procedures: (context.procedures || []).length
      };
    }

    function summarizeContextCounts(counts) {
      const parts = [];
      if (counts.groups) parts.push(`${counts.groups} group${counts.groups > 1 ? "s" : ""}`);
      if (counts.malware) parts.push(`${counts.malware} malware`);
      if (counts.campaigns) parts.push(`${counts.campaigns} campaign${counts.campaigns > 1 ? "s" : ""}`);
      if (counts.procedures) parts.push(`${counts.procedures} procedure${counts.procedures > 1 ? "s" : ""}`);
      return parts.length ? parts.join(" · ") : "No contextual entities recorded";
    }

    function getTechniqueUsageScore(techId) {
      const counts = getTechniqueContextCounts(techId);
      return counts.groups * 4 + counts.malware * 3 + counts.campaigns * 2 + counts.procedures + 1;
    }

    function buildWorkflowContextChips(techId) {
      const counts = getTechniqueContextCounts(techId);
      const chips = [];
      if (counts.groups) chips.push(`<span class="workflow-context-chip">Groups ${counts.groups}</span>`);
      if (counts.malware) chips.push(`<span class="workflow-context-chip">Malware ${counts.malware}</span>`);
      if (counts.campaigns) chips.push(`<span class="workflow-context-chip">Campaigns ${counts.campaigns}</span>`);
      if (counts.procedures) chips.push(`<span class="workflow-context-chip">Procedures ${counts.procedures}</span>`);
      if (!chips.length) return "";
      return `<div class="workflow-context-chips">${chips.join("")}</div>`;
    }

    function summarizeEntitySupport(entities = {}) {
      const parts = [];
      ["group", "malware", "campaign"].forEach(type => {
        const count = entities[type]?.count || 0;
        if (!count) return;
        const label =
          type === "group"
            ? `group${count > 1 ? "s" : ""}`
            : `${type}${count > 1 ? "s" : ""}`;
        parts.push(`${count} ${label}`);
      });
      return parts.join(" · ");
    }

    function formatIsoDate(value) {
      if (!value) return null;
      return value.split("T")[0];
    }

    function formatProcedurePreviewList(items = [], emptyCopy = "No procedures logged.") {
      if (!items.length) {
        return `<span class="small-muted">${emptyCopy}</span>`;
      }

      return `<div class="procedure-preview-list">${items
        .map(item => {
          const badge = buildBadge(item.source_type || "procedure");
          const snippet = truncateText(item.description, 260);
          return `
            <div class="procedure-preview">
              <div class="procedure-preview-header">
                ${badge}
                <button type="button" class="node-link" data-node-id="${item.id}">
                  View Procedure
                </button>
              </div>
              <p class="procedure-title">${item.label || "Procedure"}</p>
              <p>${snippet}</p>
            </div>
          `;
        })
        .join("")}</div>`;
    }

    function formatCitations(refs = []) {
      if (!refs.length) {
        return '<span class="small-muted">No citations recorded.</span>';
      }

      return `<ul class="reference-list">${refs
        .map(ref => {
          const anchor = ref.url
            ? `<a href="${ref.url}" target="_blank" rel="noopener">Source</a>`
            : "";
          const title = ref.source_name || ref.description || "Reference";
          const desc = ref.description && ref.description !== ref.source_name ? ref.description : "";
          return `<li>
            <span class="reference-title">${title}</span>
            ${desc ? `<span class="reference-description">${desc}</span>` : ""}
            ${anchor}
          </li>`;
        })
        .join("")}</ul>`;
    }

    function updateContextToggleLabel() {
      if (!contextToggleButton) return;
      contextToggleButton.disabled = false;
      contextToggleButton.textContent = `Context: ${useContextEntities ? "On" : "Off"}`;
      contextToggleButton.setAttribute("aria-pressed", useContextEntities ? "true" : "false");
      updateControlSummaryChips();
    }

    function setContextMode(enable, options = {}) {
      if (!graphDataExtended) return;
      const { skipReset = false } = options;

      if (useContextEntities === enable) {
        updateContextToggleLabel();
        updateModeTabsUI();
        if (!skipReset) {
          resetToDefaultView();
        }
        return;
      }

      useContextEntities = enable;
      graphDataRef = useContextEntities ? graphDataExtended : graphDataCore;
      hydrateNodeMap(graphDataRef);
      updateContextToggleLabel();
       updateModeTabsUI();

      if (!skipReset) {
        resetToDefaultView();
      }
    }

    function setActiveMode(mode, options = {}) {
      const { skipReset = false } = options;
      const isWorkflowMode = mode === "workflow";
      const isContextGraphMode = Boolean(MODE_NODE_TYPES[mode]);
      const isAttackMode = mode === "attack";
      if (!isWorkflowMode && !isAttackMode && !isContextGraphMode) return;
      if (isContextGraphMode && !graphDataExtended) return;

      activeMode = mode;
      updateModeTabsUI();
      syncWorkspaceViewForMode();

      if (isWorkflowMode) {
        restoreDetailsPanel();
        if (!skipReset) {
          renderWorkflowView();
        }
        return;
      }

      const requiresContext = isContextGraphMode;
      setContextMode(requiresContext, { skipReset: true });

      if (!skipReset) {
        resetToDefaultView();
      }
    }

    function buildNodeElement(node) {
      let label = `${node.attack_id || "NO-ID"} - ${node.label}`;

      if (node.node_type === "technique" && !node.is_subtechnique) {
        const subCount = getChildSubtechniques(node.id).length;
        if (subCount > 0) {
          label += ` [+${subCount}]`;
        }
      }

      const isContextNode = node.default_visible === false;
      const contextState = highlightNewEntities && isContextNode ? "highlight" : "default";

      return {
        data: {
          id: node.id,
          label: label,
          attack_id: node.attack_id,
          node_type: node.node_type,
          is_subtechnique: node.is_subtechnique || false,
          context_state: contextState
        }
      };
    }

    function buildEdgeElement(edge, overrideType = null, overrideSource = null, overrideTarget = null) {
      return {
        data: {
          id: `${overrideSource || edge.source}->${overrideTarget || edge.target}->${overrideType || edge.type}`,
          source: overrideSource || edge.source,
          target: overrideTarget || edge.target,
          type: overrideType || edge.type
        }
      };
    }

    function getTechniqueDomains(techId) {
      const technique = techniqueMap[techId];
      return (technique && technique.domains) || [];
    }

    function matchesTechniqueQuery(record, normalizedQuery) {
      if (!record || !normalizedQuery) return false;
      const idPart = `${record.attack_id || record.attackId || ""}`.toLowerCase();
      const labelPart = `${record.label || record.name || ""}`.toLowerCase();
      return idPart.includes(normalizedQuery) || labelPart.includes(normalizedQuery);
    }

    function matchesNodeQuery(record, normalizedQuery) {
      if (!record || !normalizedQuery) return false;
      const idPart = `${record.attack_id || record.attackId || record.id || ""}`.toLowerCase();
      const labelPart = `${record.label || record.name || ""}`.toLowerCase();
      return idPart.includes(normalizedQuery) || labelPart.includes(normalizedQuery);
    }

    function findTechniqueByQuery(query) {
      if (!query) return null;
      const normalized = query.toLowerCase();
      const activeNodeMatch = Object.values(nodeMap).find(
        node => node.node_type === "technique" && matchesTechniqueQuery(node, normalized)
      );
      if (activeNodeMatch) {
        return { id: activeNodeMatch.id, node: activeNodeMatch };
      }

      const globalNodeMatch = Object.values(allNodeMap).find(
        node => node.node_type === "technique" && matchesTechniqueQuery(node, normalized)
      );
      if (globalNodeMatch) {
        return { id: globalNodeMatch.id, node: globalNodeMatch };
      }

      const techniqueRecordMatch = Object.values(techniqueMap).find(tech =>
        matchesTechniqueQuery(tech, normalized)
      );
      if (techniqueRecordMatch) {
        return { id: techniqueRecordMatch.stix_id, record: techniqueRecordMatch };
      }

      return null;
    }

    function formatNodeTypeLabel(nodeType) {
      if (!nodeType) return "";
      return nodeType
        .split(/[-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }

    function collectSearchSuggestions(normalizedQuery) {
      if (!normalizedQuery) return [];
      if (activeMode === "workflow") {
        return Object.values(techniqueMap)
          .filter(
            technique =>
              matchesTechniqueQuery(technique, normalizedQuery) &&
              matchesDomainFilter(technique.stix_id) &&
              matchesPhaseFilter(technique.stix_id)
          )
          .slice(0, 8)
          .map(technique => ({
            id: technique.stix_id,
            label: technique.name || technique.attack_id || technique.stix_id,
            meta: technique.attack_id || "",
            searchValue: technique.name || technique.attack_id || technique.stix_id,
            type: "technique"
          }));
      }

      const candidateMap = new Map();
      Object.values(nodeMap).forEach(node => candidateMap.set(node.id, node));
      Object.values(allNodeMap).forEach(node => {
        if (!candidateMap.has(node.id)) {
          candidateMap.set(node.id, node);
        }
      });

      return Array.from(candidateMap.values())
        .filter(node => {
          if (!matchesNodeQuery(node, normalizedQuery)) return false;
          if (node.node_type === "technique") {
            return matchesPhaseFilter(node.id) && matchesDomainFilter(node.id);
          }
          return true;
        })
        .slice(0, 8)
        .map(node => ({
          id: node.id,
          label: node.label || node.name || node.attack_id || node.id,
          meta: node.attack_id || formatNodeTypeLabel(node.node_type || ""),
          searchValue: node.label || node.name || node.attack_id || node.id,
          type: node.node_type || "node"
        }));
    }

    function renderSearchSuggestions(results) {
      if (!searchSuggestionsContainer) return;
      if (!results.length) {
        clearSearchSuggestions();
        return;
      }
      searchSuggestions = results;
      activeSearchSuggestionIndex = -1;
      const markup = results
        .map(
          (entry, index) => `
            <button
              type="button"
              class="search-suggestion"
              role="option"
              data-suggestion-index="${index}"
              data-suggestion-id="${entry.id}"
              aria-selected="${index === activeSearchSuggestionIndex ? "true" : "false"}"
            >
              <span class="search-suggestion-title">${entry.label}</span>
              <span class="search-suggestion-meta">${entry.meta || ""}</span>
            </button>
          `
        )
        .join("");
      searchSuggestionsContainer.innerHTML = markup;
      searchSuggestionsContainer.classList.remove("is-hidden");
      const searchInput = document.getElementById("search");
      if (searchInput) {
        searchInput.setAttribute("aria-expanded", "true");
      }
    }

    function clearSearchSuggestions() {
      if (!searchSuggestionsContainer) return;
      searchSuggestionsContainer.innerHTML = "";
      searchSuggestionsContainer.classList.add("is-hidden");
      searchSuggestions = [];
      activeSearchSuggestionIndex = -1;
      const searchInput = document.getElementById("search");
      if (searchInput) {
        searchInput.setAttribute("aria-expanded", "false");
      }
    }

    function highlightSearchSuggestion(index) {
      if (!searchSuggestionsContainer) return;
      const items = searchSuggestionsContainer.querySelectorAll(".search-suggestion");
      items.forEach((item, idx) => {
        item.classList.toggle("is-highlighted", idx === index);
        item.setAttribute("aria-selected", idx === index ? "true" : "false");
      });
    }

    function applySearchSuggestion(entry) {
      if (!entry) return;
      const searchInput = document.getElementById("search");
      if (searchInput) {
        searchInput.value = entry.searchValue || entry.label;
      }
      clearSearchSuggestions();
      if (activeMode === "workflow") {
        setWorkflowAnchor(entry.id, { updateSearchInput: false });
        return;
      }
      focusNodeById(entry.id);
    }

    function performDirectSearch(query) {
      if (!query) return false;
      const normalized = query.toLowerCase().trim();
      if (!normalized) return false;
      if (activeMode === "workflow") {
        const match = findTechniqueByQuery(normalized);
        if (match) {
          setWorkflowAnchor(match.id, { updateSearchInput: false });
          return true;
        }
        return false;
      }

      const activePool = Object.values(nodeMap);
      let matchedNode = activePool.find(node => {
        const label = `${node.attack_id || ""} ${node.label || ""}`.toLowerCase();
        return label.includes(normalized);
      });

      if (!matchedNode && !useContextEntities) {
        matchedNode = Object.values(allNodeMap).find(node => {
          const label = `${node.attack_id || ""} ${node.label || ""}`.toLowerCase();
          return label.includes(normalized);
        });
      }

      if (!matchedNode) return false;
      focusNodeById(matchedNode.id);
      return true;
    }

    function matchesDomainFilter(techId) {
      if (activeDomainFilter === "all") return true;
      return getTechniqueDomains(techId).includes(activeDomainFilter);
    }

    function matchesPhaseFilter(techId) {
      if (activePhaseFilter === "all" || !techId) return true;
      const info = getTechniquePhaseInfo(techId);
      if (!info || !Array.isArray(info.phases) || !info.phases.length) {
        return false;
      }
      return info.phases.some(phase => phase.shortname === activePhaseFilter);
    }

    function getTechniqueNameLabel(techId) {
      if (!techId) return "";
      const record = techniqueMap[techId];
      const nodeRecord = nodeMap[techId] || allNodeMap[techId];
      return (
        record?.name ||
        nodeRecord?.label ||
        record?.attack_id ||
        nodeRecord?.attack_id ||
        techId ||
        ""
      ).toString();
    }

    function getTechniqueAttackIdLabel(techId) {
      if (!techId) return "";
      const record = techniqueMap[techId];
      const nodeRecord = nodeMap[techId] || allNodeMap[techId];
      return (record?.attack_id || nodeRecord?.attack_id || "").toString();
    }

    function compareTechniquesForSort(aId, bId) {
      if (!aId || !bId) return 0;
      if (activeSortOrder === "signal") {
        return getTechniqueUsageScore(bId) - getTechniqueUsageScore(aId);
      }
      if (activeSortOrder === "alpha") {
        return getTechniqueNameLabel(aId).localeCompare(getTechniqueNameLabel(bId));
      }
      if (activeSortOrder === "attack") {
        const idResult = getTechniqueAttackIdLabel(aId).localeCompare(getTechniqueAttackIdLabel(bId));
        if (idResult !== 0) return idResult;
        return getTechniqueNameLabel(aId).localeCompare(getTechniqueNameLabel(bId));
      }
      const infoA = getTechniquePhaseInfo(aId);
      const infoB = getTechniquePhaseInfo(bId);
      const idxA = Number.isFinite(infoA.primaryIndex) ? infoA.primaryIndex : 99;
      const idxB = Number.isFinite(infoB.primaryIndex) ? infoB.primaryIndex : 99;
      if (idxA !== idxB) return idxA - idxB;
      return getTechniqueNameLabel(aId).localeCompare(getTechniqueNameLabel(bId));
    }

    function sortEdgesByTechniquePreference(edges) {
      if (!Array.isArray(edges)) return [];
      if (edges.length <= 1) return edges.slice();
      return edges.slice().sort((a, b) => compareTechniquesForSort(a.target, b.target));
    }

    function sortTechniqueNodes(nodes = []) {
      if (!Array.isArray(nodes)) return [];
      return nodes
        .slice()
        .sort((a, b) => compareTechniquesForSort(a?.id || a, b?.id || b));
    }

    function buildModeAwareDefaultView(limitOverride) {
      const limit = limitOverride ?? nodeSampleLimit;
      const targetType = MODE_NODE_TYPES[activeMode];
      if (activeMode === "attack" || !targetType) {
        return buildAttackDefaultView(limit);
      }

      return buildContextDefaultView(targetType, limit);
    }

    function setWorkflowAnchor(techId, options = {}) {
      if (!techId || !techniqueMap[techId]) return;
      activeWorkflowTechniqueId = techId;
      activeWorkflowPhaseIndex = null;
      workflowTimelineExpanded = false;
      if (options.updateSearchInput !== false) {
        const searchInput = document.getElementById("search");
        if (searchInput) {
          const technique = techniqueMap[techId];
          searchInput.value = `${technique.attack_id || ""} ${technique.name || ""}`.trim();
        }
      }
      if (activeMode !== "workflow") {
        setActiveMode("workflow", { skipReset: true });
      }
      renderWorkflowView();
    }

    function renderWorkflowTimeline(activePhases = workflowTimelineHighlights) {
      if (!workflowTimeline) return;
      workflowTimelineHighlights = activePhases || [];
      const activeSet = new Set(workflowTimelineHighlights.map(phase => phase.shortname));
      const hasHighlights = activeSet.size > 0;
      const shouldShowFullChain = workflowTimelineExpanded || !hasHighlights;
      let phasesToRender = shouldShowFullChain
        ? WORKFLOW_TACTIC_SEQUENCE
        : WORKFLOW_TACTIC_SEQUENCE.filter(phase => activeSet.has(phase.shortname));
      if (!phasesToRender.length) {
        phasesToRender = WORKFLOW_TACTIC_SEQUENCE;
      }
      const markup = phasesToRender
        .map((phase, index) => {
          const isActive = activeSet.has(phase.shortname);
          const isSelected = activeWorkflowPhaseIndex === phase.index;
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
          workflowTimelineExpanded ? "true" : "false"
        );
        const toggleLabel = workflowTimelineExpanded
          ? "Collapse to Anchored Phases"
          : hiddenCount > 0
          ? `Show Full Chain (${hiddenCount} hidden)`
          : "Show Full Chain";
        setIconButtonLabel(workflowTimelineToggleButton, toggleLabel);
      }
    }

    function setTimelineVisibility(visible) {
      if (workflowTimeline) {
        if (!visible) {
          workflowTimeline.innerHTML = "";
        }
        workflowTimeline.classList.toggle("is-hidden", !visible);
      }
      if (workflowTimelineToggleButton) {
        workflowTimelineToggleButton.classList.toggle("is-hidden", !visible);
      }
    }

    function renderWorkflowView() {
      if (!workflowPanel) return;
      const workflowActive = activeMode === "workflow";
      workflowPanel.classList.toggle("is-hidden", !workflowActive);
      if (!workflowActive) return;

      const anchorId = activeWorkflowTechniqueId;
      const anchorTechnique = anchorId ? techniqueMap[anchorId] : null;
      const anchorEntry = anchorId ? ensureWorkflowTechnique(anchorId) : null;
      const highlightedPhases = anchorEntry && anchorEntry.phases ? anchorEntry.phases : [];
      const hasAnchor = Boolean(anchorTechnique);
      setTimelineVisibility(hasAnchor);

      if (!anchorTechnique) {
        closeDetailsPanel();
        resetDetailsPanelContent();
        if (workflowAnchorDetails) {
          workflowAnchorDetails.innerHTML = "";
        }
        if (workflowPhaseList) {
          workflowPhaseList.innerHTML = "";
          workflowPhaseList.classList.add("is-hidden");
        }
        if (workflowPhasePlaceholder) {
          workflowPhasePlaceholder.classList.add("is-hidden");
        }
        if (workflowEmptyState) {
          workflowEmptyState.classList.remove("is-hidden");
        }
        updateStatusChipText("Workflow mode ready. Search a technique to begin.");
        return;
      }

      renderWorkflowTimeline(highlightedPhases);

      if (workflowEmptyState) {
        workflowEmptyState.classList.add("is-hidden");
      }
      if (workflowAnchorDetails) {
        workflowAnchorDetails.innerHTML = buildWorkflowAnchorCard(anchorTechnique);
      }

      const columns = buildWorkflowPhaseModel(anchorId, anchorEntry);
      workflowPhaseColumns = new Map();
      columns.forEach(column => {
        if (column && column.phase) {
          workflowPhaseColumns.set(column.phase.index, column);
        }
      });
      renderWorkflowPhaseDetails();
      const detailNodeId = anchorTechnique?.stix_id || anchorTechnique?.id;
      if (detailNodeId) {
        renderTechniqueDetails(anchorTechnique, detailNodeId);
      }
      updateStatusChipText(
        `Workflow anchored on ${anchorTechnique.attack_id || ""} ${anchorTechnique.name}`
      );
    }

    function renderWorkflowPhaseDetails() {
      if (!workflowPhaseList) return;
      const hasColumns = workflowPhaseColumns && workflowPhaseColumns.size;
      const hasSelection =
        Number.isFinite(activeWorkflowPhaseIndex) &&
        workflowPhaseColumns.has(activeWorkflowPhaseIndex);
      if (!hasColumns || !hasSelection) {
        workflowPhaseList.innerHTML = "";
        workflowPhaseList.classList.add("is-hidden");
        if (workflowPhasePlaceholder) {
          workflowPhasePlaceholder.classList.remove("is-hidden");
        }
        return;
      }

      const column = workflowPhaseColumns.get(activeWorkflowPhaseIndex);
      if (!column) {
        workflowPhaseList.innerHTML = "";
        workflowPhaseList.classList.add("is-hidden");
        if (workflowPhasePlaceholder) {
          workflowPhasePlaceholder.classList.remove("is-hidden");
        }
        return;
      }

      if (workflowPhasePlaceholder) {
        workflowPhasePlaceholder.classList.add("is-hidden");
      }
      workflowPhaseList.classList.remove("is-hidden");
      workflowPhaseList.innerHTML = renderWorkflowPhaseColumn(column);
    }

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

    function buildWorkflowPhaseModel(anchorId, anchorEntry) {
      anchorEntry = anchorEntry || ensureWorkflowTechnique(anchorId);
      let anchorPhases = anchorEntry.phases || [];
      if (!anchorPhases.length) {
        const fallbackIndex = Number.isFinite(anchorEntry.primaryIndex) ? anchorEntry.primaryIndex : 0;
        const fallbackPhase = WORKFLOW_TACTIC_SEQUENCE[fallbackIndex] || WORKFLOW_TACTIC_SEQUENCE[0];
        anchorPhases = fallbackPhase ? [fallbackPhase] : [];
        anchorEntry.phases = anchorPhases;
      }
      const anchorPhaseIndices = anchorPhases.length
        ? anchorPhases.map(phase => phase.index)
        : [0];
      const minAnchor = Math.min(...anchorPhaseIndices);
      const maxAnchor = Math.max(...anchorPhaseIndices);
      const neighbors = {
        predecessors: buildNeighborArray(anchorEntry.predecessors),
        successors: buildNeighborArray(anchorEntry.successors),
        parallels: buildNeighborArray(anchorEntry.parallels)
      };

      const columns = WORKFLOW_TACTIC_SEQUENCE.map(phase => {
        const idx = phase.index;
        const isAnchorPhase = anchorPhaseIndices.includes(idx);
        const state = isAnchorPhase
          ? "anchor"
          : idx < minAnchor
          ? "before"
          : idx > maxAnchor
          ? "after"
          : "after";
        const column = {
          phase,
          state,
          anchorTechniques: [],
          preceding: [],
          succeeding: [],
          parallels: [],
          fallback: []
        };

        if (isAnchorPhase) {
          column.anchorTechniques.push(createTechniqueWorkflowModel(anchorId, "anchor"));
          column.parallels = neighbors.parallels
            .filter(item => item.phaseInfo.phases.some(phaseInfo => phaseInfo.index === idx))
            .slice(0, WORKFLOW_COLUMN_CARD_LIMIT)
            .map(item => createTechniqueWorkflowModel(item.techId, "parallel", item.bucket))
            .filter(Boolean);
        }

        if (state === "before") {
          column.preceding = neighbors.predecessors
            .filter(item => item.phaseInfo.phases.some(phaseInfo => phaseInfo.index === idx))
            .slice(0, WORKFLOW_COLUMN_CARD_LIMIT)
            .map(item => createTechniqueWorkflowModel(item.techId, "preceding", item.bucket))
            .filter(Boolean);
        }

        if (state === "after") {
          column.succeeding = neighbors.successors
            .filter(item => item.phaseInfo.phases.some(phaseInfo => phaseInfo.index === idx))
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
          column.fallback = buildFallbackTechniques(phase.shortname, {
            exclude: new Set([anchorId])
          });
        }

        return column;
      });

      return columns;
    }

    function buildNeighborArray(neighborMap = {}) {
      return Object.entries(neighborMap).map(([techId, bucket]) => ({
        techId,
        bucket,
        phaseInfo: getTechniquePhaseInfo(techId)
      }));
    }

    function createTechniqueWorkflowModel(techId, relation, bucket = null) {
      const technique = techniqueMap[techId];
      if (!technique) return null;
      return {
        techId,
        technique,
        relation,
        weight: bucket?.weight || 0,
        entities: bucket?.entities || {}
      };
    }

    function buildFallbackTechniques(phaseShortname, options = {}) {
      const exclude = options.exclude || new Set();
      const pool = phaseTechniqueCatalog[phaseShortname] || [];
      return pool
        .filter(id => !exclude.has(id))
        .sort((a, b) => getTechniqueUsageScore(b) - getTechniqueUsageScore(a))
        .slice(0, WORKFLOW_COLUMN_CARD_LIMIT)
        .map(id => createTechniqueWorkflowModel(id, "reference"))
        .filter(Boolean);
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
      const body = sections.length ? sections.join("") : buildPhaseEmptyState("No signals available for this phase.");

      return `
        <div class="workflow-phase-column" data-phase-state="${column.state}">
          <div class="workflow-phase-header">
            <p class="phase-metadata">Phase ${column.phase.index + 1}</p>
            <h4>${column.phase.label}</h4>
          </div>
          <div class="workflow-phase-body">
            ${body}
          </div>
        </div>
      `;
    }

    function renderWorkflowTechniqueCard(model) {
      if (!model || !model.technique) return "";
      const technique = model.technique;
      const entitySummary = summarizeEntitySupport(model.entities || {});
      const metaParts = [];
      if (model.weight) {
        metaParts.push(`<span class="workflow-card-weight">${model.weight} signal${model.weight > 1 ? "s" : ""}</span>`);
      }
      if (entitySummary) {
        metaParts.push(`<span>${entitySummary}</span>`);
      }
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

    function buildAttackDefaultView(limit = nodeSampleLimit) {
      const techniqueEdges = graphDataRef.edges.filter(edge => {
        if (edge.type !== "tactic-technique") return false;
        if (!isParentTechnique(edge.target)) return false;
        if (!matchesDomainFilter(edge.target)) return false;
        if (!matchesPhaseFilter(edge.target)) return false;
        return true;
      });

      const sortedEdges = sortEdgesByTechniquePreference(techniqueEdges);
      if (!sortedEdges.length) {
        return {
          elements: [],
          nodesCount: 0,
          edgesCount: 0
        };
      }

      const techniqueLimit = Math.max(5, Math.min(limit, sortedEdges.length));
      const parentTechniqueIds = [];
      const tacticForTechnique = new Map();
      const seenTechniques = new Set();

      for (const edge of sortedEdges) {
        if (parentTechniqueIds.length >= techniqueLimit) {
          break;
        }
        if (seenTechniques.has(edge.target)) continue;
        seenTechniques.add(edge.target);
        parentTechniqueIds.push(edge.target);
        tacticForTechnique.set(edge.target, edge.source);
      }

      const nodeIds = new Set();
      const nodeElements = [];
      const primaryEdges = [];

      const addNodeIfPresent = id => {
        if (!id || nodeIds.has(id)) return;
        const node = nodeMap[id];
        if (!node) return;
        nodeElements.push(buildNodeElement(node));
        nodeIds.add(id);
      };

      parentTechniqueIds.forEach(techId => {
        addNodeIfPresent(techId);
        const tacticId = tacticForTechnique.get(techId);
        if (tacticId) {
          addNodeIfPresent(tacticId);
          primaryEdges.push(
            buildEdgeElement({
              source: tacticId,
              target: techId,
              type: "tactic-technique"
            })
          );
        }
      });

      const subtechAssignments = [];
      parentTechniqueIds.forEach(parentId => {
        const children = sortTechniqueNodes(getChildSubtechniques(parentId));
        children.forEach(child => {
          if (!child || !child.id) return;
          if (!matchesDomainFilter(child.id)) return;
          if (!matchesPhaseFilter(child.id)) return;
          subtechAssignments.push({ parentId, child });
        });
      });

      let subtechCap = 0;
      if (activeFocusFilter === "balanced") {
        subtechCap = Math.min(
          subtechAssignments.length,
          Math.max(2, Math.floor(parentTechniqueIds.length * 0.4))
        );
      } else if (activeFocusFilter === "subtech") {
        const availableBudget = Math.max(5, limit - parentTechniqueIds.length);
        subtechCap = Math.min(subtechAssignments.length, availableBudget);
      }

      const supplementaryEdges = [];
      subtechAssignments.slice(0, subtechCap).forEach(entry => {
        addNodeIfPresent(entry.child.id);
        supplementaryEdges.push(
          buildEdgeElement(
            {
              source: entry.child.id,
              target: entry.parentId,
              type: "contains-subtechnique"
            },
            "contains-subtechnique"
          )
        );
      });

      const elements = [...nodeElements, ...primaryEdges, ...supplementaryEdges];
      return {
        elements,
        nodesCount: nodeElements.length,
        edgesCount: primaryEdges.length + supplementaryEdges.length
      };
    }

    function buildContextDefaultView(nodeType, limit = nodeSampleLimit) {
      if (!nodeType) {
        return buildAttackDefaultView(limit);
      }

      const candidates = graphDataRef.nodes.filter(node => node.node_type === nodeType);
      if (!candidates.length) {
        return buildAttackDefaultView(limit);
      }

      const maxSeeds = Math.max(1, Math.min(candidates.length, Math.floor(limit / 3) || 1));
      const seedNodes = candidates.slice(0, maxSeeds);

      const nodeStore = new Map();
      const nodeIds = new Set();
      seedNodes.forEach(node => {
        nodeIds.add(node.id);
        nodeStore.set(node.id, node);
      });

      const edges = [];
      const seenEdges = new Set();
      const addEdgeRecord = edge => {
        const key = `${edge.source}->${edge.target}->${edge.type}`;
        if (seenEdges.has(key)) return;
        seenEdges.add(key);
        edges.push(edge);
      };

      const addNodeIfSpace = id => {
        if (nodeIds.has(id)) return true;
        if (nodeIds.size >= limit) return false;
        const node = nodeMap[id] || allNodeMap[id];
        if (!node) return false;
        nodeIds.add(id);
        nodeStore.set(id, node);
        return true;
      };

      const includeProcedures = showProceduresInView || nodeType === "procedure";
      const includeCampaignLinks = showCampaignLinks && activeMode === "campaigns";

      const handleContextMode = () => {
        const contextTechniqueTypes = new Set([
          "group-technique",
          "malware-technique",
          "campaign-technique"
        ]);
        const sortedContextEdges = sortEdgesByTechniquePreference(
          graphDataRef.edges.filter(edge => contextTechniqueTypes.has(edge.type))
        );
        const techniqueCountsByContext = new Map();
        const techniqueIds = new Set();
        const techniqueGlobalCap = Math.max(5, Math.floor(limit * 0.65));
        const perContextTechniqueCap = Math.max(
          2,
          Math.floor(techniqueGlobalCap / Math.max(1, seedNodes.length))
        );

        sortedContextEdges.forEach(edge => {
          if (nodeIds.size >= limit) return;
          if (!nodeIds.has(edge.source)) return;
          if (!matchesDomainFilter(edge.target)) return;
          if (!matchesPhaseFilter(edge.target)) return;

          if (techniqueIds.size >= techniqueGlobalCap) return;
          const used = techniqueCountsByContext.get(edge.source) || 0;
          if (used >= perContextTechniqueCap) return;

          if (!addNodeIfSpace(edge.target)) return;
          techniqueIds.add(edge.target);
          techniqueCountsByContext.set(edge.source, used + 1);
          addEdgeRecord(edge);
        });

        if (includeCampaignLinks) {
          ["campaign-group", "campaign-malware"].forEach(etype => {
            graphDataRef.edges.forEach(edge => {
              if (nodeIds.size >= limit) return;
              if (edge.type !== etype) return;
              if (!nodeIds.has(edge.source)) return;
              if (!addNodeIfSpace(edge.target)) return;
              addEdgeRecord(edge);
            });
          });
        }

        if (includeProcedures) {
          const procedureCap = Math.max(1, Math.floor(limit / 5));
          const techniqueProcedureCounts = new Map();
          const sortedProcedureEdges = sortEdgesByTechniquePreference(
            graphDataRef.edges.filter(edge => edge.type === "procedure-technique")
          );

          sortedProcedureEdges.forEach(edge => {
            if (nodeIds.size >= limit) return;
            if (!nodeIds.has(edge.target)) return;
            if (!matchesDomainFilter(edge.target)) return;
            if (!matchesPhaseFilter(edge.target)) return;
            const used = techniqueProcedureCounts.get(edge.target) || 0;
            if (used >= procedureCap) return;
            if (!addNodeIfSpace(edge.source)) return;
            techniqueProcedureCounts.set(edge.target, used + 1);
            addEdgeRecord(edge);
          });

          ["procedure-group", "procedure-malware", "procedure-campaign"].forEach(etype => {
            graphDataRef.edges.forEach(edge => {
              if (edge.type !== etype) return;
              if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
              addEdgeRecord(edge);
            });
          });
        }
      };

      const handleProcedureMode = () => {
        const perProcedureTechniqueCap = Math.max(1, Math.floor(limit / Math.max(1, seedNodes.length)));
        const procedureTechniqueCounts = new Map();

        graphDataRef.edges.forEach(edge => {
          if (nodeIds.size >= limit) return;
          if (edge.type !== "procedure-technique") return;
          if (!nodeIds.has(edge.source)) return;
          const used = procedureTechniqueCounts.get(edge.source) || 0;
          if (used >= perProcedureTechniqueCap) return;
          if (!addNodeIfSpace(edge.target)) return;
          procedureTechniqueCounts.set(edge.source, used + 1);
          addEdgeRecord(edge);
        });

        ["procedure-group", "procedure-malware", "procedure-campaign"].forEach(etype => {
          graphDataRef.edges.forEach(edge => {
            if (nodeIds.size >= limit) return;
            if (edge.type !== etype) return;
            if (!nodeIds.has(edge.source)) return;
            if (!addNodeIfSpace(edge.target)) return;
            addEdgeRecord(edge);
          });
        });

        if (showCampaignLinks) {
          ["campaign-technique", "group-technique", "malware-technique"].forEach(etype => {
            graphDataRef.edges.forEach(edge => {
              if (nodeIds.size >= limit) return;
              if (edge.type !== etype) return;
              if (!nodeIds.has(edge.source)) return;
              if (!addNodeIfSpace(edge.target)) return;
              addEdgeRecord(edge);
            });
          });
        }
      };

      if (nodeType === "procedure") {
        handleProcedureMode();
      } else {
        handleContextMode();
      }

      const finalNodes = Array.from(nodeStore.values());
      const elements = [
        ...finalNodes.map(buildNodeElement),
        ...edges.map(edge => buildEdgeElement(edge))
      ];

      return {
        elements,
        nodesCount: finalNodes.length,
        edgesCount: edges.length
      };
    }

    function buildTacticView(tacticId) {
      const tacticNode = nodeMap[tacticId];
      const techniqueNodes = getTechniquesForTactic(tacticId);

      const edges = graphDataRef.edges.filter(
        edge =>
          edge.type === "tactic-technique" &&
          edge.source === tacticId &&
          isParentTechnique(edge.target)
      );

      const nodes = [tacticNode, ...techniqueNodes].filter(Boolean);

      const elements = [
        ...nodes.map(buildNodeElement),
        ...edges.map(edge => buildEdgeElement(edge))
      ];

      return {
        elements,
        nodesCount: nodes.length,
        edgesCount: edges.length
      };
    }

    function buildTechniqueExpandedView(parentTechniqueId) {
      const parentTechnique = nodeMap[parentTechniqueId];
      const tacticNodes = getTacticsForTechnique(parentTechniqueId);
      const childSubtechniques = getChildSubtechniques(parentTechniqueId);

      const tacticEdges = graphDataRef.edges.filter(
        edge =>
          edge.type === "tactic-technique" &&
          edge.target === parentTechniqueId
      );

      const displaySubEdges = childSubtechniques.map(child => ({
        source: parentTechniqueId,
        target: child.id,
        type: "contains-subtechnique"
      }));

      const nodes = [...tacticNodes, parentTechnique, ...childSubtechniques].filter(Boolean);

      const elements = [
        ...nodes.map(buildNodeElement),
        ...tacticEdges.map(edge => buildEdgeElement(edge)),
        ...displaySubEdges.map(edge => buildEdgeElement(edge))
      ];

      return {
        elements,
        nodesCount: nodes.length,
        edgesCount: tacticEdges.length + displaySubEdges.length
      };
    }

    function buildContextEntityView(entityId, entityType) {
      const rootNode = nodeMap[entityId];
      if (!rootNode) return null;

      const edgeTypeMap = {
        group: ["group-technique"],
        malware: ["malware-technique"],
        campaign: ["campaign-technique", "campaign-group", "campaign-malware"],
        procedure: [
          "procedure-technique",
          "procedure-group",
          "procedure-malware",
          "procedure-campaign"
        ]
      };

      const relevantEdges = graphDataRef.edges.filter(
        edge => edge.source === entityId && (edgeTypeMap[entityType] || []).includes(edge.type)
      );

      const nodeIds = new Set([entityId]);
      relevantEdges.forEach(edge => nodeIds.add(edge.target));

      const nodes = Array.from(nodeIds)
        .map(id => nodeMap[id])
        .filter(Boolean);

      const elements = [
        ...nodes.map(buildNodeElement),
        ...relevantEdges.map(edge => buildEdgeElement(edge))
      ];

      return {
        elements,
        nodesCount: nodes.length,
        edgesCount: relevantEdges.length
      };
    }

    function renderTechniqueDetails(nodeData, nodeId) {
      const techniqueData = techniqueMap[nodeId] || nodeMap[nodeId];
      const { parents, children } = getHierarchyInfo(nodeId);
      const tactics = getTacticsForTechnique(nodeId);
      const descriptionText = techniqueData.description || "No description available.";
      const contextInfo = techniqueContextIndex[nodeId] || {
        groups: [],
        malware: [],
        campaigns: [],
        procedures: []
      };

      const techniqueTypeBadge = techniqueData.is_subtechnique
        ? `<span class="badge badge-sub">Sub-technique</span>`
        : `<span class="badge badge-parent">Technique</span>`;

      detailsContainer.innerHTML = `
        <div class="label">Name</div>
        <div class="value-block">${techniqueData.name || techniqueData.label}</div>

        <div class="label">ATT&CK ID</div>
        <div class="value-block">${techniqueData.attack_id || "N/A"}</div>

        <div class="label">Node Type</div>
        <div class="value-block">${techniqueTypeBadge}</div>

        <div class="label">Tactic(s)</div>
        <div class="value-block">
          ${formatNodeLinks(tactics)}
        </div>

        <div class="label">Parent Technique</div>
        <div class="value-block">
          ${formatNodeLinks(parents)}
        </div>

        <div class="label">Child Sub-techniques</div>
        <div class="value-block">
          ${formatNodeLinks(children)}
        </div>

        <div class="label">Description</div>
        ${buildDescriptionBlock(descriptionText)}

        <div class="label">Groups Using This Technique</div>
        <div class="value-block">
          ${formatNodeLinks(
            contextInfo.groups || [],
            "No recorded groups currently linked to this technique."
          )}
        </div>

        <div class="label">Malware Using This Technique</div>
        <div class="value-block">
          ${formatNodeLinks(
            contextInfo.malware || [],
            "No malware families currently linked to this technique."
          )}
        </div>

        <div class="label">Campaigns Using This Technique</div>
        <div class="value-block">
          ${formatNodeLinks(
            contextInfo.campaigns || [],
            "No campaign reporting mapped to this technique."
          )}
        </div>

        <div class="label">Documented Procedures</div>
        <div class="value-block">
          ${formatProcedurePreviewList(contextInfo.procedures || [])}
        </div>
      `;
      openDetailsPanel();
    }

    function renderTacticDetails(nodeData, nodeId) {
      const tacticData = tacticMap[nodeId] || nodeMap[nodeId];
      const techniques = getTechniquesForTactic(nodeId);
      const descriptionText = tacticData.description || "No description available.";

      detailsContainer.innerHTML = `
        <div class="label">Name</div>
        <div class="value-block">${tacticData.name || tacticData.label}</div>

        <div class="label">ATT&CK ID</div>
        <div class="value-block">${tacticData.attack_id || "N/A"}</div>

        <div class="label">Node Type</div>
        <div class="value-block"><span class="badge" style="background:#8e24aa;">Tactic</span></div>

        <div class="label">Techniques Under This Tactic</div>
        <div class="value-block">
          ${formatNodeLinks(techniques)}
        </div>

        <div class="label">Description</div>
        ${buildDescriptionBlock(descriptionText)}
      `;
      openDetailsPanel();
    }

    function renderGroupDetails(nodeData, nodeId) {
      const record = entityData.group[nodeId] || nodeData;
      if (!record) {
        closeDetailsPanel();
        return;
      }

      detailsContainer.innerHTML = `
        <div class="label">Name</div>
        <div class="value-block">${record.name || nodeData.label}</div>

        <div class="label">ATT&CK ID</div>
        <div class="value-block">${record.attack_id || "N/A"}</div>

        <div class="label">Node Type</div>
        <div class="value-block">${buildBadge("group")}</div>

        <div class="label">Aliases</div>
        <div class="value-block">${formatValueChips(record.aliases, "No known aliases.")}</div>

        <div class="label">Motivations</div>
        <div class="value-block">${formatValueChips(
          [record.primary_motivation, ...(record.secondary_motivations || [])].filter(Boolean),
          "No stated motivations."
        )}</div>

        <div class="label">Goals</div>
        <div class="value-block">${formatValueChips(record.goals, "No explicit goals shared.")}</div>

        <div class="label">Observed Techniques</div>
        <div class="value-block">
          ${formatNodeLinks(record.techniques || [], "No linked techniques yet.")}
        </div>

        <div class="label">Description</div>
        ${buildDescriptionBlock(record.description)}
      `;
      openDetailsPanel();
    }

    function renderMalwareDetails(nodeData, nodeId) {
      const record = entityData.malware[nodeId] || nodeData;
      if (!record) {
        closeDetailsPanel();
        return;
      }

      detailsContainer.innerHTML = `
        <div class="label">Name</div>
        <div class="value-block">${record.name || nodeData.label}</div>

        <div class="label">ATT&CK ID</div>
        <div class="value-block">${record.attack_id || "N/A"}</div>

        <div class="label">Node Type</div>
        <div class="value-block">${buildBadge("malware")}</div>

        <div class="label">Aliases</div>
        <div class="value-block">${formatValueChips(record.aliases, "No known aliases.")}</div>

        <div class="label">Malware Types</div>
        <div class="value-block">${formatValueChips(record.malware_types, "No types provided.")}</div>

        <div class="label">Platforms</div>
        <div class="value-block">${formatValueChips(record.platforms, "No platforms specified.")}</div>

        <div class="label">Capabilities</div>
        <div class="value-block">${formatValueChips(
          record.capabilities,
          "No capability annotations."
        )}</div>

        <div class="label">Observed Techniques</div>
        <div class="value-block">
          ${formatNodeLinks(record.techniques || [], "No linked techniques yet.")}
        </div>

        <div class="label">Description</div>
        ${buildDescriptionBlock(record.description)}
      `;
      openDetailsPanel();
    }

    function renderCampaignDetails(nodeData, nodeId) {
      const record = entityData.campaign[nodeId] || nodeData;
      if (!record) {
        closeDetailsPanel();
        return;
      }

      const timeline = [formatIsoDate(record.first_seen), formatIsoDate(record.last_seen)].filter(
        Boolean
      );

      detailsContainer.innerHTML = `
        <div class="label">Name</div>
        <div class="value-block">${record.name || nodeData.label}</div>

        <div class="label">ATT&CK ID</div>
        <div class="value-block">${record.attack_id || "N/A"}</div>

        <div class="label">Node Type</div>
        <div class="value-block">${buildBadge("campaign")}</div>

        <div class="label">Objective</div>
        <div class="value-block">${record.objective || "Not documented."}</div>

        <div class="label">Active Window</div>
        <div class="value-block">
          ${
            timeline.length
              ? timeline.join(" → ")
              : "No temporal bounds recorded."
          }
        </div>

        <div class="label">Associated Groups</div>
        <div class="value-block">
          ${formatNodeLinks(record.groups || [], "No attributed groups provided.")}
        </div>

        <div class="label">Associated Malware</div>
        <div class="value-block">
          ${formatNodeLinks(record.malware || [], "No malware listed for this campaign.")}
        </div>

        <div class="label">Observed Techniques</div>
        <div class="value-block">
          ${formatNodeLinks(record.techniques || [], "No linked techniques yet.")}
        </div>

        <div class="label">Description</div>
        ${buildDescriptionBlock(record.description)}
      `;
      openDetailsPanel();
    }

    function renderProcedureDetails(nodeData, nodeId) {
      const record = entityData.procedure[nodeId] || nodeData;
      if (!record) {
        closeDetailsPanel();
        return;
      }

      const windowLabel =
        record.start_time || record.stop_time
          ? [formatIsoDate(record.start_time), formatIsoDate(record.stop_time)]
              .filter(Boolean)
              .join(" → ")
          : "Not specified.";

      const relatedTechnique = record.target_ref
        ? [
            {
              id: record.target_ref,
              label: record.target_name || record.target_ref,
              attack_id: record.target_attack_id
            }
          ]
        : [];

      const relatedSource = record.source_ref
        ? [
            {
              id: record.source_ref,
              label: record.source_name || record.source_ref,
              attack_id:
                (entityData[record.source_type] &&
                  entityData[record.source_type][record.source_ref] &&
                  entityData[record.source_type][record.source_ref].attack_id) ||
                allNodeMap[record.source_ref]?.attack_id ||
                null
            }
          ]
        : [];

      detailsContainer.innerHTML = `
        <div class="label">Procedure Summary</div>
        <div class="value-block">${record.source_name || nodeData.label}</div>

        <div class="label">Node Type</div>
        <div class="value-block">${buildBadge("procedure")}</div>

        <div class="label">Associated Entity</div>
        <div class="value-block">
          ${formatNodeLinks(relatedSource, "No related entity reference.")}
        </div>

        <div class="label">Target Technique</div>
        <div class="value-block">
          ${formatNodeLinks(relatedTechnique, "No target technique reference.")}
        </div>

        <div class="label">Observed Window</div>
        <div class="value-block">${windowLabel}</div>

        <div class="label">Procedure Narrative</div>
        ${buildDescriptionBlock(record.description)}

        <div class="label">Citations</div>
        <div class="value-block">
          ${formatCitations(record.external_references || [])}
        </div>
      `;
      openDetailsPanel();
    }

    function renderElements(elements, statusText, options = {}) {
      if (!cy) return;
      const {
        layoutOverrides = null,
        selectedId = null,
        preservePositions = false
      } = options;

      if (preservePositions) {
        const previousPositions = {};
        cy.nodes().forEach(node => {
          previousPositions[node.id()] = { ...node.position() };
        });
        const previousPan = { ...cy.pan() };
        const previousZoom = cy.zoom();

        const nodeElements = [];
        const edgeElements = [];
        const nodeElementMap = new Map();
        const edgeElementMap = new Map();

        elements.forEach(el => {
          if (!el || !el.data) return;
          if (typeof el.data.source === "undefined" && typeof el.data.target === "undefined") {
            nodeElements.push(el);
            nodeElementMap.set(el.data.id, el);
          } else {
            edgeElements.push(el);
            edgeElementMap.set(el.data.id, el);
          }
        });

        cy.batch(() => {
          const retainedNodeIds = new Set();
          const nodesToRemove = [];

          cy.nodes().forEach(node => {
            const id = node.id();
            const template = nodeElementMap.get(id);
            if (!template) {
              nodesToRemove.push(node);
              return;
            }
            retainedNodeIds.add(id);
            node.data({ ...template.data });
          });

          nodesToRemove.forEach(node => node.remove());

          const newlyAddedNodeIds = new Set();
          nodeElements.forEach(el => {
            if (!retainedNodeIds.has(el.data.id)) {
              cy.add(el);
              newlyAddedNodeIds.add(el.data.id);
            }
          });

          const edgesToRemove = [];
          cy.edges().forEach(edge => {
            const id = edge.id();
            const template = edgeElementMap.get(id);
            if (!template) {
              edgesToRemove.push(edge);
              return;
            }
            edge.data({ ...template.data });
          });
          edgesToRemove.forEach(edge => edge.remove());

          edgeElements.forEach(el => {
            if (!cy.getElementById(el.data.id).length) {
              cy.add(el);
            }
          });

          const nodesNeedingPlacement = [];
          const jitter = () => Math.random() * 24 - 12;
          cy.nodes().forEach(node => {
            const stored = previousPositions[node.id()];
            if (stored) {
              node.position(stored);
            } else if (newlyAddedNodeIds.has(node.id())) {
              nodesNeedingPlacement.push(node);
            }
          });

          nodesNeedingPlacement.forEach(node => {
            const anchoredPositions = [];
            node.connectedEdges().forEach(edge => {
              const sourceId = edge.data("source");
              const targetId = edge.data("target");
              const neighborId = sourceId === node.id() ? targetId : sourceId;
              if (neighborId && previousPositions[neighborId]) {
                anchoredPositions.push(previousPositions[neighborId]);
              }
            });

            if (anchoredPositions.length) {
              const sums = anchoredPositions.reduce(
                (acc, pos) => {
                  acc.x += pos.x;
                  acc.y += pos.y;
                  return acc;
                },
                { x: 0, y: 0 }
              );
              node.position({
                x: sums.x / anchoredPositions.length + jitter(),
                y: sums.y / anchoredPositions.length + jitter()
              });
            } else {
              node.position({
                x: -previousPan.x + jitter(),
                y: -previousPan.y + jitter()
              });
            }
          });

          if (typeof previousZoom === "number") {
            cy.zoom(previousZoom);
          }
          cy.pan(previousPan);

          cy.elements().removeClass("selected-node");
          if (selectedId) {
            const selected = cy.getElementById(selectedId);
            if (selected) {
              selected.addClass("selected-node");
            }
          }
        });

        updateStatusChipText(statusText);
        return;
      }

      cy.elements().remove();
      cy.add(elements);
      if (!elements.length) {
        updateStatusChipText(statusText);
        return;
      }

      const layoutOptions = getLayoutOptions(layoutOverrides || {});
      const fitPadding = elements.length <= 6 ? 20 : 60;

      cy.one("layoutstop", () => {
        if (selectedId) {
          const selected = cy.getElementById(selectedId);
          if (selected) {
            selected.addClass("selected-node");
            cy.animate(
              {
                center: { eles: selected },
                zoom: Math.min(1.6, Math.max(0.6, cy.zoom()))
              },
              {
                duration: 500,
                easing: "ease-out"
              }
            );
          }
        } else {
          cy.animate(
            {
              fit: { eles: cy.elements(), padding: fitPadding }
            },
            {
              duration: 500,
              easing: "ease-in-out"
            }
          );
        }
      });

      cy.layout(layoutOptions).run();
      updateStatusChipText(statusText);
    }

    function highlightWithinCurrentView(nodeId) {
      if (!cy) return;
      cy.elements().removeClass("faded selected-node connected-node highlighted-edge");
      cy.elements().addClass("faded");
      const node = cy.getElementById(nodeId);
      if (!node || node.empty()) return;

      node.removeClass("faded");
      node.addClass("selected-node");

      const connectedEdges = node.connectedEdges();
      const connectedNodes = node.connectedNodes().difference(node);

      connectedEdges.removeClass("faded").addClass("highlighted-edge");
      connectedNodes.removeClass("faded").addClass("connected-node");

      cy.animate(
        {
          center: { eles: node },
          zoom: Math.min(1.6, Math.max(0.6, cy.zoom()))
        },
        {
          duration: 450,
          easing: "ease-out"
        }
      );
    }

    function focusNodeById(nodeId) {
      let matchedNode = nodeMap[nodeId];
      if (!matchedNode && allNodeMap[nodeId]) {
        setContextMode(true, { skipReset: true });
        matchedNode = nodeMap[nodeId];
      }
      if (!matchedNode) return;

      if (detailsPanel?.classList.contains("is-hidden")) {
        openDetailsPanel();
      } else {
        detailsPanelManuallyHidden = false;
      }

      if (detailsPanelManuallyHidden) {
        openDetailsPanel();
      }

      if (matchedNode.node_type === "tactic") {
        const tacticView = buildTacticView(nodeId);
        renderElements(
          tacticView.elements,
          `Tactic view loaded. Nodes: ${tacticView.nodesCount}, Edges: ${tacticView.edgesCount}`,
          { selectedId: nodeId }
        );
        renderTacticDetails(matchedNode, nodeId);
        return;
      }

      if (
        ["group", "malware", "campaign", "procedure"].includes(matchedNode.node_type) &&
        !useContextEntities
      ) {
        setContextMode(true, { skipReset: true });
        matchedNode = nodeMap[nodeId];
      }

      if (["group", "malware", "campaign", "procedure"].includes(matchedNode.node_type)) {
        const derivedMode = NODE_TYPE_TO_MODE[matchedNode.node_type];
        if (derivedMode) {
          setActiveMode(derivedMode, { skipReset: true });
        }
        const contextView = buildContextEntityView(nodeId, matchedNode.node_type);
        if (contextView) {
          renderElements(
            contextView.elements,
            `${
              matchedNode.node_type.charAt(0).toUpperCase() + matchedNode.node_type.slice(1)
            } neighborhood loaded. Nodes: ${contextView.nodesCount}, Edges: ${contextView.edgesCount}`,
            { selectedId: nodeId }
          );
        }

        if (matchedNode.node_type === "group") {
          renderGroupDetails(matchedNode, nodeId);
        } else if (matchedNode.node_type === "malware") {
          renderMalwareDetails(matchedNode, nodeId);
        } else if (matchedNode.node_type === "campaign") {
          renderCampaignDetails(matchedNode, nodeId);
        } else if (matchedNode.node_type === "procedure") {
          renderProcedureDetails(matchedNode, nodeId);
        }

        return;
      }

      if (!useFullChain && matchedNode.node_type === "technique") {
        highlightWithinCurrentView(nodeId);
        renderTechniqueDetails(matchedNode, nodeId);
        return;
      }

      if (matchedNode.is_subtechnique) {
        const parent = getParentTechnique(nodeId);
        if (parent) {
          const expandedView = buildTechniqueExpandedView(parent.id);
          renderElements(
            expandedView.elements,
            `Technique expanded view loaded. Nodes: ${expandedView.nodesCount}, Edges: ${expandedView.edgesCount}`,
            { selectedId: nodeId }
          );
        } else {
          const fallbackView = buildTechniqueExpandedView(nodeId);
          renderElements(
            fallbackView.elements,
            `Technique expanded view loaded. Nodes: ${fallbackView.nodesCount}, Edges: ${fallbackView.edgesCount}`,
            { selectedId: nodeId }
          );
        }
        renderTechniqueDetails(matchedNode, nodeId);
        return;
      }

      const expandedView = buildTechniqueExpandedView(nodeId);
      renderElements(
        expandedView.elements,
        `Technique expanded view loaded. Nodes: ${expandedView.nodesCount}, Edges: ${expandedView.edgesCount}`,
        { selectedId: nodeId }
      );
      renderTechniqueDetails(matchedNode, nodeId);
    }

    const defaultView = buildModeAwareDefaultView(nodeSampleLimit);

    cy = cytoscape({
      container: document.getElementById("cy"),
      elements: defaultView.elements,
      style: [
        {
          selector: "node",
          style: {
            "label": "data(label)",
            "font-size": "11px",
            "font-weight": "600",
            "text-wrap": "wrap",
            "text-max-width": "150px",
            "width": 38,
            "height": 38,
            "background-color": "#7c8bff",
            "color": "#f5f8ff",
            "text-outline-width": 2,
            "text-outline-color": "rgba(5, 12, 28, 0.65)",
            "border-width": 2,
            "border-color": "rgba(255, 255, 255, 0.35)",
            "shadow-blur": 14,
            "shadow-color": "rgba(0, 0, 0, 0.35)",
            "transition-property": "background-color, width, height, border-width, opacity",
            "transition-duration": "250ms"
          }
        },
        {
          selector: 'node[node_type = "tactic"]',
          style: {
            "background-color": "#c77dff",
            "shape": "round-rectangle",
            "width": 48,
            "height": 30,
            "font-size": "11px",
            "border-color": "rgba(255, 255, 255, 0.45)"
          }
        },
        {
          selector: 'node[node_type = "technique"][is_subtechnique = false]',
          style: {
            "background-color": "#5de0c1",
            "border-color": "rgba(93, 224, 193, 0.9)"
          }
        },
        {
          selector: 'node[node_type = "technique"][is_subtechnique = true]',
          style: {
            "background-color": "#ffb347",
            "border-color": "rgba(255, 179, 71, 0.9)"
          }
        },
        {
          selector: 'node[node_type = "technique"][is_subtechnique = false]',
          style: {
            "border-width": 3
          }
        },
        {
          selector: 'node[node_type = "group"]',
          style: {
            "background-color": "#ff7043",
            "shape": "round-rectangle",
            "width": 46,
            "height": 32,
            "border-color": "rgba(255, 255, 255, 0.4)"
          }
        },
        {
          selector: 'node[node_type = "malware"]',
          style: {
            "background-color": "#26c6da",
            "shape": "round-rectangle",
            "width": 46,
            "height": 32,
            "border-color": "rgba(255, 255, 255, 0.35)"
          }
        },
        {
          selector: 'node[node_type = "campaign"]',
          style: {
            "background-color": "#f06292",
            "shape": "round-rectangle",
            "width": 46,
            "height": 32,
            "border-color": "rgba(255, 255, 255, 0.35)"
          }
        },
        {
          selector: 'node[node_type = "procedure"]',
          style: {
            "background-color": "#90a4ae",
            "shape": "diamond",
            "width": 40,
            "height": 40,
            "border-color": "rgba(255, 255, 255, 0.4)"
          }
        },
        {
          selector: 'node[context_state = "highlight"]',
          style: {
            "border-width": 4,
            "border-color": "#f5f5f5",
            "shadow-blur": 24,
            "shadow-color": "rgba(0, 201, 255, 0.6)"
          }
        },
        {
          selector: "edge",
          style: {
            "width": 2,
            "line-color": "rgba(255, 255, 255, 0.18)",
            "target-arrow-color": "rgba(255, 255, 255, 0.25)",
            "curve-style": "straight",
            "arrow-scale": 0.8,
            "line-cap": "round",
            "target-arrow-shape": "triangle",
            "transition-property": "line-color, width, opacity",
            "transition-duration": "200ms"
          }
        },
        {
          selector: 'edge[type = "tactic-technique"]',
          style: {
            "width": 3,
            "line-color": "rgba(199, 125, 255, 0.8)",
            "target-arrow-color": "rgba(199, 125, 255, 0.9)",
            "opacity": 0.85
          }
        },
        {
          selector: 'edge[type = "contains-subtechnique"]',
          style: {
            "width": 3,
            "line-color": "rgba(255, 179, 71, 0.9)",
            "target-arrow-color": "rgba(255, 179, 71, 0.9)",
            "line-style": "dashed",
            "opacity": 1
          }
        },
        {
          selector: 'edge[type = "subtechnique-of"]',
          style: {
            "width": 3,
            "line-color": "rgba(152, 165, 255, 0.6)",
            "target-arrow-color": "rgba(152, 165, 255, 0.7)",
            "opacity": 0.9
          }
        },
        {
          selector: 'edge[type = "group-technique"]',
          style: {
            "line-color": "rgba(255, 112, 67, 0.9)",
            "target-arrow-color": "rgba(255, 112, 67, 0.9)",
            "width": 3
          }
        },
        {
          selector: 'edge[type = "malware-technique"]',
          style: {
            "line-color": "rgba(38, 198, 218, 0.9)",
            "target-arrow-color": "rgba(38, 198, 218, 0.9)",
            "width": 3
          }
        },
        {
          selector: 'edge[type = "campaign-technique"]',
          style: {
            "line-color": "rgba(240, 98, 146, 0.9)",
            "target-arrow-color": "rgba(240, 98, 146, 0.9)",
            "width": 3
          }
        },
        {
          selector: 'edge[type = "campaign-group"]',
          style: {
            "line-color": "rgba(255, 112, 67, 0.7)",
            "target-arrow-color": "rgba(255, 112, 67, 0.7)",
            "line-style": "dotted",
            "width": 2
          }
        },
        {
          selector: 'edge[type = "campaign-malware"]',
          style: {
            "line-color": "rgba(38, 198, 218, 0.7)",
            "target-arrow-color": "rgba(38, 198, 218, 0.7)",
            "line-style": "dotted",
            "width": 2
          }
        },
        {
          selector: 'edge[type = "procedure-technique"]',
          style: {
            "line-color": "rgba(144, 164, 174, 0.85)",
            "target-arrow-color": "rgba(144, 164, 174, 0.95)",
            "line-style": "dashed"
          }
        },
        {
          selector: 'edge[type = "procedure-group"], edge[type = "procedure-malware"], edge[type = "procedure-campaign"]',
          style: {
            "line-color": "rgba(255, 255, 255, 0.45)",
            "target-arrow-color": "rgba(255, 255, 255, 0.55)",
            "line-style": "dashed"
          }
        },
        {
          selector: ".faded",
          style: {
            "opacity": 0.12
          }
        },
        {
          selector: ".selected-node",
          style: {
            "background-color": "#e53935",
            "width": 48,
            "height": 48,
            "font-size": "12px",
            "border-width": 4,
            "border-color": "#ffb4a4",
            "shadow-blur": 22,
            "shadow-color": "rgba(229, 57, 53, 0.6)"
          }
        },
        {
          selector: ".connected-node",
          style: {
            "background-color": "#1e88e5",
            "width": 40,
            "height": 40
          }
        },
        {
          selector: ".highlighted-edge",
          style: {
            "line-color": "#1e88e5",
            "target-arrow-color": "#1e88e5",
            "width": 5,
            "opacity": 1
          }
        }
      ],
      layout: getLayoutOptions(),
      minZoom: 0.25,
      maxZoom: 3
    });

    if (activeMode !== "workflow") {
      const initialLabel =
        activeMode === "attack" ? "Collapsed default view" : `${getModeLabel()} spotlight view`;
      updateStatusChipText(
        `${initialLabel} loaded. Nodes: ${defaultView.nodesCount}, Edges: ${defaultView.edgesCount}`
      );
    }

    function resetToDefaultView(options = {}) {
      const { preservePositions = false } = options;
      if (activeMode === "workflow") {
        if (!preservePositions) {
          activeWorkflowTechniqueId = null;
          const searchInput = document.getElementById("search");
          if (searchInput) {
            searchInput.value = "";
          }
        }
        restoreDetailsPanel();
        renderWorkflowView();
        return;
      }
      const view = buildModeAwareDefaultView();
      const baseLabel =
        activeMode === "attack" ? "Collapsed default view" : `${getModeLabel()} spotlight view`;
      const statusText =
        view.nodesCount > 0
          ? `${baseLabel} loaded. Nodes: ${view.nodesCount}, Edges: ${view.edgesCount}`
          : "No nodes match the current filter combination.";
      renderElements(
        view.elements,
        statusText,
        { preservePositions }
      );

      if (!preservePositions) {
        restoreDetailsPanel();
        const searchInput = document.getElementById("search");
        if (searchInput) {
          searchInput.value = "";
        }
      }
    }

    const searchInputEl = document.getElementById("search");
    if (searchInputEl) {
      searchInputEl.addEventListener("input", function (e) {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
          clearSearchSuggestions();
          return;
        }
        const results = collectSearchSuggestions(query);
        renderSearchSuggestions(results);
      });

      searchInputEl.addEventListener("keydown", function (e) {
        if (!searchSuggestions.length) {
          if (e.key === "Enter") {
            const value = e.target.value || "";
            if (performDirectSearch(value)) {
              clearSearchSuggestions();
              e.preventDefault();
            }
          }
          return;
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          activeSearchSuggestionIndex =
            activeSearchSuggestionIndex + 1 < searchSuggestions.length ? activeSearchSuggestionIndex + 1 : 0;
          highlightSearchSuggestion(activeSearchSuggestionIndex);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          activeSearchSuggestionIndex =
            activeSearchSuggestionIndex - 1 >= 0 ? activeSearchSuggestionIndex - 1 : searchSuggestions.length - 1;
          highlightSearchSuggestion(activeSearchSuggestionIndex);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const targetIndex = activeSearchSuggestionIndex >= 0 ? activeSearchSuggestionIndex : 0;
          const entry = searchSuggestions[targetIndex];
          if (entry) {
            applySearchSuggestion(entry);
          }
        } else if (e.key === "Escape") {
          clearSearchSuggestions();
        }
      });

      searchInputEl.addEventListener("focus", () => {
        const query = searchInputEl.value.toLowerCase().trim();
        if (!query) return;
        const results = collectSearchSuggestions(query);
        if (results.length) {
          renderSearchSuggestions(results);
        }
      });
    }

    if (searchSuggestionsContainer) {
      searchSuggestionsContainer.addEventListener("click", event => {
        const option = event.target.closest(".search-suggestion");
        if (!option) return;
        const index = Number(option.getAttribute("data-suggestion-index"));
        const entry = searchSuggestions[index];
        if (entry) {
          applySearchSuggestion(entry);
        }
      });
    }

    document.addEventListener("click", event => {
      if (!event.target.closest(".search-field")) {
        clearSearchSuggestions();
      }
    });

    document.getElementById("resetView").addEventListener("click", function () {
      resetToDefaultView();
    });

    if (workflowBackToGraphButton) {
      workflowBackToGraphButton.addEventListener("click", () => {
        setActiveMode("attack");
      });
    }

    if (workflowTimelineToggleButton) {
      workflowTimelineToggleButton.addEventListener("click", () => {
        workflowTimelineExpanded = !workflowTimelineExpanded;
        renderWorkflowTimeline();
      });
    }

    if (workflowTimeline) {
      const handleTimelineActivation = (target) => {
        if (!target) return;
        const phaseIndex = Number(target.getAttribute("data-phase-index"));
        if (!Number.isFinite(phaseIndex)) return;
        if (!workflowPhaseColumns.has(phaseIndex)) return;
        activeWorkflowPhaseIndex = phaseIndex;
        renderWorkflowTimeline();
        renderWorkflowPhaseDetails();
      };

      workflowTimeline.addEventListener("click", event => {
        const target = event.target.closest(".timeline-phase");
        handleTimelineActivation(target);
      });

      workflowTimeline.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const target = event.target.closest(".timeline-phase");
        if (!target) return;
        event.preventDefault();
        handleTimelineActivation(target);
      });
    }

    if (workflowPanel) {
      workflowPanel.addEventListener("click", event => {
        const anchorButton = event.target.closest("[data-tech-anchor-id]");
        if (anchorButton) {
          const techId = anchorButton.getAttribute("data-tech-anchor-id");
          if (techId) {
            setWorkflowAnchor(techId);
          }
          return;
        }

        const focusButton = event.target.closest("[data-focus-node-id]");
        if (focusButton) {
          const nodeId = focusButton.getAttribute("data-focus-node-id");
          if (nodeId) {
            setActiveMode("attack");
            focusNodeById(nodeId);
          }
        }
      });
    }

    if (modeTabsContainer) {
      modeTabsContainer.addEventListener("click", function (event) {
        const tab = event.target.closest(".mode-tab");
        if (!tab) return;
        const mode = tab.getAttribute("data-mode");
        if (mode) {
          setActiveMode(mode);
        }
      });
    }

    const toggleChainButton = document.getElementById("toggleMode");
    if (toggleChainButton) {
      toggleChainButton.addEventListener("click", function () {
        if (activeMode === "workflow") return;
        useFullChain = !useFullChain;
        this.textContent = useFullChain ? "Mode: Expand Technique" : "Mode: Highlight Only";
        resetToDefaultView();
      });
    }

    if (contextToggleButton) {
      contextToggleButton.addEventListener("click", function () {
        if (activeMode === "workflow") return;
        const nextState = !useContextEntities;
        if (!nextState && activeMode !== "attack") {
          setActiveMode("attack");
          return;
        }
        setContextMode(nextState);
      });
    }

    if (domainFilterSelect) {
      domainFilterSelect.addEventListener("change", function () {
        activeDomainFilter = this.value || "all";
        updateControlSummaryChips();
        resetToDefaultView();
      });
    }

    if (focusFilterSelect) {
      focusFilterSelect.addEventListener("change", function () {
        activeFocusFilter = this.value || "balanced";
        updateControlSummaryChips();
        resetToDefaultView();
      });
    }

    if (phaseFilterSelect) {
      phaseFilterSelect.addEventListener("change", function () {
        activePhaseFilter = this.value || "all";
        updateControlSummaryChips();
        resetToDefaultView();
      });
    }

    if (sortOrderSelect) {
      sortOrderSelect.addEventListener("change", function () {
        activeSortOrder = this.value || "phase";
        updateControlSummaryChips();
        resetToDefaultView();
      });
    }

    if (layoutStrategySelect) {
      layoutStrategySelect.addEventListener("change", function () {
        const requested = this.value || "cose";
        activeLayoutPreset = LAYOUT_PRESETS[requested] ? requested : "cose";
        updateControlSummaryChips();
        if (cy) {
          cy.layout(getLayoutOptions()).run();
        }
      });
    }

    if (nodeSampleRange && nodeSampleValue) {
      nodeSampleRange.addEventListener("input", function () {
        nodeSampleLimit = Number(this.value) || nodeSampleLimit;
        nodeSampleValue.textContent = `${nodeSampleLimit} nodes`;
      });
      nodeSampleRange.addEventListener("change", function () {
        nodeSampleLimit = Number(this.value) || nodeSampleLimit;
        nodeSampleValue.textContent = `${nodeSampleLimit} nodes`;
        resetToDefaultView({ preservePositions: true });
      });
    }

    if (showProceduresToggle) {
      showProceduresToggle.addEventListener("change", function () {
        showProceduresInView = !!this.checked;
        resetToDefaultView({ preservePositions: true });
      });
    }

    if (showCampaignLinksToggle) {
      showCampaignLinksToggle.addEventListener("change", function () {
        showCampaignLinks = !!this.checked;
        resetToDefaultView({ preservePositions: true });
      });
    }

    if (highlightNewEntitiesToggle) {
      highlightNewEntitiesToggle.addEventListener("change", function () {
        highlightNewEntities = !!this.checked;
        resetToDefaultView({ preservePositions: true });
      });
    }

    if (filtersToggle && filterOverlay) {
      const toggleOverlay = show => {
        filterOverlay.classList.toggle("is-hidden", !show);
        filtersToggle.setAttribute("aria-pressed", show ? "true" : "false");
      };
      filtersToggle.addEventListener("click", event => {
        const willShow = filterOverlay.classList.contains("is-hidden");
        toggleOverlay(willShow);
        event.stopPropagation();
      });
      document.addEventListener("click", evt => {
        if (!filterOverlay.classList.contains("is-hidden") && !filterOverlay.contains(evt.target)) {
          toggleOverlay(false);
        }
      });
    }

    detailsContainer.addEventListener("click", function(evt) {
      const card = evt.target.closest(".description-card.expandable");
      if (card) {
        const full = card.querySelector(".description-full");
        const preview = card.querySelector(".description-preview");
        if (!full) return;

        const isCollapsed = full.classList.contains("collapsed");
        if (isCollapsed) {
          full.classList.remove("collapsed");
          full.classList.add("expanded");
          preview?.classList.add("muted");
          card.setAttribute("aria-expanded", "true");
          card.classList.add("open");
        } else {
          full.classList.add("collapsed");
          full.classList.remove("expanded");
          preview?.classList.remove("muted");
          card.setAttribute("aria-expanded", "false");
          card.classList.remove("open");
        }
        return;
      }

      const nodeLink = evt.target.closest(".node-link");
      if (nodeLink) {
        const targetId = nodeLink.getAttribute("data-node-id");
        if (targetId) {
          focusNodeById(targetId);
        }
      }
    });

    cy.on("tap", "node", function(evt) {
      const nodeId = evt.target.id();
      focusNodeById(nodeId);
    });

    cy.on("tap", function(evt) {
      if (evt.target === cy) {
        closeDetailsPanel({ manual: true });
      }
    });
  })
  .catch(err => {
    if (statusChip) {
      statusChip.innerText = "Failed to load data";
      statusChip.title = err?.message || "Check console for details.";
    }
    console.error(err);
  });
