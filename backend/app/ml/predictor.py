"""
ML Predictor — loads trained model and produces health scores and failure probabilities.
"""
import numpy as np
import pandas as pd
import joblib
from app.config import MODEL_PATH, SCALER_PATH, MAX_RUL_CAP


class HealthPredictor:
    """Predicts machine health score and failure probability from sensor features."""

    def __init__(self, model=None):
        self.model = model

    def load_model(self):
        """Load saved model from disk."""
        if MODEL_PATH.exists():
            self.model = joblib.load(MODEL_PATH)
            return True
        return False

    def predict(self, features: pd.DataFrame | np.ndarray) -> list[dict]:
        """
        Predict health for one or more machines.

        Returns list of dicts with keys:
            - predicted_rul: float
            - health_score: float (0=failure, 1=healthy)
            - failure_prob: float (0=healthy, 1=imminent failure)
            - risk_level: str ('low', 'medium', 'high', 'critical')
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        predicted_rul = self.model.predict(features)
        results = []

        for rul in predicted_rul:
            rul = max(0, float(rul))
            health_score = min(1.0, rul / MAX_RUL_CAP)
            failure_prob = 1.0 - health_score
            risk_level = self._classify_risk(failure_prob)

            results.append({
                "predicted_rul": round(rul, 1),
                "health_score": round(health_score, 4),
                "failure_prob": round(failure_prob, 4),
                "risk_level": risk_level,
            })

        return results

    def predict_single(self, features: pd.DataFrame | np.ndarray) -> dict:
        """Predict health for a single machine."""
        results = self.predict(features)
        return results[0] if results else {}

    @staticmethod
    def _classify_risk(failure_prob: float) -> str:
        """Classify risk level based on failure probability."""
        if failure_prob >= 0.8:
            return "critical"
        elif failure_prob >= 0.5:
            return "high"
        elif failure_prob >= 0.3:
            return "medium"
        else:
            return "low"
