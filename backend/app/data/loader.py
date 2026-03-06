"""
Data loader for NASA Turbofan Engine Degradation dataset (CMAPSSData).
"""
import pandas as pd
import numpy as np
from pathlib import Path
from app.config import COLUMN_NAMES, TRAIN_FILE, TEST_FILE, RUL_FILE, DATA_DIR


def load_dataset() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Load the FD001 dataset files.

    Returns:
        (train_df, test_df, rul_df)
    """
    # If dataset files don't exist, generate synthetic data
    if not TRAIN_FILE.exists():
        print("Dataset files not found. Generating synthetic data...")
        from app.data.generate_dataset import generate_synthetic_dataset
        generate_synthetic_dataset(n_units=100, output_dir=DATA_DIR)

    train_df = _load_txt(TRAIN_FILE)
    test_df = _load_txt(TEST_FILE)
    rul_df = pd.read_csv(RUL_FILE, sep=r"\s+", header=None, names=["RUL"])

    # Add RUL to training data
    train_df = _add_rul_to_train(train_df)

    print(f"Loaded dataset: train={len(train_df)} rows, test={len(test_df)} rows, RUL={len(rul_df)} values")
    return train_df, test_df, rul_df


def _load_txt(filepath: Path) -> pd.DataFrame:
    """Load a space-separated CMAPSSData text file."""
    df = pd.read_csv(
        filepath,
        sep=r"\s+",
        header=None,
        names=COLUMN_NAMES,
    )
    return df


def _add_rul_to_train(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute RUL for training data.
    RUL = max_cycle_for_unit - current_cycle
    """
    max_cycles = df.groupby("unit_id")["cycle"].max().reset_index()
    max_cycles.columns = ["unit_id", "max_cycle"]
    df = df.merge(max_cycles, on="unit_id", how="left")
    df["RUL"] = df["max_cycle"] - df["cycle"]
    df.drop("max_cycle", axis=1, inplace=True)
    return df


def get_last_cycle_per_unit(df: pd.DataFrame) -> pd.DataFrame:
    """Get the last recorded cycle for each engine unit (latest sensor readings)."""
    return df.loc[df.groupby("unit_id")["cycle"].idxmax()].reset_index(drop=True)
