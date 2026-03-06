"""
API Routes — Future Risk Forecasting endpoints.
"""
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api", tags=["forecast"])


@router.get("/forecast/{hours}")
async def get_forecast(hours: int):
    """Get factory state forecast at a specific time horizon (hours)."""
    from app.main import app_state

    if hours not in (6, 12, 24):
        raise HTTPException(
            status_code=400,
            detail="Supported forecast horizons: 6, 12, 24 hours"
        )

    forecast_engine = app_state.get("forecast_engine")
    if not forecast_engine:
        raise HTTPException(status_code=503, detail="Forecast engine not initialized")

    return forecast_engine.forecast_factory(hours)


@router.get("/forecast/timeline/data")
async def get_forecast_timeline(
    max_hours: int = Query(default=24, ge=6, le=48),
    interval: int = Query(default=2, ge=1, le=6),
):
    """Get factory health trajectory timeline for charting."""
    from app.main import app_state

    forecast_engine = app_state.get("forecast_engine")
    if not forecast_engine:
        raise HTTPException(status_code=503, detail="Forecast engine not initialized")

    return forecast_engine.get_timeline(max_hours=max_hours, interval_hours=interval)
