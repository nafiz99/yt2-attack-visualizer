// modules/search.js
// Search suggestions, filter matching, sorting, and direct search.

import { state } from "./state.js";
import { getTechniqueDomains } from "./graphQueries.js";
// Note: applySearchSuggestion calls setWorkflowAnchor (workflowEngine) and focusNodeById (graphRenderer).
// These are circular imports that work fine because calls happen inside function bodies.
import { setWorkflowAnchor } from "./workflowEngine.js";
import { focusNodeById } from "./graphRenderer.js";
import { getTechniquePhaseInfo } from "./workflowEngine.js";

const searchSuggestionsContainer = document.getElementById("searchSuggestions");

// --- Filter Helpers ---

export function matchesDomainFilter(techId) {
  if (state.activeDomainFilter === "all") return true;
  return getTechniqueDomains(techId).includes(state.activeDomainFilter);
}

export function matchesPhaseFilter(techId) {
  if (state.activePhaseFilter === "all" || !techId) return true;
  const info = getTechniquePhaseInfo(techId);
  if (!info || !Array.isArray(info.phases) || !info.phases.length) return false;
  return info.phases.some(phase => phase.shortname === state.activePhaseFilter);
}

// --- Sort Helpers ---

export function getTechniqueContextCounts(techId) {
  const context = state.techniqueContextIndex[techId] || {};
  return {
    groups: (context.groups || []).length,
    malware: (context.malware || []).length,
    campaigns: (context.campaigns || []).length,
    procedures: (context.procedures || []).length,
  };
}

export function getTechniqueUsageScore(techId) {
  const counts = getTechniqueContextCounts(techId);
  return counts.groups * 4 + counts.malware * 3 + counts.campaigns * 2 + counts.procedures + 1;
}

export function getTechniqueNameLabel(techId) {
  if (!techId) return "";
  const record = state.techniqueMap[techId];
  const nodeRecord = state.nodeMap[techId] || state.allNodeMap[techId];
  return (
    record?.name ||
    nodeRecord?.label ||
    record?.attack_id ||
    nodeRecord?.attack_id ||
    techId ||
    ""
  ).toString();
}

export function getTechniqueAttackIdLabel(techId) {
  if (!techId) return "";
  const record = state.techniqueMap[techId];
  const nodeRecord = state.nodeMap[techId] || state.allNodeMap[techId];
  return (record?.attack_id || nodeRecord?.attack_id || "").toString();
}

export function compareTechniquesForSort(aId, bId) {
  if (!aId || !bId) return 0;
  if (state.activeSortOrder === "signal") {
    return getTechniqueUsageScore(bId) - getTechniqueUsageScore(aId);
  }
  if (state.activeSortOrder === "alpha") {
    return getTechniqueNameLabel(aId).localeCompare(getTechniqueNameLabel(bId));
  }
  if (state.activeSortOrder === "attack") {
    const idResult = getTechniqueAttackIdLabel(aId).localeCompare(getTechniqueAttackIdLabel(bId));
    if (idResult !== 0) return idResult;
    return getTechniqueNameLabel(aId).localeCompare(getTechniqueNameLabel(bId));
  }
  // Default: phase order
  const infoA = getTechniquePhaseInfo(aId);
  const infoB = getTechniquePhaseInfo(bId);
  const idxA = Number.isFinite(infoA.primaryIndex) ? infoA.primaryIndex : 99;
  const idxB = Number.isFinite(infoB.primaryIndex) ? infoB.primaryIndex : 99;
  if (idxA !== idxB) return idxA - idxB;
  return getTechniqueNameLabel(aId).localeCompare(getTechniqueNameLabel(bId));
}

export function sortEdgesByTechniquePreference(edges) {
  if (!Array.isArray(edges)) return [];
  if (edges.length <= 1) return edges.slice();
  return edges.slice().sort((a, b) => compareTechniquesForSort(a.target, b.target));
}

export function sortTechniqueNodes(nodes = []) {
  if (!Array.isArray(nodes)) return [];
  return nodes.slice().sort((a, b) => compareTechniquesForSort(a?.id || a, b?.id || b));
}

// --- Query Helpers ---

export function matchesTechniqueQuery(record, normalizedQuery) {
  if (!record || !normalizedQuery) return false;
  const idPart = `${record.attack_id || record.attackId || ""}`.toLowerCase();
  const labelPart = `${record.label || record.name || ""}`.toLowerCase();
  return idPart.includes(normalizedQuery) || labelPart.includes(normalizedQuery);
}

export function matchesNodeQuery(record, normalizedQuery) {
  if (!record || !normalizedQuery) return false;
  const idPart = `${record.attack_id || record.attackId || record.id || ""}`.toLowerCase();
  const labelPart = `${record.label || record.name || ""}`.toLowerCase();
  return idPart.includes(normalizedQuery) || labelPart.includes(normalizedQuery);
}

