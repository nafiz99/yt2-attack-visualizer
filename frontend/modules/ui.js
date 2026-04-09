// modules/ui.js
// Theme, legend, mode tabs, status chip, control summary chips, layout options.
// Owns all non-data UI initialization that runs at startup.

import { state, THEME_STORAGE_KEY, LAYOUT_PRESETS, MODE_LABELS } from "./state.js";

// --- DOM References ---
const themeToggleButton = document.getElementById("themeToggle");
const themeToggleText = themeToggleButton
  ? themeToggleButton.querySelector(".theme-toggle-text")
  : null;
const modeTabsContainer = document.getElementById("modeTabs");
const domainFilterSelect = document.getElementById("domainFilter");
const focusFilterSelect = document.getElementById("focusFilter");
const phaseFilterSelect = document.getElementById("phaseFilter");
const sortOrderSelect = document.getElementById("sortOrder");
const layoutStrategySelect = document.getElementById("layoutStrategy");
const controlSummaryChips = document.getElementById("controlSummaryChips");
export const statusChip = document.getElementById("status");
const legendToggleButton = document.getElementById("legendToggle");
const legendContainer = document.getElementById("graphLegend");
const focusModeSelect = document.getElementById("focusModeSelect");
const detailModeSelect = document.getElementById("detailModeSelect");
const legendCloseButton = document.getElementById("legendClose");
export const workflowPanel = document.getElementById("workflowPanel");
export const graphContainer = document.getElementById("cy");
const legendWrapper = document.querySelector(".legend-wrapper");
const canvasCard = document.querySelector(".canvas-card");
const searchControls = document.getElementById("canvasSearchControls");
const workflowSearchMount = document.getElementById("workflowSearchMount");
const graphSearchMount = document.getElementById("graphSearchMount");
const graphViewControlSection = document.getElementById("graphViewControlSection");
const graphFiltersSection = document.getElementById("graphFiltersSection");
const workflowControlsSection = document.getElementById("workflowControlsSection");

// --- Pure Helpers ---

export function getSelectLabel(selectEl, fallback = "") {
  if (!selectEl) return fallback;
  const option =
    (selectEl.selectedOptions && selectEl.selectedOptions[0]) ||
    selectEl.options?.[selectEl.selectedIndex];
  if (!option) return fallback;
  const text = option.textContent || option.innerText;
  return text ? text.trim() : fallback;
}

export function setIconButtonLabel(button, label) {
  if (!button || !label) return;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  const srText = button.querySelector(".sr-only");
  if (srText) srText.textContent = label;
  const visibleLabel = button.querySelector(".button-label");
  if (visibleLabel) visibleLabel.textContent = label;
}

export function getModeLabel() {
  return MODE_LABELS[state.activeMode] || state.activeMode.toUpperCase();
}

export function updateControlSummaryChips() {
  if (!controlSummaryChips) return;
  const selectChips = controlSummaryChips.querySelectorAll("select");
  selectChips.forEach(select => {
    select.setAttribute("data-selected-label", getSelectLabel(select));
  });
}

export function updateStatusChipText(baseText) {
  if (!statusChip) return;
  const contextNote = state.useContextEntities ? "Context: ON" : "Context: OFF";
  statusChip.innerText = `${baseText} • Mode: ${getModeLabel()} • ${contextNote}`;
}

