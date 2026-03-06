"""
GenAI Factory Reliability Copilot — LLM-powered conversational AI.

Supports multiple LLM providers with automatic fallback:
  1. Gemini (GEMINI_API_KEY) — Google Gemini with function-calling
  2. Groq  (GROQ_API_KEY)   — free tier, fast, Llama 3 models
  3. Keyword fallback        — regex-based intent matching (no API key needed)
"""
import os
import json
import traceback
from typing import Generator

from app.config import FACTORY_LINES
from app.intelligence.conversation_context import ConversationContextManager

# ── Machine Naming Utilities ────────────────────────────────────────────────────
TYPE_NAMES = {
    "CMP": "Air Compressor",
    "PRS": "Hydraulic Press",
    "CNC": "CNC Machine",
    "ROB": "Assembly Robot",
    "CNV": "Packaging Conveyor",
}


def get_machine_short_label(machine_id: str) -> str:
    """CMP-A1 -> Air Compressor A1"""
    if not machine_id:
        return ""
    parts = machine_id.split("-")
    if len(parts) < 2:
        return machine_id
    name = TYPE_NAMES.get(parts[0], parts[0])
    return f"{name} {parts[1]}"


# ── Machine ID registry ────────────────────────────────────────────────────
ALL_MACHINE_IDS = []
MACHINE_ID_LOOKUP = {}
for _line in FACTORY_LINES:
    for _m in _line["machines"]:
        ALL_MACHINE_IDS.append(_m["id"])
        MACHINE_ID_LOOKUP[_m["id"].lower()] = _m["id"]
        MACHINE_ID_LOOKUP[_m["id"].lower().replace("-", "")] = _m["id"]

LINE_NAMES = [line["name"] for line in FACTORY_LINES]

SUGGESTED_PROMPTS = [
    "How is the factory doing overall?",
    "Which machine is most likely to fail?",
    "What happens if the air compressor on Line A fails?",
    "Which machine should we repair first?",
    "Which machines will fail in the next 24 hours?",
    "Why is Production Line C risky?",
    "What if we repair the robot on Line C?",
]

# ── System prompt ───────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are the CascadeGuard Factory Reliability Copilot — an expert industrial AI assistant embedded in a manufacturing intelligence platform.

You help factory engineers understand machine health, failure risks, cascade impacts, maintenance priorities, and production forecasts.

IMPORTANT RULES:
1. You ONLY answer questions about: machine health, failure prediction, cascade failures, maintenance planning, factory risk, and production line analysis.
2. If the user asks about anything else (weather, sports, coding, general knowledge), respond EXACTLY: "I am the CascadeGuard factory reliability assistant. I can only answer questions about machine health, failures, and factory risk."
3. Always use the available tools to retrieve real data before answering. NEVER make up machine data or statistics.
4. Reference actual machine names and metrics from the tool results in your answers.
5. Format your responses using markdown: use **bold** for important metrics, bullet points for lists, and numbered lists for rankings.
6. Be concise but thorough. Engineers want actionable insights, not lengthy essays.
7. When discussing machines, use their human-readable names (e.g., "Air Compressor A1" not "CMP-A1").

