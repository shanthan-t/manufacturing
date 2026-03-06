"""
Conversation Context Manager — maintains session-scoped memory for the GenAI Copilot.

Tracks machine_type, production_line, machine_id across messages so follow-up
questions are automatically scoped to the right context.
"""
import re
import time
import uuid
from typing import Optional

from app.config import FACTORY_LINES


# ── Machine-type aliases (user language → internal code) ─────────────────────
_TYPE_ALIASES = {
    # CNC
    "cnc": "CNC", "cnc machine": "CNC", "cnc machines": "CNC",
    # Compressor
    "compressor": "CMP", "compressors": "CMP",
    "air compressor": "CMP", "air compressors": "CMP",
    # Press
    "press": "PRS", "presses": "PRS",
    "hydraulic press": "PRS", "hydraulic presses": "PRS",
    # Robot
    "robot": "ROB", "robots": "ROB",
    "assembly robot": "ROB", "assembly robots": "ROB",
    # Conveyor
    "conveyor": "CNV", "conveyors": "CNV",
    "packaging conveyor": "CNV", "packaging conveyors": "CNV",
}

_TYPE_DISPLAY = {
    "CNC": "CNC Machine",
    "CMP": "Air Compressor",
    "PRS": "Hydraulic Press",
    "ROB": "Assembly Robot",
    "CNV": "Packaging Conveyor",
}

# Build production-line lookup from config
_LINE_ALIASES = {}
for _line in FACTORY_LINES:
    name = _line["name"]                       # e.g. "Production Line A"
    _LINE_ALIASES[name.lower()] = name
    short = name.replace("Production ", "")     # "Line A"
    _LINE_ALIASES[short.lower()] = name
    letter = name.split()[-1]                   # "A"
    _LINE_ALIASES[f"line {letter.lower()}"] = name

# Machine-ID set (for exact ID extraction)
_ALL_IDS = set()
_ID_LOOKUP = {}
for _line in FACTORY_LINES:
    for _m in _line["machines"]:
        mid = _m["id"]
        _ALL_IDS.add(mid)
        _ID_LOOKUP[mid.lower()] = mid
        _ID_LOOKUP[mid.lower().replace("-", "")] = mid

# ── Session TTL ──────────────────────────────────────────────────────────────
_SESSION_TTL = 30 * 60  # 30 minutes
_MAX_HISTORY = 10       # keep last N messages


class SessionState:
    """Per-session conversational state."""

    __slots__ = ("machine_type", "production_line", "machine_id",
                 "history", "last_active")

    def __init__(self):
        self.machine_type: Optional[str] = None      # e.g. "CNC"
        self.production_line: Optional[str] = None    # e.g. "Production Line A"
        self.machine_id: Optional[str] = None         # e.g. "CNC-B1"
        self.history: list[dict] = []                 # [{role, content}, ...]
        self.last_active: float = time.time()

    def touch(self):
        self.last_active = time.time()

    def is_expired(self) -> bool:
        return (time.time() - self.last_active) > _SESSION_TTL

    def to_dict(self) -> dict:
        return {
            "machine_type": self.machine_type,
            "production_line": self.production_line,
            "machine_id": self.machine_id,
        }


