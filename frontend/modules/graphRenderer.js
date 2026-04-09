// modules/graphRenderer.js
// Cytoscape initialization, view builders, rendering, mode/context switching.

import { state, MODE_NODE_TYPES, NODE_TYPE_TO_MODE } from "./state.js";
import {
  getLayoutOptions,
  updateStatusChipText,
  updateModeTabsUI,
  syncWorkspaceViewForMode,
  updateContextToggleLabel,
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
} from "./detailsPanel.js";
import {
  matchesDomainFilter,
  matchesPhaseFilter,
  sortTechniqueNodes,
  sortEdgesByTechniquePreference,
} from "./search.js";
// renderWorkflowView and setWorkflowAnchor imported inside function bodies to break circular init
// They are only called after all modules have loaded.

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
  const techniqueEdges = state.graphDataRef.edges.filter(edge => {
    if (edge.type !== "tactic-technique") return false;
    if (!isParentTechnique(edge.target)) return false;
    if (!matchesDomainFilter(edge.target)) return false;
    if (!matchesPhaseFilter(edge.target)) return false;
    return true;
  });

  const sortedEdges = sortEdgesByTechniquePreference(techniqueEdges);
  if (!sortedEdges.length) return { elements: [], nodesCount: 0, edgesCount: 0 };

  const techniqueLimit = Math.max(5, Math.min(limit, sortedEdges.length));
  const parentTechniqueIds = [];
  const tacticForTechnique = new Map();
  const seenTechniques = new Set();

  for (const edge of sortedEdges) {
    if (parentTechniqueIds.length >= techniqueLimit) break;
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
    const node = state.nodeMap[id];
    if (!node) return;
    nodeElements.push(buildNodeElement(node));
    nodeIds.add(id);
  };

  parentTechniqueIds.forEach(techId => {
    addNodeIfPresent(techId);
    const tacticId = tacticForTechnique.get(techId);
    if (tacticId) {
      addNodeIfPresent(tacticId);
      primaryEdges.push(buildEdgeElement({ source: tacticId, target: techId, type: "tactic-technique" }));
    }
  });

  const subtechAssignments = [];
  parentTechniqueIds.forEach(parentId => {
    sortTechniqueNodes(getChildSubtechniques(parentId)).forEach(child => {
      if (!child || !child.id) return;
      if (!matchesDomainFilter(child.id)) return;
      if (!matchesPhaseFilter(child.id)) return;
      subtechAssignments.push({ parentId, child });
    });
  });

  let subtechCap = 0;
  if (state.activeFocusFilter === "balanced") {
    subtechCap = Math.min(
      subtechAssignments.length,
      Math.max(2, Math.floor(parentTechniqueIds.length * 0.4))
    );
  } else if (state.activeFocusFilter === "subtech") {
    const availableBudget = Math.max(5, limit - parentTechniqueIds.length);
    subtechCap = Math.min(subtechAssignments.length, availableBudget);
  }

  const supplementaryEdges = [];
  subtechAssignments.slice(0, subtechCap).forEach(entry => {
    addNodeIfPresent(entry.child.id);
    supplementaryEdges.push(
      buildEdgeElement(
        { source: entry.child.id, target: entry.parentId, type: "contains-subtechnique" },
        "contains-subtechnique"
      )
    );
  });

  return {
    elements: [...nodeElements, ...primaryEdges, ...supplementaryEdges],
    nodesCount: nodeElements.length,
    edgesCount: primaryEdges.length + supplementaryEdges.length,
  };
}

