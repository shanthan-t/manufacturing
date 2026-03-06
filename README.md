# Vortex — AI Failure Propagation Intelligence Platform

An AI-powered manufacturing intelligence system that predicts machine failures and simulates cascade failure propagation across a factory dependency graph.

## Quick Start

### 1. Backend
```bash
cd backend
source ../venv/bin/activate
python run.py
```
The backend starts at `http://localhost:8000`. On first run it generates synthetic NASA Turbofan data and trains the ML model (~3s).

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
The dashboard opens at `http://localhost:5173`.

## Architecture

```
Data Layer → Feature Engineering → XGBoost Model → Factory Graph → Propagation Engine → Dashboard
```

- **20 machines** across **4 production lines** with inter-line dependencies
- **XGBoost RUL predictor** trained on NASA Turbofan-style sensor data
- **BFS cascade simulation** with weighted edge propagation
- **D3.js force-directed graph** with real-time cascade animation

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/machines` | All machines with health |
| GET | `/api/machines/{id}` | Machine detail + sensors |
| GET | `/api/graph` | D3.js-ready graph data |
| POST | `/api/simulate` | Cascade failure simulation |
| POST | `/api/simulate/reset` | Reset to predicted state |
| GET | `/api/risk/summary` | Factory risk summary |
| GET | `/api/risk/critical` | Top critical machines |
| GET | `/api/risk/impact` | Highest impact analysis |

## Tech Stack

- **Backend**: Python, FastAPI, XGBoost, NetworkX, Pandas
- **Frontend**: React, Vite, D3.js
- **ML Model**: XGBoost regressor for Remaining Useful Life prediction
