import logging
import time
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from models import SolveRequest

logger = logging.getLogger(__name__)


def solve_vrp(request: SolveRequest, duration_matrix: list[list[int]]) -> dict:
    """
    Solves a pickup/delivery VRP with vehicle capacity constraints.

    Node layout in the routing model:
      0 .. V-1       → vehicle start/end depots (one per vehicle)
      V + 2*i        → pickup for delivery i
      V + 2*i + 1    → dropoff for delivery i

    Returns:
      {
        "vehicle_routes": [[node, ...], ...],  # non-depot nodes only, one list per vehicle
        "unassigned_delivery_ids": [str, ...]
      }
    """
    V = len(request.vehicles)
    D = len(request.deliveries)

    manager = pywrapcp.RoutingIndexManager(
        V + 2 * D,
        V,
        list(range(V)),  # starts
        list(range(V)),  # ends
    )
    routing = pywrapcp.RoutingModel(manager)

    # --- Arc cost: travel duration (seconds) ---
    def duration_callback(from_index, to_index):
        f = manager.IndexToNode(from_index)
        t = manager.IndexToNode(to_index)
        return duration_matrix[f][t]

    transit_cb = routing.RegisterTransitCallback(duration_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_cb)
    
    
    

    # --- Capacity dimension (+1 at pickup, -1 at dropoff, 0 at depots) ---
    def demand_callback(from_index):
        node = manager.IndexToNode(from_index)
        if node < V:
            return 0  # depot
        offset = node - V
        return 1 if offset % 2 == 0 else -1  # even = pickup, odd = dropoff

    demand_cb = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_cb,
        0,  # null capacity slack
        [v.capacity for v in request.vehicles],
        True,  # start cumul to zero
        "Capacity",
    )
    
    # duration dimension (for potential use in advanced constraints or objective)
    routing.AddDimension(
        transit_cb,
        0,  # no slack
        300000,  # large max duration to not constrain routes
        True,  # start cumul to zero
        "Duration",
    )
    
    duration_dimension = routing.GetDimensionOrDie("Duration")
    duration_dimension.SetGlobalSpanCostCoefficient(100)  # encourage shorter routes
    
    

    # --- Pickup/delivery pairing constraints ---
    # Each pair is optional: solver may skip both nodes but pays a high penalty,
    # so skipping only happens when a delivery is genuinely infeasible (e.g. cross-water).
    SKIP_PENALTY = 100_000_000  # >> any realistic arc cost (seconds)
    for i in range(D):
        pickup_idx = manager.NodeToIndex(V + 2 * i)
        dropoff_idx = manager.NodeToIndex(V + 2 * i + 1)
        routing.AddPickupAndDelivery(pickup_idx, dropoff_idx)
        routing.solver().Add(
            routing.VehicleVar(pickup_idx) == routing.VehicleVar(dropoff_idx)
        )
        routing.AddDisjunction([pickup_idx], SKIP_PENALTY)
        routing.AddDisjunction([dropoff_idx], SKIP_PENALTY)

    # --- Search parameters ---
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH 
    )
    search_params.time_limit.seconds = 30  # hard cap

    NO_IMPROVE_SECONDS = 3
    best = [float("inf")]
    last_improvement = [time.time()]

    def on_solution_callback():
        objective = routing.CostVar().Value()
        if objective < best[0]:
            best[0] = objective
            last_improvement[0] = time.time()
            logger.info(f"New best solution: {objective}s total duration")
        elif time.time() - last_improvement[0] > NO_IMPROVE_SECONDS:
            logger.info("No improvement for %ds — stopping search", NO_IMPROVE_SECONDS)
            routing.solver().FinishCurrentSearch()

    routing.AddAtSolutionCallback(on_solution_callback)

    solution = routing.SolveWithParameters(search_params)

    if not solution:
        return {
            "vehicle_routes": [[] for _ in range(V)],
            "unassigned_delivery_ids": [d.id for d in request.deliveries],
        }

    # --- Extract routes ---
    vehicle_routes: list[list[int]] = []
    visited_deliveries: set[int] = set()

    for v in range(V):
        route_nodes: list[int] = []
        index = routing.Start(v)
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node >= V:  # skip depot nodes
                route_nodes.append(node)
                delivery_i = (node - V) // 2
                if (node - V) % 2 == 0:  # pickup
                    visited_deliveries.add(delivery_i)
            index = solution.Value(routing.NextVar(index))
        vehicle_routes.append(route_nodes)

    unassigned = [
        request.deliveries[i].id
        for i in range(D)
        if i not in visited_deliveries
    ]

    return {
        "vehicle_routes": vehicle_routes,
        "unassigned_delivery_ids": unassigned,
    }
