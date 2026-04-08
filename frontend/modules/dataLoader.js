// modules/dataLoader.js
// Fetches all JSON data files from the server.

import { DATA_PATH_CANDIDATES } from "./state.js";

export async function fetchJsonWithFallback(filename) {
  let lastError = null;
  for (const basePath of DATA_PATH_CANDIDATES) {
    if (!basePath) continue;
    const normalizedBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
    const url = `${normalizedBase}/${filename}`;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`Failed to load ${filename} from ${url}`, error);
    }
  }
  throw lastError || new Error(`Unable to load ${filename}`);
}

export function loadAllData() {
  return Promise.all([
    fetchJsonWithFallback("graph.json"),
    fetchJsonWithFallback("graph_extended.json"),
    fetchJsonWithFallback("techniques.json"),
    fetchJsonWithFallback("tactics.json"),
    fetchJsonWithFallback("groups.json"),
    fetchJsonWithFallback("malware.json"),
    fetchJsonWithFallback("campaigns.json"),
    fetchJsonWithFallback("procedures.json"),
  ]);
}