export function updateModeTabsUI() {
  if (!modeTabsContainer) return;
  const tabs = modeTabsContainer.querySelectorAll(".mode-tab");
  const effectiveViewMode = state.activeMode === "workflow" ? "workflow" : "attack";
  tabs.forEach(tab => {
    const tabMode = tab.getAttribute("data-mode");
    const isActive = tabMode === effectiveViewMode;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  if (focusModeSelect) {
    const focusModes = ["attack", "techniques", "groups", "malware", "campaigns", "procedures"];
    const fallbackMode = "attack";
    const resolvedMode = focusModes.includes(state.activeMode) ? state.activeMode : fallbackMode;
    focusModeSelect.value = resolvedMode;
  }

  if (detailModeSelect) {
    detailModeSelect.value = state.useContextEntities ? "advanced" : "basic";
    detailModeSelect.disabled = state.activeMode === "workflow";
    detailModeSelect.parentElement?.classList.toggle("is-disabled", state.activeMode === "workflow");
  }

  const isWorkflow = state.activeMode === "workflow";

  // Show/hide sidebar sections based on mode
  if (graphViewControlSection) graphViewControlSection.classList.toggle("is-hidden", isWorkflow);
  if (graphFiltersSection) graphFiltersSection.classList.toggle("is-hidden", isWorkflow);
  if (workflowControlsSection) workflowControlsSection.classList.toggle("is-hidden", !isWorkflow);

  // Disable graph-only controls when in workflow mode (belt-and-suspenders)
  const toggleFilterState = selectEl => {
    if (!selectEl) return;
    selectEl.disabled = isWorkflow;
    selectEl.parentElement?.classList.toggle("is-disabled", isWorkflow);
  };
  toggleFilterState(detailModeSelect);
  toggleFilterState(domainFilterSelect);
  toggleFilterState(focusFilterSelect);
  toggleFilterState(phaseFilterSelect);
  toggleFilterState(sortOrderSelect);

  updateControlSummaryChips();
}

export function syncWorkspaceViewForMode() {
  const workflowActive = state.activeMode === "workflow";
  if (workflowPanel) workflowPanel.classList.toggle("is-hidden", !workflowActive);
  if (graphContainer) graphContainer.classList.toggle("is-hidden", workflowActive);
  if (legendWrapper) legendWrapper.classList.toggle("is-hidden", workflowActive);
  if (canvasCard) {
    canvasCard.classList.toggle("graph-only", !workflowActive);
    canvasCard.classList.toggle("workflow-expanded", workflowActive);
  }
  if (searchControls && workflowSearchMount && graphSearchMount) {
    const target = workflowActive ? workflowSearchMount : graphSearchMount;
    if (!target.contains(searchControls)) {
      target.appendChild(searchControls);
    }
  }
  if (!workflowActive && state.cy) {
    requestAnimationFrame(() => {
      state.cy.resize();
    });
  }
}

export function getLayoutOptions(overrides = {}) {
  const preset = LAYOUT_PRESETS[state.activeLayoutPreset] || LAYOUT_PRESETS.cose;
  return { ...preset, ...overrides };
}

// --- Theme ---

export function applyThemePreference(mode) {
  const body = document.body;
  if (!body) return;
  if (mode === "light") {
    body.classList.add("theme-light");
  } else {
    body.classList.remove("theme-light");
    mode = "dark";
  }
  state.currentTheme = mode;
  if (themeToggleButton) {
    themeToggleButton.setAttribute("data-theme", mode);
    themeToggleButton.setAttribute(
      "aria-label",
      `Change theme (currently ${mode === "light" ? "light" : "dark"})`
    );
    if (themeToggleText) {
      themeToggleText.textContent = mode === "light" ? "Light Mode" : "Dark Mode";
    }
  }
}

// --- Initialization (runs once at startup) ---

function initTheme() {
  const prefersDarkMedia = window.matchMedia("(prefers-color-scheme: dark)");
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  applyThemePreference(savedTheme || (prefersDarkMedia.matches ? "dark" : "light"));

  if (themeToggleButton) {
    themeToggleButton.addEventListener("click", () => {
      const nextTheme = state.currentTheme === "light" ? "dark" : "light";
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      applyThemePreference(nextTheme);
    });
  }

  const respondToPrefChange = event => {
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

function initLegend() {
  if (!legendToggleButton || !legendContainer) return;
  legendContainer.classList.add("is-hidden");
  legendToggleButton.setAttribute("aria-expanded", "false");
  const updateLegendButton = isHidden => {
    setIconButtonLabel(legendToggleButton, isHidden ? "Show Legend" : "Hide Legend");
    legendToggleButton.classList.toggle("is-active", !isHidden);
    legendToggleButton.classList.toggle("is-hidden", !isHidden);
  };
  updateLegendButton(true);

  const closeLegend = () => {
    if (legendContainer.classList.contains("is-hidden")) return;
    legendContainer.classList.add("is-hidden");
    legendToggleButton.setAttribute("aria-expanded", "false");
    updateLegendButton(true);
    document.removeEventListener("click", handleOutsideClick, true);
    document.removeEventListener("keydown", handleEscape, true);
  };

  const openLegend = () => {
    legendContainer.classList.remove("is-hidden");
    legendToggleButton.setAttribute("aria-expanded", "true");
    updateLegendButton(false);
    document.addEventListener("click", handleOutsideClick, true);
    document.addEventListener("keydown", handleEscape, true);
  };

  const handleOutsideClick = event => {
    if (
      legendContainer.contains(event.target) ||
      legendToggleButton.contains(event.target)
    ) {
      return;
    }
    closeLegend();
  };

  const handleEscape = event => {
    if (event.key === "Escape") {
      closeLegend();
    }
  };

  legendToggleButton.addEventListener("click", () => {
    if (legendContainer.classList.contains("is-hidden")) {
      openLegend();
    } else {
      closeLegend();
    }
  });

  if (legendCloseButton) {
    legendCloseButton.addEventListener("click", closeLegend);
  }
}

// Run on import
updateControlSummaryChips();
initTheme();
initLegend();
