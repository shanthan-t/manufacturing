"""
What-If Scenario Engine — simulate preventative maintenance actions.
Computes before/after delta for cascade downtime and risk.
"""
import copy
from dataclasses import dataclass
from app.graph.factory_graph import FactoryGraph
from app.graph.propagation import PropagationEngine
from app.config import DOWNTIME_COSTS


# ── Action definitions ─────────────────────────────────────────────────────

ACTION_SPECS = {
    "repair": {
        "label": "Repair",
        "health_override": 0.90,       # restore to 90% health
        "failure_prob_override": 0.10,
        "description": "Machine is repaired and restored to near-full health.",
    },
    "replace": {
        "label": "Replace",
        "health_override": 1.00,
        "failure_prob_override": 0.00,
        "description": "Machine is replaced with a new unit at full health.",
    },
    "load_reduction": {
        "label": "Load Reduction",
        "failure_prob_scale": 0.55,    # reduce failure prob by 45%
        "description": "Operating load reduced, slowing degradation rate.",
    },
    "shutdown": {
        "label": "Shutdown",
        "health_override": 0.00,
        "failure_prob_override": 0.00, # removed from propagation
        "remove_from_cascade": True,
        "description": "Machine is taken offline. No cascade contribution, but zero production.",
    },
    "preventive_maintenance": {
        "label": "Preventive Maintenance",
        "health_override": 0.75,
        "failure_prob_override": 0.25,
        "description": "Scheduled maintenance performed, reducing risk substantially.",
    },
}


@dataclass
class ScenarioResult:
    machine_id: str
    action_type: str
    action_label: str
    description: str

    # Before state
    before_failure_prob: float
    before_health: float
    before_cascade_affected: int
    before_cascade_downtime: float

    # After state
    after_failure_prob: float
    after_health: float
    after_cascade_affected: int
    after_cascade_downtime: float

    # Deltas
    downtime_reduction: float
    risk_improvement: float
    narrative: str

    def to_dict(self):
        return {
            "machine_id": self.machine_id,
            "action_type": self.action_type,
            "action_label": self.action_label,
            "description": self.description,
            "before": {
                "failure_prob": round(self.before_failure_prob, 3),
                "health_score": round(self.before_health, 3),
                "cascade_affected": self.before_cascade_affected,
                "cascade_downtime_hours": round(self.before_cascade_downtime, 1),
            },
            "after": {
                "failure_prob": round(self.after_failure_prob, 3),
                "health_score": round(self.after_health, 3),
                "cascade_affected": self.after_cascade_affected,
                "cascade_downtime_hours": round(self.after_cascade_downtime, 1),
            },
            "improvement": {
                "downtime_reduction_hours": round(self.downtime_reduction, 1),
                "downtime_reduction_pct": round(
                    (self.downtime_reduction / max(self.before_cascade_downtime, 0.01)) * 100, 1
                ),
                "risk_improvement": round(self.risk_improvement, 3),
            },
            "narrative": self.narrative,
        }


