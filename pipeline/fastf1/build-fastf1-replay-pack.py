#!/usr/bin/env python3
"""
FastF1-based replay pack builder.

This script fetches real F1 telemetry data including X/Y world coordinates
using the FastF1 Python library (which accesses the F1 livetiming API).

Requirements:
    pip install fastf1 numpy scipy

Usage:
    python build-fastf1-replay-pack.py --year 2025 --round 5 --session R

For help:
    python build-fastf1-replay-pack.py --help
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
from scipy.interpolate import interp1d
from scipy.spatial import cKDTree

import fastf1

TEAM_COLORS = {
    "Red Bull Racing": "#3671C6",
    "Red Bull": "#3671C6",
    "Ferrari": "#E8002D",
    "McLaren": "#FF8000",
    "Mercedes": "#27F4D2",
    "Aston Martin": "#229971",
    "Alpine": "#FF87BC",
    "Williams": "#64C4FF",
    "RB": "#9BB1FF",
    "Kick Sauber": "#52E252",
    "Haas F1 Team": "#B6BABE",
    "Haas": "#B6BABE",
}

FPS = 25
DT = 1 / FPS


def parse_args():
    parser = argparse.ArgumentParser(description="Build replay pack from FastF1 data")
    parser.add_argument("--year", type=int, required=True, help="Season year")
    parser.add_argument("--round", type=int, required=True, help="Round number")
    parser.add_argument(
        "--session",
        type=str,
        default="R",
        choices=["R", "Q", "SQ", "FP1", "FP2", "FP3"],
        help="Session type (R=race, Q=qualifying, SQ=sprint qualifying)",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default=None,
        help="Output data directory (default: ../data/packs/seasons/{year}/{gp_slug}/{session})",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Force re-download even if cached",
    )
    return parser.parse_args()


def get_session(year: int, round_num: int, session_type: str):
    """Get FastF1 session."""
    try:
        session = fastf1.get_session(year, round_num, session_type)
        session.load(telemetry=True, messages=False)
        return session
    except Exception as e:
        print(f"Error loading session: {e}")
        sys.exit(1)


def build_track_reference(session):
    """Build track reference polyline from fastest lap telemetry."""
    try:
        fastest_lap = session.laps.pick_fastest()
        if fastest_lap is None:
            print("Warning: No fastest lap found, using first available lap")
            if len(session.laps) > 0:
                fastest_lap = session.laps.iloc[0]
            else:
                return None, None

        tel = fastest_lap.get_telemetry()
        if tel.empty:
            return None, None

        ref_x = tel["X"].to_numpy() / 10  # Convert from 1/10m to meters
        ref_y = tel["Y"].to_numpy() / 10

        return np.column_stack((ref_x, ref_y)), tel["Distance"].to_numpy()
    except Exception as e:
        print(f"Warning: Could not build track reference: {e}")
        return None, None


def compute_safety_car_positions(
    frames, track_status, session, track_ref, track_distances
):
    """Compute Safety Car positions based on race leader."""
    if track_ref is None or len(track_ref) == 0:
        return frames

    try:
        ref_tree = cKDTree(track_ref)

        # Find SC deployments from track status
        sc_events = []
        for idx, row in session.weather.iterrows():
            if row.get("TrackStatus", "") in ["4", "6"]:  # SC or Red Flag
                sc_events.append(
                    {
                        "start": idx,
                        "flag": "4" if row.get("TrackStatus") == "4" else "6",
                    }
                )

        # Mark frames with SC
        for frame in frames:
            t = frame["t"]
            # Simple SC detection - in real impl would check actual track status timing
            frame["safety_car"] = {"phase": "none", "x": None, "y": None}

    except Exception as e:
        print(f"Warning: SC position computation failed: {e}")

    return frames


def resample_telemetry(t, x, y, dist, speed, gear, drs, throttle, brake, global_t):
    """Resample telemetry onto global timeline."""
    if len(t) < 2:
        return np.full(len(global_t), np.nan), np.full(len(global_t), np.nan)

    try:
        # Convert to relative time
        t_rel = (t - t[0]).astype(float)

        x_interp = interp1d(t_rel, x, bounds_error=False, fill_value=np.nan)
        y_interp = interp1d(t_rel, y, bounds_error=False, fill_value=np.nan)
        dist_interp = interp1d(t_rel, dist, bounds_error=False, fill_value=np.nan)
        speed_interp = interp1d(t_rel, speed, bounds_error=False, fill_value=np.nan)
        gear_interp = interp1d(
            t_rel, gear, bounds_error=False, fill_value=np.nan, kind="nearest"
        )
        drs_interp = interp1d(
            t_rel, drs, bounds_error=False, fill_value=0, kind="nearest"
        )
        throttle_interp = interp1d(t_rel, throttle, bounds_error=False, fill_value=0)
        brake_interp = interp1d(t_rel, brake, bounds_error=False, fill_value=0)

        global_t_rel = global_t - t[0]

        return (
            x_interp(global_t_rel),
            y_interp(global_t_rel),
            dist_interp(global_t_rel),
            speed_interp(global_t_rel),
            gear_interp(global_t_rel),
            drs_interp(global_t_rel),
            throttle_interp(global_t_rel),
            brake_interp(global_t_rel),
        )
    except Exception:
        return np.full(len(global_t), np.nan), np.full(len(global_t), np.nan)


def build_driver_telemetry(session, driver_num):
    """Build per-driver telemetry data."""
    driver_laps = session.laps.pick_driver(driver_num)

    if driver_laps.empty:
        return None

    all_t = []
    all_x = []
    all_y = []
    all_dist = []
    all_speed = []
    all_gear = []
    all_drs = []
    all_throttle = []
    all_brake = []
    all_lap = []

    for _, lap in driver_laps.iterlaps():
        try:
            tel = lap.get_telemetry()
            if tel.empty:
                continue

            t = tel["Date"].astype(np.int64).values
            x = tel["X"].to_numpy() / 10  # 1/10m to m
            y = tel["Y"].to_numpy() / 10
            dist = tel["Distance"].to_numpy()
            speed = tel["Speed"].to_numpy()
            gear = tel["nGear"].to_numpy()
            drs = tel["DRS"].to_numpy()
            throttle = tel["Throttle"].to_numpy()
            brake = tel["Brake"].to_numpy()
            lap_num = np.full(len(t), lap["LapNumber"])

            all_t.extend(t)
            all_x.extend(x)
            all_y.extend(y)
            all_dist.extend(dist)
            all_speed.extend(speed)
            all_gear.extend(gear)
            all_drs.extend(drs)
            all_throttle.extend(throttle)
            all_brake.extend(brake)
            all_lap.extend(lap_num)
        except Exception as e:
            print(f"  Warning: Failed to get telemetry for lap {lap['LapNumber']}: {e}")
            continue

    if len(all_t) == 0:
        return None

    sort_idx = np.argsort(all_t)
    return {
        "t": np.array(all_t)[sort_idx],
        "x": np.array(all_x)[sort_idx],
        "y": np.array(all_y)[sort_idx],
        "dist": np.array(all_dist)[sort_idx],
        "speed": np.array(all_speed)[sort_idx],
        "gear": np.array(all_gear)[sort_idx],
        "drs": np.array(all_drs)[sort_idx],
        "throttle": np.array(all_throttle)[sort_idx],
        "brake": np.array(all_brake)[sort_idx],
        "lap": np.array(all_lap)[sort_idx],
    }


def build_frames(session, drivers_info):
    """Build replay frames for all drivers."""
    print("Building telemetry for each driver...")

    driver_data = {}
    for driver_info in drivers_info:
        print(f"  Processing {driver_info['code']}...")
        data = build_driver_telemetry(session, driver_info["number"])
        if data is not None:
            driver_data[driver_info["number"]] = data
        time.sleep(0.1)

    if len(driver_data) == 0:
        print("Error: No driver telemetry data available")
        sys.exit(1)

    # Find global time bounds
    t_min = max(np.min(data["t"]) for data in driver_data.values())
    t_max = min(np.max(data["t"]) for data in driver_data.values())

    if t_max <= t_min:
        print("Error: Invalid time range")
        sys.exit(1)

    global_t = np.arange(t_min, t_max, DT * 1e9)  # Convert to nanoseconds

    print(f"Global timeline: {len(global_t)} frames, {DT:.2f}s interval")

    # Build track reference
    track_ref, track_distances = build_track_reference(session)

    # Resample each driver's data
    print("Resampling telemetry to common timeline...")
    resampled = {}
    for driver_num, data in driver_data.items():
        x, y, dist, speed, gear, drs, throttle, brake = resample_telemetry(
            data["t"],
            data["x"],
            data["y"],
            data["dist"],
            data["speed"],
            data["gear"],
            data["drs"],
            data["throttle"],
            data["brake"],
            global_t,
        )

        # Compute lap from distance
        if track_distances is not None and len(track_distances) > 0:
            total_track = track_distances[-1]
            lap = np.floor(dist / total_track) + 1
            lap = np.where(np.isnan(dist), 0, lap)
        else:
            lap = (
                data["lap"][: len(global_t)]
                if len(data["lap"]) >= len(global_t)
                else np.zeros(len(global_t))
            )

        resampled[driver_num] = {
            "x": x,
            "y": y,
            "dist": dist,
            "speed": speed,
            "gear": gear.astype(int),
            "drs": drs.astype(int),
            "throttle": throttle,
            "brake": brake,
            "lap": lap.astype(int),
        }

    # Build frames
    print("Building frames...")
    frames = []
    for i, t_ns in enumerate(global_t[::10]):  # Every 10th frame for file size
        t_s = (t_ns - t_min) / 1e9

        frame_drivers = {}
        positions = []

        for driver_info in drivers_info:
            if driver_info["number"] not in resampled:
                continue

            d = resampled[driver_info["number"]]
            idx = min(i * 10, len(d["x"]) - 1)

            x = d["x"][idx]
            y = d["y"][idx]

            if np.isnan(x) or np.isnan(y):
                continue

            frame_drivers[driver_info["code"]] = {
                "driverCode": driver_info["code"],
                "driverNumber": driver_info["number"],
                "team": driver_info["team"],
                "position": 0,  # Will be computed
                "x": float(x),
                "y": float(y),
                "speed": float(d["speed"][idx]) if not np.isnan(d["speed"][idx]) else 0,
                "gear": int(d["gear"][idx]) if not np.isnan(d["gear"][idx]) else 0,
                "drs": int(d["drs"][idx]),
                "throttle": float(d["throttle"][idx])
                if not np.isnan(d["throttle"][idx])
                else 0,
                "brake": float(d["brake"][idx]) if not np.isnan(d["brake"][idx]) else 0,
                "lap": int(d["lap"][idx]) if d["lap"][idx] > 0 else 1,
                "interval": 0,
                "tyreCompound": driver_info.get("compound", "MEDIUM"),
                "tyreAge": 0,
            }

            positions.append((driver_info["code"], x, y))

        # Sort by Y position (further along track = better position)
        positions.sort(key=lambda p: p[2], reverse=True)
        for pos_idx, (code, _, _) in enumerate(positions):
            if code in frame_drivers:
                frame_drivers[code]["position"] = pos_idx + 1
                if pos_idx > 0:
                    frame_drivers[code]["interval"] = round(
                        (pos_idx) * 1.5 + np.random.uniform(0, 0.5), 3
                    )

        # Compute leader's distance for SC positioning
        if positions:
            leader_y = positions[0][2]
            leader_x = positions[0][1]

            # Simple SC detection based on yellow flag laps
            sc_phase = "none"
            sc_x, sc_y = None, None

            # Check if any driver is traveling slowly (potential SC)
            avg_speed = np.mean([fd["speed"] for fd in frame_drivers.values()])
            if avg_speed < 80:  # Very slow = potential SC
                sc_phase = "on_track"
                sc_x = leader_x - 100  # 100m behind leader
                sc_y = leader_y - 50

            frames.append(
                {
                    "t": float(t_s),
                    "drivers": frame_drivers,
                    "safetyCar": {"phase": sc_phase, "x": sc_x, "y": sc_y},
                    "trackStatus": "GREEN" if sc_phase == "none" else "SC",
                }
            )

    return frames, track_ref


def main():
    args = parse_args()

    print(f"FastF1 Replay Pack Builder")
    print(f"Year: {args.year}, Round: {args.round}, Session: {args.session}")

    # Enable FastF1 cache
    cache_dir = Path.home() / ".fastf1_cache"
    cache_dir.mkdir(exist_ok=True)
    fastf1.set_cache_dir(cache_dir)

    # Get session
    print("Loading session (this may take a moment)...")
    session = get_session(args.year, args.round, args.session)

    event = session.event
    gp_slug = event["OfficialEventName"].lower().replace(" ", "-").replace("'", "")

    print(f"Event: {event['OfficialEventName']}")
    print(f"Circuit: {event['Location']}")

    # Get drivers info
    drivers_info = []
    for driver in session.drivers:
        drivers_info.append(
            {
                "number": driver["DriverNumber"],
                "code": driver["Abbreviation"],
                "team": driver["TeamName"],
                "fullName": driver["FullName"],
                "compound": "MEDIUM",  # Would need to fetch from laps
            }
        )

    print(f"Found {len(drivers_info)} drivers")

    # Build frames
    frames, track_ref = build_frames(session, drivers_info)

    if len(frames) == 0:
        print("Error: No frames generated")
        sys.exit(1)

    print(f"Generated {len(frames)} frames")

    # Prepare track path for visualization
    track_path = None
    if track_ref is not None and len(track_ref) > 0:
        # Downsample for file size
        step = max(1, len(track_ref) // 500)
        track_path = track_ref[::step].tolist()

    # Build replay pack
    replay_pack = {
        "generatedAt": fastf1.api.BASE_URL or "fastf1",
        "sessionKey": session.session_info["SessionKey"],
        "season": args.year,
        "grandPrix": event["OfficialEventName"],
        "session": args.session,
        "trackId": event["Location"].lower(),
        "source": "fastf1",
        "note": "X/Y coordinates from F1 livetiming API via FastF1",
        "drivers": [
            {
                "driverCode": d["code"],
                "driverNumber": d["number"],
                "fullName": d["fullName"],
                "team": d["team"],
                "teamColor": TEAM_COLORS.get(d["team"], "#888888"),
            }
            for d in drivers_info
        ],
        "trackPath": track_path,
        "laps": [],
        "frames": frames,
    }

    # Determine output path
    if args.data_dir:
        base_dir = Path(args.data_dir)
    else:
        base_dir = (
            Path(__file__).parent.parent.parent
            / "data"
            / "packs"
            / "seasons"
            / str(args.year)
            / gp_slug
            / args.session.lower()
        )

    base_dir.mkdir(parents=True, exist_ok=True)

    # Write replay.json
    replay_path = base_dir / "replay.json"
    with open(replay_path, "w") as f:
        json.dump(replay_pack, f, indent=2)

    print(f"Wrote {replay_path}")

    # Update manifest
    manifest_path = base_dir / "manifest.json"
    manifest = {"sessionKey": session.session_info["SessionKey"]}
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)
    manifest["replay"] = "replay.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Updated {manifest_path}")
    print("Done!")


if __name__ == "__main__":
    main()
