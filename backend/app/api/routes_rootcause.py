"""
API Routes — Root Cause Analysis endpoint.
"""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["root-cause"])


@router.get("/machines/{machine_id}/root-cause")
async def get_root_cause(machine_id: str):
    """Get root cause analysis for a specific machine."""
    from app.main import app_state
    from app.config import FACTORY_LINES

    root_cause_engine = app_state.get("root_cause_engine")
    if not root_cause_engine:
        raise HTTPException(status_code=503, detail="Root cause engine not initialized")

    train_df = app_state.get("train_df")
    if train_df is None:
        raise HTTPException(status_code=503, detail="Training data not available")

    # Find unit_id for this machine
    unit_id = None
    for line in FACTORY_LINES:
        for m in line["machines"]:
            if m["id"] == machine_id:
                unit_id = m["unit_id"]
                break
        if unit_id:
            break

    if unit_id is None:
        raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")

    analysis = root_cause_engine.analyze(machine_id, unit_id, train_df)
    return {"root_cause": analysis}
