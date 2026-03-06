"""
Future Risk Forecasting Engine — projects machine health degradation
over 6h, 12h, and 24h horizons using RUL-derived degradation rates.
"""
from copy import deepcopy
from app.graph.factory_graph import FactoryGraph
from app.graph.propagation import PropagationEngine
from app.config import MAX_RUL_CAP

# Assumption: ~10 operational cycles per hour
CYCLES_PER_HOUR = 10


class ForecastEngine:
    """
    Projects future factory state by extrapolating health degradation
    from current RUL predictions and recomputing cascade propagation
    at future time horizons.
    """

    def __init__(self, factory_graph: FactoryGraph, propagation_engine: PropagationEngine):
        self.factory_graph = factory_graph
        self.propagation_engine = propagation_engine

    def forecast_machine(self, machine_id: str, hours: float) -> dict | None:
        """
        Forecast a single machine's health at a future time horizon.

        Degradation model:
            degradation_rate = (1 - health_score) / predicted_rul  (per-cycle)
            future_health = max(0, current_health - degradation_rate × Δcycles)
        """
        machine = self.factory_graph.get_machine(machine_id)
        if not machine:
            return None

        return self._project_machine(machine, hours)

    def forecast_factory(self, hours: float) -> dict:
        """
        Forecast the entire factory state at a future time horizon.
        Recomputes cascade propagation with projected failure probabilities.
        """
        machines = self.factory_graph.get_all_machines()
        projected_machines = []

        for m in machines:
            proj = self._project_machine(m, hours)
            projected_machines.append(proj)

        # Compute factory-level summary
        n = len(projected_machines)
        if n == 0:
            return {"horizon_hours": hours, "machines": [], "summary": {}}

        avg_health = sum(m["future_health_score"] for m in projected_machines) / n
        avg_failure = sum(m["future_failure_prob"] for m in projected_machines) / n

        # Count by risk level
        risk_counts = {}
        for m in projected_machines:
            rl = m["future_risk_level"]
            risk_counts[rl] = risk_counts.get(rl, 0) + 1

        # Machines likely to fail (failure_prob >= 0.8)
        likely_failures = [
            m for m in projected_machines if m["future_failure_prob"] >= 0.8
        ]

        # Estimated future downtime
        total_downtime = sum(
            m.get("downtime_cost", 4) * m["future_failure_prob"]
            for m in projected_machines
        )

        # Find most vulnerable line
        line_risks = {}
        for m in projected_machines:
            line = m.get("production_line", "Unknown")
            if line not in line_risks:
                line_risks[line] = []
            line_risks[line].append(m["future_failure_prob"])

        vulnerable_line = max(
            line_risks.items(),
            key=lambda x: sum(x[1]) / len(x[1]),
        )

        return {
            "horizon_hours": hours,
            "machines": projected_machines,
            "summary": {
                "avg_health_score": round(avg_health, 3),
                "avg_failure_prob": round(avg_failure, 3),
                "factory_risk_level": self._classify_risk(avg_failure),
                "risk_breakdown": risk_counts,
                "likely_failures_count": len(likely_failures),
                "likely_failures": [
                    {
                        "machine_id": m["machine_id"],
                        "machine_type": m["machine_type"],
                        "future_failure_prob": round(m["future_failure_prob"], 3),
                        "hours_to_failure": m["estimated_hours_to_failure"],
                    }
                    for m in sorted(likely_failures, key=lambda x: x["future_failure_prob"], reverse=True)
                ],
                "estimated_downtime_hours": round(total_downtime, 1),
                "most_vulnerable_line": {
                    "name": vulnerable_line[0],
                    "avg_failure_prob": round(sum(vulnerable_line[1]) / len(vulnerable_line[1]), 3),
                },
            },
        }

    def get_timeline(self, max_hours: int = 24, interval_hours: int = 2) -> dict:
        """
        Generate a factory health trajectory timeline from 0 to max_hours.
        Returns data points at each interval for charting.
        """
        timeline_points = []

        for h in range(0, max_hours + 1, interval_hours):
            if h == 0:
                # Current state
                machines = self.factory_graph.get_all_machines()
                n = len(machines)
                avg_health = sum(m.get("health_score", 1.0) for m in machines) / n if n else 0
                avg_failure = sum(m.get("failure_prob", 0.0) for m in machines) / n if n else 0
                critical_count = sum(1 for m in machines if m.get("failure_prob", 0) >= 0.8)
                total_downtime = sum(
                    m.get("downtime_cost", 4) * m.get("failure_prob", 0.0) for m in machines
                )
                timeline_points.append({
                    "hour": 0,
                    "avg_health_score": round(avg_health, 3),
                    "avg_failure_prob": round(avg_failure, 3),
                    "risk_level": self._classify_risk(avg_failure),
                    "critical_machines": critical_count,
                    "estimated_downtime_hours": round(total_downtime, 1),
                })
            else:
                forecast = self.forecast_factory(h)
                s = forecast["summary"]
                timeline_points.append({
                    "hour": h,
                    "avg_health_score": s.get("avg_health_score", 0),
                    "avg_failure_prob": s.get("avg_failure_prob", 0),
                    "risk_level": s.get("factory_risk_level", "unknown"),
                    "critical_machines": s.get("likely_failures_count", 0),
                    "estimated_downtime_hours": s.get("estimated_downtime_hours", 0),
                })

        return {
            "max_hours": max_hours,
            "interval_hours": interval_hours,
            "data_points": timeline_points,
        }

    def _project_machine(self, machine: dict, hours: float) -> dict:
        """Project a single machine's health forward by the given hours."""
        current_health = machine.get("health_score", 1.0)
        current_fp = machine.get("failure_prob", 0.0)
        predicted_rul = machine.get("predicted_rul", MAX_RUL_CAP)
        delta_cycles = hours * CYCLES_PER_HOUR

        # Compute degradation rate (per cycle)
        if predicted_rul > 0:
            degradation_rate = (1 - current_health) / predicted_rul if current_health < 1 else 0.005
            # Minimum degradation rate for machines that appear healthy
            degradation_rate = max(degradation_rate, 0.001)
        else:
            degradation_rate = 0.05  # Already at end of life

        # Project future state
        future_health = max(0.0, current_health - degradation_rate * delta_cycles)
        future_fp = min(1.0, 1.0 - future_health)
        future_rul = max(0.0, predicted_rul - delta_cycles)

        # Estimate hours to failure (health ≤ 0.1)
        if degradation_rate > 0 and current_health > 0.1:
            cycles_to_fail = (current_health - 0.1) / degradation_rate
            hours_to_failure = round(cycles_to_fail / CYCLES_PER_HOUR, 1)
        else:
            hours_to_failure = 0.0 if current_health <= 0.1 else 999.0

        return {
            "machine_id": machine.get("id", machine.get("machine_id")),
            "machine_type": machine.get("machine_type", "Unknown"),
            "production_line": machine.get("production_line", "Unknown"),
            "downtime_cost": machine.get("downtime_cost", 4),
            "current_health_score": round(current_health, 4),
            "current_failure_prob": round(current_fp, 4),
            "future_health_score": round(future_health, 4),
            "future_failure_prob": round(future_fp, 4),
            "future_risk_level": self._classify_risk(future_fp),
            "predicted_rul_cycles": round(future_rul, 1),
            "degradation_rate": round(degradation_rate, 5),
            "estimated_hours_to_failure": hours_to_failure,
            "health_delta": round(future_health - current_health, 4),
        }

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
