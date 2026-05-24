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
  activeDomainFilter: "enterprise-attack",
  activeFocusFilter: "balanced",
  activePhaseFilter: "all",
  activePlatformFilter: "all",
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
  // Actor profile mode
  activeActorId: null,
  actorPhaseMap: {},

  // Workflow sidebar settings
  workflowCardLimit: 5,        // cards shown per phase section
  workflowPhaseReach: 4,       // max phase delta for surfacing connections
  workflowShowContextChips: true,  // show group/malware/campaign chips on cards
  workflowCardDetail: "standard",  // "standard" | "compact"

  // Workflow indexes (populated during init)
  techniquePhaseLookup: {},
  phaseTechniqueCatalog: {},
  workflowTechniqueIndex: {},
  subtechParentLookup: {},

  // Theme
  currentTheme: "dark",

  // Details panel — starts hidden; opens only when a node is explicitly selected
  detailsPanelManuallyHidden: true,
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
  attack: "Tactics",
  techniques: "Techniques",
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
  // Enterprise (ordered by kill-chain phase)
  { shortname: "reconnaissance",          label: "Reconnaissance",          domain: "enterprise-attack" },
  { shortname: "resource-development",    label: "Resource Development",    domain: "enterprise-attack" },
  { shortname: "initial-access",          label: "Initial Access",          domain: "enterprise-attack" },
  { shortname: "execution",               label: "Execution",               domain: "enterprise-attack" },
  { shortname: "persistence",             label: "Persistence",             domain: "enterprise-attack" },
  { shortname: "privilege-escalation",    label: "Privilege Escalation",    domain: "enterprise-attack" },
  { shortname: "defense-evasion",         label: "Defense Evasion",         domain: "enterprise-attack" },
  { shortname: "credential-access",       label: "Credential Access",       domain: "enterprise-attack" },
  { shortname: "discovery",               label: "Discovery",               domain: "enterprise-attack" },
  { shortname: "lateral-movement",        label: "Lateral Movement",        domain: "enterprise-attack" },
  { shortname: "collection",              label: "Collection",              domain: "enterprise-attack" },
  { shortname: "command-and-control",     label: "Command and Control",     domain: "enterprise-attack" },
  { shortname: "exfiltration",            label: "Exfiltration",            domain: "enterprise-attack" },
  { shortname: "impact",                  label: "Impact",                  domain: "enterprise-attack" },
  // Mobile (TA002x / TA003x / TA004x)
  { shortname: "initial-access",          label: "Initial Access",          domain: "mobile-attack" },
  { shortname: "execution",               label: "Execution",               domain: "mobile-attack" },
  { shortname: "persistence",             label: "Persistence",             domain: "mobile-attack" },
  { shortname: "privilege-escalation",    label: "Privilege Escalation",    domain: "mobile-attack" },
  { shortname: "defense-evasion",         label: "Defense Evasion",         domain: "mobile-attack" },
  { shortname: "credential-access",       label: "Credential Access",       domain: "mobile-attack" },
  { shortname: "discovery",               label: "Discovery",               domain: "mobile-attack" },
  { shortname: "lateral-movement",        label: "Lateral Movement",        domain: "mobile-attack" },
  { shortname: "collection",              label: "Collection",              domain: "mobile-attack" },
  { shortname: "command-and-control",     label: "Command and Control",     domain: "mobile-attack" },
  { shortname: "exfiltration",            label: "Exfiltration",            domain: "mobile-attack" },
  { shortname: "impact",                  label: "Impact",                  domain: "mobile-attack" },
  // ICS (TA01xx)
  { shortname: "initial-access",          label: "Initial Access",          domain: "ics-attack" },
  { shortname: "execution",               label: "Execution",               domain: "ics-attack" },
  { shortname: "persistence",             label: "Persistence",             domain: "ics-attack" },
  { shortname: "privilege-escalation",    label: "Privilege Escalation",    domain: "ics-attack" },
  { shortname: "discovery",               label: "Discovery",               domain: "ics-attack" },
  { shortname: "lateral-movement",        label: "Lateral Movement",        domain: "ics-attack" },
  { shortname: "collection",              label: "Collection",              domain: "ics-attack" },
  { shortname: "command-and-control",     label: "Command and Control",     domain: "ics-attack" },
  { shortname: "evasion",                 label: "Evasion",                 domain: "ics-attack" },
  { shortname: "inhibit-response-function", label: "Inhibit Response Function", domain: "ics-attack" },
  { shortname: "impair-process-control",  label: "Impair Process Control",  domain: "ics-attack" },
  { shortname: "impact",                  label: "Impact",                  domain: "ics-attack" },
].map((entry, index) => ({ ...entry, index }));

// Keyed by shortname — first occurrence wins so enterprise takes priority for
// shared names (initial-access, execution, etc.). ICS-unique tactics get their
// own entries because no enterprise tactic shares their shortname.
export const WORKFLOW_PHASE_LOOKUP = WORKFLOW_TACTIC_SEQUENCE.reduce((acc, phase) => {
  if (!acc[phase.shortname]) acc[phase.shortname] = phase;
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
