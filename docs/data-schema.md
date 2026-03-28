# Data Schema

## Principle

Browser payloads should be compact, derived, and route-specific.

Do not mirror the upstream OpenF1 payload shape directly to the client.

The pipeline should normalize raw data first, then export small packs for distinct product surfaces.

## Common fields

Shared metadata to keep in every pack where useful:

```json
{
  "season": 2025,
  "grand_prix": "Australian Grand Prix",
  "session": "Qualifying",
  "session_key": 9839,
  "track_id": "albert-park",
  "generated_at": "2026-03-27T09:00:00Z",
  "source": "openf1",
  "version": 1
}
```

## Core pack types

### 1. Session summary

Use for route bootstrapping.

```json
{
  "season": 2025,
  "grand_prix": "Australian Grand Prix",
  "session": "Qualifying",
  "session_key": 9839,
  "track_id": "albert-park",
  "drivers": ["VER", "NOR", "LEC"],
  "generated_at": "2026-03-27T09:00:00Z",
  "source": "openf1"
}
```

### 2. Driver summary

```json
{
  "driver_code": "VER",
  "driver_number": 1,
  "team": "Red Bull Racing",
  "best_lap": 14,
  "best_lap_time": 78.412,
  "stints": [
    { "stint": 1, "compound": "SOFT", "laps": 11 }
  ]
}
```

### 3. Lap record

```json
{
  "driver_number": 1,
  "driver_code": "VER",
  "lap_number": 14,
  "lap_time": 78.412,
  "sector_1": 25.101,
  "sector_2": 28.203,
  "sector_3": 25.108,
  "compound": "SOFT",
  "stint": 2,
  "is_fastest": true
}
```

### 4. Telemetry chunk

This should be lap-scoped or sector-scoped, not a giant whole-session browser blob.

```json
{
  "driver_code": "VER",
  "lap_number": 14,
  "sample_hz": 3.7,
  "points": [
    [0.000, 298, 1.00, 0.00, 8, 11800, 0],
    [0.270, 301, 1.00, 0.00, 8, 11920, 0]
  ]
}
```

Suggested point column order:

- distance ratio or time ratio
- speed
- throttle
- brake
- gear
- rpm
- drs active

### 5. Compare pack

For driver-vs-driver views.

```json
{
  "track_id": "albert-park",
  "drivers": ["VER", "NOR"],
  "laps": [14, 16],
  "delta_sections": [
    { "from": 0.00, "to": 0.18, "leader": "VER", "delta_ms": 92 },
    { "from": 0.18, "to": 0.33, "leader": "NOR", "delta_ms": 41 }
  ],
  "events": [
    { "type": "late_brake", "driver": "VER", "corner": 3 },
    { "type": "better_exit", "driver": "NOR", "corner": 4 }
  ]
}
```

Add telemetry traces for the compare route as the next derived layer:

```json
{
  "telemetry": {
    "left": {
      "driverCode": "NOR",
      "lapNumber": 19,
      "sampleHz": 3.7,
      "points": [
        { "ratio": 0.00, "speed": 318, "throttle": 99, "brake": 0, "gear": 8, "rpm": 11161, "drs": 14 }
      ]
    },
    "right": {
      "driverCode": "PIA",
      "lapNumber": 17,
      "sampleHz": 3.7,
      "points": [
        { "ratio": 0.00, "speed": 315, "throttle": 99, "brake": 0, "gear": 8, "rpm": 11084, "drs": 14 }
      ]
    }
  }
}
```

Add corner or sector-window annotations as a derived interpretation layer on top of those traces:

```json
{
  "annotations": [
    {
      "id": "corner-window-1",
      "label": "S1",
      "from": 0.0,
      "to": 0.18,
      "leader": "NOR",
      "summary": "NOR owns the opening window overall, but PIA is back to throttle slightly earlier on exit.",
      "metrics": {
        "left": { "brakePointRatio": 0.032, "minSpeed": 168, "throttlePickupRatio": 0.048 },
        "right": { "brakePointRatio": 0.031, "minSpeed": 172, "throttlePickupRatio": 0.050 }
      }
    }
  ]
}
```

### 6. Corner explainer pack

```json
{
  "track_id": "albert-park",
  "corner_id": "t3",
  "drivers": ["VER", "NOR"],
  "entry_distance": 0.214,
  "apex_distance": 0.228,
  "exit_distance": 0.244,
  "metrics": {
    "VER": {
      "brake_point_m": 108,
      "min_speed_kmh": 112,
      "throttle_pickup_m": 38
    },
    "NOR": {
      "brake_point_m": 104,
      "min_speed_kmh": 109,
      "throttle_pickup_m": 42
    }
  },
  "annotation": "VER gains more from late braking here, but NOR leaves with better stability for the next acceleration phase."
}
```

