"""
Real Data Adapter — transforms arbitrary uploaded machine data into the internal CMAPSSData format.

Works with whatever columns the SchemaDetector was able to map. Missing features
are filled with synthetic baselines. Health scores are computed from available
features when no failure labels are present.
"""
import numpy as np
import pandas as pd
from app.config import COLUMN_NAMES, SENSOR_COLUMN_MAPPING, FEATURE_HEALTH_WEIGHTS
from app.data.schema_detector import SchemaMapping


class RealDataAdapter:
    """Adapts arbitrary real machine datasets into the internal CMAPSSData format."""

    def __init__(self):
        self.machine_id_map: dict[str, int] = {}
        self.schema: SchemaMapping | None = None

    def transform(
        self, df: pd.DataFrame, schema: SchemaMapping
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """
        Transform a real-data DataFrame into (train_df, test_df, rul_df).

        Uses the schema mapping to find actual column names in the dataset.
        Works with any subset of features — missing ones are filled synthetically.
        """
        self.schema = schema
        df = df.copy()

        # Clean and prepare using schema mapping
        df = self._clean_data(df, schema)

        # Map machine IDs to integer unit IDs
        self._build_machine_map(df, schema)

        # Convert to CMAPSSData format
        cmapss_df = self._to_cmapss_format(df, schema)

        # Split into train/test
        train_df, test_df, rul_df = self._split_train_test(cmapss_df)

        return train_df, test_df, rul_df

    def _clean_data(self, df: pd.DataFrame, schema: SchemaMapping) -> pd.DataFrame:
        """Clean the raw data: parse timestamps, fill NaNs, sort."""
        # Parse and sort by timestamp if available
        if schema.has_timestamp:
            ts_col = schema.mapped["timestamp"]
            df[ts_col] = pd.to_datetime(df[ts_col], errors="coerce")
            df = df.dropna(subset=[ts_col])
            if schema.has_machine_id:
                mid_col = schema.mapped["machine_id"]
                df = df.sort_values([mid_col, ts_col])
            else:
                df = df.sort_values(ts_col)

        # If no machine_id, create a synthetic one — treat all data as machine "M1"
        if not schema.has_machine_id:
            df["_machine_id_"] = "M1"
            schema.mapped["machine_id"] = "_machine_id_"

        mid_col = schema.mapped["machine_id"]

        # Fill NaN sensor values with forward-fill then backward-fill per machine
        for feature in schema.sensor_features:
            orig_col = schema.mapped[feature]
            if orig_col in df.columns:
                df[orig_col] = pd.to_numeric(df[orig_col], errors="coerce")
                df[orig_col] = df.groupby(mid_col)[orig_col].transform(
                    lambda s: s.ffill().bfill()
                )
                # If still NaN, fill with global median
                if df[orig_col].isna().any():
                    median_val = df[orig_col].median()
                    df[orig_col] = df[orig_col].fillna(median_val if pd.notna(median_val) else 0)

        # Also handle any unmapped numeric columns as additional features
        for col in schema.unmapped:
            if col in df.columns and pd.api.types.is_numeric_dtype(df[col]):
                df[col] = df.groupby(mid_col)[col].transform(
                    lambda s: s.ffill().bfill()
                )
                if df[col].isna().any():
                    df[col] = df[col].fillna(df[col].median() if pd.notna(df[col].median()) else 0)

        return df.reset_index(drop=True)

    def _build_machine_map(self, df: pd.DataFrame, schema: SchemaMapping):
        """Map unique machine IDs to sequential integers starting from 1."""
        mid_col = schema.mapped["machine_id"]
        unique_machines = sorted(df[mid_col].unique(), key=str)
        self.machine_id_map = {str(mid): idx + 1 for idx, mid in enumerate(unique_machines)}

    def _to_cmapss_format(self, df: pd.DataFrame, schema: SchemaMapping) -> pd.DataFrame:
        """Convert real data to CMAPSSData format with all 21 sensors."""
        rng = np.random.default_rng(42)
        mid_col = schema.mapped["machine_id"]
        ts_col = schema.mapped.get("timestamp")
        sort_col = ts_col if ts_col else None

        rows = []
        for machine_id, group in df.groupby(mid_col):
            unit_id = self.machine_id_map[str(machine_id)]
            if sort_col:
                group = group.sort_values(sort_col).reset_index(drop=True)
            else:
                group = group.reset_index(drop=True)

            for cycle_idx, (_, row) in enumerate(group.iterrows(), start=1):
                deg_frac = cycle_idx / len(group)

                # Operational settings
                op1 = rng.choice([-0.0007, 0.0, 0.0007]) + rng.normal(0, 0.0001)
                op2 = rng.choice([-0.0004, 0.0, 0.0004]) + rng.normal(0, 0.0001)
                op3 = 100.0

                # Build sensor values using schema mapping
                sensor_values = self._map_sensors(row, schema, deg_frac, len(group), rng)

                cmapss_row = [unit_id, cycle_idx, op1, op2, op3] + sensor_values
                rows.append(cmapss_row)

        return pd.DataFrame(rows, columns=COLUMN_NAMES)

    def _map_sensors(
        self,
        row: pd.Series,
        schema: SchemaMapping,
        deg_frac: float,
        total_cycles: int,
        rng: np.random.Generator,
    ) -> list[float]:
        """
        Map available real sensor values to the 21 CMAPSSData sensor columns.

        Uses SENSOR_COLUMN_MAPPING to map detected features to sensor slots.
        Unmapped sensors are filled with realistic baselines + degradation.
        """
        sensor_profiles = {
            "sensor_1": {"base": 518.67, "degrade": 0.0, "noise": 0.0},
            "sensor_2": {"base": 642.15, "degrade": 0.03, "noise": 0.5},
            "sensor_3": {"base": 1589.70, "degrade": 0.08, "noise": 1.2},
            "sensor_4": {"base": 1400.60, "degrade": 0.06, "noise": 2.0},
            "sensor_5": {"base": 14.62, "degrade": 0.0, "noise": 0.0},
            "sensor_6": {"base": 21.61, "degrade": 0.0, "noise": 0.0},
            "sensor_7": {"base": 554.36, "degrade": 0.02, "noise": 0.3},
            "sensor_8": {"base": 2388.02, "degrade": 0.05, "noise": 1.5},
            "sensor_9": {"base": 9046.19, "degrade": 0.1, "noise": 3.0},
            "sensor_10": {"base": 1.30, "degrade": 0.0, "noise": 0.0},
            "sensor_11": {"base": 47.47, "degrade": 0.01, "noise": 0.1},
            "sensor_12": {"base": 521.66, "degrade": 0.03, "noise": 0.4},
            "sensor_13": {"base": 2388.02, "degrade": 0.05, "noise": 1.0},
            "sensor_14": {"base": 8138.62, "degrade": 0.08, "noise": 2.5},
            "sensor_15": {"base": 8.4195, "degrade": 0.005, "noise": 0.02},
            "sensor_16": {"base": 0.03, "degrade": 0.0, "noise": 0.0},
            "sensor_17": {"base": 392.0, "degrade": 0.002, "noise": 0.1},
            "sensor_18": {"base": 2388.0, "degrade": 0.0, "noise": 0.0},
            "sensor_19": {"base": 100.0, "degrade": 0.0, "noise": 0.0},
            "sensor_20": {"base": 39.06, "degrade": 0.01, "noise": 0.05},
            "sensor_21": {"base": 23.42, "degrade": 0.02, "noise": 0.08},
        }

        # Build reverse map: sensor_name -> (feature, orig_col)
        sensor_to_feature = {}
        for feature in schema.sensor_features:
            if feature in SENSOR_COLUMN_MAPPING:
                sensor_name = SENSOR_COLUMN_MAPPING[feature]["sensor"]
                orig_col = schema.mapped[feature]
                sensor_to_feature[sensor_name] = (feature, orig_col)

        values = []
        for i in range(1, 22):
            sensor_name = f"sensor_{i}"
            prof = sensor_profiles[sensor_name]

            if sensor_name in sensor_to_feature:
                feature, orig_col = sensor_to_feature[sensor_name]
                if orig_col in row.index and pd.notna(row[orig_col]):
                    real_val = float(row[orig_col])
                    base = prof["base"]
                    scale = SENSOR_COLUMN_MAPPING[feature]["scale"]
                    value = base + (real_val * scale) + rng.normal(0, prof["noise"] * 0.5)
                else:
                    value = (
                        prof["base"]
                        + prof["degrade"] * deg_frac * total_cycles
                        + rng.normal(0, prof["noise"])
                    )
            else:
                # No mapping — generate synthetic baseline
                value = (
                    prof["base"]
                    + prof["degrade"] * deg_frac * total_cycles
                    + rng.normal(0, prof["noise"])
                )

            values.append(value)

        return values

    def _split_train_test(
        self, df: pd.DataFrame
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """Split into 80% train / 20% test with RUL computation."""
        unit_ids = sorted(df["unit_id"].unique())
        n_train = max(1, int(len(unit_ids) * 0.8))

        train_units = unit_ids[:n_train]
        test_units = unit_ids[n_train:] if len(unit_ids) > 1 else unit_ids

        train_df = df[df["unit_id"].isin(train_units)].copy()

        rng = np.random.default_rng(42)
        test_rows = []
        rul_values = []

        for uid in test_units:
            unit_data = df[df["unit_id"] == uid].copy()
            max_cyc = int(unit_data["cycle"].max())
            if max_cyc <= 2:
                test_rows.append(unit_data)
                rul_values.append(0)
                continue
            cut_at = rng.integers(max(1, int(max_cyc * 0.4)), max(2, int(max_cyc * 0.85)))
            test_rows.append(unit_data[unit_data["cycle"] <= cut_at])
            rul_values.append(max_cyc - cut_at)

        if test_rows:
            test_df = pd.concat(test_rows, ignore_index=True)
            uid_map = {old: new for new, old in enumerate(test_units, 1)}
            test_df["unit_id"] = test_df["unit_id"].map(uid_map)
        else:
            test_df = train_df.tail(10).copy()
            rul_values = [10]

        rul_df = pd.DataFrame({"RUL": rul_values})

        return train_df, test_df, rul_df

    def get_machine_id_map(self) -> dict[str, int]:
        """Return the mapping from original machine IDs to unit IDs."""
        return self.machine_id_map.copy()
