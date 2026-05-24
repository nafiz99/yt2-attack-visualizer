import json
from collections import defaultdict
from pathlib import Path

import networkx as nx

PROCESSED_DIR = Path('data_processed')
FRONTEND_DATA_DIR = Path('frontend') / 'data_processed'


def write_dataset(filename, payload):
    """Write JSON to both core processed and frontend-facing directories."""
    for target_dir in (PROCESSED_DIR, FRONTEND_DATA_DIR):
        target_dir.mkdir(parents=True, exist_ok=True)
        with (target_dir / filename).open('w', encoding='utf-8') as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)

# Load all three domain STIX bundles and merge their objects.
# Objects are deduplicated by STIX id so shared entities (groups, malware
# that appear across domains) are only included once.
DOMAIN_FILES = {
    "enterprise-attack": "data_raw/enterprise-attack.json",
    "mobile-attack":     "data_raw/mobile-attack.json",
    "ics-attack":        "data_raw/ics-attack.json",
}

all_objects_by_id = {}  # deduplicated by stix id
for domain_key, file_path in DOMAIN_FILES.items():
    p = Path(file_path)
    if not p.exists():
        print(f"WARNING: {file_path} not found, skipping {domain_key}")
        continue
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    domain_objects = data.get("objects", [])
    print(f"Loaded {len(domain_objects):,} objects from {domain_key}")
    for obj in domain_objects:
        oid = obj.get("id")
        if oid and oid not in all_objects_by_id:
            all_objects_by_id[oid] = obj

objects = list(all_objects_by_id.values())
print(f"Total unique objects after merge: {len(objects):,}")


def extract_external_id(obj, source_name="mitre-attack"):
    """Return the ATT&CK external ID for a STIX object, if present."""
    for ref in obj.get("external_references", []):
        if ref.get("source_name") == source_name:
            return ref.get("external_id")
    return None


def build_object_lookup(objects):
    lookup = {}
    for obj in objects:
        obj_id = obj.get("id")
        if obj_id:
            lookup[obj_id] = obj
    return lookup


def get_object_name(stix_id, lookup):
    obj = lookup.get(stix_id, {})
    return obj.get("name", stix_id)


object_lookup = build_object_lookup(objects)
object_type_lookup = {sid: obj.get("type") for sid, obj in object_lookup.items()}

attack_patterns = [o for o in objects if o.get("type") == "attack-pattern"]
relationships  = [o for o in objects if o.get("type") == "relationship"]
intrusion_sets = [o for o in objects if o.get("type") == "intrusion-set"]
malware_objs   = [o for o in objects if o.get("type") == "malware"]
campaign_objs  = [o for o in objects if o.get("type") == "campaign"]
tools          = [o for o in objects if o.get("type") == "tool"]
mitigations    = [o for o in objects if o.get("type") == "course-of-action"]
tactics        = [o for o in objects if o.get("type") == "x-mitre-tactic"]

print("\n=== ATT&CK Object Counts (all domains) ===")
print("Techniques (attack-pattern):", len(attack_patterns))
print("Relationships:", len(relationships))
print("Groups (intrusion-set):", len(intrusion_sets))
print("Malware:", len(malware_objs))
print("Campaigns:", len(campaign_objs))
print("Tools:", len(tools))
print("Mitigations:", len(mitigations))
print("Tactics:", len(tactics))

# Build a clean technique list
technique_records = []
technique_lookup = {}

for obj in attack_patterns:
    record = {
        "stix_id": obj.get("id"),
        "attack_id": extract_external_id(obj),
        "name": obj.get("name"),
        "description": obj.get("description"),
        "is_subtechnique": obj.get("x_mitre_is_subtechnique", False),
        "domains": obj.get("x_mitre_domains", []),
        "kill_chain_phases": obj.get("kill_chain_phases", []),
        "platforms": obj.get("x_mitre_platforms", [])
    }

    technique_records.append(record)
    technique_lookup[record["stix_id"]] = record

