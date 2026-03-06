"""
API Routes — What-If Scenario simulation endpoint.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["scenario"])


class ScenarioRequest(BaseModel):
    machine_id: str
    action_type: str  # repair | replace | load_reduction | shutdown | preventive_maintenance


@router.post("/scenario/simulate")
async def simulate_scenario(request: ScenarioRequest):
    """Simulate a what-if maintenance action on a machine."""
    from app.main import app_state

    scenario_engine = app_state.get("scenario_engine")
    if not scenario_engine:
        raise HTTPException(status_code=503, detail="Scenario engine not initialized")

    try:
        result = scenario_engine.simulate(
            machine_id=request.machine_id,
            action_type=request.action_type,
        )
        return {"scenario": result.to_dict()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/scenario/best-action/{machine_id}")
async def get_best_action(machine_id: str):
    """Return the action that yields the greatest downtime reduction for a machine."""
    from app.main import app_state

    scenario_engine = app_state.get("scenario_engine")
    if not scenario_engine:
        raise HTTPException(status_code=503, detail="Scenario engine not initialized")

    result = scenario_engine.get_best_action(machine_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"No scenario data found for '{machine_id}'")
    return {"best_action": result}


@router.get("/scenario/actions")
async def list_actions():
    """List all available scenario action types."""
    from app.intelligence.scenario_engine import ACTION_SPECS
    return {
        "actions": [
            {"type": k, "label": v["label"], "description": v["description"]}
            for k, v in ACTION_SPECS.items()
        ]
    }
