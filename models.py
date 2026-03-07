from pydantic import BaseModel
from typing import Optional


class VehicleInput(BaseModel):
    id: str
    lat: float
    lon: float
    capacity: int


class DeliveryInput(BaseModel):
    id: str
    pickup_lat: float
    pickup_lon: float
    dropoff_lat: float
    dropoff_lon: float


class SolveRequest(BaseModel):
    vehicles: list[VehicleInput]
    deliveries: list[DeliveryInput]


class StopOutput(BaseModel):
    type: str  # "start" | "pickup" | "dropoff" | "end"
    delivery_id: Optional[str] = None
    lat: float
    lon: float


class RouteOutput(BaseModel):
    vehicle_id: str
    capacity: int
    stops: list[StopOutput]
    geometry: list[list[float]]  # [[lat, lon], ...]
    distance_m: float
    duration_s: float


class SolveResponse(BaseModel):
    routes: list[RouteOutput]
    unassigned_delivery_ids: list[str]
    solver_status: str