print("\n=== Sample Clean Techniques ===")
for t in technique_records[:5]:
    print(t)

# Build clean tactic list
tactic_records = []
tactic_lookup_by_shortname = {}

for obj in tactics:
    record = {
        "stix_id": obj.get("id"),
        "attack_id": extract_external_id(obj),
        "name": obj.get("name"),
        "shortname": obj.get("x_mitre_shortname"),
        "description": obj.get("description"),
        "domains": obj.get("x_mitre_domains", [])
    }

    tactic_records.append(record)

print("\n=== Sample Clean Tactics ===")
for t in tactic_records[:5]:
    print(t)

# Build tactic lookup by shortname
for tactic in tactic_records:
    if tactic["shortname"]:
        tactic_lookup_by_shortname[tactic["shortname"]] = tactic

# Build clean relationship list (baseline)
relationship_records = []

for rel in relationships:
    relationship_records.append({
        "source": rel.get("source_ref"),
        "target": rel.get("target_ref"),
        "type": rel.get("relationship_type")
    })

print("\n=== Sample Relationships ===")
for r in relationship_records[:5]:
    print(r)

# Build graph with networkx for stats
G = nx.DiGraph()

# Add tactic nodes
for tactic in tactic_records:
    G.add_node(
        tactic["stix_id"],
        label=tactic["name"],
        attack_id=tactic["attack_id"],
        node_type="tactic"
    )

# Add technique nodes
for tech in technique_records:
    G.add_node(
        tech["stix_id"],
        label=tech["name"],
        attack_id=tech["attack_id"],
        node_type="technique",
        is_subtechnique=tech["is_subtechnique"]
    )

# Add subtechnique-of edges
subtechnique_edge_count = 0
for r in relationship_records:
    if (
        r["source"] and r["target"]
        and r["source"].startswith("attack-pattern")
        and r["target"].startswith("attack-pattern")
        and r["type"] == "subtechnique-of"
    ):
        G.add_edge(r["source"], r["target"], type=r["type"])
        subtechnique_edge_count += 1

# Add tactic -> technique edges
tactic_edge_records = []
tactic_edge_count = 0

for technique in technique_records:
    for phase in technique.get("kill_chain_phases", []):
        shortname = phase.get("phase_name")
        if shortname and shortname in tactic_lookup_by_shortname:
            tactic = tactic_lookup_by_shortname[shortname]

            G.add_edge(
                tactic["stix_id"],
                technique["stix_id"],
                type="tactic-technique"
            )

            tactic_edge_records.append({
                "source": tactic["stix_id"],
                "target": technique["stix_id"],
                "type": "tactic-technique"
            })
            tactic_edge_count += 1

print("\n=== Graph Stats ===")
print("Total Nodes:", G.number_of_nodes())
print("Sub-technique Edges:", subtechnique_edge_count)
print("Tactic-Technique Edges:", tactic_edge_count)
print("Total Graph Edges:", G.number_of_edges())

# Save cleaned data to processed files
write_dataset("techniques.json", technique_records)
write_dataset("tactics.json", tactic_records)
write_dataset("relationships.json", relationship_records)

# Export only subtechnique-of edges
graph_edges = []

for r in relationship_records:
    if (
        r["source"] and r["target"]
        and r["source"].startswith("attack-pattern")
        and r["target"].startswith("attack-pattern")
        and r["type"] == "subtechnique-of"
    ):
        graph_edges.append(r)

write_dataset("graph_edges.json", graph_edges)

# Build frontend-ready graph structure with tactics + techniques
graph_data = {
    "nodes": [],
    "edges": []
}

# Add tactic nodes (default visible)
for tactic in tactic_records:
    graph_data["nodes"].append({
        "id": tactic["stix_id"],
        "label": tactic["name"],
        "attack_id": tactic["attack_id"],
        "node_type": "tactic",
        "shortname": tactic["shortname"],
        "description": tactic["description"],
        "default_visible": True
    })

