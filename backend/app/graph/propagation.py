"""
Failure Propagation Engine — simulates cascade failures through the factory graph.

Enhanced with:
  • Propagation decay — impact reduces as cascade depth increases
  • Impact scoring — failure_prob × dependency_weight × decay^depth
  • Impact levels  — critical / high / medium / low colour coding
  • Blast radius   — economic loss, impact breakdown, summary metrics
"""
from collections import deque
from dataclasses import dataclass, field
from app.graph.factory_graph import FactoryGraph

# ── Constants ────────────────────────────────────────────────────────────────
PROPAGATION_DECAY = 0.85          # Impact multiplier per cascade depth
HOURLY_COST_USD = 5_000           # Economic cost per hour of downtime
IMPACT_THRESHOLDS = {             # impact_score → level
    "critical": 0.70,
    "high":     0.40,
    "medium":   0.15,
}


def _impact_level(score: float) -> str:
    """Classify an impact score into a severity level."""
    if score >= IMPACT_THRESHOLDS["critical"]:
        return "critical"
    if score >= IMPACT_THRESHOLDS["high"]:
        return "high"
    if score >= IMPACT_THRESHOLDS["medium"]:
        return "medium"
    return "low"


@dataclass
class CascadeStep:
    """A single step in a cascade failure propagation."""
    machine_id: str
    machine_type: str
    production_line: str
    original_failure_prob: float
    cascade_risk: float
    combined_risk: float
    depth: int
    impact_score: float = 0.0
    impact_level: str = "low"
    source_machine: str | None = None

    def to_dict(self):
        return {
            "machine_id": self.machine_id,
            "machine_type": self.machine_type,
            "production_line": self.production_line,
            "original_failure_prob": round(self.original_failure_prob, 4),
            "cascade_risk": round(self.cascade_risk, 4),
            "combined_risk": round(self.combined_risk, 4),
            "impact_score": round(self.impact_score, 4),
            "impact_level": self.impact_level,
            "depth": self.depth,
            "source_machine": self.source_machine,
        }


@dataclass
class CascadeResult:
    """Result of a cascade failure simulation with blast-radius metrics."""
    origin_machine: str
    origin_failure_prob: float
    affected_machines: list[CascadeStep] = field(default_factory=list)
    total_downtime_hours: float = 0.0
    max_cascade_depth: int = 0
    cascade_paths: list[list[str]] = field(default_factory=list)

    # ── Blast-radius helpers ─────────────────────────────────────────────

    @property
    def estimated_economic_loss(self) -> float:
        """Total estimated $ loss from cascaded downtime."""
        return self.total_downtime_hours * HOURLY_COST_USD

    @property
    def impact_breakdown(self) -> dict[str, int]:
        """Count of affected machines per impact level."""
        breakdown = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for m in self.affected_machines:
            breakdown[m.impact_level] = breakdown.get(m.impact_level, 0) + 1
        return breakdown

    def to_dict(self):
        return {
            "origin_machine": self.origin_machine,
            "origin_failure_prob": round(self.origin_failure_prob, 4),
            "affected_machines": [m.to_dict() for m in self.affected_machines],
            "affected_count": len(self.affected_machines),
            "total_downtime_hours": round(self.total_downtime_hours, 1),
            "max_cascade_depth": self.max_cascade_depth,
            "cascade_paths": self.cascade_paths,
            "blast_radius": {
                "estimated_economic_loss": round(self.estimated_economic_loss, 2),
                "impact_breakdown": self.impact_breakdown,
                "affected_lines": list({
                    m.production_line for m in self.affected_machines
                }),
            },
        }


