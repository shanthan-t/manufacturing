"""
API Routes — GenAI Factory Reliability Copilot endpoints.
Supports both standard POST and streaming SSE responses.
Includes session-based conversation context memory.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["copilot"])


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ResetRequest(BaseModel):
    session_id: str


@router.post("/copilot/chat")
async def copilot_chat(request: ChatRequest):
    """Process a natural language question about factory health."""
    from app.main import app_state

    copilot = app_state.get("copilot_engine")
    if not copilot:
        raise HTTPException(status_code=503, detail="Copilot engine not initialized")

    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    result = copilot.chat(request.message, session_id=request.session_id)
    return result


@router.post("/copilot/stream")
async def copilot_stream(request: ChatRequest):
    """Stream copilot response via Server-Sent Events."""
    from app.main import app_state

    copilot = app_state.get("copilot_engine")
    if not copilot:
        raise HTTPException(status_code=503, detail="Copilot engine not initialized")

    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    session_id = request.session_id

    def event_generator():
        try:
            for chunk in copilot.chat_stream(request.message, session_id=session_id):
                # SSE format: data: <text>\n\n
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/copilot/reset")
async def copilot_reset(request: ResetRequest):
    """Reset conversation context for a session."""
    from app.main import app_state

    copilot = app_state.get("copilot_engine")
    if not copilot:
        raise HTTPException(status_code=503, detail="Copilot engine not initialized")

    copilot.context_manager.reset_session(request.session_id)
    return {"status": "ok", "message": "Session reset"}


@router.get("/copilot/suggestions")
async def copilot_suggestions():
    """Get context-aware suggested prompts."""
    from app.main import app_state

    copilot = app_state.get("copilot_engine")
    if not copilot:
        raise HTTPException(status_code=503, detail="Copilot engine not initialized")

    return {"suggestions": copilot.get_suggestions()}
