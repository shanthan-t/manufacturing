"""
API Routes — AI Insight Summary endpoint.
"""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["insights"])


@router.get("/insights/summary")
async def get_insights_summary():
    """Get AI-generated factory risk narrative and recommendations."""
    from app.main import app_state

    insight_generator = app_state.get("insight_generator")
    if not insight_generator:
        raise HTTPException(status_code=503, detail="Insight generator not initialized")

    summary = insight_generator.generate_summary()
    return {"insights": summary}


@router.get("/machines/{machine_id}/detail")
async def get_machine_detail(machine_id: str):
    """Get comprehensive detail for a single machine: health + cascade + maintenance."""
    from app.main import app_state
    from app.config import FACTORY_LINES

    factory_graph = app_state.get("factory_graph")
    propagation_engine = app_state.get("propagation_engine")
    decision_engine = app_state.get("decision_engine")

    if not factory_graph:
        raise HTTPException(status_code=503, detail="Factory graph not initialized")

    graph = factory_graph.graph
    if machine_id not in graph:
        raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")

    node = dict(graph.nodes[machine_id])

    # Get cascade impact for this machine
    cascade = propagation_engine.simulate_cascade(
        machine_id, failure_prob=node.get("failure_prob", 0.5), apply_to_graph=False
    )

    # Get maintenance recommendation
    maintenance = None
    if decision_engine:
        try:
            rec = decision_engine.get_recommendation(machine_id)
            maintenance = rec
        except Exception:
            pass

    # Build downstream list
    downstream = factory_graph.get_downstream(machine_id)

    return {
        "machine": {
            **node,
            "id": machine_id,
        },
        "cascade": {
            "affected_count": len(cascade.affected_machines),
            "total_downtime_hours": round(cascade.total_downtime_hours, 1),
            "max_depth": cascade.max_cascade_depth,
            "affected_machines": [m.to_dict() for m in cascade.affected_machines[:6]],
        },
        "downstream": downstream,
        "maintenance": maintenance,
    }


@router.get("/machines/{machine_id}/sensor-history")
async def get_sensor_history(machine_id: str, n_cycles: int = 30):
    """Get last N cycles of sensor readings for sparkline charts."""
    from app.main import app_state
    from app.config import FACTORY_LINES, FEATURE_SENSORS

    train_df = app_state.get("train_df")
    if train_df is None:
        raise HTTPException(status_code=503, detail="Training data not available")

    # Resolve unit_id
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

    unit_data = train_df[train_df["unit_id"] == unit_id].tail(n_cycles)
    if unit_data.empty:
        return {"sensor_history": []}

    # Return top sensors (those with most variance in this unit)
    sensor_variance = {}
    for s in FEATURE_SENSORS:
        if s in unit_data.columns:
            sensor_variance[s] = float(unit_data[s].std())

    top_sensors = sorted(sensor_variance.items(), key=lambda x: x[1], reverse=True)[:6]

    history = []
    for sensor_name, _ in top_sensors:
        values = unit_data[sensor_name].tolist()
        history.append({
            "sensor": sensor_name,
            "values": [round(v, 4) for v in values],
            "min": round(min(values), 4),
            "max": round(max(values), 4),
            "trend": "rising" if values[-1] > values[0] else "falling" if values[-1] < values[0] else "stable",
        })

    return {
        "machine_id": machine_id,
        "cycles": unit_data["cycle"].tolist(),
        "sensor_history": history,
    }