class PropagationEngine:
    """
    Simulates cascade failure propagation through the factory dependency graph.

    Uses BFS to propagate failure risk from a source machine to all downstream
    machines, applying edge weights and propagation decay to compute cascading risk.
    """

    def __init__(self, factory_graph: FactoryGraph):
        self.factory_graph = factory_graph

    def simulate_cascade(
        self,
        machine_id: str,
        failure_prob: float | None = None,
        apply_to_graph: bool = True,
    ) -> CascadeResult:
        """
        Simulate cascade failure starting from a given machine.

        Impact model per downstream node:
            impact_score = failure_prob × edge_weight × PROPAGATION_DECAY ^ depth

        Args:
            machine_id: The machine that initiates the failure
            failure_prob: Override failure probability (default: use current)
            apply_to_graph: Whether to update graph node states

        Returns:
            CascadeResult with all affected machines, blast-radius metrics
        """
        graph = self.factory_graph.graph
        if machine_id not in graph:
            raise ValueError(f"Machine '{machine_id}' not found in factory graph")

        # Get or set the origin failure probability
        if failure_prob is not None:
            origin_prob = failure_prob
        else:
            origin_prob = graph.nodes[machine_id].get("failure_prob", 0.5)

        # Force the origin machine into failed state
        if apply_to_graph:
            self.factory_graph.set_machine_failed(machine_id, origin_prob)

        result = CascadeResult(
            origin_machine=machine_id,
            origin_failure_prob=origin_prob,
        )

        # BFS propagation
        visited = {machine_id}
        queue = deque()

        # Seed the queue with direct successors
        for successor in graph.successors(machine_id):
            edge_weight = graph[machine_id][successor]["weight"]
            cascade_risk = origin_prob * edge_weight
            queue.append((successor, cascade_risk, 1, machine_id, [machine_id, successor]))

        while queue:
            current_id, incoming_risk, depth, source_id, path = queue.popleft()

            if current_id in visited:
                continue
            visited.add(current_id)

            node_data = graph.nodes[current_id]
            original_fp = node_data.get("failure_prob", 0.0)

            # Apply propagation decay
            decay = PROPAGATION_DECAY ** depth
            impact_score = origin_prob * incoming_risk * decay

            # Combined risk: own risk + cascade risk, capped at 1.0
            combined_risk = min(1.0, original_fp + incoming_risk)

            step = CascadeStep(
                machine_id=current_id,
                machine_type=node_data.get("machine_type", "Unknown"),
                production_line=node_data.get("production_line", "Unknown"),
                original_failure_prob=original_fp,
                cascade_risk=round(incoming_risk, 4),
                combined_risk=round(combined_risk, 4),
                impact_score=round(impact_score, 4),
                impact_level=_impact_level(combined_risk),
                depth=depth,
                source_machine=source_id,
            )
            result.affected_machines.append(step)

            # Update graph if requested
            if apply_to_graph:
                graph.nodes[current_id]["cascade_risk"] = round(incoming_risk, 4)
                graph.nodes[current_id]["failure_prob"] = round(combined_risk, 4)
                graph.nodes[current_id]["health_score"] = round(1 - combined_risk, 4)
                if combined_risk >= 0.8:
                    graph.nodes[current_id]["status"] = "critical"
                elif combined_risk >= 0.5:
                    graph.nodes[current_id]["status"] = "degraded"
                elif combined_risk >= 0.3:
                    graph.nodes[current_id]["status"] = "warning"

            # Calculate downtime
            downtime = node_data.get("downtime_cost", 4) * combined_risk
            result.total_downtime_hours += downtime

            # Track cascade path
            result.cascade_paths.append(path)
            result.max_cascade_depth = max(result.max_cascade_depth, depth)

            # Propagate to successors with decay
            for successor in graph.successors(current_id):
                if successor not in visited:
                    edge_weight = graph[current_id][successor]["weight"]
                    next_risk = combined_risk * edge_weight * PROPAGATION_DECAY
                    # Only propagate if risk is significant
                    if next_risk >= 0.01:
                        queue.append(
                            (successor, next_risk, depth + 1, current_id, path + [successor])
                        )

        # Add origin machine downtime
        origin_downtime = graph.nodes[machine_id].get("downtime_cost", 4) * origin_prob
        result.total_downtime_hours += origin_downtime

        return result

    def get_all_cascade_risks(self) -> list[dict]:
        """
        Compute cascade risk for every machine (what happens if each one fails).
        Returns sorted list by total impact.
        """
        results = []
        for node_id in self.factory_graph.graph.nodes:
            # Simulate without applying to graph
            cascade = self.simulate_cascade(node_id, failure_prob=1.0, apply_to_graph=False)
            results.append({
                "machine_id": node_id,
                "machine_type": self.factory_graph.graph.nodes[node_id].get("machine_type"),
                "production_line": self.factory_graph.graph.nodes[node_id].get("production_line"),
                "affected_count": len(cascade.affected_machines),
                "total_downtime_hours": round(cascade.total_downtime_hours, 1),
                "max_cascade_depth": cascade.max_cascade_depth,
                "estimated_economic_loss": round(cascade.estimated_economic_loss, 2),
            })

        results.sort(key=lambda x: x["total_downtime_hours"], reverse=True)
        return results
