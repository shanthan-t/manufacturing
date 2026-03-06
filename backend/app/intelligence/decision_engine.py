"""
Maintenance Decision Engine — transforms failure predictions and cascade risks
into actionable maintenance recommendations with priority ranking.
"""
from dataclasses import dataclass, field
from app.graph.factory_graph import FactoryGraph
from app.graph.propagation import PropagationEngine
from app.config import DOWNTIME_COSTS


@dataclass
class MaintenanceRecommendation:
    """A single maintenance recommendation for a machine."""
    machine_id: str
    machine_type: str
    production_line: str
    priority_score: float
    urgency: str  # immediate, urgent, scheduled, monitor
    failure_prob: float
    health_score: float
    predicted_rul: float
    cascade_impact_factor: float
    production_criticality: float
    prevented_downtime_hours: float
    actions: list[str] = field(default_factory=list)
    reasoning: str = ""

    def to_dict(self):
        return {
            "machine_id": self.machine_id,
            "machine_type": self.machine_type,
            "production_line": self.production_line,
            "priority_score": round(self.priority_score, 3),
            "urgency": self.urgency,
            "failure_prob": round(self.failure_prob, 4),
            "health_score": round(self.health_score, 4),
            "predicted_rul": round(self.predicted_rul, 1),
            "cascade_impact_factor": round(self.cascade_impact_factor, 3),
            "production_criticality": round(self.production_criticality, 3),
            "prevented_downtime_hours": round(self.prevented_downtime_hours, 1),
            "actions": self.actions,
            "reasoning": self.reasoning,
        }


# Maintenance action templates keyed by (machine_type, severity)
_ACTION_TEMPLATES = {
    ("Air Compressor", "critical"): [
        "🔴 IMMEDIATE: Shut down compressor and switch to backup air supply",
        "Inspect discharge valves and pressure relief systems",
        "Check compressor oil levels and coolant flow rate",
        "Schedule emergency compressor overhaul within 2 hours",
    ],
    ("Air Compressor", "high"): [
        "🟠 Schedule maintenance within 6 hours",
        "Monitor discharge pressure and temperature continuously",
        "Inspect air filter and intake valves for blockage",
        "Verify backup compressor readiness",
    ],
    ("Pneumatic Press", "critical"): [
        "🔴 IMMEDIATE: Halt press operations and lock out",
        "Inspect hydraulic lines for leaks or pressure loss",
        "Check pneumatic cylinder alignment and seals",
        "Schedule emergency press overhaul within 2 hours",
    ],
    ("Pneumatic Press", "high"): [
        "🟠 Schedule maintenance within 6 hours",
        "Monitor hydraulic pressure trends",
        "Inspect press die alignment and wear patterns",
        "Reduce cycle rate by 30% until maintenance",
    ],
    ("CNC Machine", "critical"): [
        "🔴 IMMEDIATE: Stop CNC operations and inspect spindle",
        "Check spindle bearing vibration levels",
        "Inspect coolant system and chip evacuation",
        "Schedule emergency spindle replacement within 2 hours",
    ],
    ("CNC Machine", "high"): [
        "🟠 Schedule maintenance within 6 hours",
        "Monitor spindle vibration and temperature sensors",
        "Inspect tool wear and replace if beyond threshold",
        "Reduce feed rate by 25% to extend remaining life",
    ],
    ("Assembly Robot", "critical"): [
        "🔴 IMMEDIATE: Emergency stop robot and inspect servo motors",
        "Check joint encoders and calibration drift",
        "Inspect cable harness for wear or damage",
        "Schedule emergency servo replacement within 2 hours",
    ],
    ("Assembly Robot", "high"): [
        "🟠 Schedule maintenance within 6 hours",
        "Monitor joint torque and position accuracy",
        "Inspect gripper mechanism and force sensors",
        "Reduce operating speed by 20% until maintenance",
    ],
    ("Packaging Conveyor", "critical"): [
        "🔴 IMMEDIATE: Stop conveyor and inspect drive motor",
        "Check belt tension and alignment",
        "Inspect gearbox for abnormal noise or temperature",
        "Schedule emergency motor/belt replacement within 2 hours",
    ],
    ("Packaging Conveyor", "high"): [
        "🟠 Schedule maintenance within 6 hours",
        "Monitor motor current draw and belt tracking",
        "Inspect roller bearings and lubrication",
        "Reduce conveyor speed by 30% until maintenance",
    ],
}