# Add technique nodes
for tech in technique_records:
    graph_data["nodes"].append({
        "id": tech["stix_id"],
        "label": tech["name"],
        "attack_id": tech["attack_id"],
        "node_type": "technique",
        "is_subtechnique": tech["is_subtechnique"],
        "description": tech["description"],
        "default_visible": True
    })

# Add tactic-technique edges
for edge in tactic_edge_records:
    graph_data["edges"].append({
        "source": edge["source"],
        "target": edge["target"],
        "type": edge["type"]
    })

# Add subtechnique-of edges
for edge in graph_edges:
    graph_data["edges"].append({
        "source": edge["source"],
        "target": edge["target"],
        "type": edge["type"]
    })

write_dataset("graph.json", graph_data)

print("\nProcessed files saved to data_processed/ and mirrored to frontend/data_processed/:")
for name in [
    "techniques.json",
    "tactics.json",
    "relationships.json",
    "graph_edges.json",
    "graph.json"
]:
    print(f"- {name}")

# --- New contextual entity parsing ---

group_records = []
for obj in intrusion_sets:
    group_records.append({
        "stix_id": obj.get("id"),
        "attack_id": extract_external_id(obj),
        "name": obj.get("name"),
        "aliases": obj.get("aliases", []),
        "description": obj.get("description"),
        "first_seen": obj.get("first_seen"),
        "last_seen": obj.get("last_seen"),
        "primary_motivation": obj.get("primary_motivation"),
        "secondary_motivations": obj.get("secondary_motivations", []),
        "goals": obj.get("goals", []),
        "created": obj.get("created"),
        "modified": obj.get("modified"),
        "domains": obj.get("x_mitre_domains", [])
    })

malware_records = []
for obj in malware_objs:
    malware_records.append({
        "stix_id": obj.get("id"),
        "attack_id": extract_external_id(obj),
        "name": obj.get("name"),
        "aliases": obj.get("aliases", []),
        "description": obj.get("description"),
        "malware_types": obj.get("malware_types", []),
        "is_family": obj.get("x_mitre_is_family"),
        "platforms": obj.get("x_mitre_platforms", []),
        "capabilities": obj.get("x_mitre_capabilities", []),
        "first_seen": obj.get("first_seen"),
        "last_seen": obj.get("last_seen"),
        "created": obj.get("created"),
        "modified": obj.get("modified")
    })

campaign_records = []
for obj in campaign_objs:
    campaign_records.append({
        "stix_id": obj.get("id"),
        "attack_id": extract_external_id(obj),
        "name": obj.get("name"),
        "aliases": obj.get("aliases", []),
        "description": obj.get("description"),
        "objective": obj.get("objective"),
        "first_seen": obj.get("first_seen"),
        "last_seen": obj.get("last_seen"),
        "created": obj.get("created"),
        "modified": obj.get("modified"),
        "domains": obj.get("x_mitre_domains", [])
    })

group_to_techniques = defaultdict(set)
malware_to_techniques = defaultdict(set)
campaign_to_techniques = defaultdict(set)
campaign_to_groups = defaultdict(set)
campaign_to_malware = defaultdict(set)

group_tech_relationships = []
malware_tech_relationships = []
campaign_tech_relationships = []
campaign_group_relationships = []
campaign_malware_relationships = []

procedure_records = []