export function findTechniqueByQuery(query) {
  if (!query) return null;
  const normalized = query.toLowerCase();

  const activeNodeMatch = Object.values(state.nodeMap).find(
    node => node.node_type === "technique" && matchesTechniqueQuery(node, normalized)
  );
  if (activeNodeMatch) return { id: activeNodeMatch.id, node: activeNodeMatch };

  const globalNodeMatch = Object.values(state.allNodeMap).find(
    node => node.node_type === "technique" && matchesTechniqueQuery(node, normalized)
  );
  if (globalNodeMatch) return { id: globalNodeMatch.id, node: globalNodeMatch };

  const techniqueRecordMatch = Object.values(state.techniqueMap).find(tech =>
    matchesTechniqueQuery(tech, normalized)
  );
  if (techniqueRecordMatch) return { id: techniqueRecordMatch.stix_id, record: techniqueRecordMatch };

  return null;
}

function formatNodeTypeLabel(nodeType) {
  if (!nodeType) return "";
  return nodeType
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// --- Suggestions UI ---

export function collectSearchSuggestions(normalizedQuery) {
  if (!normalizedQuery) return [];
  if (state.activeMode === "workflow") {
    return Object.values(state.techniqueMap)
      .filter(
        tech =>
          matchesTechniqueQuery(tech, normalizedQuery) &&
          matchesDomainFilter(tech.stix_id) &&
          matchesPhaseFilter(tech.stix_id)
      )
      .slice(0, 8)
      .map(tech => ({
        id: tech.stix_id,
        label: tech.name || tech.attack_id || tech.stix_id,
        meta: tech.attack_id || "",
        searchValue: tech.name || tech.attack_id || tech.stix_id,
        type: "technique",
      }));
  }

  const candidateMap = new Map();
  Object.values(state.nodeMap).forEach(node => candidateMap.set(node.id, node));
  Object.values(state.allNodeMap).forEach(node => {
    if (!candidateMap.has(node.id)) candidateMap.set(node.id, node);
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
      type: node.node_type || "node",
    }));
}

export function renderSearchSuggestions(results) {
  if (!searchSuggestionsContainer) return;
  if (!results.length) { clearSearchSuggestions(); return; }
  state.searchSuggestions = results;
  state.activeSearchSuggestionIndex = -1;
  const markup = results
    .map(
      (entry, index) => `
        <button
          type="button"
          class="search-suggestion"
          role="option"
          data-suggestion-index="${index}"
          data-suggestion-id="${entry.id}"
          aria-selected="${index === state.activeSearchSuggestionIndex ? "true" : "false"}"
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
  if (searchInput) searchInput.setAttribute("aria-expanded", "true");
}

export function clearSearchSuggestions() {
  if (!searchSuggestionsContainer) return;
  searchSuggestionsContainer.innerHTML = "";
  searchSuggestionsContainer.classList.add("is-hidden");
  state.searchSuggestions = [];
  state.activeSearchSuggestionIndex = -1;
  const searchInput = document.getElementById("search");
  if (searchInput) searchInput.setAttribute("aria-expanded", "false");
}

export function highlightSearchSuggestion(index) {
  if (!searchSuggestionsContainer) return;
  const items = searchSuggestionsContainer.querySelectorAll(".search-suggestion");
  items.forEach((item, idx) => {
    item.classList.toggle("is-highlighted", idx === index);
    item.setAttribute("aria-selected", idx === index ? "true" : "false");
  });
}

export function applySearchSuggestion(entry) {
  if (!entry) return;
  const searchInput = document.getElementById("search");
  if (searchInput) searchInput.value = entry.searchValue || entry.label;
  clearSearchSuggestions();
  if (state.activeMode === "workflow") {
    setWorkflowAnchor(entry.id, { updateSearchInput: false });
    return;
  }
  focusNodeById(entry.id);
}

export function performDirectSearch(query) {
  if (!query) return false;
  const normalized = query.toLowerCase().trim();
  if (!normalized) return false;
  if (state.activeMode === "workflow") {
    const match = findTechniqueByQuery(normalized);
    if (match) {
      setWorkflowAnchor(match.id, { updateSearchInput: false });
      return true;
    }
    return false;
  }

  const activePool = Object.values(state.nodeMap);
  let matchedNode = activePool.find(node => {
    const label = `${node.attack_id || ""} ${node.label || ""}`.toLowerCase();
    return label.includes(normalized);
  });

  if (!matchedNode && !state.useContextEntities) {
    matchedNode = Object.values(state.allNodeMap).find(node => {
      const label = `${node.attack_id || ""} ${node.label || ""}`.toLowerCase();
      return label.includes(normalized);
    });
  }

  if (!matchedNode) return false;
  focusNodeById(matchedNode.id);
  return true;
}