_DEFAULT_ACTIONS = {
    "critical": [
        "🔴 IMMEDIATE: Halt machine operations",
        "Perform full diagnostic inspection",
        "Schedule emergency maintenance within 2 hours",
    ],
    "high": [
        "🟠 Schedule maintenance within 6 hours",
        "Increase monitoring frequency",
        "Reduce machine load by 25%",
    ],
    "medium": [
        "🟡 Schedule maintenance within 24 hours",
        "Monitor sensor readings for anomalies",
        "Prepare replacement parts",
    ],
    "low": [
        "🟢 Continue normal operations",
        "Monitor for the next 24 hours",
        "Include in next scheduled maintenance window",
    ],
}


class DecisionEngine:
    """
    Computes maintenance priorities by combining failure predictions,
    cascade impact analysis, and production criticality into a single
    ranked decision matrix.
    """

    def __init__(self, factory_graph: FactoryGraph, propagation_engine: PropagationEngine):
        self.factory_graph = factory_graph
        self.propagation_engine = propagation_engine
        # Cache cascade impacts (expensive to compute)
        self._cascade_cache: dict[str, dict] = {}

    def _get_cascade_impact(self, machine_id: str) -> dict:
        """Get or compute cascade impact for a machine."""
        if machine_id not in self._cascade_cache:
            cascade = self.propagation_engine.simulate_cascade(
                machine_id, failure_prob=1.0, apply_to_graph=False
            )
            self._cascade_cache[machine_id] = {
                "affected_count": len(cascade.affected_machines),
                "total_downtime_hours": cascade.total_downtime_hours,
                "max_depth": cascade.max_cascade_depth,
            }
        return self._cascade_cache[machine_id]

    def compute_priorities(self) -> list[dict]:
        """
        Compute maintenance priority scores for all machines.

        Priority formula:
            priority_score = failure_prob × cascade_impact × production_criticality

        cascade_impact = normalized(affected_count × downtime_hours)
        production_criticality = position_weight × downtime_cost_weight
        """
        machines = self.factory_graph.get_all_machines()
        if not machines:
            return []

        # Compute raw cascade impacts for normalization
        raw_impacts = {}
        max_impact = 0.01  # avoid division by zero
        for m in machines:
            impact = self._get_cascade_impact(m["id"])
            # Impact score = downstream count × downtime
            raw_score = (impact["affected_count"] + 1) * impact["total_downtime_hours"]
            raw_impacts[m["id"]] = raw_score
            max_impact = max(max_impact, raw_score)

        # Max downtime cost for normalization
        max_downtime_cost = max(DOWNTIME_COSTS.values())

        recommendations = []
        for m in machines:
            fp = m.get("failure_prob", 0.0)
            hs = m.get("health_score", 1.0)
            rul = m.get("predicted_rul", 125.0)
            mtype = m.get("machine_type", "Unknown")
            pos = m.get("position_in_line", 0)

            # --- Cascade impact factor (0-1) ---
            cascade_impact_factor = raw_impacts[m["id"]] / max_impact

            # --- Production criticality (0-1) ---
            # Upstream machines (low position) are more critical
            position_weight = 1.0 - (pos * 0.15)  # pos 0→1.0, pos 4→0.4
            downtime_cost_weight = m.get("downtime_cost", 4) / max_downtime_cost
            production_criticality = position_weight * downtime_cost_weight

            # --- Priority score ---
            priority_score = fp * cascade_impact_factor * production_criticality

            # --- Urgency classification ---
            urgency = self._classify_urgency(fp, rul, cascade_impact_factor)

            # --- Prevented downtime ---
            prevented = self._estimate_prevented_downtime(m["id"], fp)

            # --- Actions ---
            severity = self._urgency_to_severity(urgency)
            actions = _ACTION_TEMPLATES.get(
                (mtype, severity),
                _DEFAULT_ACTIONS.get(severity, _DEFAULT_ACTIONS["low"])
            )

            # --- Reasoning ---
            reasoning = self._generate_reasoning(m, cascade_impact_factor, prevented)

            rec = MaintenanceRecommendation(
                machine_id=m["id"],
                machine_type=mtype,
                production_line=m.get("production_line", "Unknown"),
                priority_score=priority_score,
                urgency=urgency,
                failure_prob=fp,
                health_score=hs,
                predicted_rul=rul,
                cascade_impact_factor=cascade_impact_factor,
                production_criticality=production_criticality,
                prevented_downtime_hours=prevented,
                actions=actions,
                reasoning=reasoning,
            )
            recommendations.append(rec)

        # Sort by priority score (descending)
        recommendations.sort(key=lambda r: r.priority_score, reverse=True)
        return [r.to_dict() for r in recommendations]

    def get_recommendations(self, machine_id: str) -> dict | None:
        """Get detailed recommendations for a specific machine."""
        all_recs = self.compute_priorities()
        for rec in all_recs:
            if rec["machine_id"] == machine_id:
                return rec
        return None

    def _estimate_prevented_downtime(self, machine_id: str, failure_prob: float) -> float:
        """
        Estimate production downtime prevented by proactive maintenance.
        Computed as the total cascade downtime weighted by failure probability.
        """
        impact = self._get_cascade_impact(machine_id)
        return impact["total_downtime_hours"] * failure_prob

    @staticmethod
    def _classify_urgency(failure_prob: float, rul: float, cascade_impact: float) -> str:
        """Classify maintenance urgency based on multiple factors."""
        # Weighted urgency score
        urgency_score = (failure_prob * 0.5) + (cascade_impact * 0.3) + ((1 - min(rul / 125, 1)) * 0.2)

        if urgency_score >= 0.7 or failure_prob >= 0.8:
            return "immediate"
        elif urgency_score >= 0.45 or failure_prob >= 0.5:
            return "urgent"
        elif urgency_score >= 0.25 or failure_prob >= 0.3:
            return "scheduled"
        else:
            return "monitor"

    @staticmethod
    def _urgency_to_severity(urgency: str) -> str:
        return {
            "immediate": "critical",
            "urgent": "high",
            "scheduled": "medium",
            "monitor": "low",
        }.get(urgency, "low")

    @staticmethod
    def _generate_reasoning(machine: dict, cascade_impact: float, prevented: float) -> str:
        """Generate a human-readable reasoning string."""
        parts = []
        fp = machine.get("failure_prob", 0)
        mtype = machine.get("machine_type", "Unknown")

        if fp >= 0.8:
            parts.append(f"{mtype} {machine['id']} has critical failure probability ({fp:.0%})")
        elif fp >= 0.5:
            parts.append(f"{mtype} {machine['id']} shows elevated failure risk ({fp:.0%})")
        else:
            parts.append(f"{mtype} {machine['id']} has moderate risk ({fp:.0%})")

        if cascade_impact >= 0.6:
            parts.append(f"High cascade impact — failure would severely affect downstream production")
        elif cascade_impact >= 0.3:
            parts.append(f"Moderate cascade impact on downstream machines")

        if prevented >= 5:
            parts.append(f"Proactive maintenance could prevent {prevented:.1f}h of production loss")
        elif prevented >= 2:
            parts.append(f"Maintenance could save {prevented:.1f}h of downtime")

        return ". ".join(parts) + "."

    def invalidate_cache(self):
        """Clear cascade impact cache (call after graph state changes)."""
        self._cascade_cache.clear()
