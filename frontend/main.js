// main.js
// Application bootstrapper: loads data, initialises all modules, registers event listeners.

import { state, LAYOUT_PRESETS } from "./modules/state.js";
import { loadAllData } from "./modules/dataLoader.js";
import {
  updateModeTabsUI,
  syncWorkspaceViewForMode,
  updateContextToggleLabel,
  updateStatusChipText,
  updateControlSummaryChips,
  getLayoutOptions,
} from "./modules/ui.js";
import { openDetailsPanel, closeDetailsPanel, detailsContainer } from "./modules/detailsPanel.js";
import {
  collectSearchSuggestions,
  renderSearchSuggestions,
  clearSearchSuggestions,
  highlightSearchSuggestion,
  applySearchSuggestion,
  performDirectSearch,
} from "./modules/search.js";
import {
  hydrateWorkflowTacticMetadata,
  buildSubtechParentLookup,
  buildPhaseTechniqueCatalog,
  buildWorkflowNeighborGraph,
  renderWorkflowView,
  renderWorkflowPhaseDetails,
  renderWorkflowTimeline,
  setWorkflowAnchor,
} from "./modules/workflowEngine.js";
import {
  hydrateNodeMap,
  initCytoscape,
  buildModeAwareDefaultView,
  resetToDefaultView,
  setContextMode,
  setActiveMode,
  focusNodeById,
} from "./modules/graphRenderer.js";

// --- DOM References (for event listeners) ---
const searchInputEl = document.getElementById("search");
const searchSuggestionsContainer = document.getElementById("searchSuggestions");
const workflowPanel = document.getElementById("workflowPanel");
const workflowTimeline = document.getElementById("workflowPhaseTimeline");
const workflowBackToGraphButton = document.getElementById("workflowBackToGraph");
const workflowTimelineToggleButton = document.getElementById("workflowTimelineToggle");
const modeTabsContainer = document.getElementById("modeTabs");
const contextToggleButton = document.getElementById("contextToggle");
const domainFilterSelect = document.getElementById("domainFilter");
const focusFilterSelect = document.getElementById("focusFilter");
const phaseFilterSelect = document.getElementById("phaseFilter");
const sortOrderSelect = document.getElementById("sortOrder");
const layoutStrategySelect = document.getElementById("layoutStrategy");
const advancedControls = document.getElementById("advancedControls");
const nodeSampleRange = document.getElementById("nodeSampleRange");
const nodeSampleValue = document.getElementById("nodeSampleValue");
const showProceduresToggle = document.getElementById("showProceduresToggle");
const showCampaignLinksToggle = document.getElementById("showCampaignLinksToggle");
const highlightNewEntitiesToggle = document.getElementById("highlightNewEntitiesToggle");
const statusChip = document.getElementById("status");
const focusModeSelect = document.getElementById("focusModeSelect");
const chipFilterSelects = [
  domainFilterSelect,
  focusFilterSelect,
  phaseFilterSelect,
  sortOrderSelect,
  layoutStrategySelect,
];
const customChipSelects = [];

enhanceFilterDropdowns();

// Read initial nodeSampleRange value
if (nodeSampleRange) state.nodeSampleLimit = Number(nodeSampleRange.value) || state.nodeSampleLimit;
if (nodeSampleValue) nodeSampleValue.textContent = `${state.nodeSampleLimit} nodes`;

// --- Data Loading and Initialisation ---

