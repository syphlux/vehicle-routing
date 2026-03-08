# SplitFleet

**Live demo → [www.splitfleet.cc](https://www.splitfleet.cc)**

SplitFleet is an interactive vehicle routing optimizer that solves real-world pickup & delivery problems in seconds. Place vehicles and deliveries on a map, hit **Generate Routes**, and get optimal, capacity-aware routes drawn on real road geometry — no configuration files, no setup, no friction.

---

## What it does

Given a fleet of vehicles (each with its own depot and capacity) and a set of pickup/delivery pairs, SplitFleet finds the assignment and ordering of stops that minimizes total travel time across all vehicles — a problem known as the **Vehicle Routing Problem with Pickup and Delivery (VRPPD)**.

- Each vehicle starts and ends at its own depot
- Each delivery has a distinct pickup location and dropoff location
- A vehicle must visit the pickup before the dropoff, in the same route
- Vehicle capacity is respected — no vehicle exceeds its package limit
- If a delivery is genuinely infeasible, it is flagged as unassigned rather than silently dropped

---

## Features

- **Interactive map** — click to place vehicles and pickup/delivery pairs anywhere on the map
- **Real road routing** — routes follow actual roads via the OSRM routing engine, not straight lines
- **Capacity constraints** — configure each vehicle's package capacity independently
- **Animated routes** — each vehicle's route is color-coded and animated on the map
- **Hover highlight** — hover a route in the sidebar to isolate it on the map, dimming all others
- **Detailed / simplified view** — toggle between road geometry and straight-line segments
- **Land detection** — prevents placing stops in water using reverse geocoding
- **Export results** — download the full solution as JSON
- **Solver status** — reports whether the solution is optimal, partial, or infeasible
- **New route flow** — re-solve with the same stops or start fresh

---

## Tech stack

| Layer | Technology |
|---|---|
| Solver | [Google OR-Tools](https://developers.google.com/optimization) — VRPPD with GLS metaheuristic |
| Backend | Python · FastAPI · Uvicorn |
| Routing engine | [OSRM](http://project-osrm.org/) — real road distances & geometry |
| Frontend | Vanilla JS · [Leaflet.js](https://leafletjs.com/) |
| Maps | OpenStreetMap · CARTO tiles |
| Infrastructure | AWS EC2 · Nginx |

No frontend framework, no database, no external dependencies beyond OR-Tools and FastAPI. The solver runs in a thread pool to keep the async API non-blocking.

---

## How the solver works

1. **Distance matrix** — OSRM's Table API computes travel times between all nodes (depots + pickups + dropoffs) in a single request
2. **Model** — nodes are indexed as `0..V-1` (depots), `V+2i` (pickup i), `V+2i+1` (dropoff i)
3. **Constraints** — pickup before dropoff, same vehicle, capacity dimension
4. **First solution** — `PARALLEL_CHEAPEST_INSERTION` for a fast feasible starting point
5. **Improvement** — `GUIDED_LOCAL_SEARCH` metaheuristic refines until no improvement for 3 seconds (hard cap: 30s)
6. **Geometry** — per-route road geometry fetched from OSRM's Route API

---

## API

The backend exposes a single endpoint:

```
POST /solve
```

```json
{
  "vehicles": [
    { "id": "vehicle1", "lat": 36.75, "lon": 3.05, "capacity": 3 }
  ],
  "deliveries": [
    {
      "id": "stop1",
      "pickup_lat": 36.76, "pickup_lon": 3.06,
      "dropoff_lat": 36.74, "dropoff_lon": 3.04
    }
  ]
}
```

Response includes per-vehicle routes with full stop sequences, road geometry, distance (meters), duration (seconds), and any unassigned delivery IDs.

---

## Run locally

```bash
git clone https://github.com/YOUR_USERNAME/vehicle-routing.git
cd vehicle-routing
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload
# open http://localhost:8000
```

---

## Known limitations

- OSRM public server does not account for real-time traffic (static road network)
- Public OSRM instance supports ~100 nodes per request
- No authentication or rate limiting on the `/solve` endpoint
