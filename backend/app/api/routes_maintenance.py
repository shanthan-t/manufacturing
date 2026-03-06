"""
API Routes — Maintenance Decision endpoints.
"""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["maintenance"])


@router.get("/maintenance/priorities")
async def get_maintenance_priorities():
    """Get ranked list of machines by maintenance priority."""
    from app.main import app_state

    decision_engine = app_state.get("decision_engine")
    if not decision_engine:
        raise HTTPException(status_code=503, detail="Decision engine not initialized")

    priorities = decision_engine.compute_priorities()
    return {
        "priorities": priorities,
        "total": len(priorities),
        "immediate_count": sum(1 for p in priorities if p["urgency"] == "immediate"),
        "urgent_count": sum(1 for p in priorities if p["urgency"] == "urgent"),
    }


@router.get("/maintenance/recommendations/{machine_id}")
async def get_recommendations(machine_id: str):
    """Get detailed maintenance recommendations for a specific machine."""
    from app.main import app_state

    decision_engine = app_state.get("decision_engine")
    if not decision_engine:
        raise HTTPException(status_code=503, detail="Decision engine not initialized")

    rec = decision_engine.get_recommendations(machine_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")

    return {"recommendation": rec}
