// modules/detailsPanel.js
// Details panel visibility + all render*Details functions + HTML formatting helpers.

import { state } from "./state.js";
import { setIconButtonLabel } from "./ui.js";
import {
  getTacticsForTechnique,
  getTechniquesForTactic,
  getHierarchyInfo,
} from "./graphQueries.js";

// --- DOM References ---
const detailsPanel = document.getElementById("right");
const detailsOverlay = document.getElementById("detailsOverlay");
const detailsCloseButton = document.getElementById("detailsClose");
const detailsToggleButton = document.getElementById("detailsToggleButton");
export const detailsContainer = document.getElementById("details");
const defaultDetailsMarkup = detailsContainer ? detailsContainer.innerHTML : "";

state.isDetailsPanelOpen = detailsPanel
  ? !detailsPanel.classList.contains("is-hidden")
  : false;

// --- Panel Visibility ---

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

export function resetDetailsPanelContent() {
  if (!detailsContainer) return;
  detailsContainer.innerHTML = defaultDetailsMarkup;
}

export function syncDetailsToggle() {
  if (!detailsToggleButton || !detailsPanel) return;
  const isHidden = detailsPanel.classList.contains("is-hidden");
  setIconButtonLabel(detailsToggleButton, isHidden ? "Show Details" : "Hide Details");
  detailsToggleButton.setAttribute("aria-pressed", isHidden ? "false" : "true");
  detailsToggleButton.classList.toggle("is-active", !isHidden);
}

export function restoreDetailsPanel(options = {}) {
  if (!detailsPanel || !detailsContainer) return;
  if (state.detailsPanelManuallyHidden) return;
  resetDetailsPanelContent();
  if (detailsPanel.classList.contains("is-hidden")) {
    openDetailsPanel(options);
  } else {
    detailsPanel.classList.add("is-floating");
    showDetailsOverlayIfNeeded();
    syncDetailsToggle();
  }
}

export function openDetailsPanel(options = {}) {
  if (!detailsPanel) return;
  detailsPanel.classList.add("is-floating");
  detailsPanel.classList.remove("is-hidden");
  detailsPanel.setAttribute("aria-hidden", "false");
  showDetailsOverlayIfNeeded();
  state.isDetailsPanelOpen = true;
  state.detailsPanelManuallyHidden = false;
  syncDetailsToggle();
}

export function closeDetailsPanel(options = {}) {
  const { resetContent = true, manual = false } = options;
  if (resetContent) resetDetailsPanelContent();
  if (!detailsPanel) return;
  detailsPanel.classList.remove("is-floating");
  detailsPanel.classList.add("is-hidden");
  detailsPanel.setAttribute("aria-hidden", "true");
  hideDetailsOverlay();
  state.isDetailsPanelOpen = false;
  state.detailsPanelManuallyHidden = manual ? true : false;
  syncDetailsToggle();
}

// Register panel toggle event listeners once at startup
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

// --- HTML Formatting Helpers ---

export function formatNodeLinks(nodes = [], emptyCopy = "None") {
  if (!nodes.length) return `<span class="small-muted">${emptyCopy}</span>`;
  const links = nodes
    .filter(Boolean)
    .map(node => {
      const id = node.id || node.stix_id;
      if (!id) return null;
      const attackId =
        node.attack_id ??
        (state.nodeMap[id]
          ? state.nodeMap[id].attack_id
          : state.allNodeMap[id]
          ? state.allNodeMap[id].attack_id
          : null) ??
        "N/A";
      const label =
        node.label ||
        node.name ||
        (state.nodeMap[id]
          ? state.nodeMap[id].label
          : state.allNodeMap[id]
          ? state.allNodeMap[id].label
          : id);
      return `<button type="button" class="node-link" data-node-id="${id}">
        ${attackId || "N/A"} - ${label}
      </button>`;
    })
    .filter(Boolean)
    .join("");
  return `<div class="node-link-list">${links}</div>`;
}

export function formatValueChips(values = [], emptyCopy = "None") {
  if (!values || !values.length) return `<span class="small-muted">${emptyCopy}</span>`;
  return `<div class="chip-list">${values
    .map(value => `<span class="value-chip">${value}</span>`)
    .join("")}</div>`;
}

function cleanDescription(text) {
  if (!text) return text;
  // Remove (Citation: ...) markers
  let out = text.replace(/\(Citation:[^)]*\)/g, "");
  // Remove bare Markdown links [label](url) → label
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Collapse runs of whitespace left behind
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}

export function buildDescriptionBlock(descriptionText) {
  const cleaned = cleanDescription(descriptionText);
  const fallbackText = cleaned || "No description available.";
  const hasExpandable = cleaned && cleaned.length > 220;
  const shortDescription = hasExpandable ? `${cleaned.slice(0, 220)}...` : fallbackText;
  return `
    <div class="description-card${hasExpandable ? " expandable" : ""}" ${
    hasExpandable ? 'data-action="toggle-description" aria-expanded="false"' : ""
  }>
      <p class="description-preview${hasExpandable ? "" : " full"}">${shortDescription}</p>
      <p class="description-full ${hasExpandable ? "collapsed" : "expanded"}">${cleaned || fallbackText}</p>
      ${hasExpandable ? '<span class="description-hint">Click to read the full description</span>' : ""}
    </div>
  `;
}

