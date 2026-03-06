"""
Data preprocessor: normalization, feature engineering, and preparation.
"""
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from app.config import (
    FEATURE_SENSORS,
    FEATURE_OP_SETTINGS,
    DROP_SENSORS,
    DROP_OP_SETTINGS,
    ROLLING_WINDOW,
    MAX_RUL_CAP,
)


class DataPreprocessor:
    """Preprocesses turbofan sensor data for ML model training and inference."""

    def __init__(self):
        self.scaler = MinMaxScaler()
        self.feature_columns: list[str] = []

    def fit_transform(self, train_df: pd.DataFrame) -> pd.DataFrame:
        """Fit scaler on training data and transform it."""
        df = train_df.copy()

        # Drop constant sensors and unused settings
        df = self._drop_columns(df)

        # Cap RUL to prevent outlier influence
        if "RUL" in df.columns:
            df["RUL"] = df["RUL"].clip(upper=MAX_RUL_CAP)

        # Compute rolling features per unit
        df = self._add_rolling_features(df)

        # Identify feature columns (all sensors + op_settings + rolling features)
        self.feature_columns = [
            c for c in df.columns
            if c not in ["unit_id", "cycle", "RUL"]
        ]

        # Fit and transform
        df[self.feature_columns] = self.scaler.fit_transform(df[self.feature_columns])

        return df

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Transform data using already-fitted scaler."""
        df = df.copy()
        df = self._drop_columns(df)
        df = self._add_rolling_features(df)

        # Use only columns that exist in both datasets
        available_cols = [c for c in self.feature_columns if c in df.columns]
        df[available_cols] = self.scaler.transform(df[available_cols])

        return df

    def _drop_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Drop sensors and settings with near-zero variance."""
        cols_to_drop = [c for c in DROP_SENSORS + DROP_OP_SETTINGS if c in df.columns]
        return df.drop(columns=cols_to_drop, errors="ignore")

    def _add_rolling_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add rolling mean and std for each sensor per unit."""
        sensor_cols = [c for c in FEATURE_SENSORS if c in df.columns]

        for col in sensor_cols:
            rolling = df.groupby("unit_id")[col].rolling(
                window=ROLLING_WINDOW, min_periods=1
            )
            df[f"{col}_roll_mean"] = rolling.mean().reset_index(level=0, drop=True)
            df[f"{col}_roll_std"] = rolling.std().fillna(0).reset_index(level=0, drop=True)

        return df

    def get_features_and_target(self, df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series | None]:
        """Split into feature matrix X and target y (RUL)."""
        available_cols = [c for c in self.feature_columns if c in df.columns]
        X = df[available_cols]
        y = df["RUL"] if "RUL" in df.columns else None
        return X, y
