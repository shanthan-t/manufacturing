"""
Root Cause Analysis Engine — explains why a machine is predicted to fail
using XGBoost feature importance, sensor anomaly detection, and
industrial failure mode mapping.
"""
import numpy as np
import pandas as pd
from dataclasses import dataclass, field


# ---- Industrial failure mode knowledge base ----
# Maps sensor groups to probable root causes and descriptions
FAILURE_MODE_MAP = {
    "sensor_2": {
        "name": "Total Temperature at LPC Outlet",
        "failure_modes": ["Compressor fouling", "Inlet filter blockage"],
        "description": "Elevated LPC outlet temperature indicates compressor inefficiency or restricted airflow.",
    },
    "sensor_3": {
        "name": "Total Temperature at HPC Outlet",
        "failure_modes": ["Bearing wear", "Thermal degradation"],
        "description": "High HPC temperature drift suggests bearing friction or degraded thermal management.",
    },
    "sensor_4": {
        "name": "Total Temperature at LPT Outlet",
        "failure_modes": ["Turbine blade erosion", "Seal deterioration"],
        "description": "Abnormal LPT temperature signals hot gas path degradation.",
    },
    "sensor_7": {
        "name": "Total Pressure at HPC Outlet",
        "failure_modes": ["Pressure system leak", "Valve malfunction"],
        "description": "Pressure anomaly indicates potential leak or valve performance degradation.",
    },
    "sensor_8": {
        "name": "Physical Fan Speed",
        "failure_modes": ["Fan imbalance", "Shaft misalignment"],
        "description": "Abnormal fan speed patterns suggest rotor imbalance or shaft bearing issues.",
    },
    "sensor_9": {
        "name": "Physical Core Speed",
        "failure_modes": ["Core bearing wear", "Shaft degradation"],
        "description": "Core speed deviation indicates bearing deterioration or shaft integrity loss.",
    },
    "sensor_11": {
        "name": "Static Pressure at HPC Outlet",
        "failure_modes": ["Compressor stall risk", "Surge margin reduction"],
        "description": "Static pressure anomaly suggests compressor approaching stall conditions.",
    },
    "sensor_12": {
        "name": "Ratio of Fuel to Ps30",
        "failure_modes": ["Fuel system degradation", "Combustor efficiency loss"],
        "description": "Fuel ratio drift indicates fuel delivery system wear or combustion inefficiency.",
    },
    "sensor_13": {
        "name": "Corrected Fan Speed",
        "failure_modes": ["Fan blade damage", "Foreign object impact"],
        "description": "Corrected fan speed anomaly may indicate blade damage or aerodynamic changes.",
    },
    "sensor_14": {
        "name": "Corrected Core Speed",
        "failure_modes": ["Core degradation", "Thermal cycling fatigue"],
        "description": "Core speed correction anomaly suggests thermal cycling damage.",
    },
    "sensor_15": {
        "name": "Bypass Ratio",
        "failure_modes": ["Bypass duct blockage", "Nozzle wear"],
        "description": "Bypass ratio change indicates duct obstruction or nozzle erosion.",
    },
    "sensor_17": {
        "name": "Bleed Enthalpy",
        "failure_modes": ["Bleed valve wear", "Thermal management failure"],
        "description": "Bleed enthalpy anomaly signals valve deterioration or cooling system issue.",
    },
    "sensor_20": {
        "name": "Bleed Pressure",
        "failure_modes": ["Bleed air system leak", "Pressure regulation failure"],
        "description": "Bleed pressure anomaly indicates air system leak or regulator malfunction.",
    },
    "sensor_21": {
        "name": "Demanded Corrected Fan Speed",
        "failure_modes": ["Control system drift", "Actuator wear"],
        "description": "Demanded speed anomaly suggests control loop or actuator degradation.",
    },
}

# Default for sensors not in the map
_DEFAULT_MODE = {
    "name": "Unknown Sensor",
    "failure_modes": ["Sensor degradation"],
    "description": "Abnormal sensor reading detected.",
}