### 7. Stint pack

```json
{
  "driver_code": "NOR",
  "session_key": 9839,
  "stints": [
    {
      "stint": 2,
      "compound": "MEDIUM",
      "lap_start": 18,
      "lap_end": 36,
      "lap_times": [80.12, 80.20, 80.35],
      "degradation_per_lap": 0.08,
      "weather_context": {
        "track_temp_c": 34,
        "rainfall": false
      }
    }
  ]
}
```

### 8. Strategy pack

```json
{
  "track_id": "albert-park",
  "pit_loss_s": 20.8,
  "safety_car_pit_loss_s": 11.4,
  "recommended_windows": [
    { "lap_start": 17, "lap_end": 21, "reason": "medium-to-hard undercut window" }
  ],
  "weather_crossover": {
    "to_intermediate": 0.61,
    "to_wet": 0.79
  }
}
```

### 9. Replay pack

```json
{
  "session_key": 9839,
  "tick_hz": 5,
  "drivers": ["VER", "NOR", "LEC"],
  "track_id": "albert-park",
  "frames": [
    {
      "t": 0,
      "cars": [
        { "driver": "VER", "x": 0.121, "y": 0.842, "heading": 1.93, "speed": 288 }
      ]
    }
  ]
}
```

### 10. Sim pack

For wind or aero explanation scenes.

```json
{
  "sim_id": "ground-effect-ride-032-speed-280",
  "car_spec": "2025-generic-f1",
  "inputs": {
    "speed_kmh": 280,
    "ride_height_mm": 32,
    "yaw_deg": 1.5,
    "rear_wing_level": 7,
    "drs": false
  },
  "outputs": {
    "downforce_index": 0.84,
    "drag_index": 0.36,
    "floor_efficiency": 0.88
  },
  "assets": {
    "pressure_map": "pressure-map.webp",
    "streamlines": "streamlines.json.br",
    "wake_slice": "wake-slice.json.br"
  }
}
```

### 11. CFD overlay schema example

For baked mesh-linked overlays on the car viewer.

```json
{
  "schemaVersion": 1,
  "modelId": "mclaren-2025-mcl39",
  "scenarioId": "baseline-speed-280-yaw-1p5",
  "metric": "cp",
  "units": "coefficient",
  "meshBinding": {
    "renderMeshId": "body-shell",
    "mappingMode": "triangle-sampled",
    "triangleCount": 84216
  },
  "colorScale": {
    "min": -2.2,
    "max": 1.1,
    "palette": ["#1f4e79", "#3d87b7", "#7fc7da", "#f2d2a2", "#c54f2a"]
  },
  "scalarFields": [
    { "name": "cp", "domain": "surface", "stats": { "min": -2.2, "max": 1.1, "mean": -0.32 } },
    { "name": "cf", "domain": "surface", "stats": { "min": 0.0, "max": 0.064, "mean": 0.012 } }
  ],
  "overlays": {
    "streamlines": [{ "id": "roofline-feed", "color": "#7fc7da", "count": 36 }],
    "hotspots": [{ "id": "front-wing-mainplane", "label": "Front wing stagnation zone", "field": "cp", "value": 0.84 }]
  }
}
```

## Manifests

### Latest manifest

Small file the frontend loads first.

```json
{
  "version": 12,
  "seasons": [2023, 2024, 2025],
  "latest": {
    "season": 2025,
    "grand_prix": "Australian Grand Prix",
    "session": "Qualifying"
  }
}
```

### Session manifest

```json
{
  "session_key": 9839,
  "summary": "summary.json",
  "drivers": "drivers.json",
  "laps": "laps.json.br",
  "telemetry": {
    "VER-fastest": "telemetry/ver-fastest.json.br",
    "NOR-fastest": "telemetry/nor-fastest.json.br"
  },
  "compare": {
    "VER-NOR": "compare/ver-nor.json.br"
  },
  "stints": "stints.json.br",
  "strategy": "strategy.json.br"
}
```

## Derived metrics to precompute

Recommended derived fields:

- braking point
- apex position
- minimum speed
- throttle pickup point
- delta dominance ranges
- DRS usage ranges
- sector leader changes
- tyre degradation trend
- pit-loss estimates by track
- safety-car adjusted pit-loss estimates
- crossover thresholds for weather pages

## Compression

Recommended browser-serving formats:

- JSON for tiny summaries and manifests
- Brotli-compressed JSON for telemetry and compare packs
- optional Arrow or Parquet only inside the pipeline, not as general browser payloads

## Rules

- immutable versioned files only
- never overwrite packs in place
- make route payloads purpose-built
- keep learn-page data separate from telemetry-page data