class ConversationContextManager:
    """
    Server-side session store that tracks conversational context.

    Usage:
        ctx = ConversationContextManager()
        ctx.extract_context(session_id, "When should I upgrade my CNC machines?")
        # → machine_type is now "CNC"
        ctx.extract_context(session_id, "Which has the highest failure probability?")
        # → machine_type is still "CNC", follow-up is scoped
    """

    def __init__(self):
        self._sessions: dict[str, SessionState] = {}

    # ── Session access ───────────────────────────────────────────────────

    def _get_session(self, session_id: str) -> SessionState:
        """Get or create session, with lazy TTL cleanup."""
        if session_id in self._sessions:
            session = self._sessions[session_id]
            if session.is_expired():
                del self._sessions[session_id]
            else:
                session.touch()
                return session

        # Lazy cleanup: evict expired sessions (cap scan to avoid spike)
        expired_keys = [
            k for k, v in self._sessions.items() if v.is_expired()
        ]
        for k in expired_keys[:50]:
            del self._sessions[k]

        session = SessionState()
        self._sessions[session_id] = session
        return session

    def reset_session(self, session_id: str):
        """Clear a session entirely."""
        self._sessions.pop(session_id, None)

    # ── Context extraction ───────────────────────────────────────────────

    def extract_context(self, session_id: str, message: str) -> dict:
        """
        Parse user message for machine type, line, and ID references.
        Updates session state and returns the current context dict.
        """
        session = self._get_session(session_id)
        msg_lower = message.lower().strip()

        # 1. Extract specific machine ID  (e.g. "CNC-B1", "cmpA2")
        machine_id = self._extract_machine_id(msg_lower)
        if machine_id:
            session.machine_id = machine_id
            # Infer type from ID prefix
            prefix = machine_id.split("-")[0]
            if prefix in _TYPE_DISPLAY:
                session.machine_type = prefix

        # 2. Extract machine type (e.g. "CNC machines", "compressors")
        machine_type = self._extract_machine_type(msg_lower)
        if machine_type:
            session.machine_type = machine_type
            # Clear specific machine_id when user broadens to a type
            if not machine_id:
                session.machine_id = None

        # 3. Extract production line (e.g. "Line A", "Production Line B")
        production_line = self._extract_production_line(msg_lower)
        if production_line:
            session.production_line = production_line

        return session.to_dict()

    def _extract_machine_id(self, msg: str) -> Optional[str]:
        pattern = r'\b([a-z]{3})-?([a-z])(\d)\b'
        match = re.search(pattern, msg, re.IGNORECASE)
        if match:
            candidate = f"{match.group(1).upper()}-{match.group(2).upper()}{match.group(3)}"
            if candidate in _ALL_IDS:
                return candidate
        # Exact substring match
        for key, canonical in _ID_LOOKUP.items():
            if key in msg:
                return canonical
        return None

    def _extract_machine_type(self, msg: str) -> Optional[str]:
        # Check longest aliases first to avoid partial matches
        for alias in sorted(_TYPE_ALIASES.keys(), key=len, reverse=True):
            if alias in msg:
                return _TYPE_ALIASES[alias]
        return None

    def _extract_production_line(self, msg: str) -> Optional[str]:
        for alias in sorted(_LINE_ALIASES.keys(), key=len, reverse=True):
            if alias in msg:
                return _LINE_ALIASES[alias]
        return None

    # ── History management ───────────────────────────────────────────────

    def add_to_history(self, session_id: str, role: str, content: str):
        """Append a message and keep history bounded."""
        session = self._get_session(session_id)
        session.history.append({"role": role, "content": content})
        if len(session.history) > _MAX_HISTORY:
            session.history = session.history[-_MAX_HISTORY:]

    def get_history(self, session_id: str) -> list[dict]:
        """Return conversation history for this session."""
        session = self._get_session(session_id)
        return list(session.history)

    # ── Context prompt builder ───────────────────────────────────────────

    def build_context_prompt(self, session_id: str) -> str:
        """
        Build a natural-language context string for injection into the system prompt.
        Returns empty string if no context is set.
        """
        session = self._get_session(session_id)
        parts = []

        if session.machine_type:
            display = _TYPE_DISPLAY.get(session.machine_type, session.machine_type)
            parts.append(f"machine type = {display} ({session.machine_type})")
        if session.production_line:
            parts.append(f"production line = {session.production_line}")
        if session.machine_id:
            parts.append(f"specific machine = {session.machine_id}")

        if not parts:
            return ""

        return (
            "\n\nCONVERSATION CONTEXT (from previous messages):\n"
            f"The user is currently discussing: {', '.join(parts)}.\n"
            "When the user asks follow-up questions, scope your answers to this context "
            "unless they explicitly change the topic."
        )

    def get_context(self, session_id: str) -> dict:
        """Return the current context dict for a session."""
        session = self._get_session(session_id)
        return session.to_dict()
