"""
CascadeGuard — AI Failure Propagation Intelligence Platform
FastAPI main application entry point.
"""
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.data.loader import load_dataset, get_last_cycle_per_unit
from app.data.preprocessor import DataPreprocessor
from app.data.data_manager import DataManager
from app.ml.trainer import RULTrainer
from app.ml.predictor import HealthPredictor
from app.graph.factory_graph import FactoryGraph
from app.graph.propagation import PropagationEngine
from app.intelligence.risk_engine import RiskEngine
from app.intelligence.decision_engine import DecisionEngine
from app.intelligence.forecast_engine import ForecastEngine
from app.intelligence.root_cause_engine import RootCauseEngine
from app.intelligence.scenario_engine import ScenarioEngine
from app.intelligence.insight_generator import InsightGenerator
from app.intelligence.copilot_engine import CopilotEngine
from app.config import FACTORY_LINES, MODEL_PATH

# Global application state
app_state: dict = {}


async def reinitialize_system(train_df, test_df, rul_df):
    """
    Re-initialize all system components with new data.
    Called when switching data sources (synthetic <-> real).

    When in 'real' mode, builds a dynamic factory graph from uploaded machine IDs.
    When in 'synthetic' mode, uses the hardcoded FACTORY_LINES config.
    """
    print("\n" + "=" * 60)
    print("  CascadeGuard — Re-initializing with new data source")
    print("=" * 60 + "\n")

    start = time.time()

    # Ensure train_df has RUL column (needed for model training)
    if "RUL" not in train_df.columns:
        max_cycles = train_df.groupby("unit_id")["cycle"].max().reset_index()
        max_cycles.columns = ["unit_id", "max_cycle"]
        train_df = train_df.merge(max_cycles, on="unit_id", how="left")
        train_df["RUL"] = train_df["max_cycle"] - train_df["cycle"]
        train_df.drop("max_cycle", axis=1, inplace=True)

    app_state["train_df"] = train_df

    # 1. Preprocess
    print("[1/7] Preprocessing data...")
    preprocessor = DataPreprocessor()
    train_processed = preprocessor.fit_transform(train_df)
    test_processed = preprocessor.transform(test_df)

    # 2. Train model
    print("[2/7] Training ML model on new data...")
    trainer = RULTrainer()
    X_train, y_train = preprocessor.get_features_and_target(train_processed)
    trainer.train(X_train, y_train)

    # 3. Build factory graph and predict health
    print("[3/7] Building factory graph and predicting machine health...")

    data_manager = app_state.get("data_manager")
    is_real_data = data_manager and data_manager.mode == "real"

    factory_graph = FactoryGraph()

    if is_real_data:
        # Dynamic graph: build from uploaded machine data
        machine_id_map = data_manager.adapter.get_machine_id_map()
        original_machine_ids = list(machine_id_map.keys())
        factory_graph.build_from_data(original_machine_ids, machine_id_map)
        print(f"  Built dynamic graph: {len(original_machine_ids)} machines from uploaded data")

        # Reverse map: unit_id -> graph node ID (the original machine ID string)
        unit_to_node = {v: k for k, v in machine_id_map.items()}
    else:
        # Static graph: use FACTORY_LINES config
        unit_to_node = {}
        for line in FACTORY_LINES:
            for machine in line["machines"]:
                unit_to_node[machine["unit_id"]] = machine["id"]

    predictor = HealthPredictor(model=trainer.model)

    last_cycle_train = get_last_cycle_per_unit(train_df)
    last_cycle_processed = preprocessor.transform(last_cycle_train)

    original_health = {}
    for _, row in last_cycle_processed.iterrows():
        unit_id = int(row["unit_id"])
        node_id = unit_to_node.get(unit_id)
        if node_id and node_id in factory_graph.graph:
            features = row[preprocessor.feature_columns].values.reshape(1, -1)
            health = predictor.predict_single(features)
            health_update = {
                "health_score": health["health_score"],
                "failure_prob": health["failure_prob"],
                "predicted_rul": health["predicted_rul"],
                "risk_level": health["risk_level"],
                "status": "operational" if health["failure_prob"] < 0.3 else (
                    "warning" if health["failure_prob"] < 0.5 else (
                        "degraded" if health["failure_prob"] < 0.8 else "critical"
                    )
                ),
            }
            factory_graph.update_machine_health(node_id, health_update)
            original_health[node_id] = health_update.copy()

    # 4. Set up engines
    print("[4/7] Initializing propagation and risk engines...")
    propagation_engine = PropagationEngine(factory_graph)
    risk_engine = RiskEngine(factory_graph, propagation_engine)

    app_state["preprocessor"] = preprocessor
    app_state["predictor"] = predictor
    app_state["factory_graph"] = factory_graph
    app_state["propagation_engine"] = propagation_engine
    app_state["risk_engine"] = risk_engine
    app_state["original_health"] = original_health

    print("[5/7] Initializing decision and forecast engines...")
    decision_engine = DecisionEngine(factory_graph, propagation_engine)
    app_state["decision_engine"] = decision_engine

    forecast_engine = ForecastEngine(factory_graph, propagation_engine)
    app_state["forecast_engine"] = forecast_engine

    print("[6/7] Initializing root cause and scenario engines...")
    root_cause_engine = RootCauseEngine(
        model=trainer.model,
        preprocessor=preprocessor,
        train_df=train_df,
        feature_columns=preprocessor.feature_columns,
    )
    app_state["root_cause_engine"] = root_cause_engine

    scenario_engine = ScenarioEngine(factory_graph, propagation_engine)
    app_state["scenario_engine"] = scenario_engine

    print("[7/7] Initializing AI engines...")
    insight_generator = InsightGenerator(factory_graph, propagation_engine, risk_engine)
    app_state["insight_generator"] = insight_generator

    copilot_engine = CopilotEngine(
        factory_graph=factory_graph,
        propagation_engine=propagation_engine,
        risk_engine=risk_engine,
        decision_engine=decision_engine,
        forecast_engine=forecast_engine,
        root_cause_engine=root_cause_engine,
        scenario_engine=scenario_engine,
    )
    app_state["copilot_engine"] = copilot_engine

    elapsed = time.time() - start
    summary = risk_engine.get_factory_summary()
    mode_label = data_manager.mode if data_manager else "synthetic"
    print(f"\n{'=' * 60}")
    print(f"  CascadeGuard — Re-initialized ({elapsed:.1f}s)")
    print(f"  Machines: {len(factory_graph.get_all_machines())}")
    print(f"  Factory Health: {summary['avg_health_score']:.1%}")
    print(f"  Data Source: {mode_label}")
    print(f"{'=' * 60}\n")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize all components on startup."""
    print("\n" + "=" * 60)
    print("  CascadeGuard — Initializing System")
    print("=" * 60 + "\n")

    start = time.time()

    # 0. Initialize data manager
    print("[0/11] Initializing Data Manager...")
    data_manager = DataManager()
    app_state["data_manager"] = data_manager

    # 1. Load data (synthetic by default)
    print("[1/11] Loading dataset...")
    train_df, test_df, rul_df = data_manager.load_synthetic()
    app_state["train_df"] = train_df

    # 2. Preprocess
    print("[2/11] Preprocessing data...")
    preprocessor = DataPreprocessor()
    train_processed = preprocessor.fit_transform(train_df)
    test_processed = preprocessor.transform(test_df)

    # 3. Train or load model
    print("[3/11] Setting up ML model...")
    trainer = RULTrainer()

    if MODEL_PATH.exists():
        trainer.load()
    else:
        X_train, y_train = preprocessor.get_features_and_target(train_processed)
        trainer.train(X_train, y_train)
        trainer.save()

    # 4. Build factory graph and predict health
    print("[4/11] Building factory graph and predicting machine health...")
    factory_graph = FactoryGraph()
    predictor = HealthPredictor(model=trainer.model)

    # Get last cycle data for each unit (most recent sensor readings)
    last_cycle_train = get_last_cycle_per_unit(train_df)
    last_cycle_processed = preprocessor.transform(last_cycle_train)

    # Map unit IDs to machine IDs and predict health
    unit_to_machine = {}
    for line in FACTORY_LINES:
        for machine in line["machines"]:
            unit_to_machine[machine["unit_id"]] = machine["id"]

    original_health = {}
    for _, row in last_cycle_processed.iterrows():
        unit_id = int(row["unit_id"])
        machine_id = unit_to_machine.get(unit_id)
        if machine_id:
            features = row[preprocessor.feature_columns].values.reshape(1, -1)
            health = predictor.predict_single(features)
            health_update = {
                "health_score": health["health_score"],
                "failure_prob": health["failure_prob"],
                "predicted_rul": health["predicted_rul"],
                "risk_level": health["risk_level"],
                "status": "operational" if health["failure_prob"] < 0.3 else (
                    "warning" if health["failure_prob"] < 0.5 else (
                        "degraded" if health["failure_prob"] < 0.8 else "critical"
                    )
                ),
            }
            factory_graph.update_machine_health(machine_id, health_update)
            original_health[machine_id] = health_update.copy()

    # 5. Set up propagation and risk engines
    print("[5/11] Initializing propagation and risk engines...")
    propagation_engine = PropagationEngine(factory_graph)
    risk_engine = RiskEngine(factory_graph, propagation_engine)

    # Store in app state
    app_state["preprocessor"] = preprocessor
    app_state["predictor"] = predictor
    app_state["factory_graph"] = factory_graph
    app_state["propagation_engine"] = propagation_engine
    app_state["risk_engine"] = risk_engine
    app_state["original_health"] = original_health

    # 6. Set up decision engine
    print("[6/11] Initializing maintenance decision engine...")
    decision_engine = DecisionEngine(factory_graph, propagation_engine)
    app_state["decision_engine"] = decision_engine

    # 7. Set up forecast engine
    print("[7/11] Initializing forecast engine...")
    forecast_engine = ForecastEngine(factory_graph, propagation_engine)
    app_state["forecast_engine"] = forecast_engine

    # 8. Set up root cause engine
    print("[8/11] Initializing root cause analysis engine...")
    root_cause_engine = RootCauseEngine(
        model=trainer.model,
        preprocessor=preprocessor,
        train_df=train_df,
        feature_columns=preprocessor.feature_columns,
    )
    app_state["root_cause_engine"] = root_cause_engine

    # 9. Set up scenario engine
    print("[9/11] Initializing what-if scenario engine...")
    scenario_engine = ScenarioEngine(factory_graph, propagation_engine)
    app_state["scenario_engine"] = scenario_engine

    # 10. Set up AI insight generator
    print("[10/11] Initializing AI insight generator...")
    insight_generator = InsightGenerator(factory_graph, propagation_engine, risk_engine)
    app_state["insight_generator"] = insight_generator

    # 11. Set up GenAI copilot
    print("[11/11] Initializing GenAI Factory Copilot...")
    copilot_engine = CopilotEngine(
        factory_graph=factory_graph,
        propagation_engine=propagation_engine,
        risk_engine=risk_engine,
        decision_engine=decision_engine,
        forecast_engine=forecast_engine,
        root_cause_engine=root_cause_engine,
        scenario_engine=scenario_engine,
    )
    app_state["copilot_engine"] = copilot_engine

    elapsed = time.time() - start
    print(f"\n{'=' * 60}")
    print(f"  CascadeGuard — System Ready ({elapsed:.1f}s) — 12 modules")
    print(f"  Machines: {len(factory_graph.get_all_machines())}")
    summary = risk_engine.get_factory_summary()
    print(f"  Factory Health: {summary['avg_health_score']:.1%}")
    print(f"  Risk Level: {summary['factory_risk_level'].upper()}")
    print(f"  Data Source: {data_manager.mode}")
    print(f"{'=' * 60}\n")

    yield

    # Cleanup
    app_state.clear()


# Create FastAPI app
app = FastAPI(
    title="CascadeGuard",
    description="AI Failure Propagation Intelligence Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
from app.api.routes_health import router as health_router
from app.api.routes_graph import router as graph_router
from app.api.routes_simulate import router as simulate_router
from app.api.routes_maintenance import router as maintenance_router
from app.api.routes_forecast import router as forecast_router
from app.api.routes_rootcause import router as rootcause_router
from app.api.routes_scenario import router as scenario_router
from app.api.routes_insights import router as insights_router
from app.api.routes_copilot import router as copilot_router
from app.api.routes_data import router as data_router

app.include_router(health_router)
app.include_router(graph_router)
app.include_router(simulate_router)
app.include_router(maintenance_router)
app.include_router(forecast_router)
app.include_router(rootcause_router)
app.include_router(scenario_router)
app.include_router(insights_router)
app.include_router(copilot_router)
app.include_router(data_router)


@app.get("/")
async def root():
    return {
        "name": "CascadeGuard",
        "version": "1.0.0",
        "description": "AI Failure Propagation Intelligence Platform",
        "status": "operational",
    }


@app.get("/api/health")
async def health_check():
    """API health check."""
    return {
        "status": "healthy",
        "components": {
            "model": app_state.get("predictor") is not None,
            "graph": app_state.get("factory_graph") is not None,
            "propagation": app_state.get("propagation_engine") is not None,
            "data_manager": app_state.get("data_manager") is not None,
        },
    }