# Map machine types to likely failure root causes
MACHINE_FAILURE_PROFILES = {
    "Air Compressor": ["Bearing wear", "Compressor fouling", "Pressure system leak", "Valve malfunction"],
    "Pneumatic Press": ["Hydraulic seal failure", "Pressure system leak", "Valve malfunction", "Thermal degradation"],
    "CNC Machine": ["Spindle bearing wear", "Thermal cycling fatigue", "Fan imbalance"],
    "Assembly Robot": ["Servo motor degradation", "Shaft misalignment", "Core bearing wear", "Control system drift"],
    "Packaging Conveyor": ["Belt drive wear", "Fan imbalance", "Bearing wear", "Actuator wear"],
}


@dataclass
class SensorContribution:
    """A single sensor's contribution to the failure prediction."""
    sensor_name: str
    display_name: str
    importance: float
    anomaly_score: float  # z-score magnitude
    current_value: float
    fleet_mean: float
    fleet_std: float
    is_anomalous: bool
    failure_modes: list[str] = field(default_factory=list)
    description: str = ""

    def to_dict(self):
        return {
            "sensor_name": self.sensor_name,
            "display_name": self.display_name,
            "importance": round(self.importance, 4),
            "anomaly_score": round(self.anomaly_score, 2),
            "current_value": round(self.current_value, 4),
            "fleet_mean": round(self.fleet_mean, 4),
            "fleet_std": round(self.fleet_std, 4),
            "is_anomalous": self.is_anomalous,
            "failure_modes": self.failure_modes,
            "description": self.description,
        }