loadAllData()
  .then(([graphData, extendedGraph, techniques, tactics, groups, malware, campaigns, procedures]) => {
    // Populate graph data
    state.graphDataCore = graphData;
    state.graphDataExtended = extendedGraph;
    state.graphDataRef = state.graphDataCore;

    buildSubtechParentLookup(state.graphDataCore);

    extendedGraph.nodes.forEach(node => {
      state.allNodeMap[node.id] = node;
    });

    techniques.forEach(t => {
      state.techniqueMap[t.stix_id] = t;
    });

    tactics.forEach(t => {
      state.tacticMap[t.stix_id] = t;
      if (t.shortname) state.tacticShortnameMap[t.shortname] = t;
    });

    hydrateWorkflowTacticMetadata();
    hydrateNodeMap(state.graphDataRef);
    buildPhaseTechniqueCatalog();

    // Build entity maps
    const buildEntityMap = items => {
      const map = {};
      items.forEach(item => { if (item.stix_id) map[item.stix_id] = item; });
      return map;
    };
    state.entityData.group = buildEntityMap(groups);
    state.entityData.malware = buildEntityMap(malware);
    state.entityData.campaign = buildEntityMap(campaigns);
    state.entityData.procedure = buildEntityMap(procedures);

    // Build technique context index
    const ensureTechniqueContext = techId => {
      if (!state.techniqueContextIndex[techId]) {
        state.techniqueContextIndex[techId] = { groups: [], malware: [], campaigns: [], procedures: [] };
      }
      return state.techniqueContextIndex[techId];
    };

    groups.forEach(group => {
      (group.techniques || []).forEach(tech => {
        if (!tech || !tech.stix_id) return;
        const ctx = ensureTechniqueContext(tech.stix_id);
        ctx.groups.push({ id: group.stix_id, label: group.name, attack_id: group.attack_id });
      });
    });

    malware.forEach(item => {
      (item.techniques || []).forEach(tech => {
        if (!tech || !tech.stix_id) return;
        const ctx = ensureTechniqueContext(tech.stix_id);
        ctx.malware.push({ id: item.stix_id, label: item.name, attack_id: item.attack_id });
      });
    });

    campaigns.forEach(campaign => {
      (campaign.techniques || []).forEach(tech => {
        if (!tech || !tech.stix_id) return;
        const ctx = ensureTechniqueContext(tech.stix_id);
        ctx.campaigns.push({ id: campaign.stix_id, label: campaign.name, attack_id: campaign.attack_id });
      });
    });

    procedures.forEach(proc => {
      if (!proc.target_ref) return;
      const ctx = ensureTechniqueContext(proc.target_ref);
      ctx.procedures.push({
        id: proc.stix_id,
        label: `${proc.source_name || proc.source_ref || "Procedure"} → ${
          proc.target_name || state.techniqueMap[proc.target_ref]?.name || proc.target_ref
        }`,
        source_type: proc.source_type,
        description: proc.description,
      });
    });

    buildWorkflowNeighborGraph({ groups, malware, campaigns });

    updateContextToggleLabel();
    updateModeTabsUI();
    syncWorkspaceViewForMode();

    // Build initial graph view and initialise Cytoscape
    const defaultView = buildModeAwareDefaultView(state.nodeSampleLimit);
    initCytoscape(defaultView.elements);

    if (state.activeMode === "workflow") {
      renderWorkflowView();
    } else {
      const initialLabel =
        state.activeMode === "attack" ? "Collapsed default view" : `${state.activeMode} spotlight view`;
      updateStatusChipText(
        `${initialLabel} loaded. Nodes: ${defaultView.nodesCount}, Edges: ${defaultView.edgesCount}`
      );
    }

    registerEventListeners();
  })
  .catch(err => {
    if (statusChip) {
      statusChip.innerText = "Failed to load data";
      statusChip.title = err?.message || "Check console for details.";
    }
    console.error("Data load failed:", err);
  });

// --- Event Listener Registration ---