for rel in relationships:
    rel_type = rel.get("relationship_type")
    source = rel.get("source_ref")
    target = rel.get("target_ref")
    if not source or not target:
        continue

    source_type = object_type_lookup.get(source)
    target_type = object_type_lookup.get(target)

    if rel_type == "uses" and source_type == "intrusion-set" and target_type == "attack-pattern":
        group_to_techniques[source].add(target)
        group_tech_relationships.append({
            "relationship_id": rel.get("id"),
            "source": source,
            "target": target
        })
    elif rel_type == "uses" and source_type == "malware" and target_type == "attack-pattern":
        malware_to_techniques[source].add(target)
        malware_tech_relationships.append({
            "relationship_id": rel.get("id"),
            "source": source,
            "target": target
        })
    elif rel_type == "uses" and source_type == "campaign" and target_type == "attack-pattern":
        campaign_to_techniques[source].add(target)
        campaign_tech_relationships.append({
            "relationship_id": rel.get("id"),
            "source": source,
            "target": target
        })
    elif rel_type == "attributed-to" and source_type == "campaign" and target_type == "intrusion-set":
        campaign_to_groups[source].add(target)
        campaign_group_relationships.append({
            "relationship_id": rel.get("id"),
            "source": source,
            "target": target
        })
    elif rel_type == "uses" and source_type == "campaign" and target_type == "malware":
        campaign_to_malware[source].add(target)
        campaign_malware_relationships.append({
            "relationship_id": rel.get("id"),
            "source": source,
            "target": target
        })

    if (
        rel_type == "uses"
        and source_type in {"intrusion-set", "malware", "campaign"}
        and target_type == "attack-pattern"
    ):
        source_label = {
            "intrusion-set": "group",
            "malware": "malware",
            "campaign": "campaign"
        }[source_type]

        procedure_records.append({
            "stix_id": rel.get("id"),
            "relationship_type": rel_type,
            "source_ref": source,
            "source_type": source_label,
            "source_name": get_object_name(source, object_lookup),
            "target_ref": target,
            "target_type": "technique",
            "target_name": get_object_name(target, object_lookup),
            "target_attack_id": technique_lookup.get(target, {}).get("attack_id"),
            "description": rel.get("description"),
            "start_time": rel.get("start_time"),
            "stop_time": rel.get("stop_time"),
            "confidence": rel.get("confidence"),
            "lang": rel.get("lang"),
            "external_references": rel.get("external_references", [])
        })

# Augment entity records with linked references
tech_name_lookup = {rec["stix_id"]: rec.get("name") for rec in technique_records}


def build_link_entries(ids):
    entries = []
    for tid in sorted(ids):
        entries.append({
            "stix_id": tid,
            "attack_id": technique_lookup.get(tid, {}).get("attack_id"),
            "name": tech_name_lookup.get(tid, get_object_name(tid, object_lookup))
        })
    return entries


group_index = {rec["stix_id"]: rec for rec in group_records}
for group_id, linked in group_to_techniques.items():
    if group_id in group_index:
        group_index[group_id]["techniques"] = build_link_entries(linked)

malware_index = {rec["stix_id"]: rec for rec in malware_records}
for malware_id, linked in malware_to_techniques.items():
    if malware_id in malware_index:
        malware_index[malware_id]["techniques"] = build_link_entries(linked)

campaign_index = {rec["stix_id"]: rec for rec in campaign_records}
for camp_id, linked in campaign_to_techniques.items():
    if camp_id in campaign_index:
        campaign_index[camp_id]["techniques"] = build_link_entries(linked)

for camp_id, linked in campaign_to_groups.items():
    if camp_id in campaign_index:
        campaign_index[camp_id]["groups"] = [
            {
                "stix_id": gid,
                "attack_id": extract_external_id(object_lookup.get(gid, {})),
                "name": get_object_name(gid, object_lookup)
            }
            for gid in sorted(linked)
        ]

for camp_id, linked in campaign_to_malware.items():
    if camp_id in campaign_index:
        campaign_index[camp_id]["malware"] = [
            {
                "stix_id": mid,
                "attack_id": extract_external_id(object_lookup.get(mid, {})),
                "name": get_object_name(mid, object_lookup)
            }
            for mid in sorted(linked)
        ]

# Persist contextual datasets
write_dataset("groups.json", group_records)
write_dataset("malware.json", malware_records)
write_dataset("campaigns.json", campaign_records)
write_dataset("procedures.json", procedure_records)

print("\nContextual datasets saved to both directories:")
for name in ["groups.json", "malware.json", "campaigns.json", "procedures.json"]:
    print(f"- {name}")

