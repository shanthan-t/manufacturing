"""
Data Manager — central orchestrator for data source management.

Manages switching between synthetic demo data and real uploaded datasets.
Provides a unified interface for the rest of the system to access data
regardless of the active source.
"""
from datetime import datetime
from pathlib import Path

import pandas as pd

from app.config import DATA_DIR, UPLOAD_DIR
from app.data.loader import load_dataset
from app.data.dataset_validator import DatasetValidator, ValidationResult
from app.data.real_data_adapter import RealDataAdapter


class DataManager:
    """Manages data source selection and provides unified dataset access."""

    def __init__(self):
        self.mode: str = "synthetic"  # "synthetic" or "real"
        self.validator = DatasetValidator()
        self.adapter = RealDataAdapter()

        # Current datasets
        self._train_df: pd.DataFrame | None = None
        self._test_df: pd.DataFrame | None = None
        self._rul_df: pd.DataFrame | None = None

        # Upload metadata
        self._upload_info: dict = {}
        self._processing_status: str = "idle"  # idle, uploading, validating, processing, ready, error
        self._last_error: str | None = None

        # Ensure upload directory exists
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    def load_synthetic(self) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """Load synthetic demo data."""
        self.mode = "synthetic"
        self._processing_status = "processing"
        self._upload_info = {}
        self._last_error = None

        try:
            train_df, test_df, rul_df = load_dataset()
            self._train_df = train_df
            self._test_df = test_df
            self._rul_df = rul_df
            self._processing_status = "ready"
            return train_df, test_df, rul_df
        except Exception as e:
            self._processing_status = "error"
            self._last_error = str(e)
            raise

    def process_upload(self, file_path: Path, original_filename: str) -> ValidationResult:
        """
        Validate, process, and load an uploaded dataset.

        Uses adaptive schema detection — works with any column names.
        Returns the validation result. The dataset will be processed
        using whatever features are detected.
        """
        self._processing_status = "validating"
        self._last_error = None

        # Step 1: Validate with adaptive schema detection
        validation = self.validator.validate_file(file_path)
        if not validation.valid:
            self._processing_status = "error"
            self._last_error = "; ".join(validation.errors)
            return validation

        # Step 2: Read the data
        self._processing_status = "processing"
        try:
            ext = file_path.suffix.lower()
            if ext == ".csv":
                raw_df = pd.read_csv(file_path)
            else:
                raw_df = pd.read_excel(file_path)

            # Step 3: Adapt to internal format using detected schema
            schema = validation.schema_mapping
            train_df, test_df, rul_df = self.adapter.transform(raw_df, schema)

            # Step 4: Store
            self._train_df = train_df
            self._test_df = test_df
            self._rul_df = rul_df
            self.mode = "real"

            # Store upload metadata with schema info
            self._upload_info = {
                "filename": original_filename,
                "uploaded_at": datetime.now().isoformat(),
                "machines_detected": validation.metadata.get("machines_detected", 0),
                "total_records": validation.metadata.get("total_records", 0),
                "machine_id_map": self.adapter.get_machine_id_map(),
                "mapped_features": validation.metadata.get("mapped_features", {}),
                "sensor_features": validation.metadata.get("sensor_features_detected", []),
                "unmapped_columns": validation.metadata.get("unmapped_columns", []),
                "columns_found": validation.metadata.get("columns_found", []),
            }
            self._processing_status = "ready"

        except Exception as e:
            self._processing_status = "error"
            self._last_error = f"Processing failed: {str(e)}"
            validation.add_error(self._last_error)

        return validation

    def get_dataset(self) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """Get the currently active dataset."""
        if self._train_df is None:
            return self.load_synthetic()
        return self._train_df, self._test_df, self._rul_df

    def get_status(self) -> dict:
        """Get current data source status for the frontend."""
        status = {
            "mode": self.mode,
            "status": self._processing_status,
        }

        if self.mode == "real" and self._upload_info:
            status["upload"] = {
                "filename": self._upload_info.get("filename", ""),
                "uploaded_at": self._upload_info.get("uploaded_at", ""),
                "machines_detected": self._upload_info.get("machines_detected", 0),
                "total_records": self._upload_info.get("total_records", 0),
                "mapped_features": self._upload_info.get("mapped_features", {}),
                "sensor_features": self._upload_info.get("sensor_features", []),
                "unmapped_columns": self._upload_info.get("unmapped_columns", []),
                "columns_found": self._upload_info.get("columns_found", []),
            }

        if self._last_error:
            status["error"] = self._last_error

        return status

    def save_uploaded_file(self, content: bytes, filename: str) -> Path:
        """Save an uploaded file to the upload directory."""
        safe_name = filename.replace("..", "").replace("/", "_").replace("\\", "_")
        file_path = UPLOAD_DIR / safe_name

        with open(file_path, "wb") as f:
            f.write(content)

        return file_path
