"""
API Routes — Machine Health endpoints.
"""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["machines"])


@router.get("/machines")
async def get_all_machines():
    """Get all machines with their current health status."""
    from app.main import app_state

    machines = app_state["factory_graph"].get_all_machines()
    return {
        "machines": machines,
        "total": len(machines),
    }


@router.get("/machines/{machine_id}")
async def get_machine(machine_id: str):
    """Get detailed info for a specific machine."""
    from app.main import app_state

    machine = app_state["factory_graph"].get_machine(machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")

    # Get sensor history if available
    sensor_history = _get_sensor_history(machine_id)

    return {
        "machine": machine,
        "downstream": app_state["factory_graph"].get_downstream(machine_id),
        "upstream": app_state["factory_graph"].get_upstream(machine_id),
        "sensor_history": sensor_history,
    }


def _get_sensor_history(machine_id: str) -> list[dict]:
    """Get recent sensor readings for a machine (from training data)."""
    from app.main import app_state

    machine = app_state["factory_graph"].get_machine(machine_id)
    if not machine:
        return []

    unit_id = machine.get("unit_id")
    train_df = app_state.get("train_df")
    if train_df is None or unit_id is None:
        return []

    unit_data = train_df[train_df["unit_id"] == unit_id].tail(30)
    if unit_data.empty:
        return []

    sensor_cols = [c for c in unit_data.columns if c.startswith("sensor_")]
    history = []
    for _, row in unit_data.iterrows():
        entry = {"cycle": int(row["cycle"])}
        for col in sensor_cols:
            entry[col] = round(float(row[col]), 4)
        history.append(entry)

    return history