function registerEventListeners() {
  // Search input
  if (searchInputEl) {
    searchInputEl.addEventListener("input", function (e) {
      const query = e.target.value.toLowerCase().trim();
      if (!query) { clearSearchSuggestions(); return; }
      renderSearchSuggestions(collectSearchSuggestions(query));
    });

    searchInputEl.addEventListener("keydown", function (e) {
      if (!state.searchSuggestions.length) {
        if (e.key === "Enter") {
          if (performDirectSearch(e.target.value)) {
            clearSearchSuggestions();
            e.preventDefault();
          }
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        state.activeSearchSuggestionIndex =
          state.activeSearchSuggestionIndex + 1 < state.searchSuggestions.length
            ? state.activeSearchSuggestionIndex + 1
            : 0;
        highlightSearchSuggestion(state.activeSearchSuggestionIndex);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        state.activeSearchSuggestionIndex =
          state.activeSearchSuggestionIndex - 1 >= 0
            ? state.activeSearchSuggestionIndex - 1
            : state.searchSuggestions.length - 1;
        highlightSearchSuggestion(state.activeSearchSuggestionIndex);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const targetIndex = state.activeSearchSuggestionIndex >= 0 ? state.activeSearchSuggestionIndex : 0;
        const entry = state.searchSuggestions[targetIndex];
        if (entry) applySearchSuggestion(entry);
      } else if (e.key === "Escape") {
        clearSearchSuggestions();
      }
    });

    searchInputEl.addEventListener("focus", () => {
      const query = searchInputEl.value.toLowerCase().trim();
      if (!query) return;
      const results = collectSearchSuggestions(query);
      if (results.length) renderSearchSuggestions(results);
    });
  }

  // Search suggestions click
  if (searchSuggestionsContainer) {
    searchSuggestionsContainer.addEventListener("click", event => {
      const option = event.target.closest(".search-suggestion");
      if (!option) return;
      const index = Number(option.getAttribute("data-suggestion-index"));
      const entry = state.searchSuggestions[index];
      if (entry) applySearchSuggestion(entry);
    });
  }

  // Close suggestions on outside click
  document.addEventListener("click", event => {
    if (!event.target.closest(".search-field")) clearSearchSuggestions();
  });

  // Reset view button
  const resetViewButton = document.getElementById("resetView");
  if (resetViewButton) {
    resetViewButton.addEventListener("click", () => resetToDefaultView());
  }

  // Workflow: back to graph
  if (workflowBackToGraphButton) {
    workflowBackToGraphButton.addEventListener("click", () => setActiveMode("attack"));
  }

  // Workflow: timeline toggle
  if (workflowTimelineToggleButton) {
    workflowTimelineToggleButton.addEventListener("click", () => {
      state.workflowTimelineExpanded = !state.workflowTimelineExpanded;
      renderWorkflowTimeline();
    });
  }

  // Workflow: timeline phase click
  if (workflowTimeline) {
    const handleTimelineActivation = target => {
      if (!target) return;
      const phaseIndex = Number(target.getAttribute("data-phase-index"));
      if (!Number.isFinite(phaseIndex)) return;
      if (!state.workflowPhaseColumns.has(phaseIndex)) return;
      state.activeWorkflowPhaseIndex = phaseIndex;
      renderWorkflowTimeline();
      renderWorkflowPhaseDetails();
    };
    workflowTimeline.addEventListener("click", event => {
      handleTimelineActivation(event.target.closest(".timeline-phase"));
    });
    workflowTimeline.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target.closest(".timeline-phase");
      if (!target) return;
      event.preventDefault();
      handleTimelineActivation(target);
    });
  }

  // Workflow panel button delegation
  if (workflowPanel) {
    workflowPanel.addEventListener("click", event => {
      const anchorButton = event.target.closest("[data-tech-anchor-id]");
      if (anchorButton) {
        const techId = anchorButton.getAttribute("data-tech-anchor-id");
        if (techId) setWorkflowAnchor(techId);
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

  // Mode tabs
  if (modeTabsContainer) {
    modeTabsContainer.addEventListener("click", event => {
      const tab = event.target.closest(".mode-tab");
      if (!tab) return;
      const mode = tab.getAttribute("data-mode");
      if (mode) setActiveMode(mode);
    });
  }

  // Context toggle
  if (contextToggleButton) {
    contextToggleButton.addEventListener("click", function () {
      if (state.activeMode === "workflow") return;
      const nextState = !state.useContextEntities;
      if (!nextState && state.activeMode !== "attack") {
        setActiveMode("attack");
        return;
      }
      setContextMode(nextState);
    });
  }

  // Filter selects
  if (domainFilterSelect) {
    domainFilterSelect.addEventListener("change", function () {
      state.activeDomainFilter = this.value || "all";
      updateControlSummaryChips();
      resetToDefaultView();
    });
  }

  if (focusFilterSelect) {
    focusFilterSelect.addEventListener("change", function () {
      state.activeFocusFilter = this.value || "balanced";
      updateControlSummaryChips();
      resetToDefaultView();
    });
  }

  if (phaseFilterSelect) {
    phaseFilterSelect.addEventListener("change", function () {
      state.activePhaseFilter = this.value || "all";
      updateControlSummaryChips();
      resetToDefaultView();
    });
  }

  if (sortOrderSelect) {
    sortOrderSelect.addEventListener("change", function () {
      state.activeSortOrder = this.value || "phase";
      updateControlSummaryChips();
      resetToDefaultView();
    });
  }

  if (layoutStrategySelect) {
    layoutStrategySelect.addEventListener("change", function () {
      const requested = this.value || "cose";
      state.activeLayoutPreset = LAYOUT_PRESETS[requested] ? requested : "cose";
      updateControlSummaryChips();
      if (state.cy) state.cy.layout(getLayoutOptions()).run();
    });
  }

  if (focusModeSelect) {
    focusModeSelect.addEventListener("change", function () {
      const value = this.value;
      if (!value) {
        if (state.activeMode !== "workflow") setActiveMode("attack");
        return;
      }
      setActiveMode(value);
    });
  }

  // Node sample range
  if (nodeSampleRange && nodeSampleValue) {
    nodeSampleRange.addEventListener("input", function () {
      state.nodeSampleLimit = Number(this.value) || state.nodeSampleLimit;
      nodeSampleValue.textContent = `${state.nodeSampleLimit} nodes`;
    });
    nodeSampleRange.addEventListener("change", function () {
      state.nodeSampleLimit = Number(this.value) || state.nodeSampleLimit;
      nodeSampleValue.textContent = `${state.nodeSampleLimit} nodes`;
      resetToDefaultView({ preservePositions: true });
    });
  }

  // Procedure/campaign/highlight toggles
  if (showProceduresToggle) {
    showProceduresToggle.addEventListener("change", function () {
      state.showProceduresInView = !!this.checked;
      resetToDefaultView({ preservePositions: true });
    });
  }
  if (showCampaignLinksToggle) {
    showCampaignLinksToggle.addEventListener("change", function () {
      state.showCampaignLinks = !!this.checked;
      resetToDefaultView({ preservePositions: true });
    });
  }
  if (highlightNewEntitiesToggle) {
    highlightNewEntitiesToggle.addEventListener("change", function () {
      state.highlightNewEntities = !!this.checked;
      resetToDefaultView({ preservePositions: true });
    });
  }

  // Details panel: description expand + node links
  if (detailsContainer) {
    detailsContainer.addEventListener("click", function (evt) {
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
        if (targetId) focusNodeById(targetId);
      }
    });
  }

  // Keyboard shortcut: Ctrl/Cmd+K focuses search
  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      if (searchInputEl) searchInputEl.focus();
    }
  });
}

