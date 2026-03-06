"""
Schema Detector — automatically inspects and maps dataset columns to internal features.

Uses fuzzy keyword matching against the COLUMN_ALIASES dictionary to map
arbitrary column names to known internal feature names.
"""
import re
from app.config import COLUMN_ALIASES


class SchemaMapping:
    """Result of schema detection — maps original columns to internal features."""

    def __init__(self):
        # feature_name -> original_column_name
        self.mapped: dict[str, str] = {}
        # original columns that couldn't be mapped
        self.unmapped: list[str] = []
        # all original columns
        self.original_columns: list[str] = []

    @property
    def sensor_features(self) -> list[str]:
        """Get mapped sensor features (excludes timestamp and machine_id)."""
        return [
            f for f in self.mapped
            if f not in ("timestamp", "machine_id")
        ]

    @property
    def has_machine_id(self) -> bool:
        return "machine_id" in self.mapped

    @property
    def has_timestamp(self) -> bool:
        return "timestamp" in self.mapped

    def to_dict(self) -> dict:
        return {
            "mapped_features": {k: v for k, v in self.mapped.items()},
            "unmapped_columns": self.unmapped,
            "original_columns": self.original_columns,
            "sensor_features_detected": self.sensor_features,
            "has_machine_id": self.has_machine_id,
            "has_timestamp": self.has_timestamp,
        }


class SchemaDetector:
    """Detects and maps dataset columns to internal features using keyword matching."""

    def __init__(self, aliases: dict[str, list[str]] | None = None):
        self.aliases = aliases or COLUMN_ALIASES

    def detect(self, columns: list[str]) -> SchemaMapping:
        """
        Inspect column names and map them to internal features.

        Uses a two-pass approach:
        1. Exact match against aliases (case-insensitive)
        2. Substring/fuzzy match for remaining columns
        """
        mapping = SchemaMapping()
        mapping.original_columns = list(columns)

        # Normalize column names for matching
        normalized = {self._normalize(c): c for c in columns}
        remaining = set(normalized.keys())
        used_features = set()

        # Pass 1: Exact alias match
        for feature, aliases in self.aliases.items():
            if feature in used_features:
                continue
            for alias in aliases:
                norm_alias = self._normalize(alias)
                if norm_alias in remaining:
                    mapping.mapped[feature] = normalized[norm_alias]
                    remaining.discard(norm_alias)
                    used_features.add(feature)
                    break

        # Pass 2: Substring match for remaining columns
        for norm_col in list(remaining):
            if norm_col in ("", "unnamed"):
                continue
            for feature, aliases in self.aliases.items():
                if feature in used_features:
                    continue
                for alias in aliases:
                    norm_alias = self._normalize(alias)
                    # Check if alias is a substring of column or vice versa
                    if (len(norm_alias) >= 3 and norm_alias in norm_col) or \
                       (len(norm_col) >= 3 and norm_col in norm_alias):
                        mapping.mapped[feature] = normalized[norm_col]
                        remaining.discard(norm_col)
                        used_features.add(feature)
                        break
                if feature in used_features:
                    break

        # Remaining unmapped columns
        mapping.unmapped = [normalized[n] for n in remaining]

        return mapping

    @staticmethod
    def _normalize(name: str) -> str:
        """Normalize a column name for comparison: lowercase, strip, remove special chars."""
        name = name.strip().lower()
        name = re.sub(r'[^a-z0-9]', '_', name)
        name = re.sub(r'_+', '_', name).strip('_')
        return name