export function buildContextDefaultView(nodeType, limit = state.nodeSampleLimit) {
  if (!nodeType) return buildAttackDefaultView(limit);

  const candidates = state.graphDataRef.nodes.filter(node => node.node_type === nodeType);
  if (!candidates.length) return buildAttackDefaultView(limit);

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
    const node = state.nodeMap[id] || state.allNodeMap[id];
    if (!node) return false;
    nodeIds.add(id);
    nodeStore.set(id, node);
    return true;
  };

  const includeProcedures = state.showProceduresInView || nodeType === "procedure";
  const includeCampaignLinks = state.showCampaignLinks && state.activeMode === "campaigns";

  const handleContextMode = () => {
    const contextTechniqueTypes = new Set([
      "group-technique",
      "malware-technique",
      "campaign-technique",
    ]);
    const sortedContextEdges = sortEdgesByTechniquePreference(
      state.graphDataRef.edges.filter(edge => contextTechniqueTypes.has(edge.type))
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
        state.graphDataRef.edges.forEach(edge => {
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
        state.graphDataRef.edges.filter(edge => edge.type === "procedure-technique")
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
        state.graphDataRef.edges.forEach(edge => {
          if (edge.type !== etype) return;
          if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
          addEdgeRecord(edge);
        });
      });
    }
  };

  const handleProcedureMode = () => {
    const perProcedureTechniqueCap = Math.max(
      1,
      Math.floor(limit / Math.max(1, seedNodes.length))
    );
    const procedureTechniqueCounts = new Map();
    state.graphDataRef.edges.forEach(edge => {
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
      state.graphDataRef.edges.forEach(edge => {
        if (nodeIds.size >= limit) return;
        if (edge.type !== etype) return;
        if (!nodeIds.has(edge.source)) return;
        if (!addNodeIfSpace(edge.target)) return;
        addEdgeRecord(edge);
      });
    });
    if (state.showCampaignLinks) {
      ["campaign-technique", "group-technique", "malware-technique"].forEach(etype => {
        state.graphDataRef.edges.forEach(edge => {
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
  return {
    elements: [...finalNodes.map(buildNodeElement), ...edges.map(edge => buildEdgeElement(edge))],
    nodesCount: finalNodes.length,
    edgesCount: edges.length,
  };
}

export function buildTacticView(tacticId) {
  const tacticNode = state.nodeMap[tacticId];
  const techniqueNodes = getTechniquesForTactic(tacticId);
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
  const rootNode = state.nodeMap[entityId];
  if (!rootNode) return null;
  const edgeTypeMap = {
    group: ["group-technique"],
    malware: ["malware-technique"],
    campaign: ["campaign-technique", "campaign-group", "campaign-malware"],
    procedure: ["procedure-technique", "procedure-group", "procedure-malware", "procedure-campaign"],
  };
  const relevantEdges = state.graphDataRef.edges.filter(
    edge => edge.source === entityId && (edgeTypeMap[entityType] || []).includes(edge.type)
  );
  const nodeIds = new Set([entityId]);
  relevantEdges.forEach(edge => nodeIds.add(edge.target));
  const nodes = Array.from(nodeIds)
    .map(id => state.nodeMap[id])
    .filter(Boolean);
  return {
    elements: [...nodes.map(buildNodeElement), ...relevantEdges.map(edge => buildEdgeElement(edge))],
    nodesCount: nodes.length,
    edgesCount: relevantEdges.length,
  };
}

export function buildModeAwareDefaultView(limitOverride) {
  const limit = limitOverride ?? state.nodeSampleLimit;
  const targetType = MODE_NODE_TYPES[state.activeMode];
  if (state.activeMode === "attack" || !targetType) return buildAttackDefaultView(limit);
  return buildContextDefaultView(targetType, limit);
}

// --- Rendering ---

export function renderElements(elements, statusText, options = {}) {
  if (!state.cy) return;
  const { layoutOverrides = null, selectedId = null, preservePositions = false } = options;

  if (preservePositions) {
    const previousPositions = {};
    state.cy.nodes().forEach(node => {
      previousPositions[node.id()] = { ...node.position() };
    });
    const previousPan = { ...state.cy.pan() };
    const previousZoom = state.cy.zoom();

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

    state.cy.batch(() => {
      const retainedNodeIds = new Set();
      const nodesToRemove = [];
      state.cy.nodes().forEach(node => {
        const id = node.id();
        const template = nodeElementMap.get(id);
        if (!template) { nodesToRemove.push(node); return; }
        retainedNodeIds.add(id);
        node.data({ ...template.data });
      });
      nodesToRemove.forEach(node => node.remove());

      const newlyAddedNodeIds = new Set();
      nodeElements.forEach(el => {
        if (!retainedNodeIds.has(el.data.id)) {
          state.cy.add(el);
          newlyAddedNodeIds.add(el.data.id);
        }
      });

      const edgesToRemove = [];
      state.cy.edges().forEach(edge => {
        const id = edge.id();
        const template = edgeElementMap.get(id);
        if (!template) { edgesToRemove.push(edge); return; }
        edge.data({ ...template.data });
      });
      edgesToRemove.forEach(edge => edge.remove());
      edgeElements.forEach(el => {
        if (!state.cy.getElementById(el.data.id).length) state.cy.add(el);
      });

      const nodesNeedingPlacement = [];
      const jitter = () => Math.random() * 24 - 12;
      state.cy.nodes().forEach(node => {
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
            (acc, pos) => { acc.x += pos.x; acc.y += pos.y; return acc; },
            { x: 0, y: 0 }
          );
          node.position({ x: sums.x / anchoredPositions.length + jitter(), y: sums.y / anchoredPositions.length + jitter() });
        } else {
          node.position({ x: -previousPan.x + jitter(), y: -previousPan.y + jitter() });
        }
      });

      if (typeof previousZoom === "number") state.cy.zoom(previousZoom);
      state.cy.pan(previousPan);
      state.cy.elements().removeClass("selected-node");
      if (selectedId) {
        const selected = state.cy.getElementById(selectedId);
        if (selected) selected.addClass("selected-node");
      }
    });
    updateStatusChipText(statusText);
    return;
  }

  state.cy.elements().remove();
  state.cy.add(elements);
  if (!elements.length) { updateStatusChipText(statusText); return; }

  const layoutOptions = getLayoutOptions(layoutOverrides || {});
  const fitPadding = elements.length <= 6 ? 20 : 60;

  state.cy.one("layoutstop", () => {
    if (selectedId) {
      const selected = state.cy.getElementById(selectedId);
      if (selected) {
        selected.addClass("selected-node");
        state.cy.animate(
          { center: { eles: selected }, zoom: Math.min(1.6, Math.max(0.6, state.cy.zoom())) },
          { duration: 500, easing: "ease-out" }
        );
      }
    } else {
      state.cy.animate(
        { fit: { eles: state.cy.elements(), padding: fitPadding } },
        { duration: 500, easing: "ease-in-out" }
      );
    }
  });

  state.cy.layout(layoutOptions).run();
  updateStatusChipText(statusText);
}

export function highlightWithinCurrentView(nodeId) {
  if (!state.cy) return;
  state.cy.elements().removeClass("faded selected-node connected-node highlighted-edge");
  state.cy.elements().addClass("faded");
  const node = state.cy.getElementById(nodeId);
  if (!node || node.empty()) return;
  node.removeClass("faded");
  node.addClass("selected-node");
  const connectedEdges = node.connectedEdges();
  const connectedNodes = node.connectedNodes().difference(node);
  connectedEdges.removeClass("faded").addClass("highlighted-edge");
  connectedNodes.removeClass("faded").addClass("connected-node");
  state.cy.animate(
    { center: { eles: node }, zoom: Math.min(1.6, Math.max(0.6, state.cy.zoom())) },
    { duration: 450, easing: "ease-out" }
  );
}

function clearGraphSelection() {
  if (!state.cy) return;
  state.cy.elements().removeClass("faded selected-node connected-node highlighted-edge");
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

  if (state.detailsPanelManuallyHidden) {
    openDetailsPanel();
  } else {
    state.detailsPanelManuallyHidden = false;
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

  if (["group", "malware", "campaign", "procedure"].includes(matchedNode.node_type) && !state.useContextEntities) {
    setContextMode(true, { skipReset: true });
    matchedNode = state.nodeMap[nodeId];
  }

  if (["group", "malware", "campaign", "procedure"].includes(matchedNode.node_type)) {
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
    if (matchedNode.node_type === "group") renderGroupDetails(matchedNode, nodeId);
    else if (matchedNode.node_type === "malware") renderMalwareDetails(matchedNode, nodeId);
    else if (matchedNode.node_type === "campaign") renderCampaignDetails(matchedNode, nodeId);
    else if (matchedNode.node_type === "procedure") renderProcedureDetails(matchedNode, nodeId);
    return;
  }

  if (!forceExpand && !state.useFullChain && matchedNode.node_type === "technique") {
    highlightWithinCurrentView(nodeId);
    renderTechniqueDetails(matchedNode, nodeId);
    return;
  }

  if (matchedNode.is_subtechnique) {
    const parent = getParentTechnique(nodeId);
    const pivotId = parent ? parent.id : nodeId;
    const expandedView = buildTechniqueExpandedView(pivotId);
    renderElements(
      expandedView.elements,
      `Technique expanded view loaded. Nodes: ${expandedView.nodesCount}, Edges: ${expandedView.edgesCount}`,
      { selectedId: nodeId }
    );
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

// --- Mode / Context Switching ---

export function setContextMode(enable, options = {}) {
  if (!state.graphDataExtended) return;
  const { skipReset = false } = options;
  if (state.useContextEntities === enable) {
    updateContextToggleLabel();
    updateModeTabsUI();
    if (!skipReset) resetToDefaultView();
    return;
  }
  state.useContextEntities = enable;
  state.graphDataRef = state.useContextEntities ? state.graphDataExtended : state.graphDataCore;
  hydrateNodeMap(state.graphDataRef);
  updateContextToggleLabel();
  updateModeTabsUI();
  if (!skipReset) resetToDefaultView();
}

export function setActiveMode(mode, options = {}) {
  const { skipReset = false } = options;
  const isWorkflowMode = mode === "workflow";
  const isContextGraphMode = Boolean(MODE_NODE_TYPES[mode]);
  const isAttackMode = mode === "attack";
  if (!isWorkflowMode && !isAttackMode && !isContextGraphMode) return;
  if (isContextGraphMode && !state.graphDataExtended) return;

  state.activeMode = mode;
  updateModeTabsUI();
  syncWorkspaceViewForMode();

  if (isWorkflowMode) {
    restoreDetailsPanel();
    if (!skipReset) {
      // Dynamic import to break circular dependency at module init time
      import("./workflowEngine.js").then(({ renderWorkflowView }) => renderWorkflowView());
    }
    return;
  }

  const requiresContext = isContextGraphMode;
  setContextMode(requiresContext, { skipReset: true });
  if (!skipReset) resetToDefaultView();
}

export function resetToDefaultView(options = {}) {
  const { preservePositions = false } = options;
  if (state.activeMode === "workflow") {
    if (!preservePositions) {
      state.activeWorkflowTechniqueId = null;
      const searchInput = document.getElementById("search");
      if (searchInput) searchInput.value = "";
    }
    restoreDetailsPanel();
    import("./workflowEngine.js").then(({ renderWorkflowView }) => renderWorkflowView());
    return;
  }
  const view = buildModeAwareDefaultView();
  const baseLabel =
    state.activeMode === "attack" ? "Collapsed default view" : `${getModeLabel()} spotlight view`;
  const statusText =
    view.nodesCount > 0
      ? `${baseLabel} loaded. Nodes: ${view.nodesCount}, Edges: ${view.edgesCount}`
      : "No nodes match the current filter combination.";
  renderElements(view.elements, statusText, { preservePositions });
  if (!preservePositions) {
    restoreDetailsPanel();
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
        "font-size": "11px",
        "font-weight": "600",
        "text-wrap": "wrap",
        "text-max-width": "150px",
        width: 38,
        height: 38,
        "background-color": "#7c8bff",
        color: "#f5f8ff",
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
        "background-color": "#c77dff",
        shape: "round-rectangle",
        width: 48,
        height: 30,
        "font-size": "11px",
        "border-color": "rgba(255, 255, 255, 0.45)",
      },
    },
    {
      selector: 'node[node_type = "technique"][is_subtechnique = false]',
      style: { "background-color": "#5de0c1", "border-color": "rgba(93, 224, 193, 0.9)" },
    },
    {
      selector: 'node[node_type = "technique"][is_subtechnique = true]',
      style: { "background-color": "#ffb347", "border-color": "rgba(255, 179, 71, 0.9)" },
    },
    {
      selector: 'node[node_type = "technique"][is_subtechnique = false]',
      style: { "border-width": 3 },
    },
    {
      selector: 'node[node_type = "group"]',
      style: {
        "background-color": "#ff7043",
        shape: "round-rectangle",
        width: 46,
        height: 32,
        "border-color": "rgba(255, 255, 255, 0.4)",
      },
    },
    {
      selector: 'node[node_type = "malware"]',
      style: {
        "background-color": "#26c6da",
        shape: "round-rectangle",
        width: 46,
        height: 32,
        "border-color": "rgba(255, 255, 255, 0.35)",
      },
    },
    {
      selector: 'node[node_type = "campaign"]',
      style: {
        "background-color": "#f06292",
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
        "line-color": "rgba(199, 125, 255, 0.8)",
        "target-arrow-color": "rgba(199, 125, 255, 0.9)",
        opacity: 0.85,
      },
    },
    {
      selector: 'edge[type = "contains-subtechnique"]',
      style: {
        width: 3,
        "line-color": "rgba(255, 179, 71, 0.9)",
        "target-arrow-color": "rgba(255, 179, 71, 0.9)",
        "line-style": "dashed",
        opacity: 1,
      },
    },
    {
      selector: 'edge[type = "subtechnique-of"]',
      style: {
        width: 3,
        "line-color": "rgba(152, 165, 255, 0.6)",
        "target-arrow-color": "rgba(152, 165, 255, 0.7)",
        opacity: 0.9,
      },
    },
    {
      selector: 'edge[type = "group-technique"]',
      style: {
        "line-color": "rgba(255, 112, 67, 0.9)",
        "target-arrow-color": "rgba(255, 112, 67, 0.9)",
        width: 3,
      },
    },
    {
      selector: 'edge[type = "malware-technique"]',
      style: {
        "line-color": "rgba(38, 198, 218, 0.9)",
        "target-arrow-color": "rgba(38, 198, 218, 0.9)",
        width: 3,
      },
    },
    {
      selector: 'edge[type = "campaign-technique"]',
      style: {
        "line-color": "rgba(240, 98, 146, 0.9)",
        "target-arrow-color": "rgba(240, 98, 146, 0.9)",
        width: 3,
      },
    },
    {
      selector: 'edge[type = "campaign-group"]',
      style: {
        "line-color": "rgba(255, 112, 67, 0.7)",
        "target-arrow-color": "rgba(255, 112, 67, 0.7)",
        "line-style": "dotted",
        width: 2,
      },
    },
    {
      selector: 'edge[type = "campaign-malware"]',
      style: {
        "line-color": "rgba(38, 198, 218, 0.7)",
        "target-arrow-color": "rgba(38, 198, 218, 0.7)",
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
        "background-color": "#e53935",
        width: 48,
        height: 48,
        "font-size": "12px",
        "border-width": 4,
        "border-color": "#ffb4a4",
        "shadow-blur": 22,
        "shadow-color": "rgba(229, 57, 53, 0.6)",
      },
    },
    {
      selector: ".connected-node",
      style: { "background-color": "#1e88e5", width: 40, height: 40 },
    },
    {
      selector: ".highlighted-edge",
      style: {
        "line-color": "#1e88e5",
        "target-arrow-color": "#1e88e5",
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
  });

  let lastTappedNodeId = null;
  let tapTimeoutId = null;
  const DOUBLE_TAP_THRESHOLD = 350;

  state.cy.on("tap", "node", function (evt) {
    const nodeId = evt.target.id();

    const triggerHighlight = () => {
      focusNodeById(nodeId);
    };

    const triggerExpand = () => {
      focusNodeById(nodeId, { forceExpand: true });
    };

    if (tapTimeoutId && lastTappedNodeId === nodeId) {
      clearTimeout(tapTimeoutId);
      tapTimeoutId = null;
      lastTappedNodeId = null;
      triggerExpand();
      return;
    }

    lastTappedNodeId = nodeId;
    tapTimeoutId = setTimeout(() => {
      tapTimeoutId = null;
      lastTappedNodeId = null;
      triggerHighlight();
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
