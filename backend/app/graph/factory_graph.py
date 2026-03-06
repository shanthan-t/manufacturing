"""
Factory Dependency Graph — models machines and their dependencies using NetworkX.
"""
import networkx as nx
from app.config import FACTORY_LINES, CROSS_LINE_DEPENDENCIES, DEFAULT_EDGE_WEIGHT, DOWNTIME_COSTS


class FactoryGraph:
    """
    Directed graph representing factory machine dependencies.
    Nodes = machines, Edges = dependency relationships.
    """

    def __init__(self):
        self.graph = nx.DiGraph()
        self._build_graph()

    def _build_graph(self):
        """Build the factory graph from configuration."""
        # Add nodes for each production line
        for line in FACTORY_LINES:
            machines = line["machines"]
            for i, machine in enumerate(machines):
                self.graph.add_node(
                    machine["id"],
                    machine_type=machine["type"],
                    unit_id=machine["unit_id"],
                    production_line=line["name"],
                    position_in_line=i,
                    health_score=1.0,
                    failure_prob=0.0,
                    cascade_risk=0.0,
                    status="operational",
                    downtime_cost=DOWNTIME_COSTS.get(machine["type"], 4),
                )

            # Add sequential edges within the line
            for i in range(len(machines) - 1):
                self.graph.add_edge(
                    machines[i]["id"],
                    machines[i + 1]["id"],
                    weight=DEFAULT_EDGE_WEIGHT,
                    dependency_type="sequential",
                )

        # Add cross-line dependencies
        for dep in CROSS_LINE_DEPENDENCIES:
            if dep["from"] in self.graph and dep["to"] in self.graph:
                self.graph.add_edge(
                    dep["from"],
                    dep["to"],
                    weight=dep["weight"],
                    dependency_type="cross-line",
                )

    def build_from_data(self, machine_ids: list, machine_id_map: dict = None):
        """
        Build the factory graph dynamically from uploaded machine data.

        Groups machines into production lines (up to 5 per line),
        assigns machine types, and creates dependency edges.

        Args:
            machine_ids: List of original machine IDs from the uploaded dataset
            machine_id_map: Mapping from original IDs to unit_id integers
        """
        self.graph.clear()

        # Machine type cycle for assigning types to uploaded machines
        machine_types = [
            "Air Compressor", "Pneumatic Press", "CNC Machine",
            "Assembly Robot", "Packaging Conveyor",
        ]
        machines_per_line = 5

        # Group machines into production lines
        sorted_ids = sorted(machine_ids, key=str)
        lines = []
        for i in range(0, len(sorted_ids), machines_per_line):
            line_machines = sorted_ids[i:i + machines_per_line]
            line_idx = i // machines_per_line
            line_letter = chr(ord('A') + (line_idx % 26))
            lines.append({
                "name": f"Production Line {line_letter}",
                "machines": line_machines,
            })

        # Build nodes
        for line in lines:
            for pos, orig_id in enumerate(line["machines"]):
                m_type = machine_types[pos % len(machine_types)]
                unit_id = machine_id_map.get(str(orig_id), pos + 1) if machine_id_map else pos + 1
                node_id = str(orig_id)

                self.graph.add_node(
                    node_id,
                    machine_type=m_type,
                    unit_id=unit_id,
                    production_line=line["name"],
                    position_in_line=pos,
                    health_score=1.0,
                    failure_prob=0.0,
                    cascade_risk=0.0,
                    status="operational",
                    downtime_cost=DOWNTIME_COSTS.get(m_type, 4),
                    original_id=str(orig_id),
                )

            # Sequential edges within the line
            for j in range(len(line["machines"]) - 1):
                self.graph.add_edge(
                    str(line["machines"][j]),
                    str(line["machines"][j + 1]),
                    weight=DEFAULT_EDGE_WEIGHT,
                    dependency_type="sequential",
                )

        # Cross-line dependencies (first machine of each line feeds into next line)
        line_names = [l["name"] for l in lines]
        if len(lines) >= 2:
            for i in range(0, len(lines) - 1, 2):
                src = str(lines[i]["machines"][0])
                tgt_line = lines[i + 1]
                if len(tgt_line["machines"]) >= 2:
                    tgt = str(tgt_line["machines"][1])
                    self.graph.add_edge(src, tgt, weight=0.3, dependency_type="cross-line")

        # Store dynamic line info for get_graph_data
        self._dynamic_lines = [l["name"] for l in lines]

    def update_machine_health(self, machine_id: str, health_data: dict):
        """Update health data for a specific machine node."""
        if machine_id in self.graph:
            self.graph.nodes[machine_id].update(health_data)

    def get_machine(self, machine_id: str) -> dict | None:
        """Get full data for a machine node."""
        if machine_id in self.graph:
            data = dict(self.graph.nodes[machine_id])
            data["id"] = machine_id
            return data
        return None

    def get_all_machines(self) -> list[dict]:
        """Get all machines with their current state."""
        machines = []
        for node_id, data in self.graph.nodes(data=True):
            machine = dict(data)
            machine["id"] = node_id
            machines.append(machine)
        return machines

    def get_downstream(self, machine_id: str) -> list[str]:
        """Get all downstream machines (successors in the dependency chain)."""
        if machine_id not in self.graph:
            return []
        return list(nx.descendants(self.graph, machine_id))

    def get_upstream(self, machine_id: str) -> list[str]:
        """Get all upstream machines (predecessors in the dependency chain)."""
        if machine_id not in self.graph:
            return []
        return list(nx.ancestors(self.graph, machine_id))

    def get_graph_data(self) -> dict:
        """
        Get graph structure in a format suitable for D3.js visualization.
        Returns { nodes: [...], edges: [...], lines: [...] }
        """
        nodes = []
        for node_id, data in self.graph.nodes(data=True):
            node = dict(data)
            node["id"] = node_id
            nodes.append(node)

        edges = []
        for source, target, data in self.graph.edges(data=True):
            edge = dict(data)
            edge["source"] = source
            edge["target"] = target
            edges.append(edge)

        lines = getattr(self, '_dynamic_lines', None) or [line["name"] for line in FACTORY_LINES]

        return {"nodes": nodes, "edges": edges, "lines": lines}

    def set_machine_failed(self, machine_id: str, failure_prob: float = 1.0):
        """Force a machine into failed state."""
        if machine_id in self.graph:
            self.graph.nodes[machine_id].update({
                "health_score": max(0, 1.0 - failure_prob),
                "failure_prob": failure_prob,
                "status": "failed" if failure_prob >= 0.8 else "degraded",
            })

    def reset_machine(self, machine_id: str, health_data: dict):
        """Reset a machine to its predicted health state."""
        if machine_id in self.graph:
            self.graph.nodes[machine_id].update(health_data)
            self.graph.nodes[machine_id]["cascade_risk"] = 0.0

    def get_edge_weight(self, source: str, target: str) -> float:
        """Get the propagation weight between two machines."""
        if self.graph.has_edge(source, target):
            return self.graph[source][target]["weight"]
        return 0.0
