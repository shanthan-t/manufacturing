"""
API Routes — Simulation & Risk Intelligence endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["simulation"])


class SimulateRequest(BaseModel):
    machine_id: str
    failure_prob: float = 1.0


@router.post("/simulate")
async def simulate_cascade(req: SimulateRequest):
    """Simulate cascade failure from a specific machine."""
    from app.main import app_state

    try:
        result = app_state["propagation_engine"].simulate_cascade(
            machine_id=req.machine_id,
            failure_prob=req.failure_prob,
            apply_to_graph=True,
        )
        return {
            "simulation": result.to_dict(),
            "updated_graph": app_state["factory_graph"].get_graph_data(),
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/simulate/reset")
async def reset_simulation():
    """Reset all machines to their original predicted health states."""
    from app.main import app_state

    original_health = app_state.get("original_health", {})
    factory_graph = app_state["factory_graph"]

    for machine_id, health_data in original_health.items():
        factory_graph.reset_machine(machine_id, health_data)

    return {
        "status": "reset",
        "graph": factory_graph.get_graph_data(),
    }


@router.get("/risk/summary")
async def get_risk_summary():
    """Get overall factory risk summary."""
    from app.main import app_state

    summary = app_state["risk_engine"].get_factory_summary()
    return summary


@router.get("/risk/critical")
async def get_critical_machines():
    """Get the most critical machines by failure probability."""
    from app.main import app_state

    critical = app_state["risk_engine"].get_critical_machines(top_n=5)
    return {"critical_machines": critical}


@router.get("/risk/impact")
async def get_highest_impact():
    """Get machines with highest downstream impact potential."""
    from app.main import app_state

    impact = app_state["risk_engine"].get_highest_impact_machines(top_n=5)
    return {"highest_impact": impact}


@router.get("/risk/paths")
async def get_cascade_paths():
    """Get all significant cascade failure paths."""
    from app.main import app_state

    paths = app_state["risk_engine"].get_cascade_paths()
    return {"cascade_paths": paths}
