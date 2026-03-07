import httpx

OSRM_BASE = "http://router.project-osrm.org"
_LARGE_DURATION = 999_999  # fallback for unreachable pairs


def _coords_str(coords: list[tuple[float, float]]) -> str:
    """Convert (lat, lon) pairs to OSRM's lon,lat;lon,lat;... format."""
    return ";".join(f"{lon},{lat}" for lat, lon in coords)


async def get_duration_matrix(coords: list[tuple[float, float]]) -> list[list[int]]:
    """
    Calls OSRM table API and returns duration matrix as integer seconds.
    coords: list of (lat, lon) tuples
    """
    coords_str = _coords_str(coords)
    url = f"{OSRM_BASE}/table/v1/driving/{coords_str}?annotations=duration"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
    return [
        [int(round(d)) if d is not None else _LARGE_DURATION for d in row]
        for row in data["durations"]
    ]


async def get_route_geometry(
    coords: list[tuple[float, float]],
) -> tuple[list[list[float]], float, float]:
    """
    Calls OSRM route API and returns (geometry [[lat,lon],...], distance_m, duration_s).
    Falls back to straight-line segments on error.
    coords: list of (lat, lon) tuples
    """
    if len(coords) < 2:
        return [[c[0], c[1]] for c in coords], 0.0, 0.0

    coords_str = _coords_str(coords)
    url = f"{OSRM_BASE}/route/v1/driving/{coords_str}?overview=full&geometries=geojson"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
        route = data["routes"][0]
        # GeoJSON coords are [lon, lat] — swap to [lat, lon] for Leaflet
        geometry = [[lat, lon] for lon, lat in route["geometry"]["coordinates"]]
        return geometry, route["distance"], route["duration"]
    except Exception:
        # Fallback: connect stops with straight lines
        return [[c[0], c[1]] for c in coords], 0.0, 0.0
