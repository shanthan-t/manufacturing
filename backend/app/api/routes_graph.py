"""
API Routes — Factory Graph endpoints.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["graph"])


@router.get("/graph")
async def get_factory_graph():
    """Get the full factory dependency graph for D3.js visualization."""
    from app.main import app_state

    graph_data = app_state["factory_graph"].get_graph_data()
    return graph_data


@router.get("/graph/impact")
async def get_impact_analysis():
    """Get impact analysis — which machines would cause the most damage if they fail."""
    from app.main import app_state

    impact = app_state["propagation_engine"].get_all_cascade_risks()
    return {"impact_analysis": impact}
