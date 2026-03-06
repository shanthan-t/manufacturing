"""
ML Model Trainer — trains XGBoost regressor for RUL prediction.
"""
import joblib
import numpy as np
from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from app.config import MODEL_PATH, SCALER_PATH, MODELS_DIR


class RULTrainer:
    """Trains and evaluates an XGBoost model for Remaining Useful Life prediction."""

    def __init__(self):
        self.model = XGBRegressor(
            n_estimators=150,
            max_depth=6,
            learning_rate=0.08,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=3,
            random_state=42,
            n_jobs=-1,
        )
        self.is_trained = False

    def train(self, X_train, y_train, X_val=None, y_val=None):
        """Train the model on preprocessed features."""
        print(f"Training XGBoost model on {len(X_train)} samples, {X_train.shape[1]} features...")

        eval_set = [(X_train, y_train)]
        if X_val is not None and y_val is not None:
            eval_set.append((X_val, y_val))

        self.model.fit(
            X_train,
            y_train,
            eval_set=eval_set,
            verbose=False,
        )
        self.is_trained = True

        # Evaluate on training data
        y_pred = self.model.predict(X_train)
        metrics = self._compute_metrics(y_train, y_pred)
        print(f"Training metrics: MAE={metrics['mae']:.2f}, RMSE={metrics['rmse']:.2f}, R²={metrics['r2']:.3f}")

        return metrics

    def evaluate(self, X_test, y_test):
        """Evaluate the model on test data."""
        y_pred = self.model.predict(X_test)
        metrics = self._compute_metrics(y_test, y_pred)
        print(f"Test metrics: MAE={metrics['mae']:.2f}, RMSE={metrics['rmse']:.2f}, R²={metrics['r2']:.3f}")
        return metrics, y_pred

    def save(self):
        """Save the trained model to disk."""
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, MODEL_PATH)
        print(f"Model saved to {MODEL_PATH}")

    def load(self):
        """Load a previously saved model."""
        if MODEL_PATH.exists():
            self.model = joblib.load(MODEL_PATH)
            self.is_trained = True
            print(f"Model loaded from {MODEL_PATH}")
            return True
        return False

    @staticmethod
    def _compute_metrics(y_true, y_pred):
        return {
            "mae": mean_absolute_error(y_true, y_pred),
            "rmse": np.sqrt(mean_squared_error(y_true, y_pred)),
            "r2": r2_score(y_true, y_pred),
        }
