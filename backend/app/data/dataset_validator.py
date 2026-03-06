"""
Dataset Validator — validates uploaded CSV/Excel files with adaptive schema detection.

Never rejects datasets for missing columns. Instead, detects available features
and reports what was found. Only rejects for truly invalid files (corrupt, empty, etc.)
"""
import pandas as pd
from pathlib import Path
from app.data.schema_detector import SchemaDetector, SchemaMapping


class ValidationResult:
    """Result of a dataset validation check."""

    def __init__(self):
        self.valid = True
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.metadata: dict = {}
        self.schema_mapping: SchemaMapping | None = None

    def add_error(self, msg: str):
        self.valid = False
        self.errors.append(msg)

    def add_warning(self, msg: str):
        self.warnings.append(msg)

    def to_dict(self) -> dict:
        result = {
            "valid": self.valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "metadata": self.metadata,
        }
        if self.schema_mapping:
            result["schema"] = self.schema_mapping.to_dict()
        return result


class DatasetValidator:
    """Validates uploaded machine datasets with adaptive schema detection."""

    SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
    MIN_RECORDS = 10
    MAX_NAN_RATIO = 0.5  # Warn at 50% NaN per column

    def __init__(self):
        self.schema_detector = SchemaDetector()

    def validate_file(self, file_path: Path) -> ValidationResult:
        """Validate an uploaded file end-to-end with adaptive schema detection."""
        result = ValidationResult()

        # 1. Check file extension
        ext = file_path.suffix.lower()
        if ext not in self.SUPPORTED_EXTENSIONS:
            result.add_error(
                f"Unsupported file format '{ext}'. "
                f"Supported: {', '.join(sorted(self.SUPPORTED_EXTENSIONS))}"
            )
            return result

        # 2. Try to parse the file
        try:
            df = self._read_file(file_path)
        except Exception as e:
            result.add_error(f"Failed to parse file: {str(e)}")
            return result

        # 3. Detect schema
        schema = self.schema_detector.detect(list(df.columns))
        result.schema_mapping = schema

        # 4. Validate data quality (never reject for missing columns)
        self._validate_adaptive(df, schema, result)

        # 5. Collect metadata
        self._collect_metadata(df, schema, result)

        return result

    def _read_file(self, file_path: Path) -> pd.DataFrame:
        """Read CSV or Excel file into a DataFrame."""
        ext = file_path.suffix.lower()
        if ext == ".csv":
            return pd.read_csv(file_path)
        else:
            return pd.read_excel(file_path)

    def _validate_adaptive(self, df: pd.DataFrame, schema: SchemaMapping, result: ValidationResult):
        """Validate data quality without requiring specific columns."""
        # Check for empty dataset
        if df.empty:
            result.add_error("Dataset is empty.")
            return

        # Check minimum records
        if len(df) < self.MIN_RECORDS:
            result.add_error(
                f"Dataset too small: {len(df)} records. Minimum required: {self.MIN_RECORDS}"
            )
            return

        # Warn if no sensor features detected at all
        if not schema.sensor_features:
            result.add_warning(
                "No sensor features detected. The system will treat all numeric "
                "columns as sensor readings."
            )

        # Warn if no machine identifier detected
        if not schema.has_machine_id:
            result.add_warning(
                "No machine identifier column detected. "
                "All records will be treated as a single machine."
            )

        # Check NaN ratio for mapped sensor columns
        for feature, orig_col in schema.mapped.items():
            if feature in ("timestamp", "machine_id"):
                continue
            if orig_col in df.columns:
                nan_ratio = df[orig_col].isna().mean()
                if nan_ratio > self.MAX_NAN_RATIO:
                    result.add_warning(
                        f"Column '{orig_col}' (→ {feature}) has {nan_ratio:.0%} missing values. "
                        f"Values will be interpolated."
                    )

        # Check numeric types for mapped sensor columns
        for feature, orig_col in schema.mapped.items():
            if feature in ("timestamp", "machine_id"):
                continue
            if orig_col in df.columns and not pd.api.types.is_numeric_dtype(df[orig_col]):
                try:
                    pd.to_numeric(df[orig_col], errors="raise")
                except (ValueError, TypeError):
                    result.add_warning(
                        f"Column '{orig_col}' (→ {feature}) contains non-numeric values. "
                        f"Non-numeric values will be coerced."
                    )

        # Check machine_id if present
        if schema.has_machine_id:
            mid_col = schema.mapped["machine_id"]
            if mid_col in df.columns:
                n_machines = df[mid_col].nunique()
                if n_machines > 100:
                    result.add_warning(
                        f"Dataset contains {n_machines} unique machines. "
                        f"System will map the first 20 to factory lines."
                    )

    def _collect_metadata(self, df: pd.DataFrame, schema: SchemaMapping, result: ValidationResult):
        """Collect metadata about the validated dataset."""
        machines_detected = 0
        if schema.has_machine_id:
            mid_col = schema.mapped["machine_id"]
            if mid_col in df.columns:
                machines_detected = int(df[mid_col].nunique())

        # Detect all numeric columns (potential unmapped features)
        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]

        result.metadata = {
            "total_records": len(df),
            "total_columns": len(df.columns),
            "machines_detected": machines_detected,
            "columns_found": list(df.columns),
            "mapped_features": {k: v for k, v in schema.mapped.items()},
            "sensor_features_detected": schema.sensor_features,
            "unmapped_columns": schema.unmapped,
            "numeric_columns": numeric_cols,
        }

        # Time range if timestamp detected
        if schema.has_timestamp:
            ts_col = schema.mapped["timestamp"]
            if ts_col in df.columns:
                try:
                    ts = pd.to_datetime(df[ts_col], errors="coerce")
                    valid_ts = ts.dropna()
                    if len(valid_ts) > 0:
                        result.metadata["time_range"] = {
                            "start": str(valid_ts.min()),
                            "end": str(valid_ts.max()),
                        }
                except Exception:
                    pass
