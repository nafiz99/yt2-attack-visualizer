// modules/state.js
// Shared mutable application state and immutable constants.
// All modules import `state` and mutate it directly (state.foo = ...).

export const state = {
  // Data maps (populated during init)
  nodeMap: {},
  techniqueMap: {},
  tacticMap: {},
  tacticShortnameMap: {},

  // Graph data
  graphDataRef: null,
  graphDataCore: null,
  graphDataExtended: null,
  allNodeMap: {},
  entityData: { group: {}, malware: {}, campaign: {}, procedure: {} },
  techniqueContextIndex: {},

  // Cytoscape instance
  cy: null,

  // Active mode
  activeMode: "workflow",
  useFullChain: false,
  useContextEntities: false,

  // Filter / sort / layout state
  activeDomainFilter: "all",
  activeFocusFilter: "balanced",
  activePhaseFilter: "all",
  activeSortOrder: "phase",
  activeLayoutPreset: "cose",
  nodeSampleLimit: 60,

  // Toggles
  showProceduresInView: true,
  showCampaignLinks: true,
  highlightNewEntities: true,

  // Workflow
  activeWorkflowTechniqueId: null,
  activeWorkflowPhaseIndex: null,
  workflowPhaseColumns: new Map(),
  workflowTimelineHighlights: [],
  workflowTimelineExpanded: false,

  // Workflow indexes (populated during init)
  techniquePhaseLookup: {},
  phaseTechniqueCatalog: {},
  workflowTechniqueIndex: {},
  subtechParentLookup: {},

  // Theme
  currentTheme: "dark",

  // Details panel
  detailsPanelManuallyHidden: false,
  isDetailsPanelOpen: false,

  // Search
  searchSuggestions: [],
  activeSearchSuggestionIndex: -1,
};

// --- Immutable Constants ---

export const THEME_STORAGE_KEY = "yt2_theme_preference";
export const WORKFLOW_COLUMN_CARD_LIMIT = 4;

export const MODE_NODE_TYPES = {
  groups: "group",
  malware: "malware",
  campaigns: "campaign",
  procedures: "procedure",
};

export const MODE_LABELS = {
  attack: "Graph",
  workflow: "Workflow",
  groups: "Groups",
  malware: "Malware",
  campaigns: "Campaigns",
  procedures: "Procedures",
};

export const NODE_TYPE_TO_MODE = {
  group: "groups",
  malware: "malware",
  campaign: "campaigns",
  procedure: "procedures",
};

export const WORKFLOW_TACTIC_SEQUENCE = [
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
  { shortname: "impact", label: "Impact" },
].map((entry, index) => ({ ...entry, index }));

export const WORKFLOW_PHASE_LOOKUP = WORKFLOW_TACTIC_SEQUENCE.reduce((acc, phase) => {
  acc[phase.shortname] = phase;
  return acc;
}, {});

export const LAYOUT_PRESETS = {
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
    minTemp: 1,
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
    levelWidth: nodes => (nodes.maxDegree() || 1) / 2,
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
    avoidOverlap: true,
  },
};

export const DATA_PATH_CANDIDATES = (() => {
  if (typeof window.YT2_DATA_BASE_PATH === "string" && window.YT2_DATA_BASE_PATH.trim().length) {
    return [window.YT2_DATA_BASE_PATH.trim()];
  }
  return ["./data_processed", "../data_processed", "/data_processed"];
})();