function enhanceFilterDropdowns() {
  chipFilterSelects.forEach(select => {
    const control = buildChipSelect(select);
    if (control) customChipSelects.push(control);
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".chip-select")) {
      customChipSelects.forEach(control => control.close());
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      customChipSelects.forEach(control => control.close());
    }
  });
}

function buildChipSelect(select) {
  if (!select || select.dataset.enhanced === "true") return null;
  const chipField = select.closest(".chip-field");
  if (!chipField) return null;

  chipField.classList.add("chip-field--enhanced");
  select.dataset.enhanced = "true";

  const wrapper = document.createElement("div");
  wrapper.className = "chip-select";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "chip-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const menu = document.createElement("ul");
  menu.className = "chip-select-menu";
  menu.setAttribute("role", "listbox");

  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  wrapper.appendChild(select);
  select.classList.add("chip-select-native");
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;

  const renderOptions = () => {
    menu.innerHTML = "";
    Array.from(select.options).forEach(option => {
      const optionEl = document.createElement("li");
      optionEl.className = "chip-select-option";
      optionEl.setAttribute("role", "option");
      optionEl.dataset.value = option.value;
      optionEl.textContent = option.textContent;
      if (option.disabled) optionEl.setAttribute("aria-disabled", "true");
      if (option.selected) optionEl.classList.add("is-selected");
      menu.appendChild(optionEl);
    });
  };

  const syncFromSelect = () => {
    const selectedOption = select.options[select.selectedIndex];
    trigger.textContent = selectedOption ? selectedOption.textContent : "Select";
    menu.querySelectorAll(".chip-select-option").forEach(optionEl => {
      optionEl.classList.toggle("is-selected", optionEl.dataset.value === select.value);
    });
  };

  renderOptions();
  syncFromSelect();

  trigger.addEventListener("click", () => {
    const isOpen = wrapper.classList.contains("is-open");
    customChipSelects.forEach(control => {
      if (control.wrapper !== wrapper) control.close();
    });
    if (isOpen) {
      wrapper.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    } else {
      wrapper.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
    }
  });

  menu.addEventListener("click", event => {
    const optionEl = event.target.closest(".chip-select-option");
    if (!optionEl || optionEl.getAttribute("aria-disabled") === "true") return;
    const value = optionEl.dataset.value;
    if (value !== undefined && select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    wrapper.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    syncFromSelect();
  });

  select.addEventListener("change", syncFromSelect);

  return {
    wrapper,
    close() {
      wrapper.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    },
  };
}
