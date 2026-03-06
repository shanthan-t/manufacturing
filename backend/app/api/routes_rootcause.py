"""
API Routes — Root Cause Analysis endpoint with AI explanation support.
"""
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api", tags=["root-cause"])


@router.get("/machines/{machine_id}/root-cause")
async def get_root_cause(machine_id: str, explain: bool = Query(False)):
    """
    Get root cause analysis for a specific machine.

    Query params:
        explain (bool): If true, include AI-generated explanation via Groq LLM.
    """
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

    # Run sensor analysis
    analysis = root_cause_engine.analyze(machine_id, unit_id, train_df)

    # Get machine health from factory graph
    factory_graph = app_state.get("factory_graph")
    machine_data = factory_graph.get_machine(machine_id) if factory_graph else None
    health_score = machine_data.get("health_score", 0) if machine_data else 0
    failure_prob = machine_data.get("failure_prob", 0) if machine_data else 0
    production_line = machine_data.get("production_line", "Unknown") if machine_data else "Unknown"

    # Enrich with health data
    analysis["health_score"] = round(health_score, 4)
    analysis["failure_probability"] = round(failure_prob, 4)

    # Generate AI explanation if requested
    if explain:
        ai_result = root_cause_engine.generate_ai_explanation(
            machine_id=machine_id,
            health_score=health_score,
            failure_prob=failure_prob,
            production_line=production_line,
            analysis=analysis,
        )
        analysis["ai_explanation"] = ai_result.get("ai_explanation", "")
        # Override with AI-generated values if available
        if ai_result.get("primary_cause"):
            analysis["primary_cause"] = ai_result["primary_cause"]
        if ai_result.get("secondary_causes"):
            analysis["secondary_causes"] = ai_result["secondary_causes"]
        if ai_result.get("recommended_action"):
            analysis["recommended_action"] = ai_result["recommended_action"]

    return {"root_cause": analysis}