class RootCauseEngine:
    """
    Explains machine failure predictions using:
    1. XGBoost feature importance — which features drive the model most
    2. Sensor anomaly detection — z-score of current readings vs fleet
    3. Failure mode mapping — links sensor anomalies to industrial causes
    """

    ANOMALY_Z_THRESHOLD = 1.5  # z-scores above this are flagged

    def __init__(self, model, preprocessor, train_df: pd.DataFrame, feature_columns: list[str]):
        self.model = model
        self.preprocessor = preprocessor
        self.feature_columns = feature_columns

        # Precompute fleet-wide statistics (per-sensor means and stds)
        self._fleet_stats = self._compute_fleet_stats(train_df)

        # Extract global feature importance
        self._feature_importance = self._extract_feature_importance()

    def _compute_fleet_stats(self, train_df: pd.DataFrame) -> dict:
        """Compute mean and std for each sensor across the fleet."""
        from app.config import FEATURE_SENSORS
        stats = {}
        for col in FEATURE_SENSORS:
            if col in train_df.columns:
                stats[col] = {
                    "mean": float(train_df[col].mean()),
                    "std": float(train_df[col].std()),
                }
        return stats

    def _extract_feature_importance(self) -> dict:
        """Extract feature importance from the XGBoost model."""
        if not hasattr(self.model, 'feature_importances_'):
            return {}

        importances = self.model.feature_importances_
        if len(importances) != len(self.feature_columns):
            # Fallback: assume order matches
            n = min(len(importances), len(self.feature_columns))
            return {self.feature_columns[i]: float(importances[i]) for i in range(n)}

        return {col: float(imp) for col, imp in zip(self.feature_columns, importances)}

    def analyze(self, machine_id: str, unit_id: int, train_df: pd.DataFrame, top_n: int = 8) -> dict:
        """
        Perform root cause analysis for a specific machine.

        Args:
            machine_id: The machine identifier (e.g., "ROB-C1")
            unit_id: The engine unit ID mapped to this machine
            train_df: The training dataset with raw sensor values
            top_n: Number of top contributing sensors to return
        """
        from app.config import FEATURE_SENSORS, FACTORY_LINES

        # Get the machine's last-cycle raw sensor readings
        unit_data = train_df[train_df["unit_id"] == unit_id]
        if unit_data.empty:
            return {"machine_id": machine_id, "error": "No sensor data found"}

        last_cycle = unit_data.iloc[-1]
        machine_type = None
        for line in FACTORY_LINES:
            for m in line["machines"]:
                if m["id"] == machine_id:
                    machine_type = m["type"]
                    break

        # Analyze each sensor
        contributions = []
        for sensor in FEATURE_SENSORS:
            if sensor not in last_cycle.index:
                continue

            current_val = float(last_cycle[sensor])
            stats = self._fleet_stats.get(sensor, {"mean": 0, "std": 1})
            fleet_mean = stats["mean"]
            fleet_std = max(stats["std"], 1e-6)

            # Z-score anomaly detection
            z_score = abs(current_val - fleet_mean) / fleet_std

            # Feature importance (sum base sensor + rolling features)
            importance = self._feature_importance.get(sensor, 0)
            importance += self._feature_importance.get(f"{sensor}_roll_mean", 0)
            importance += self._feature_importance.get(f"{sensor}_roll_std", 0)

            # Sensor metadata
            sensor_meta = FAILURE_MODE_MAP.get(sensor, _DEFAULT_MODE)

            is_anomalous = z_score > self.ANOMALY_Z_THRESHOLD

            contributions.append(SensorContribution(
                sensor_name=sensor,
                display_name=sensor_meta["name"],
                importance=importance,
                anomaly_score=z_score,
                current_value=current_val,
                fleet_mean=fleet_mean,
                fleet_std=fleet_std,
                is_anomalous=is_anomalous,
                failure_modes=sensor_meta["failure_modes"],
                description=sensor_meta["description"],
            ))

        # Rank by combined score: importance × anomaly relevance
        for c in contributions:
            c._combined = c.importance * (1 + 0.3 * c.anomaly_score)
        contributions.sort(key=lambda c: c._combined, reverse=True)
        top_sensors = contributions[:top_n]

        # Generate probable causes
        all_failure_modes = []
        for c in top_sensors:
            if c.is_anomalous:
                all_failure_modes.extend(c.failure_modes)

        # Deduplicate and weight by frequency
        mode_counts = {}
        for mode in all_failure_modes:
            mode_counts[mode] = mode_counts.get(mode, 0) + 1

        # Cross-reference with machine type profile
        machine_profile = MACHINE_FAILURE_PROFILES.get(machine_type, [])
        probable_causes = []
        for mode, count in sorted(mode_counts.items(), key=lambda x: x[1], reverse=True):
            relevance = "high" if mode in machine_profile else "moderate"
            probable_causes.append({
                "cause": mode,
                "frequency": count,
                "relevance": relevance,
            })

        # Compute confidence from anomaly and importance signals
        anomaly_ratio = sum(1 for c in top_sensors if c.is_anomalous) / max(len(top_sensors), 1)
        importance_concentration = sum(c.importance for c in top_sensors[:3]) / max(sum(c.importance for c in contributions), 1e-6)
        confidence = min(0.99, 0.4 + (anomaly_ratio * 0.35) + (importance_concentration * 0.25))

        # Sensor trend summary
        anomalous_sensors = [c for c in top_sensors if c.is_anomalous]
        trend_summary = self._generate_trend_summary(anomalous_sensors, machine_type)

        return {
            "machine_id": machine_id,
            "machine_type": machine_type,
            "confidence": round(confidence, 2),
            "top_sensors": [c.to_dict() for c in top_sensors],
            "probable_causes": probable_causes[:5],
            "trend_summary": trend_summary,
            "anomalous_count": len(anomalous_sensors),
            "total_sensors_analyzed": len(contributions),
        }

    @staticmethod
    def _generate_trend_summary(anomalous_sensors: list[SensorContribution], machine_type: str | None) -> list[str]:
        """Generate human-readable trend observations."""
        summaries = []

        for s in anomalous_sensors[:4]:
            direction = "above" if s.current_value > s.fleet_mean else "below"
            summaries.append(
                f"{s.display_name} ({s.sensor_name}) is {s.anomaly_score:.1f}σ {direction} "
                f"fleet average — {s.description}"
            )

        if machine_type and machine_type in MACHINE_FAILURE_PROFILES:
            profile = MACHINE_FAILURE_PROFILES[machine_type]
            # Check overlap
            anomalous_modes = set()
            for s in anomalous_sensors:
                anomalous_modes.update(s.failure_modes)
            overlap = anomalous_modes.intersection(profile)
            if overlap:
                summaries.append(
                    f"Pattern consistent with known {machine_type} failure modes: {', '.join(list(overlap)[:3])}"
                )

        return summaries