const badgeClassMap = {
  tactic: "badge-tactic",
  technique: "badge-parent",
  group: "badge-group",
  malware: "badge-malware",
  campaign: "badge-campaign",
  procedure: "badge-procedure",
};

export function buildBadge(type, labelOverride = null) {
  const badgeClass = badgeClassMap[type] || "badge";
  const label =
    labelOverride ||
    { tactic: "Tactic", technique: "Technique", group: "Group", malware: "Malware", campaign: "Campaign", procedure: "Procedure" }[type] ||
    type;
  return `<span class="badge ${badgeClass}">${label}</span>`;
}

export function truncateText(text, limit = 200) {
  if (!text) return "No description available.";
  const clean = cleanDescription(text);
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}

export function formatIsoDate(value) {
  if (!value) return null;
  return value.split("T")[0];
}

export function formatCitations(refs = []) {
  if (!refs.length) return '<span class="small-muted">No citations recorded.</span>';
  return `<ul class="reference-list">${refs
    .map(ref => {
      const anchor = ref.url ? `<a href="${ref.url}" target="_blank" rel="noopener">Source</a>` : "";
      const title = ref.source_name || ref.description || "Reference";
      const desc =
        ref.description && ref.description !== ref.source_name ? ref.description : "";
      return `<li>
        <span class="reference-title">${title}</span>
        ${desc ? `<span class="reference-description">${desc}</span>` : ""}
        ${anchor}
      </li>`;
    })
    .join("")}</ul>`;
}