# Build extended graph that adds contextual nodes/edges but keeps default graph lightweight
extended_graph_data = {
    "nodes": [dict(node) for node in graph_data["nodes"]],
    "edges": [dict(edge) for edge in graph_data["edges"]]
}

extended_node_ids = {node["id"] for node in extended_graph_data["nodes"]}
extended_edge_ids = {
    (edge["source"], edge["target"], edge["type"], edge.get("relationship_id"))
    for edge in extended_graph_data["edges"]
}


def add_extended_node(node):
    node_id = node["id"]
    if node_id in extended_node_ids:
        return
    extended_graph_data["nodes"].append(node)
    extended_node_ids.add(node_id)


def add_extended_edge(source, target, edge_type, relationship_id=None, **extra):
    if source not in extended_node_ids or target not in extended_node_ids:
        return
    key = (source, target, edge_type, relationship_id)
    if key in extended_edge_ids:
        return

    edge = {
        "source": source,
        "target": target,
        "type": edge_type
    }
    if relationship_id:
        edge["relationship_id"] = relationship_id
    if extra:
        edge.update(extra)

    extended_graph_data["edges"].append(edge)
    extended_edge_ids.add(key)


# Register group/malware/campaign nodes (hidden by default)
for record, node_type in [
    (group_records, "group"),
    (malware_records, "malware"),
    (campaign_records, "campaign")
]:
    for entity in record:
        add_extended_node({
            "id": entity["stix_id"],
            "label": entity["name"],
            "attack_id": entity.get("attack_id"),
            "node_type": node_type,
            "description": entity.get("description"),
            "default_visible": False
        })

# Register procedure nodes
for procedure in procedure_records:
    source_name = procedure.get("source_name") or procedure.get("source_ref")
    target_name = procedure.get("target_name") or procedure.get("target_ref")
    rel_label = procedure.get("relationship_type", "procedure").replace("-", " ")
    label = f"{rel_label.title()}: {source_name} -> {target_name}"

    add_extended_node({
        "id": procedure["stix_id"],
        "label": label,
        "node_type": "procedure",
        "description": procedure.get("description"),
        "source_ref": procedure.get("source_ref"),
        "target_ref": procedure.get("target_ref"),
        "default_visible": False
    })

# Add contextual edges
for rel in group_tech_relationships:
    add_extended_edge(
        rel["source"],
        rel["target"],
        "group-technique",
        relationship_id=rel["relationship_id"],
        source_type="group",
        target_type="technique"
    )

for rel in malware_tech_relationships:
    add_extended_edge(
        rel["source"],
        rel["target"],
        "malware-technique",
        relationship_id=rel["relationship_id"],
        source_type="malware",
        target_type="technique"
    )

for rel in campaign_tech_relationships:
    add_extended_edge(
        rel["source"],
        rel["target"],
        "campaign-technique",
        relationship_id=rel["relationship_id"],
        source_type="campaign",
        target_type="technique"
    )

for rel in campaign_group_relationships:
    add_extended_edge(
        rel["source"],
        rel["target"],
        "campaign-group",
        relationship_id=rel["relationship_id"],
        source_type="campaign",
        target_type="group"
    )

for rel in campaign_malware_relationships:
    add_extended_edge(
        rel["source"],
        rel["target"],
        "campaign-malware",
        relationship_id=rel["relationship_id"],
        source_type="campaign",
        target_type="malware"
    )

for procedure in procedure_records:
    proc_id = procedure["stix_id"]
    source_ref = procedure["source_ref"]
    target_ref = procedure["target_ref"]
    source_type = procedure["source_type"]

    add_extended_edge(
        proc_id,
        target_ref,
        "procedure-technique",
        relationship_id=proc_id,
        source_type="procedure",
        target_type="technique"
    )

    add_extended_edge(
        proc_id,
        source_ref,
        f"procedure-{source_type}",
        relationship_id=proc_id,
        source_type="procedure",
        target_type=source_type
    )

write_dataset("graph_extended.json", extended_graph_data)

print("\nExtended graph saved to both directories:")
print("- graph_extended.json")
