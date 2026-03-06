"""
API Routes — Data source management endpoints.
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/data", tags=["data"])


class ModeRequest(BaseModel):
    mode: str  # "synthetic" or "real"


@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Upload a real machine dataset (CSV or Excel).
    Validates, processes, and re-initializes the system with the new data.
    """
    from app.main import app_state, reinitialize_system

    data_manager = app_state.get("data_manager")
    if not data_manager:
        raise HTTPException(status_code=500, detail="Data manager not initialized")

    # Validate file extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '.{ext}'. Use CSV or Excel files."
        )

    # Read and save file
    try:
        content = await file.read()
        file_path = data_manager.save_uploaded_file(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Validate and process
    validation = data_manager.process_upload(file_path, file.filename)

    if not validation.valid:
        return {
            "status": "error",
            "validation": validation.to_dict(),
        }

    # Re-initialize the system with the new data
    try:
        train_df, test_df, rul_df = data_manager.get_dataset()
        await reinitialize_system(train_df, test_df, rul_df)
    except Exception as e:
        return {
            "status": "error",
            "validation": validation.to_dict(),
            "error": f"System re-initialization failed: {str(e)}",
        }

    return {
        "status": "success",
        "validation": validation.to_dict(),
        "data_status": data_manager.get_status(),
    }


@router.post("/mode")
async def switch_data_mode(req: ModeRequest):
    """Switch between synthetic and real data modes."""
    from app.main import app_state, reinitialize_system

    data_manager = app_state.get("data_manager")
    if not data_manager:
        raise HTTPException(status_code=500, detail="Data manager not initialized")

    if req.mode not in ("synthetic", "real"):
        raise HTTPException(status_code=400, detail="Mode must be 'synthetic' or 'real'")

    if req.mode == "synthetic":
        # Switch back to synthetic data
        try:
            train_df, test_df, rul_df = data_manager.load_synthetic()
            await reinitialize_system(train_df, test_df, rul_df)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to switch to synthetic: {str(e)}")
    elif req.mode == "real":
        # Can only switch to real if data was previously uploaded
        if data_manager._processing_status != "ready" or data_manager.mode != "real":
            raise HTTPException(
                status_code=400,
                detail="No real dataset loaded. Upload a dataset first."
            )

    return {
        "status": "success",
        "data_status": data_manager.get_status(),
    }


@router.get("/status")
async def get_data_status():
    """Get current data source status."""
    from app.main import app_state

    data_manager = app_state.get("data_manager")
    if not data_manager:
        return {"mode": "synthetic", "status": "ready"}

    return data_manager.get_status()
