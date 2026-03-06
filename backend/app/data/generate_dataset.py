"""
Synthetic NASA Turbofan-style data generator.
Generates data matching the CMAPSSData FD001 format for demo purposes.
"""
import numpy as np
import pandas as pd
from pathlib import Path


def generate_synthetic_dataset(
    n_units: int = 100,
    min_cycles: int = 120,
    max_cycles: int = 360,
    output_dir: str | Path = None,
    seed: int = 42,
):
    """
    Generate synthetic turbofan engine degradation data in NASA CMAPSSData format.

    Each unit runs for a random number of cycles. Sensor readings start at
    healthy baseline values and degrade over time with added noise.
    """
    rng = np.random.default_rng(seed)

    # Sensor baseline values and degradation profiles
    sensor_profiles = {
        "sensor_1": {"base": 518.67, "degrade": 0.0, "noise": 0.0},      # constant
        "sensor_2": {"base": 642.15, "degrade": 0.03, "noise": 0.5},
        "sensor_3": {"base": 1589.70, "degrade": 0.08, "noise": 1.2},
        "sensor_4": {"base": 1400.60, "degrade": 0.06, "noise": 2.0},
        "sensor_5": {"base": 14.62, "degrade": 0.0, "noise": 0.0},       # constant
        "sensor_6": {"base": 21.61, "degrade": 0.0, "noise": 0.0},       # constant
        "sensor_7": {"base": 554.36, "degrade": 0.02, "noise": 0.3},
        "sensor_8": {"base": 2388.02, "degrade": 0.05, "noise": 1.5},
        "sensor_9": {"base": 9046.19, "degrade": 0.1, "noise": 3.0},
        "sensor_10": {"base": 1.30, "degrade": 0.0, "noise": 0.0},      # constant
        "sensor_11": {"base": 47.47, "degrade": 0.01, "noise": 0.1},
        "sensor_12": {"base": 521.66, "degrade": 0.03, "noise": 0.4},
        "sensor_13": {"base": 2388.02, "degrade": 0.05, "noise": 1.0},
        "sensor_14": {"base": 8138.62, "degrade": 0.08, "noise": 2.5},
        "sensor_15": {"base": 8.4195, "degrade": 0.005, "noise": 0.02},
        "sensor_16": {"base": 0.03, "degrade": 0.0, "noise": 0.0},      # constant
        "sensor_17": {"base": 392.0, "degrade": 0.002, "noise": 0.1},
        "sensor_18": {"base": 2388.0, "degrade": 0.0, "noise": 0.0},    # constant
        "sensor_19": {"base": 100.0, "degrade": 0.0, "noise": 0.0},     # constant
        "sensor_20": {"base": 39.06, "degrade": 0.01, "noise": 0.05},
        "sensor_21": {"base": 23.42, "degrade": 0.02, "noise": 0.08},
    }

    all_rows = []

    # Generate data for each unit
    rul_values = []
    unit_max_cycles = {}

    for unit_id in range(1, n_units + 1):
        n_cycles = rng.integers(min_cycles, max_cycles + 1)
        unit_max_cycles[unit_id] = n_cycles

        for cycle in range(1, n_cycles + 1):
            # Degradation fraction (0 at start, 1 at end of life)
            deg_frac = cycle / n_cycles

            # Operational settings
            op1 = rng.choice([-0.0007, 0.0, 0.0007]) + rng.normal(0, 0.0001)
            op2 = rng.choice([-0.0004, 0.0, 0.0004]) + rng.normal(0, 0.0001)
            op3 = 100.0  # constant

            row = [unit_id, cycle, op1, op2, op3]

            for s_name, prof in sensor_profiles.items():
                # Add degradation + noise
                value = (
                    prof["base"]
                    + prof["degrade"] * deg_frac * n_cycles
                    + rng.normal(0, prof["noise"])
                )
                row.append(value)

            all_rows.append(row)

    # Build column names
    columns = (
        ["unit_id", "cycle"]
        + [f"op_setting_{i}" for i in range(1, 4)]
        + [f"sensor_{i}" for i in range(1, 22)]
    )

    df_full = pd.DataFrame(all_rows, columns=columns)

    # Split into train (80%) and test (20%)
    train_units = list(range(1, int(n_units * 0.8) + 1))
    test_units = list(range(int(n_units * 0.8) + 1, n_units + 1))

    df_train = df_full[df_full["unit_id"].isin(train_units)].copy()

    # For test data, cut each unit short by some random amount
    test_rows = []
    rul_values = []
    for uid in test_units:
        unit_data = df_full[df_full["unit_id"] == uid].copy()
        max_cyc = unit_max_cycles[uid]
        cut_at = rng.integers(int(max_cyc * 0.4), int(max_cyc * 0.85))
        test_rows.append(unit_data[unit_data["cycle"] <= cut_at])
        rul_values.append(max_cyc - cut_at)

    # Re-index test unit IDs to start from 1
    df_test = pd.concat(test_rows, ignore_index=True)
    uid_map = {old: new for new, old in enumerate(test_units, 1)}
    df_test["unit_id"] = df_test["unit_id"].map(uid_map)

    df_rul = pd.DataFrame({"RUL": rul_values})

    # Save to files
    if output_dir:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        _save_space_separated(df_train, output_dir / "train_FD001.txt")
        _save_space_separated(df_test, output_dir / "test_FD001.txt")
        df_rul.to_csv(output_dir / "RUL_FD001.txt", index=False, header=False, sep=" ")

        print(f"Generated synthetic dataset:")
        print(f"  Train: {len(df_train)} rows, {len(train_units)} units")
        print(f"  Test:  {len(df_test)} rows, {len(test_units)} units")
        print(f"  RUL:   {len(rul_values)} values")
        print(f"  Saved to: {output_dir}")

    return df_train, df_test, df_rul


def _save_space_separated(df: pd.DataFrame, path: Path):
    """Save DataFrame in NASA CMAPSSData space-separated format (no header)."""
    df.to_csv(path, sep=" ", index=False, header=False)


if __name__ == "__main__":
    from app.config import DATA_DIR
    generate_synthetic_dataset(n_units=100, output_dir=DATA_DIR)
