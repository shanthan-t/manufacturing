"""
Risk Intelligence Engine — aggregates machine health and cascade analysis into actionable insights.
"""
from app.graph.factory_graph import FactoryGraph
from app.graph.propagation import PropagationEngine


class RiskEngine:
    """
    Combines machine failure predictions with graph propagation analysis
    to produce factory-wide risk intelligence.
    """

    def __init__(self, factory_graph: FactoryGraph, propagation_engine: PropagationEngine):
        self.factory_graph = factory_graph
        self.propagation_engine = propagation_engine

    def get_critical_machines(self, top_n: int = 5) -> list[dict]:
        """Get the top N machines with highest failure probability."""
        machines = self.factory_graph.get_all_machines()
        machines.sort(key=lambda m: m.get("failure_prob", 0), reverse=True)

        critical = []
        for m in machines[:top_n]:
            downstream = self.factory_graph.get_downstream(m["id"])
            critical.append({
                "id": m["id"],
                "machine_type": m.get("machine_type"),
                "production_line": m.get("production_line"),
                "health_score": m.get("health_score", 1.0),
                "failure_prob": m.get("failure_prob", 0.0),
                "risk_level": self._classify_risk(m.get("failure_prob", 0.0)),
                "downstream_count": len(downstream),
                "downstream_machines": downstream,
            })

        return critical

    def get_highest_impact_machines(self, top_n: int = 5) -> list[dict]:
        """Get machines whose failure would cause the most downstream damage."""
        impact = self.propagation_engine.get_all_cascade_risks()
        return impact[:top_n]

    def get_factory_summary(self) -> dict:
        """Get overall factory health summary."""
        machines = self.factory_graph.get_all_machines()
        n_machines = len(machines)

        if n_machines == 0:
            return {"status": "unknown", "total_machines": 0}

        avg_health = sum(m.get("health_score", 1.0) for m in machines) / n_machines
        avg_failure_prob = sum(m.get("failure_prob", 0.0) for m in machines) / n_machines

        status_counts = {}
        for m in machines:
            status = m.get("status", "operational")
            status_counts[status] = status_counts.get(status, 0) + 1

        # Find most vulnerable production line
        line_risks = {}
        for m in machines:
            line = m.get("production_line", "Unknown")
            if line not in line_risks:
                line_risks[line] = []
            line_risks[line].append(m.get("failure_prob", 0.0))

        vulnerable_line = max(
            line_risks.items(),
            key=lambda x: sum(x[1]) / len(x[1]),
        )

        # Calculate total estimated downtime
        total_downtime = sum(
            m.get("downtime_cost", 4) * m.get("failure_prob", 0.0)
            for m in machines
        )

        return {
            "total_machines": n_machines,
            "avg_health_score": round(avg_health, 3),
            "avg_failure_prob": round(avg_failure_prob, 3),
            "factory_risk_level": self._classify_risk(avg_failure_prob),
            "status_breakdown": status_counts,
            "most_vulnerable_line": {
                "name": vulnerable_line[0],
                "avg_failure_prob": round(sum(vulnerable_line[1]) / len(vulnerable_line[1]), 3),
            },
            "estimated_total_downtime_hours": round(total_downtime, 1),
        }

    def get_cascade_paths(self) -> list[dict]:
        """Get all significant cascade failure paths in the factory."""
        paths = []
        # Analyze cascade from each machine that has elevated risk
        machines = self.factory_graph.get_all_machines()
        for machine in machines:
            if machine.get("failure_prob", 0) >= 0.3:
                cascade = self.propagation_engine.simulate_cascade(
                    machine["id"],
                    failure_prob=machine["failure_prob"],
                    apply_to_graph=False,
                )
                if cascade.affected_machines:
                    paths.append({
                        "origin": machine["id"],
                        "origin_type": machine.get("machine_type"),
                        "origin_failure_prob": machine.get("failure_prob", 0),
                        "affected_count": len(cascade.affected_machines),
                        "total_downtime": round(cascade.total_downtime_hours, 1),
                        "path": cascade.cascade_paths,
                    })

        paths.sort(key=lambda p: p["total_downtime"], reverse=True)
        return paths

    @staticmethod
    def _classify_risk(failure_prob: float) -> str:
        if failure_prob >= 0.8:
            return "critical"
        elif failure_prob >= 0.5:
            return "high"
        elif failure_prob >= 0.3:
            return "medium"
        else:
            return "low"
