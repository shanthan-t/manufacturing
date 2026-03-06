"""
CascadeGuard Configuration
"""
import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "CMAPSSData"
MODELS_DIR = BASE_DIR / "models"
UPLOAD_DIR = BASE_DIR / "data" / "uploads"

# Real data upload settings — fuzzy keyword matching for schema detection
# Each internal feature maps to a list of possible column name aliases
COLUMN_ALIASES = {
    "timestamp": ["timestamp", "time", "date", "datetime", "recorded_at", "reading_time", "ts"],
    "machine_id": ["machine_id", "machine", "device", "unit", "device_id", "unit_id", "equipment", "asset", "asset_id", "equipment_id", "id"],
    "temperature": ["temperature", "temp", "air_temperature", "process_temperature", "air_temp", "surface_temp", "thermal"],
    "vibration": ["vibration", "vibe", "acceleration", "accel", "vibration_level", "vib"],
    "rpm": ["rpm", "rotational_speed", "speed", "rotation", "rev", "revolutions", "motor_speed", "spindle_speed"],
    "power": ["power", "power_usage", "torque", "power_consumption", "energy", "wattage", "load", "current"],
    "pressure": ["pressure", "psi", "bar", "air_pressure", "hydraulic_pressure", "press"],
    "humidity": ["humidity", "moisture", "relative_humidity", "rh"],
    "voltage": ["voltage", "volt", "volts", "v"],
    "noise": ["noise", "sound", "decibel", "db", "sound_level", "acoustic"],
    "flow_rate": ["flow", "flow_rate", "coolant_flow", "fluid_flow", "gpm"],
    "wear": ["wear", "tool_wear", "degradation", "erosion", "wear_level"],
}

# Mapping from detected features to synthetic sensor columns
# Each feature that can be detected maps to a sensor slot + scaling params
SENSOR_COLUMN_MAPPING = {
    "temperature": {"sensor": "sensor_2", "base": 642.15, "scale": 2.0},
    "vibration": {"sensor": "sensor_3", "base": 1589.70, "scale": 50.0},
    "rpm": {"sensor": "sensor_4", "base": 1400.60, "scale": 0.5},
    "power": {"sensor": "sensor_7", "base": 554.36, "scale": 1.5},
    "pressure": {"sensor": "sensor_8", "base": 2388.02, "scale": 1.0},
    "humidity": {"sensor": "sensor_9", "base": 9046.19, "scale": 100.0},
    "voltage": {"sensor": "sensor_11", "base": 47.47, "scale": 0.2},
    "noise": {"sensor": "sensor_12", "base": 521.66, "scale": 5.0},
    "flow_rate": {"sensor": "sensor_13", "base": 2388.02, "scale": 2.0},
    "wear": {"sensor": "sensor_14", "base": 8138.62, "scale": 30.0},
}

# Weights for computing health score from available features (higher = more impact on health)
FEATURE_HEALTH_WEIGHTS = {
    "temperature": 0.20,
    "vibration": 0.25,
    "rpm": 0.10,
    "power": 0.15,
    "pressure": 0.10,
    "humidity": 0.05,
    "voltage": 0.05,
    "noise": 0.05,
    "flow_rate": 0.03,
    "wear": 0.02,
}

# Dataset files
TRAIN_FILE = DATA_DIR / "train_FD001.txt"
TEST_FILE = DATA_DIR / "test_FD001.txt"
RUL_FILE = DATA_DIR / "RUL_FD001.txt"

# Model settings
MODEL_PATH = MODELS_DIR / "xgb_rul_model.joblib"
SCALER_PATH = MODELS_DIR / "scaler.joblib"
MAX_RUL_CAP = 125  # Cap RUL at 125 cycles (common practice)

# Column definitions for the NASA Turbofan dataset
COLUMN_NAMES = (
    ["unit_id", "cycle"]
    + [f"op_setting_{i}" for i in range(1, 4)]
    + [f"sensor_{i}" for i in range(1, 22)]
)

# Sensors with near-zero variance (to drop)
DROP_SENSORS = ["sensor_1", "sensor_5", "sensor_6", "sensor_10", "sensor_16", "sensor_18", "sensor_19"]
DROP_OP_SETTINGS = ["op_setting_3"]

# Feature columns (after dropping)
FEATURE_SENSORS = [s for s in [f"sensor_{i}" for i in range(1, 22)] if s not in DROP_SENSORS]
FEATURE_OP_SETTINGS = [s for s in [f"op_setting_{i}" for i in range(1, 4)] if s not in DROP_OP_SETTINGS]

# Rolling window size
ROLLING_WINDOW = 5

# Server settings
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))

# Factory configuration — maps engine unit IDs to factory machines
FACTORY_LINES = [
    {
        "name": "Production Line A",
        "machines": [
            {"id": "CMP-A1", "type": "Air Compressor", "unit_id": 1},
            {"id": "PRS-A1", "type": "Pneumatic Press", "unit_id": 2},
            {"id": "CNC-A1", "type": "CNC Machine", "unit_id": 3},
            {"id": "ROB-A1", "type": "Assembly Robot", "unit_id": 4},
            {"id": "CNV-A1", "type": "Packaging Conveyor", "unit_id": 5},
        ],
    },
    {
        "name": "Production Line B",
        "machines": [
            {"id": "CMP-B1", "type": "Air Compressor", "unit_id": 6},
            {"id": "PRS-B1", "type": "Pneumatic Press", "unit_id": 7},
            {"id": "CNC-B1", "type": "CNC Machine", "unit_id": 8},
            {"id": "ROB-B1", "type": "Assembly Robot", "unit_id": 9},
            {"id": "CNV-B1", "type": "Packaging Conveyor", "unit_id": 10},
        ],
    },
    {
        "name": "Production Line C",
        "machines": [
            {"id": "CMP-C1", "type": "Air Compressor", "unit_id": 11},
            {"id": "PRS-C1", "type": "Pneumatic Press", "unit_id": 12},
            {"id": "CNC-C1", "type": "CNC Machine", "unit_id": 13},
            {"id": "ROB-C1", "type": "Assembly Robot", "unit_id": 14},
            {"id": "CNV-C1", "type": "Packaging Conveyor", "unit_id": 15},
        ],
    },
    {
        "name": "Production Line D",
        "machines": [
            {"id": "CMP-D1", "type": "Air Compressor", "unit_id": 16},
            {"id": "PRS-D1", "type": "Pneumatic Press", "unit_id": 17},
            {"id": "CNC-D1", "type": "CNC Machine", "unit_id": 18},
            {"id": "ROB-D1", "type": "Assembly Robot", "unit_id": 19},
            {"id": "CNV-D1", "type": "Packaging Conveyor", "unit_id": 20},
        ],
    },
]

# Cross-line dependencies (shared utilities)
CROSS_LINE_DEPENDENCIES = [
    # Compressor A also feeds Press B (shared air supply)
    {"from": "CMP-A1", "to": "PRS-B1", "weight": 0.3},
    # Compressor C also feeds Press D
    {"from": "CMP-C1", "to": "PRS-D1", "weight": 0.3},
]

# Default edge weight within a production line
DEFAULT_EDGE_WEIGHT = 0.7

# Machine downtime cost (hours per failure)
DOWNTIME_COSTS = {
    "Air Compressor": 8,
    "Pneumatic Press": 4,
    "CNC Machine": 6,
    "Assembly Robot": 5,
    "Packaging Conveyor": 3,
}
