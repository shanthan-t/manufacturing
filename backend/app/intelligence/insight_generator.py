"""
AI Insight Generator — produces executive-level factory risk narrative.
"""
from app.graph.factory_graph import FactoryGraph
from app.graph.propagation import PropagationEngine
from app.intelligence.risk_engine import RiskEngine


class InsightGenerator:
    """
    Generates factory-wide AI insights: narrative summary, critical alerts,
    and recommended actions for operators and management.
    """

    def __init__(self, factory_graph: FactoryGraph, propagation_engine: PropagationEngine, risk_engine: RiskEngine):
        self.factory_graph = factory_graph
        self.propagation_engine = propagation_engine
        self.risk_engine = risk_engine

    def generate_summary(self) -> dict:
        """
        Computes a structured AI insight summary of factory risk.
        Returns narrative text, critical alerts, recommendations.
        """
        summary = self.risk_engine.get_factory_summary()
        critical = self.risk_engine.get_critical_machines(top_n=3)
        impact = self.risk_engine.get_highest_impact_machines(top_n=3)
        all_machines = self.factory_graph.get_all_machines()

        # Factory-level health metrics
        avg_health = summary["avg_health_score"]
        risk_level = summary["factory_risk_level"]
        downtime = summary["estimated_total_downtime_hours"]
        vulnerable_line = summary["most_vulnerable_line"]

        # Most critical single machine
        top_machine = critical[0] if critical else None
        top_impact = impact[0] if impact else None

        # Build headline narrative
        headline = self._build_headline(
            risk_level=risk_level,
            avg_health=avg_health,
            downtime=downtime,
            top_machine=top_machine,
            vulnerable_line=vulnerable_line,
        )

        # Build critical insight cards
        insight_cards = self._build_insight_cards(critical, impact, vulnerable_line)

        # Build recommended actions
        recommendations = self._build_recommendations(critical, top_impact)

        # Risk level counts
        level_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for m in all_machines:
            fp = m.get("failure_prob", 0)
            if fp >= 0.8:
                level_counts["critical"] += 1
            elif fp >= 0.5:
                level_counts["high"] += 1
            elif fp >= 0.3:
                level_counts["medium"] += 1
            else:
                level_counts["low"] += 1

        return {
            "factory_risk_level": risk_level,
            "avg_health_score": round(avg_health, 3),
            "estimated_downtime_hours": round(downtime, 1),
            "headline": headline,
            "insight_cards": insight_cards,
            "recommendations": recommendations,
            "machine_risk_distribution": level_counts,
            "most_vulnerable_line": vulnerable_line,
        }

    def _build_headline(self, risk_level, avg_health, downtime, top_machine, vulnerable_line) -> str:
        risk_words = {
            "critical": "critical condition",
            "high": "elevated risk",
            "medium": "moderate risk",
            "low": "healthy condition",
        }
        status_desc = risk_words.get(risk_level, "elevated risk")

        parts = [
            f"Factory is in {status_desc} with {avg_health:.0%} average machine health "
            f"and an estimated {downtime:.0f} hours of potential downtime exposure.",
        ]

        if top_machine:
            parts.append(
                f"{top_machine['id']} ({top_machine.get('machine_type', 'Unknown')}) "
                f"is the most critical asset with {top_machine['failure_prob']:.0%} failure probability."
            )

        if vulnerable_line:
            parts.append(
                f"{vulnerable_line['name']} is the most vulnerable production line "
                f"with {vulnerable_line['avg_failure_prob']:.0%} average failure risk."
            )

        return " ".join(parts)

    def _build_insight_cards(self, critical_machines, impact_machines, vulnerable_line) -> list[dict]:
        cards = []

        # Card 1: Most critical machine
        if critical_machines:
            m = critical_machines[0]
            fp = m["failure_prob"]
            cards.append({
                "type": "critical_machine",
                "severity": "critical" if fp >= 0.8 else "high",
                "title": f"{m['id']} at {fp:.0%} failure risk",
                "detail": (
                    f"{m.get('machine_type', 'Machine')} on {m.get('production_line', 'factory floor')} "
                    f"with {m.get('downstream_count', 0)} downstream machines at risk."
                ),
                "icon": "⚠️",
            })

        # Card 2: Highest cascade impact
        if impact_machines:
            m = impact_machines[0]
            cards.append({
                "type": "cascade_impact",
                "severity": "high",
                "title": f"{m['machine_id']} has the highest cascade impact",
                "detail": (
                    f"If {m['machine_id']} fails, {m['affected_count']} downstream machines "
                    f"will be affected, causing up to {m['total_downtime_hours']:.1f}h of downtime."
                ),
                "icon": "🌊",
            })

        # Card 3: Vulnerable production line
        if vulnerable_line:
            cards.append({
                "type": "vulnerable_line",
                "severity": "medium",
                "title": f"{vulnerable_line['name']} — production at risk",
                "detail": (
                    f"Average failure probability of {vulnerable_line['avg_failure_prob']:.0%} "
                    f"across all machines on this line. Cascade risk is elevated."
                ),
                "icon": "🏭",
            })

        return cards

    def _build_recommendations(self, critical_machines, highest_impact) -> list[dict]:
        recommendations = []

        # Priority 1: Most critical machine
        if critical_machines:
            m = critical_machines[0]
            fp = m["failure_prob"]
            if fp >= 0.8:
                urgency = "IMMEDIATE"
                action = "emergency inspection and replacement"
                timeframe = "within 2 hours"
            elif fp >= 0.6:
                urgency = "URGENT"
                action = "scheduled maintenance"
                timeframe = "within 6 hours"
            else:
                urgency = "SCHEDULED"
                action = "preventive maintenance"
                timeframe = "within 24 hours"

            recommendations.append({
                "urgency": urgency,
                "machine_id": m["id"],
                "action": f"Schedule {action} for {m['id']} {timeframe}.",
                "rationale": f"Failure probability of {fp:.0%} poses immediate risk to {m.get('downstream_count', 0)} downstream machines.",
            })

        # Priority 2: Highest cascade impact (if different machine)
        if highest_impact and (not critical_machines or highest_impact["machine_id"] != critical_machines[0]["id"]):
            m = highest_impact
            recommendations.append({
                "urgency": "URGENT",
                "machine_id": m["machine_id"],
                "action": f"Prioritize inspection of {m['machine_id']} to prevent cascade failure.",
                "rationale": f"A failure in {m['machine_id']} would affect {m['affected_count']} machines and cause {m['total_downtime_hours']:.1f}h downtime.",
            })

        return recommendations