export function formatProcedurePreviewList(items = [], emptyCopy = "No procedures logged.") {
  if (!items.length) return `<span class="small-muted">${emptyCopy}</span>`;
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

export function getTechniqueContextCounts(techId) {
  const context = state.techniqueContextIndex[techId] || {};
  return {
    groups: (context.groups || []).length,
    malware: (context.malware || []).length,
    campaigns: (context.campaigns || []).length,
    procedures: (context.procedures || []).length,
  };
}

export function summarizeContextCounts(counts) {
  const parts = [];
  if (counts.groups) parts.push(`${counts.groups} group${counts.groups > 1 ? "s" : ""}`);
  if (counts.malware) parts.push(`${counts.malware} malware`);
  if (counts.campaigns) parts.push(`${counts.campaigns} campaign${counts.campaigns > 1 ? "s" : ""}`);
  if (counts.procedures) parts.push(`${counts.procedures} procedure${counts.procedures > 1 ? "s" : ""}`);
  return parts.length ? parts.join(" · ") : "No contextual entities recorded";
}

export function summarizeEntitySupport(entities = {}) {
  const parts = [];
  ["group", "malware", "campaign"].forEach(type => {
    const count = entities[type]?.count || 0;
    if (!count) return;
    const label = type === "group" ? `group${count > 1 ? "s" : ""}` : `${type}${count > 1 ? "s" : ""}`;
    parts.push(`${count} ${label}`);
  });
  return parts.join(" · ");
}

export function buildWorkflowContextChips(techId) {
  const counts = getTechniqueContextCounts(techId);
  const chips = [];
  if (counts.groups) chips.push(`<span class="workflow-context-chip">Groups ${counts.groups}</span>`);
  if (counts.malware) chips.push(`<span class="workflow-context-chip">Malware ${counts.malware}</span>`);
  if (counts.campaigns) chips.push(`<span class="workflow-context-chip">Campaigns ${counts.campaigns}</span>`);
  if (counts.procedures) chips.push(`<span class="workflow-context-chip">Procedures ${counts.procedures}</span>`);
  if (!chips.length) return "";
  return `<div class="workflow-context-chips">${chips.join("")}</div>`;
}

// --- Detail Renderers ---

export function renderTechniqueDetails(nodeData, nodeId, { openPanel = true } = {}) {
  const techniqueData = state.techniqueMap[nodeId] || state.nodeMap[nodeId];
  const { parents, children } = getHierarchyInfo(nodeId);
  const tactics = getTacticsForTechnique(nodeId);
  const descriptionText = techniqueData.description || "No description available.";
  const contextInfo = state.techniqueContextIndex[nodeId] || {
    groups: [],
    malware: [],
    campaigns: [],
    procedures: [],
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
    <div class="value-block">${formatNodeLinks(tactics)}</div>

    <div class="label">Parent Technique</div>
    <div class="value-block">${formatNodeLinks(parents)}</div>

    <div class="label">Child Sub-techniques</div>
    <div class="value-block">${formatNodeLinks(children)}</div>

    <div class="label">Description</div>
    ${buildDescriptionBlock(descriptionText)}

    <div class="label">Groups Using This Technique</div>
    <div class="value-block">
      ${formatNodeLinks(contextInfo.groups || [], "No recorded groups currently linked to this technique.")}
    </div>

    <div class="label">Malware Using This Technique</div>
    <div class="value-block">
      ${formatNodeLinks(contextInfo.malware || [], "No malware families currently linked to this technique.")}
    </div>

    <div class="label">Campaigns Using This Technique</div>
    <div class="value-block">
      ${formatNodeLinks(contextInfo.campaigns || [], "No campaign reporting mapped to this technique.")}
    </div>

    <div class="label">Documented Procedures</div>
    <div class="value-block">
      ${formatProcedurePreviewList(contextInfo.procedures || [])}
    </div>
  `;
  if (openPanel) openDetailsPanel();
}

export function renderTacticDetails(nodeData, nodeId, { openPanel = true } = {}) {
  const tacticData = state.tacticMap[nodeId] || state.nodeMap[nodeId];
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
    <div class="value-block">${formatNodeLinks(techniques)}</div>

    <div class="label">Description</div>
    ${buildDescriptionBlock(descriptionText)}
  `;
  if (openPanel) openDetailsPanel();
}

export function renderGroupDetails(nodeData, nodeId, { openPanel = true } = {}) {
  const record = state.entityData.group[nodeId] || nodeData;
  if (!record) { closeDetailsPanel(); return; }
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
    <div class="value-block">${formatNodeLinks(record.techniques || [], "No linked techniques yet.")}</div>

    <div class="label">Description</div>
    ${buildDescriptionBlock(record.description)}
  `;
  if (openPanel) openDetailsPanel();
}

export function renderMalwareDetails(nodeData, nodeId, { openPanel = true } = {}) {
  const record = state.entityData.malware[nodeId] || nodeData;
  if (!record) { closeDetailsPanel(); return; }
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
    <div class="value-block">${formatValueChips(record.capabilities, "No capability annotations.")}</div>

    <div class="label">Observed Techniques</div>
    <div class="value-block">${formatNodeLinks(record.techniques || [], "No linked techniques yet.")}</div>

    <div class="label">Description</div>
    ${buildDescriptionBlock(record.description)}
  `;
  if (openPanel) openDetailsPanel();
}

export function renderCampaignDetails(nodeData, nodeId, { openPanel = true } = {}) {
  const record = state.entityData.campaign[nodeId] || nodeData;
  if (!record) { closeDetailsPanel(); return; }
  const timeline = [formatIsoDate(record.first_seen), formatIsoDate(record.last_seen)].filter(Boolean);
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
    <div class="value-block">${timeline.length ? timeline.join(" → ") : "No temporal bounds recorded."}</div>

    <div class="label">Associated Groups</div>
    <div class="value-block">${formatNodeLinks(record.groups || [], "No attributed groups provided.")}</div>

    <div class="label">Associated Malware</div>
    <div class="value-block">${formatNodeLinks(record.malware || [], "No malware listed for this campaign.")}</div>

    <div class="label">Observed Techniques</div>
    <div class="value-block">${formatNodeLinks(record.techniques || [], "No linked techniques yet.")}</div>

    <div class="label">Description</div>
    ${buildDescriptionBlock(record.description)}
  `;
  if (openPanel) openDetailsPanel();
}

export function renderProcedureDetails(nodeData, nodeId, { openPanel = true } = {}) {
  const record = state.entityData.procedure[nodeId] || nodeData;
  if (!record) { closeDetailsPanel(); return; }

  const windowLabel =
    record.start_time || record.stop_time
      ? [formatIsoDate(record.start_time), formatIsoDate(record.stop_time)]
          .filter(Boolean)
          .join(" → ")
      : "Not specified.";

  const relatedTechnique = record.target_ref
    ? [{ id: record.target_ref, label: record.target_name || record.target_ref, attack_id: record.target_attack_id }]
    : [];

  const relatedSource = record.source_ref
    ? [
        {
          id: record.source_ref,
          label: record.source_name || record.source_ref,
          attack_id:
            (state.entityData[record.source_type] &&
              state.entityData[record.source_type][record.source_ref] &&
              state.entityData[record.source_type][record.source_ref].attack_id) ||
            state.allNodeMap[record.source_ref]?.attack_id ||
            null,
        },
      ]
    : [];

  detailsContainer.innerHTML = `
    <div class="label">Procedure Summary</div>
    <div class="value-block">${record.source_name || nodeData.label}</div>

    <div class="label">Node Type</div>
    <div class="value-block">${buildBadge("procedure")}</div>

    <div class="label">Associated Entity</div>
    <div class="value-block">${formatNodeLinks(relatedSource, "No related entity reference.")}</div>

    <div class="label">Target Technique</div>
    <div class="value-block">${formatNodeLinks(relatedTechnique, "No target technique reference.")}</div>

    <div class="label">Observed Window</div>
    <div class="value-block">${windowLabel}</div>

    <div class="label">Procedure Narrative</div>
    ${buildDescriptionBlock(record.description)}

    <div class="label">Citations</div>
    <div class="value-block">${formatCitations(record.external_references || [])}</div>
  `;
  if (openPanel) openDetailsPanel();
}