class ScenarioEngine:
    """
    Simulates what-if maintenance actions and computes before/after risk deltas.

    Works by cloning the current factory graph state, applying the action,
    re-running cascade propagation, and diffing the results.
    """

    def __init__(self, factory_graph: FactoryGraph, propagation_engine: PropagationEngine):
        self.factory_graph = factory_graph
        self.propagation_engine = propagation_engine

    def simulate(self, machine_id: str, action_type: str) -> ScenarioResult:
        """
        Simulate a preventative action on a machine.

        Args:
            machine_id: The target machine
            action_type: One of repair / replace / load_reduction / shutdown / preventive_maintenance
        """
        if machine_id not in self.factory_graph.graph:
            raise ValueError(f"Machine '{machine_id}' not found")

        spec = ACTION_SPECS.get(action_type)
        if spec is None:
            raise ValueError(f"Unknown action '{action_type}'. Valid: {list(ACTION_SPECS.keys())}")

        graph = self.factory_graph.graph
        node = graph.nodes[machine_id]

        # ── Before: simulate cascade at current health ──────────────────────
        before_fp = float(node.get("failure_prob", 0.5))
        before_health = float(node.get("health_score", 0.5))

        before_cascade = self.propagation_engine.simulate_cascade(
            machine_id, failure_prob=before_fp, apply_to_graph=False
        )

        # ── Apply the action to a snapshot ──────────────────────────────────
        # We modify the node temporarily (thread-unsafe, but fine for this app)
        orig_fp = before_fp
        orig_health = before_health

        if "failure_prob_override" in spec:
            after_fp = spec["failure_prob_override"]
            after_health = spec.get("health_override", 1.0 - after_fp)
        elif "failure_prob_scale" in spec:
            after_fp = before_fp * spec["failure_prob_scale"]
            after_health = 1.0 - after_fp
        else:
            after_fp = before_fp
            after_health = before_health

        # Temporarily patch the graph node
        graph.nodes[machine_id]["failure_prob"] = after_fp
        graph.nodes[machine_id]["health_score"] = after_health

        # For shutdown — also temporarily boost downstream edge weights to 0
        shutdown_saved_weights = {}
        if spec.get("remove_from_cascade"):
            for successor in graph.successors(machine_id):
                shutdown_saved_weights[successor] = graph[machine_id][successor]["weight"]
                graph[machine_id][successor]["weight"] = 0.0

        # ── After: simulate cascade at new health ────────────────────────────
        after_cascade = self.propagation_engine.simulate_cascade(
            machine_id, failure_prob=after_fp, apply_to_graph=False
        )

        # ── Restore graph state ──────────────────────────────────────────────
        graph.nodes[machine_id]["failure_prob"] = orig_fp
        graph.nodes[machine_id]["health_score"] = orig_health
        for successor, weight in shutdown_saved_weights.items():
            graph[machine_id][successor]["weight"] = weight

        # ── Build result ─────────────────────────────────────────────────────
        before_dt = before_cascade.total_downtime_hours
        after_dt = after_cascade.total_downtime_hours
        downtime_reduction = max(0.0, before_dt - after_dt)
        risk_improvement = max(0.0, before_fp - after_fp)

        narrative = self._build_narrative(
            machine_id=machine_id,
            action_label=spec["label"],
            before_fp=before_fp,
            after_fp=after_fp,
            before_dt=before_dt,
            after_dt=after_dt,
            before_affected=len(before_cascade.affected_machines),
            after_affected=len(after_cascade.affected_machines),
        )

        return ScenarioResult(
            machine_id=machine_id,
            action_type=action_type,
            action_label=spec["label"],
            description=spec["description"],
            before_failure_prob=before_fp,
            before_health=before_health,
            before_cascade_affected=len(before_cascade.affected_machines),
            before_cascade_downtime=before_dt,
            after_failure_prob=after_fp,
            after_health=after_health,
            after_cascade_affected=len(after_cascade.affected_machines),
            after_cascade_downtime=after_dt,
            downtime_reduction=downtime_reduction,
            risk_improvement=risk_improvement,
            narrative=narrative,
        )

    def get_best_action(self, machine_id: str) -> dict:
        """Find which action yields the greatest downtime reduction."""
        results = []
        for action in ACTION_SPECS:
            try:
                r = self.simulate(machine_id, action)
                results.append(r.to_dict())
            except Exception:
                continue
        results.sort(key=lambda x: x["improvement"]["downtime_reduction_hours"], reverse=True)
        return results[0] if results else {}

    @staticmethod
    def _build_narrative(
        machine_id: str, action_label: str,
        before_fp: float, after_fp: float,
        before_dt: float, after_dt: float,
        before_affected: int, after_affected: int,
    ) -> str:
        direction = "reduces" if after_dt < before_dt else "maintains"
        reduction = before_dt - after_dt

        if reduction > 0:
            return (
                f"{action_label} of {machine_id} {direction} cascade downtime from "
                f"{before_dt:.1f}h to {after_dt:.1f}h — saving {reduction:.1f}h of production loss. "
                f"Failure probability drops from {before_fp:.0%} to {after_fp:.0%}, "
                f"and downstream machines at risk decreases from {before_affected} to {after_affected}."
            )
        else:
            return (
                f"{action_label} of {machine_id} does not significantly alter cascade risk. "
                f"Failure probability remains at {after_fp:.0%}. "
                f"Consider targeting upstream dependencies for greater impact."
            )