FACTORY CONTEXT:
- The factory has """ + str(len(ALL_MACHINE_IDS)) + """ machines across """ + str(len(LINE_NAMES)) + """ production lines
- Machine types: Air Compressor (CMP), Hydraulic Press (PRS), CNC Machine (CNC), Assembly Robot (ROB), Packaging Conveyor (CNV)
- Production lines: """ + ", ".join(LINE_NAMES) + """
- Machine IDs: """ + ", ".join(ALL_MACHINE_IDS) + """
"""

# ── OpenAI-format tool definitions (used by Groq) ──────────────────────────
OPENAI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_factory_summary",
            "description": "Get overall factory health summary including average health score, risk level, downtime, most vulnerable line, and top critical machines.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_machine_health",
            "description": f"Get detailed health for a specific machine including failure probability, health score, RUL, root cause analysis, and cascade impact. Available machine IDs: {', '.join(ALL_MACHINE_IDS)}",
            "parameters": {
                "type": "object",
                "properties": {
                    "machine_id": {
                        "type": "string",
                        "description": f"Machine ID e.g. CMP-A1, ROB-C1. Available: {', '.join(ALL_MACHINE_IDS)}",
                    }
                },
                "required": ["machine_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "simulate_cascade",
            "description": "Simulate what happens if a machine fails completely. Returns affected machines, downtime, cascade depth.",
            "parameters": {
                "type": "object",
                "properties": {
                    "machine_id": {
                        "type": "string",
                        "description": f"Machine ID to simulate failure for. Available: {', '.join(ALL_MACHINE_IDS)}",
                    }
                },
                "required": ["machine_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_maintenance_priorities",
            "description": "Get ranked maintenance priority list showing which machines to repair first based on failure risk, cascade impact, and production criticality.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_failure_forecast",
            "description": "Get failure prediction forecast for a time horizon. Returns projected failures, health scores, estimated downtime.",
            "parameters": {
                "type": "object",
                "properties": {
                    "hours": {
                        "type": "integer",
                        "description": "Forecast horizon in hours: 6, 12, or 24. Default 24.",
                    }
                },
                "required": [],
            },
        },
    },
]


class CopilotEngine:
    """
    LLM-powered conversational copilot with multi-provider support.
    Priority: Gemini > Groq > Keyword fallback.
    """

    def __init__(self, factory_graph, propagation_engine, risk_engine,
                 decision_engine, forecast_engine, root_cause_engine, scenario_engine):
        self.factory_graph = factory_graph
        self.propagation_engine = propagation_engine
        self.risk_engine = risk_engine
        self.decision_engine = decision_engine
        self.forecast_engine = forecast_engine
        self.root_cause_engine = root_cause_engine
        self.scenario_engine = scenario_engine

        # Conversation context memory
        self.context_manager = ConversationContextManager()

        self.active_providers = []

        # ── Try Groq ───────────────────────────────────
        groq_key = os.environ.get("GROQ_API_KEY")
        if groq_key:
            try:
                from groq import Groq
                self.groq_client = Groq(api_key=groq_key)
                self.groq_model = "llama-3.3-70b-versatile"
                self.active_providers.append("groq")
                print(f"  ✅ GenAI Copilot: Groq connected ({self.groq_model})")
            except Exception as e:
                print(f"  ⚠️  Groq init failed ({e})")

        if not self.active_providers:
            print("  ⚠️  GenAI Copilot: No LLM API key set, using keyword fallback")

        # Tool function map
        self._tool_map = {
            "get_factory_summary": self._tool_factory_summary,
            "get_machine_health": self._tool_machine_health,
            "simulate_cascade": self._tool_simulate_cascade,
            "get_maintenance_priorities": self._tool_maintenance_priorities,
            "get_failure_forecast": self._tool_failure_forecast,
        }

    # ── Main entry points ───────────────────────────────────────────────────

    def chat(self, message: str, session_id: str = None) -> dict:
        """Process a natural language message with optional session context."""
        if session_id:
            self.context_manager.extract_context(session_id, message)
            self.context_manager.add_to_history(session_id, "user", message)

        for provider in self.active_providers:
            if provider == "groq":
                try:
                    result = self._groq_chat(message, session_id)
                    if session_id:
                        self.context_manager.add_to_history(session_id, "assistant", result["response"])
                    return result
                except Exception as e:
                    print(f"Groq chat error: {e}, automatically falling back to next provider...")

        result = self._keyword_chat(message, session_id)
        if session_id:
            self.context_manager.add_to_history(session_id, "assistant", result["response"])
        return result

    def chat_stream(self, message: str, session_id: str = None) -> Generator[str, None, None]:
        """Stream response tokens with optional session context."""
        if session_id:
            self.context_manager.extract_context(session_id, message)
            self.context_manager.add_to_history(session_id, "user", message)

        collected_response = []

        for provider in self.active_providers:
            try:
                if provider == "groq":
                    stream = self._groq_chat_stream(message, session_id)
                else:
                    continue

                # Fetch first chunk to catch rate limits and errors immediately
                first_chunk = next(stream)
                collected_response.append(first_chunk)
                yield first_chunk
                
                # If first chunk succeeded, standard stream loop
                for chunk in stream:
                    collected_response.append(chunk)
                    yield chunk
                    
                if session_id:
                    self.context_manager.add_to_history(session_id, "assistant", "".join(collected_response))
                return # Successfully finished streaming!

            except StopIteration:
                # Generator succeeded but had no items
                if session_id:
                    self.context_manager.add_to_history(session_id, "assistant", "".join(collected_response))
                return
            except Exception as e:
                print(f"{provider} stream failed: {e}. Falling back to next provider...")
                collected_response = []

        result = self._keyword_chat(message, session_id)
        if session_id:
            self.context_manager.add_to_history(session_id, "assistant", result["response"])
        yield result["response"]

    # ── OpenRouter ──────────────────────────────────────────────────────────

    def _build_openrouter_messages(self, message: str, session_id: str = None) -> list:
        """Build the messages array for OpenRouter, including history and context."""
        system_content = SYSTEM_PROMPT
        if session_id:
            context_prompt = self.context_manager.build_context_prompt(session_id)
            if context_prompt:
                system_content += context_prompt

        messages = [{"role": "system", "content": system_content}]

        # Inject conversation history (skip the current message, it's added below)
        if session_id:
            history = self.context_manager.get_history(session_id)
            # Exclude the last entry (the current user message we just added)
            for entry in history[:-1]:
                messages.append({"role": entry["role"], "content": entry["content"]})

        messages.append({"role": "user", "content": message})
        return messages

    def _openrouter_chat(self, message: str, session_id: str = None) -> dict:
        """Chat using OpenRouter with function calling."""
        messages = self._build_openrouter_messages(message, session_id)

        max_rounds = 5
        for _ in range(max_rounds):
            response = self.openrouter_client.chat.completions.create(
                model=self.openrouter_model,
                messages=messages,
                tools=OPENAI_TOOLS,
                tool_choice="auto",
                temperature=0.3,
                max_tokens=2048,
            )

            choice = response.choices[0]

            # If no tool calls, we have the final response
            if choice.finish_reason != "tool_calls" or not choice.message.tool_calls:
                break

            # Add assistant message with tool calls
            messages.append(choice.message)

            # Execute each tool call
            for tc in choice.message.tool_calls:
                args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                result = self._execute_tool(tc.function.name, args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result),
                })

        final_text = choice.message.content or "I wasn't able to generate a response."
        return {"intent": "genai", "response": final_text, "data": {}}

    def _openrouter_chat_stream(self, message: str, session_id: str = None) -> Generator[str, None, None]:
        """Stream using OpenRouter. Handle tool calls first, then stream final response."""
        messages = self._build_openrouter_messages(message, session_id)

        # Phase 1: Handle tool calls (non-streaming)
        max_rounds = 5
        for _ in range(max_rounds):
            response = self.openrouter_client.chat.completions.create(
                model=self.openrouter_model,
                messages=messages,
                tools=OPENAI_TOOLS,
                tool_choice="auto",
                temperature=0.3,
                max_tokens=2048,
            )

            choice = response.choices[0]
            if choice.finish_reason != "tool_calls" or not choice.message.tool_calls:
                break

            messages.append(choice.message)
            for tc in choice.message.tool_calls:
                args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                result = self._execute_tool(tc.function.name, args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result),
                })

        # Phase 2: Stream the final response
        stream = self.openrouter_client.chat.completions.create(
            model=self.openrouter_model,
            messages=messages,
            temperature=0.3,
            max_tokens=2048,
            stream=True,
        )

        for chunk in stream:
            if chunk.choices:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content

    # ── Groq (OpenAI-compatible) ────────────────────────────────────────────

    def _build_groq_messages(self, message: str, session_id: str = None) -> list:
        """Build the messages array for Groq, including history and context."""
        system_content = SYSTEM_PROMPT
        if session_id:
            context_prompt = self.context_manager.build_context_prompt(session_id)
            if context_prompt:
                system_content += context_prompt

        messages = [{"role": "system", "content": system_content}]

        # Inject conversation history (skip the current message, it's added below)
        if session_id:
            history = self.context_manager.get_history(session_id)
            # Exclude the last entry (the current user message we just added)
            for entry in history[:-1]:
                messages.append({"role": entry["role"], "content": entry["content"]})

        messages.append({"role": "user", "content": message})
        return messages

    def _groq_chat(self, message: str, session_id: str = None) -> dict:
        """Chat using Groq with function calling."""
        messages = self._build_groq_messages(message, session_id)

        max_rounds = 5
        for _ in range(max_rounds):
            response = self.groq_client.chat.completions.create(
                model=self.groq_model,
                messages=messages,
                tools=OPENAI_TOOLS,
                tool_choice="auto",
                temperature=0.3,
                max_tokens=2048,
            )

            choice = response.choices[0]

            # If no tool calls, we have the final response
            if choice.finish_reason != "tool_calls" or not choice.message.tool_calls:
                break

            # Add assistant message with tool calls
            messages.append(choice.message)

            # Execute each tool call
            for tc in choice.message.tool_calls:
                args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                result = self._execute_tool(tc.function.name, args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result),
                })

        final_text = choice.message.content or "I wasn't able to generate a response."
        return {"intent": "genai", "response": final_text, "data": {}}

    def _groq_chat_stream(self, message: str, session_id: str = None) -> Generator[str, None, None]:
        """Stream using Groq. Handle tool calls first, then stream final response."""
        messages = self._build_groq_messages(message, session_id)

        # Phase 1: Handle tool calls (non-streaming)
        max_rounds = 5
        for _ in range(max_rounds):
            response = self.groq_client.chat.completions.create(
                model=self.groq_model,
                messages=messages,
                tools=OPENAI_TOOLS,
                tool_choice="auto",
                temperature=0.3,
                max_tokens=2048,
            )

            choice = response.choices[0]
            if choice.finish_reason != "tool_calls" or not choice.message.tool_calls:
                break

            messages.append(choice.message)
            for tc in choice.message.tool_calls:
                args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                result = self._execute_tool(tc.function.name, args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result),
                })

        # Phase 2: Stream the final response
        stream = self.groq_client.chat.completions.create(
            model=self.groq_model,
            messages=messages,
            temperature=0.3,
            max_tokens=2048,
            stream=True,
        )

        for chunk in stream:
            if chunk.choices:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content

    # ── Gemini ──────────────────────────────────────────────────────────────

    def _gemini_chat(self, message: str, session_id: str = None) -> dict:
        """Chat using Gemini with function calling."""
        from google.genai import types

        # Build system instruction with context
        system_instruction = SYSTEM_PROMPT
        if session_id:
            context_prompt = self.context_manager.build_context_prompt(session_id)
            if context_prompt:
                system_instruction += context_prompt

        tools = self._build_gemini_tools()
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            tools=[tools],
        )

        contents = []

        # Inject conversation history
        if session_id:
            history = self.context_manager.get_history(session_id)
            for entry in history[:-1]:  # Exclude current message
                role = "user" if entry["role"] == "user" else "model"
                contents.append(types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=entry["content"])],
                ))

        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=message)]))

        max_rounds = 5
        for _ in range(max_rounds):
            response = self.gemini_client.models.generate_content(
                model=self.gemini_model,
                contents=contents,
                config=config,
            )

            candidate = response.candidates[0]
            parts = candidate.content.parts
            function_calls = [p for p in parts if p.function_call]

            if not function_calls:
                break

            contents.append(candidate.content)

            tool_response_parts = []
            for part in function_calls:
                fc = part.function_call
                tool_result = self._execute_tool(fc.name, dict(fc.args) if fc.args else {})
                tool_response_parts.append(
                    types.Part.from_function_response(name=fc.name, response=tool_result)
                )

            contents.append(types.Content(role="user", parts=tool_response_parts))

        final_text = response.text if response.text else "I wasn't able to generate a response."
        return {"intent": "genai", "response": final_text, "data": {}}

    def _gemini_chat_stream(self, message: str, session_id: str = None) -> Generator[str, None, None]:
        """Stream using Gemini."""
        # Use non-streaming for tool calls, then chunk the final text
        result = self._gemini_chat(message, session_id)
        text = result["response"]
        chunk_size = 15
        for i in range(0, len(text), chunk_size):
            yield text[i:i + chunk_size]

    def _build_gemini_tools(self):
        """Build Gemini-format tool declarations."""
        from google.genai import types
        return types.Tool(function_declarations=[
            types.FunctionDeclaration(
                name="get_factory_summary",
                description="Get overall factory health summary including risk level, health scores, and critical machines.",
                parameters=types.Schema(type="OBJECT", properties={}),
            ),
            types.FunctionDeclaration(
                name="get_machine_health",
                description=f"Get detailed health for a specific machine. Available IDs: {', '.join(ALL_MACHINE_IDS)}",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={"machine_id": types.Schema(type="STRING", description="Machine ID e.g. CMP-A1")},
                    required=["machine_id"],
                ),
            ),
            types.FunctionDeclaration(
                name="simulate_cascade",
                description="Simulate what happens if a machine fails completely.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={"machine_id": types.Schema(type="STRING", description="Machine ID to simulate")},
                    required=["machine_id"],
                ),
            ),
            types.FunctionDeclaration(
                name="get_maintenance_priorities",
                description="Get ranked maintenance priority list.",
                parameters=types.Schema(type="OBJECT", properties={}),
            ),
            types.FunctionDeclaration(
                name="get_failure_forecast",
                description="Get failure prediction forecast for a time horizon (6, 12, or 24 hours).",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={"hours": types.Schema(type="INTEGER", description="Hours: 6, 12, or 24")},
                ),
            ),
        ])

    # ── Tool execution ──────────────────────────────────────────────────────

    def _execute_tool(self, tool_name: str, args: dict) -> dict:
        """Execute a tool call and return the result."""
        try:
            handler = self._tool_map.get(tool_name)
            if not handler:
                return {"error": f"Unknown tool: {tool_name}"}
            if tool_name in ("get_machine_health", "simulate_cascade"):
                return handler(args.get("machine_id", ""))
            elif tool_name == "get_failure_forecast":
                return handler(args.get("hours", 24))
            else:
                return handler()
        except Exception as e:
            return {"error": f"Tool '{tool_name}' failed: {str(e)}"}

    def _tool_factory_summary(self) -> dict:
        summary = self.risk_engine.get_factory_summary()
        critical = self.risk_engine.get_critical_machines(top_n=5)
        return {
            "factory_risk_level": summary["factory_risk_level"],
            "avg_health_score": round(summary["avg_health_score"], 3),
            "estimated_total_downtime_hours": round(summary["estimated_total_downtime_hours"], 1),
            "total_machines": summary.get("total_machines", len(ALL_MACHINE_IDS)),
            "most_vulnerable_line": summary.get("most_vulnerable_line"),
            "critical_machines": [
                {"machine_id": m["id"], "machine_name": get_machine_short_label(m["id"]),
                 "failure_prob": round(m["failure_prob"], 3),
                 "health_score": round(m.get("health_score", 0), 3),
                 "production_line": m.get("production_line", ""), "status": m.get("status", "unknown")}
                for m in critical
            ],
        }

    def _tool_machine_health(self, machine_id: str) -> dict:
        resolved = MACHINE_ID_LOOKUP.get(machine_id.lower().replace("-", ""))
        if not resolved:
            resolved = MACHINE_ID_LOOKUP.get(machine_id.lower())
        if not resolved:
            return {"error": f"Machine '{machine_id}' not found. Available: {', '.join(ALL_MACHINE_IDS)}"}

        machine = self.factory_graph.get_machine(resolved)
        if not machine:
            return {"error": f"Machine '{resolved}' not found in factory graph."}

        result = {
            "machine_id": resolved, "machine_name": get_machine_short_label(resolved),
            "machine_type": machine.get("machine_type", "Unknown"),
            "production_line": machine.get("production_line", "Unknown"),
            "failure_prob": round(machine.get("failure_prob", 0), 3),
            "health_score": round(machine.get("health_score", 1), 3),
            "predicted_rul": machine.get("predicted_rul", "N/A"),
            "status": machine.get("status", "unknown"),
        }

        try:
            rc = self.root_cause_engine.analyze(resolved)
            if rc and rc.get("probable_causes"):
                result["root_causes"] = [
                    {"cause": c["cause"], "relevance": c.get("relevance", "medium")}
                    for c in rc["probable_causes"][:4]
                ]
                result["root_cause_confidence"] = round(rc.get("confidence", 0), 2)
            if rc and rc.get("trend_summary"):
                result["sensor_trends"] = rc["trend_summary"][:3]
        except Exception:
            pass

        try:
            cascade = self.propagation_engine.simulate_cascade(
                resolved, failure_prob=machine.get("failure_prob", 0.5), apply_to_graph=False
            )
            result["cascade_affected_count"] = len(cascade.affected_machines)
            result["cascade_downtime_hours"] = round(cascade.total_downtime_hours, 1)
        except Exception:
            pass

        return result

    def _tool_simulate_cascade(self, machine_id: str) -> dict:
        resolved = MACHINE_ID_LOOKUP.get(machine_id.lower().replace("-", ""))
        if not resolved:
            resolved = MACHINE_ID_LOOKUP.get(machine_id.lower())
        if not resolved:
            return {"error": f"Machine '{machine_id}' not found. Available: {', '.join(ALL_MACHINE_IDS)}"}

        machine = self.factory_graph.get_machine(resolved)
        if not machine:
            return {"error": f"Machine '{resolved}' not found."}

        cascade = self.propagation_engine.simulate_cascade(resolved, failure_prob=1.0, apply_to_graph=False)
        return {
            "source_machine": resolved, "source_name": get_machine_short_label(resolved),
            "affected_count": len(cascade.affected_machines),
            "total_downtime_hours": round(cascade.total_downtime_hours, 1),
            "max_cascade_depth": cascade.max_cascade_depth,
            "affected_machines": [
                {"machine_id": am.machine_id, "machine_name": get_machine_short_label(am.machine_id),
                 "cascade_risk": round(am.cascade_risk, 3), "combined_risk": round(am.combined_risk, 3)}
                for am in cascade.affected_machines
            ],
        }

    def _tool_maintenance_priorities(self) -> dict:
        priorities = self.decision_engine.compute_priorities()
        return {"maintenance_priorities": [
            {"machine_id": d["machine_id"], "machine_name": get_machine_short_label(d["machine_id"]),
             "priority_score": round(d["priority_score"], 2), "urgency": d["urgency"],
             "failure_prob": round(d["failure_prob"], 3),
             "prevented_downtime_hours": round(d["prevented_downtime_hours"], 1),
             "production_line": d.get("production_line", ""),
             "actions": d.get("actions", [])[:3]}
            for d in priorities[:7]
        ]}

    def _tool_failure_forecast(self, hours: int = 24) -> dict:
        if not isinstance(hours, int) or hours not in (6, 12, 24):
            hours = 24
        forecast = self.forecast_engine.forecast_factory(hours=hours)
        machines = forecast.get("machines", [])

        likely = [
            {"machine_id": m["machine_id"], "machine_name": get_machine_short_label(m["machine_id"]),
             "projected_failure_prob": round(m.get("projected_failure_prob", 0), 3),
             "production_line": m.get("production_line", "")}
            for m in machines if m.get("projected_failure_prob", 0) >= 0.5
        ]

        return {
            "horizon_hours": hours,
            "avg_health": round(forecast.get("avg_health", 0), 3),
            "total_at_risk": len(likely),
            "estimated_downtime_hours": round(forecast.get("estimated_downtime_hours", 0), 1),
            "most_vulnerable_line": forecast.get("most_vulnerable_line"),
            "likely_failures": sorted(likely, key=lambda x: x["projected_failure_prob"], reverse=True)[:8],
        }

    # ── Keyword-based fallback ──────────────────────────────────────────────

    def _keyword_chat(self, message: str, session_id: str = None) -> dict:
        msg = message.lower().strip()
        factory_keywords = ["machine", "fail", "risk", "health", "cascade", "maintenance",
                            "repair", "fix", "forecast", "predict", "line", "factory",
                            "compressor", "press", "cnc", "robot", "conveyor", "downtime",
                            "rul", "sensor", "status", "priority",
                            "which", "highest", "most", "worst", "best", "critical",
                            "upgrade", "replace"]
        if not any(kw in msg for kw in factory_keywords):
            # Check if there's session context that makes this a valid follow-up
            has_context = False
            if session_id:
                ctx = self.context_manager.get_context(session_id)
                has_context = any(v for v in ctx.values())
            if not has_context:
                return {
                    "intent": "out_of_scope",
                    "response": "I am the CascadeGuard factory reliability assistant. I can only answer questions about machine health, failures, and factory risk.",
                    "data": {},
                }

        if any(w in msg for w in ["what happens if", "cascade", "downstream", "propagat"]):
            mid = self._extract_machine_id(msg)
            if mid:
                data = self._tool_simulate_cascade(mid)
                return {"intent": "cascade", "response": self._format_cascade(data), "data": data}

        if any(w in msg for w in ["repair first", "fix first", "priority", "maintenance"]):
            data = self._tool_maintenance_priorities()
            return {"intent": "maintenance", "response": self._format_maintenance(data), "data": data}

        if any(w in msg for w in ["forecast", "predict", "next 24", "next 12", "future", "will fail"]):
            hours = 24
            if "next 6" in msg or "6 hour" in msg: hours = 6
            elif "next 12" in msg or "12 hour" in msg: hours = 12
            data = self._tool_failure_forecast(hours)
            return {"intent": "forecast", "response": self._format_forecast(data), "data": data}

        mid = self._extract_machine_id(msg)
        if mid:
            data = self._tool_machine_health(mid)
            return {"intent": "machine_health", "response": self._format_machine(data), "data": data}

        data = self._tool_factory_summary()
        return {"intent": "factory_health", "response": self._format_summary(data), "data": data}

    def _extract_machine_id(self, msg: str) -> str | None:
        import re
        pattern = r'\b([a-z]{3})-?([a-z])(\d)\b'
        match = re.search(pattern, msg, re.IGNORECASE)
        if match:
            candidate = f"{match.group(1).upper()}-{match.group(2).upper()}{match.group(3)}"
            if candidate in MACHINE_ID_LOOKUP.values():
                return candidate
        for mid_lower, mid_canonical in MACHINE_ID_LOOKUP.items():
            if mid_lower in msg:
                return mid_canonical
        return None

    # ── Fallback formatters ─────────────────────────────────────────────────

    def _format_summary(self, data: dict) -> str:
        lines = [f"📊 **Factory Health Overview**\n",
                 f"Risk level: **{data['factory_risk_level'].upper()}** | "
                 f"Average health: **{data['avg_health_score']:.0%}** | "
                 f"Est. downtime: **{data['estimated_total_downtime_hours']:.1f}h**\n"]
        vl = data.get("most_vulnerable_line")
        if vl:
            lines.append(f"\nMost vulnerable: **{vl['name']}** ({vl['avg_failure_prob']:.0%} avg risk)\n")
        if data.get("critical_machines"):
            lines.append("\n**Critical machines:**\n")
            for i, m in enumerate(data["critical_machines"][:5]):
                lines.append(f"{i+1}. **{m['machine_name']}** — {m['failure_prob']:.0%} failure risk\n")
        return "".join(lines)

    def _format_machine(self, data: dict) -> str:
        if data.get("error"): return data["error"]
        lines = [f"🔍 **{data['machine_name']}** ({data['machine_id']})\n\n",
                 f"• Health: **{data['health_score']:.0%}** | Failure risk: **{data['failure_prob']:.0%}**\n",
                 f"• RUL: **{data['predicted_rul']}** cycles | Status: **{data['status']}**\n"]
        if data.get("root_causes"):
            lines.append(f"\n**Root causes** (confidence: {data['root_cause_confidence']:.0%}):\n")
            for c in data["root_causes"]:
                lines.append(f"• {c['cause']}\n")
        if data.get("cascade_affected_count"):
            lines.append(f"\nCascade impact: **{data['cascade_affected_count']}** downstream, "
                         f"**{data['cascade_downtime_hours']:.1f}h** downtime\n")
        return "".join(lines)

    def _format_cascade(self, data: dict) -> str:
        if data.get("error"): return data["error"]
        lines = [f"🌊 **Cascade Impact — {data['source_name']}**\n\n",
                 f"• **{data['affected_count']}** machines affected\n",
                 f"• **{data['total_downtime_hours']:.1f}h** total downtime\n",
                 f"• Max depth: **{data['max_cascade_depth']}**\n"]
        if data.get("affected_machines"):
            lines.append("\n**Affected:**\n")
            for am in data["affected_machines"][:6]:
                lines.append(f"• {am['machine_name']} — {am['combined_risk']:.0%} risk\n")
        return "".join(lines)

    def _format_maintenance(self, data: dict) -> str:
        lines = ["🔧 **Maintenance Priority Ranking**\n\n"]
        for i, d in enumerate(data.get("maintenance_priorities", [])[:5]):
            lines.append(f"{i+1}. **{d['machine_name']}** — score: {d['priority_score']:.2f}, "
                         f"urgency: **{d['urgency']}**, prevented downtime: {d['prevented_downtime_hours']:.1f}h\n")
        return "".join(lines)

    def _format_forecast(self, data: dict) -> str:
        lines = [f"📈 **{data['horizon_hours']}h Failure Forecast**\n\n",
                 f"• Avg health: **{data['avg_health']:.0%}**\n",
                 f"• Machines at risk: **{data['total_at_risk']}**\n",
                 f"• Est. downtime: **{data['estimated_downtime_hours']:.1f}h**\n"]
        if data.get("likely_failures"):
            lines.append("\n**Machines predicted to fail:**\n")
            for m in data["likely_failures"][:5]:
                lines.append(f"• {m['machine_name']} — {m['projected_failure_prob']:.0%} failure risk\n")
        return "".join(lines)

    # ── Public helpers ──────────────────────────────────────────────────────

    def get_suggestions(self) -> list[str]:
        critical = self.risk_engine.get_critical_machines(top_n=1)
        suggestions = list(SUGGESTED_PROMPTS)
        if critical:
            suggestions[1] = f"Why is {get_machine_short_label(critical[0]['id'])} at risk?"
        return suggestions
