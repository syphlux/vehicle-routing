import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from models import SolveRequest, SolveResponse, RouteOutput, StopOutput
import osrm
from routing import solve_vrp

app = FastAPI(title="Vehicle Routing Problem Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def index():
    return FileResponse("static/index.html")


@app.post("/solve", response_model=SolveResponse)
async def solve(request: SolveRequest):
    if not request.vehicles:
        raise HTTPException(status_code=400, detail="At least one vehicle required")
    if not request.deliveries:
        raise HTTPException(status_code=400, detail="At least one delivery required")

    V = len(request.vehicles)

    # Flat coords list: [depot_0..depot_V-1, pickup_0, dropoff_0, pickup_1, dropoff_1, ...]
    all_coords: list[tuple[float, float]] = [(v.lat, v.lon) for v in request.vehicles]
    for d in request.deliveries:
        all_coords.append((d.pickup_lat, d.pickup_lon))
        all_coords.append((d.dropoff_lat, d.dropoff_lon))

    # Fetch OSRM duration matrix
    duration_matrix = await osrm.get_duration_matrix(all_coords)

    # Run VRP solver in thread pool (OR-Tools is CPU-bound)
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, solve_vrp, request, duration_matrix)

    vehicle_routes: list[list[int]] = result["vehicle_routes"]
    unassigned_ids: list[str] = result["unassigned_delivery_ids"]

    # Build route outputs + fetch road geometries in parallel
    async def build_route(v_idx: int, route_nodes: list[int]) -> RouteOutput:
        vehicle = request.vehicles[v_idx]

        stops: list[StopOutput] = [
            StopOutput(type="start", lat=vehicle.lat, lon=vehicle.lon)
        ]
        for node in route_nodes:
            delivery_i = (node - V) // 2
            is_pickup = (node - V) % 2 == 0
            delivery = request.deliveries[delivery_i]
            if is_pickup:
                stops.append(StopOutput(
                    type="pickup",
                    delivery_id=delivery.id,
                    lat=delivery.pickup_lat,
                    lon=delivery.pickup_lon,
                ))
            else:
                stops.append(StopOutput(
                    type="dropoff",
                    delivery_id=delivery.id,
                    lat=delivery.dropoff_lat,
                    lon=delivery.dropoff_lon,
                ))
        stops.append(StopOutput(type="end", lat=vehicle.lat, lon=vehicle.lon))

        if route_nodes:
            stop_coords = [(s.lat, s.lon) for s in stops]
            geometry, distance_m, duration_s = await osrm.get_route_geometry(stop_coords)
        else:
            geometry = [[vehicle.lat, vehicle.lon]]
            distance_m = 0.0
            duration_s = 0.0

        return RouteOutput(
            vehicle_id=vehicle.id,
            capacity=vehicle.capacity,
            stops=stops,
            geometry=geometry,
            distance_m=distance_m,
            duration_s=duration_s,
        )

    routes = list(await asyncio.gather(
        *[build_route(i, nodes) for i, nodes in enumerate(vehicle_routes)]
    ))

    if not unassigned_ids:
        solver_status = "OPTIMAL"
    elif len(unassigned_ids) == len(request.deliveries):
        solver_status = "NO_SOLUTION"
    else:
        solver_status = "PARTIAL"

    return SolveResponse(
        routes=routes,
        unassigned_delivery_ids=unassigned_ids,
        solver_status=solver_status,
    )


app.mount("/static", StaticFiles(directory="static"), name="static")
