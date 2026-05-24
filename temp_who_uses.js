
// --- "Who Uses This?" Panel ---

const whoUsesPanel     = document.getElementById("whoUsesPanel");
const whoUsesPanelBody = document.getElementById("whoUsesPanelBody");

export function showWhoUsesPanel(techId, anchorEl) {
  if (!whoUsesPanel || !whoUsesPanelBody) return;

  const tech      = state.techniqueMap[techId];
  const context   = state.techniqueContextIndex[techId] || {};
  const groups    = context.groups    || [];
  const malware   = context.malware   || [];
  const campaigns = context.campaigns || [];

  const titleEl    = whoUsesPanel.querySelector(".who-uses-title");
  const subtitleEl = whoUsesPanel.querySelector(".who-uses-subtitle");
  if (titleEl)    titleEl.textContent = tech?.name || techId;
  if (subtitleEl) subtitleEl.textContent = tech?.attack_id || "";

  const sortedGroups    = [...groups].sort((a, b) =>
    (state.entityData.group[a]?.name    || a).localeCompare(state.entityData.group[b]?.name    || b));
  const sortedMalware   = [...malware].sort((a, b) =>
    (state.entityData.malware[a]?.name  || a).localeCompare(state.entityData.malware[b]?.name  || b));
  const sortedCampaigns = [...campaigns].sort((a, b) =>
    (state.entityData.campaign[a]?.name || a).localeCompare(state.entityData.campaign[b]?.name || b));

  const rows = [];

  sortedGroups.slice(0, 8).forEach(id => {
    const rec = state.entityData.group[id];
    if (!rec) return;
    rows.push(
      `<button type="button" class="who-uses-row" data-actor-profile-id="${id}">` +
        `<span class="who-uses-badge who-uses-badge--group">Group</span>` +
        `<span class="who-uses-name">${rec.name}</span>` +
        `<span class="who-uses-id">${rec.attack_id || ""}</span>` +
      `</button>`
    );
  });

  sortedMalware.slice(0, 6).forEach(id => {
    const rec = state.entityData.malware[id];
    if (!rec) return;
    rows.push(
      `<div class="who-uses-row who-uses-row--static">` +
        `<span class="who-uses-badge who-uses-badge--malware">Malware</span>` +
        `<span class="who-uses-name">${rec.name}</span>` +
        `<span class="who-uses-id">${rec.attack_id || ""}</span>` +
      `</div>`
    );
  });

  sortedCampaigns.slice(0, 4).forEach(id => {
    const rec = state.entityData.campaign[id];
    if (!rec) return;
    rows.push(
      `<div class="who-uses-row who-uses-row--static">` +
        `<span class="who-uses-badge who-uses-badge--campaign">Campaign</span>` +
        `<span class="who-uses-name">${rec.name}</span>` +
        `<span class="who-uses-id">${rec.attack_id || ""}</span>` +
      `</div>`
    );
  });

  if (!rows.length) {
    whoUsesPanelBody.innerHTML = `<p class="who-uses-empty">No recorded usage data for this technique.</p>`;
  } else {
    const total = groups.length + malware.length + campaigns.length;
    const overflowNote = total > rows.length
      ? `<p class="who-uses-overflow">Showing ${rows.length} of ${total} — open Details for full list</p>`
      : "";
    whoUsesPanelBody.innerHTML = rows.join("") + overflowNote;
  }

  whoUsesPanel.classList.remove("is-hidden");

  const rect = anchorEl ? anchorEl.getBoundingClientRect() : null;
  if (rect) {
    const panelW = 300;
    const panelH = whoUsesPanel.offsetHeight || 320;
    let left = rect.right + 10;
    let top  = rect.top;
    if (left + panelW > window.innerWidth - 12)  left = rect.left - panelW - 10;
    if (top  + panelH > window.innerHeight - 12) top  = window.innerHeight - panelH - 12;
    top = Math.max(12, top);
    whoUsesPanel.style.left      = left + "px";
    whoUsesPanel.style.top       = top  + "px";
    whoUsesPanel.style.transform = "";
  } else {
    whoUsesPanel.style.left      = "50%";
    whoUsesPanel.style.top       = "50%";
    whoUsesPanel.style.transform = "translate(-50%,-50%)";
  }
}

export function hideWhoUsesPanel() {
  if (!whoUsesPanel) return;
  whoUsesPanel.classList.add("is-hidden");
  whoUsesPanel.style.transform = "";
}
