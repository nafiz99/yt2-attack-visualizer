// modules/graphQueries.js
// Pure graph traversal helpers. No UI side-effects.
// Imported by detailsPanel, workflowEngine, graphRenderer, and search.

import { state } from "./state.js";

export function isParentTechnique(nodeId) {
  const node = state.nodeMap[nodeId];
  return node && node.node_type === "technique" && !node.is_subtechnique;
}

export function isSubTechnique(nodeId) {
  const node = state.nodeMap[nodeId];
  return node && node.node_type === "technique" && !!node.is_subtechnique;
}

export function getChildSubtechniques(parentId) {
  const childEdges = state.graphDataRef.edges.filter(
    edge => edge.type === "subtechnique-of" && edge.target === parentId
  );
  return childEdges.map(edge => state.nodeMap[edge.source]).filter(Boolean);
}

export function getParentTechnique(subId) {
  const parentEdge = state.graphDataRef.edges.find(
    edge => edge.type === "subtechnique-of" && edge.source === subId
  );
  return parentEdge ? state.nodeMap[parentEdge.target] : null;
}

export function getTacticsForTechnique(techniqueId) {
  const tacticEdges = state.graphDataRef.edges.filter(
    edge => edge.type === "tactic-technique" && edge.target === techniqueId
  );
  return tacticEdges.map(edge => state.nodeMap[edge.source]).filter(Boolean);
}

export function getTechniquesForTactic(tacticId) {
  const techniqueEdges = state.graphDataRef.edges.filter(
    edge => edge.type === "tactic-technique" && edge.source === tacticId
  );
  return techniqueEdges
    .map(edge => state.nodeMap[edge.target])
    .filter(node => node && isParentTechnique(node.id));
}

export function getHierarchyInfo(nodeId) {
  const parentEdges = state.graphDataRef.edges.filter(
    edge => edge.source === nodeId && edge.type === "subtechnique-of"
  );
  const childEdges = state.graphDataRef.edges.filter(
    edge => edge.target === nodeId && edge.type === "subtechnique-of"
  );
  return {
    parents: parentEdges.map(edge => state.nodeMap[edge.target]).filter(Boolean),
    children: childEdges.map(edge => state.nodeMap[edge.source]).filter(Boolean),
  };
}

export function getTechniqueDomains(techId) {
  const technique = state.techniqueMap[techId];
  return (technique && technique.domains) || [];
}
