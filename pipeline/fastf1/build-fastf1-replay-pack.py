#!/usr/bin/env python3
"""Build a GPS-backed replay pack by overlaying FastF1 telemetry onto an existing replay pack."""

import argparse
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import fastf1
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = ROOT / "data"
PUBLIC_ROOT = ROOT / "apps" / "web" / "public" / "data"

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
    "Racing Bulls": "#9BB1FF",
    "Kick Sauber": "#52E252",
    "Haas F1 Team": "#B6BABE",
    "Haas": "#B6BABE",
}

SESSION_CODE_BY_SLUG = {
    "race": "R",
    "qualifying": "Q",
    "sprint": "S",
    "sprint-qualifying": "SQ",
    "practice-1": "FP1",
    "practice-2": "FP2",
    "practice-3": "FP3",
}

SESSION_SLUG_BY_CODE = {value: key for key, value in SESSION_CODE_BY_SLUG.items()}


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build GPS-backed replay pack from FastF1 telemetry"
    )
    parser.add_argument("--year", type=int, required=True, help="Season year")
    parser.add_argument(
        "--round", type=int, default=None, help="Championship round number"
    )
    parser.add_argument(
        "--session",
        type=str,
        default="R",
        choices=["R", "Q", "S", "SQ", "FP1", "FP2", "FP3"],
        help="FastF1 session code",
    )
    parser.add_argument(
        "--grandPrixSlug",
        type=str,
        default=None,
        help="Grand Prix slug (alternative to --round)",
    )
    parser.add_argument(
        "--sessionSlug",
        type=str,
        default=None,
        help="Session slug when resolving from manifest",
    )
    parser.add_argument(
        "--data-dir", type=str, default=None, help="Optional output directory override"
    )
    parser.add_argument("--no-cache", action="store_true", help="Disable FastF1 cache")
    return parser.parse_args()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_mirrored(relative_path: Path, payload):
    for root in (DATA_ROOT, PUBLIC_ROOT):
        file_path = root / relative_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def enable_cache(disabled: bool):
    if disabled:
        return
    cache_dir = Path.home() / ".fastf1_cache"
    cache_dir.mkdir(exist_ok=True)
    fastf1.Cache.enable_cache(cache_dir)


def resolve_from_manifest(year: int, grand_prix_slug: str, session_slug: str):
    manifest_path = DATA_ROOT / "manifests" / f"openf1-{year}-season.json"
    manifest = read_json(manifest_path)
    race_weekends = [
        gp
        for gp in manifest["grandsPrix"]
        if gp["grandPrixSlug"] != "pre-season-testing"
    ]

    for index, grand_prix in enumerate(race_weekends, start=1):
        if grand_prix["grandPrixSlug"] != grand_prix_slug:
            continue

        session_ref = next(
            (
                session
                for session in grand_prix["sessions"]
                if session["sessionSlug"] == session_slug
            ),
            None,
        )
        if not session_ref:
            raise SystemExit(
                f"Session slug '{session_slug}' not found for {grand_prix_slug} in {year} manifest"
            )

        session_code = SESSION_CODE_BY_SLUG.get(session_slug)
        if not session_code:
            raise SystemExit(
                f"Unsupported session slug '{session_slug}' for FastF1 builder"
            )

        return {
            "round": index,
            "session_code": session_code,
            "grand_prix_slug": grand_prix_slug,
            "session_slug": session_slug,
            "grand_prix_name": session_ref["grandPrixName"],
            "session_name": session_ref["sessionName"],
            "track_id": session_ref["trackId"],
        }

    raise SystemExit(
        f"Grand Prix slug '{grand_prix_slug}' not found in {year} manifest"
    )


def resolve_session(args):
    if args.grandPrixSlug and args.sessionSlug:
        return resolve_from_manifest(args.year, args.grandPrixSlug, args.sessionSlug)

    if args.round is None:
        raise SystemExit(
            "Provide either --round or both --grandPrixSlug and --sessionSlug"
        )

    session_slug = SESSION_SLUG_BY_CODE.get(args.session, args.session.lower())
    return {
        "round": args.round,
        "session_code": args.session,
        "grand_prix_slug": None,
        "session_slug": session_slug,
        "grand_prix_name": None,
        "session_name": None,
        "track_id": None,
    }


def get_session(year: int, round_number: int, session_code: str):
    session = fastf1.get_session(year, round_number, session_code)
    session.load(telemetry=True, weather=True, messages=True)
    return session


def session_start_ns(session):
    start = session.session_info["StartDate"]
    if hasattr(start, "value"):
        return int(start.value)
    return int(start.timestamp() * 1e9)


def relative_seconds(value, session_start):
    if value is None or value != value:
        return None
    if hasattr(value, "total_seconds"):
        return float(value.total_seconds())
    if hasattr(value, "value"):
        raw = int(value.value)
        return float((raw - session_start) / 1e9 if raw > session_start else raw / 1e9)
    if hasattr(value, "timestamp"):
        return float(value.timestamp() - session_start / 1e9)
    return None


def build_weather_summary(weather_df):
    if weather_df is None or weather_df.empty:
        return {"airTempC": 0, "trackTempC": 0, "rainRiskPct": 0}

    air = float(weather_df["AirTemp"].mean()) if "AirTemp" in weather_df else 0.0
    track = float(weather_df["TrackTemp"].mean()) if "TrackTemp" in weather_df else 0.0
    rain_risk = 100 if bool(weather_df["Rainfall"].any()) else 0
    return {
        "airTempC": round(air),
        "trackTempC": round(track),
        "rainRiskPct": rain_risk,
    }


def build_weather_timeline(weather_df, session_start):
    if weather_df is None or weather_df.empty:
        return []

    timeline = []
    for _, row in weather_df.iterrows():
        timeline.append(
            {
                "t": relative_seconds(row["Time"], session_start),
                "airTempC": float(row.get("AirTemp", 0) or 0),
                "trackTempC": float(row.get("TrackTemp", 0) or 0),
                "humidityPct": float(row.get("Humidity", 0) or 0),
                "rainfall": bool(row.get("Rainfall", False)),
                "windSpeedMps": float(row.get("WindSpeed", 0) or 0),
                "windDirectionDeg": float(row.get("WindDirection", 0) or 0),
            }
        )
    return timeline


def build_track_status_timeline(track_status_df, session_start):
    if track_status_df is None or track_status_df.empty:
        return []

    timeline = []
    for _, row in track_status_df.iterrows():
        message = str(row.get("Message", "") or "")
        code = str(row.get("Status", "") or "")
        label = "GREEN"
        lower = message.lower()
        if "double yellow" in lower:
            label = "DOUBLE YELLOW"
        elif "yellow" in lower or code == "2":
            label = "YELLOW"
        elif "safetycar" in lower or code == "4":
            label = "SC"
        elif "virtual" in lower or code == "6":
            label = "VSC"
        elif "red" in lower or code == "5":
            label = "RED"
        elif "chequered" in lower:
            label = "CHEQUERED"

        timeline.append(
            {
                "t": relative_seconds(row["Time"], session_start),
                "status": label,
            }
        )
    return timeline


def build_race_control_timeline(rc_df, session_start):
    if rc_df is None or rc_df.empty:
        return []

    messages = []
    for _, row in rc_df.iterrows():
        messages.append(
            {
                "t": relative_seconds(row["Time"], session_start),
                "lapNumber": int(row["Lap"])
                if row.get("Lap") == row.get("Lap") and row.get("Lap") is not None
                else None,
                "category": str(row.get("Category", "Other") or "Other"),
                "flag": None
                if row.get("Flag") is None or row.get("Flag") != row.get("Flag")
                else str(row.get("Flag")),
                "scope": None
                if row.get("Scope") is None or row.get("Scope") != row.get("Scope")
                else str(row.get("Scope")),
                "sector": int(row["Sector"])
                if row.get("Sector") == row.get("Sector")
                and row.get("Sector") is not None
                else None,
                "message": str(row.get("Message", "") or ""),
            }
        )
    return messages


def build_track_reference(session):
    try:
        fastest_lap = session.laps.pick_fastest()
        if fastest_lap is None:
            return None, None
        telemetry = fastest_lap.get_telemetry()
        if telemetry.empty:
            return None, None
        ref_x = telemetry["X"].to_numpy(dtype=float) / 10.0
        ref_y = telemetry["Y"].to_numpy(dtype=float) / 10.0
        ref_dist = telemetry["Distance"].to_numpy(dtype=float)
        return np.column_stack((ref_x, ref_y)), ref_dist
    except Exception as exc:
        print(f"Warning: failed to build track reference: {exc}")
        return None, None


def normalize_track_path(track_ref):
    if track_ref is None or len(track_ref) == 0:
        return None
    step = max(1, len(track_ref) // 500)
    sampled = track_ref[::step]
    return [[float(x), float(y)] for x, y in sampled]


def lap_start_seconds(lap, session_start):
    if (
        lap.get("LapStartDate") is not None
        and lap["LapStartDate"] == lap["LapStartDate"]
    ):
        return float((lap["LapStartDate"].value - session_start) / 1e9)
    if (
        lap.get("LapStartTime") is not None
        and lap["LapStartTime"] == lap["LapStartTime"]
    ):
        return float(lap["LapStartTime"].total_seconds())
    return None


def build_driver_telemetry(session, driver_number, session_start):
    driver_laps = session.laps[session.laps["DriverNumber"] == str(driver_number)]
    if driver_laps.empty:
        return None

    telemetry_chunks = []
    lap_timeline = []

    for _, lap in driver_laps.iterrows():
        lap_number = (
            int(lap["LapNumber"])
            if lap.get("LapNumber") == lap.get("LapNumber")
            else None
        )
        if lap_number is None:
            continue

        start_s = lap_start_seconds(lap, session_start)
        if start_s is None:
            continue

        lap_time = (
            float(lap["LapTime"].total_seconds())
            if lap.get("LapTime") is not None and lap["LapTime"] == lap["LapTime"]
            else None
        )
        lap_timeline.append(
            {
                "lap": lap_number,
                "start": start_s,
                "end": start_s + (lap_time if lap_time and lap_time > 0 else 95.0),
                "compound": None
                if lap.get("Compound") is None or lap["Compound"] != lap["Compound"]
                else str(lap["Compound"]),
                "tyre_age": int(lap["TyreLife"])
                if lap.get("TyreLife") == lap.get("TyreLife")
                and lap.get("TyreLife") is not None
                else None,
            }
        )

        try:
            telemetry = lap.get_telemetry()
        except Exception:
            continue

        if telemetry.empty:
            continue

        valid = telemetry[
            [
                "Date",
                "X",
                "Y",
                "Distance",
                "Speed",
                "nGear",
                "DRS",
                "Throttle",
                "Brake",
                "RPM",
            ]
        ].copy()
        valid = valid.dropna(subset=["Date", "X", "Y"])
        if valid.empty:
            continue

        times_s = (
            valid["Date"].astype("int64").to_numpy(dtype=np.int64) - session_start
        ) / 1e9
        telemetry_chunks.append(
            {
                "t": times_s.astype(float),
                "x": valid["X"].to_numpy(dtype=float) / 10.0,
                "y": valid["Y"].to_numpy(dtype=float) / 10.0,
                "distance": valid["Distance"].to_numpy(dtype=float),
                "speed": valid["Speed"].to_numpy(dtype=float),
                "gear": valid["nGear"].to_numpy(dtype=float),
                "drs": valid["DRS"].to_numpy(dtype=float),
                "throttle": np.clip(valid["Throttle"].to_numpy(dtype=float), 0, 100),
                "brake": np.where(valid["Brake"].to_numpy(dtype=bool), 100.0, 0.0),
                "rpm": np.maximum(valid["RPM"].to_numpy(dtype=float), 0.0),
                "lap": np.full(len(valid), lap_number, dtype=float),
            }
        )

    if not telemetry_chunks:
        return None

    merged = {}
    for key in (
        "t",
        "x",
        "y",
        "distance",
        "speed",
        "gear",
        "drs",
        "throttle",
        "brake",
        "rpm",
        "lap",
    ):
        merged[key] = np.concatenate([chunk[key] for chunk in telemetry_chunks])

    order = np.argsort(merged["t"])
    for key in merged:
        merged[key] = merged[key][order]

    lap_timeline.sort(key=lambda entry: entry["start"])
    merged["lap_timeline"] = lap_timeline
    return merged


def interpolate_linear(times, values, target):
    if len(times) == 0:
        return None
    if target <= times[0]:
        return float(values[0])
    if target >= times[-1]:
        return float(values[-1])
    return float(np.interp(target, times, values))


def interpolate_step(times, values, target):
    if len(times) == 0:
        return None
    index = int(np.searchsorted(times, target, side="right") - 1)
    if index < 0:
        return float(values[0])
    index = min(index, len(values) - 1)
    return float(values[index])


def lap_state(lap_timeline, target):
    if not lap_timeline:
        return {"lap": 1, "compound": None, "tyre_age": None}
    current = lap_timeline[0]
    for entry in lap_timeline:
        if entry["start"] <= target:
            current = entry
        else:
            break
    return current


def weather_state(weather_timeline, target, fallback):
    if not weather_timeline:
        return {
            "airTempC": fallback["airTempC"],
            "trackTempC": fallback["trackTempC"],
            "humidityPct": 0,
            "rainfall": False,
            "windSpeedMps": 0,
            "windDirectionDeg": 0,
        }

    current = weather_timeline[0]
    for entry in weather_timeline:
        if entry["t"] <= target:
            current = entry
        else:
            break
    return {
        "airTempC": current["airTempC"],
        "trackTempC": current["trackTempC"],
        "humidityPct": current["humidityPct"],
        "rainfall": current["rainfall"],
        "windSpeedMps": current["windSpeedMps"],
        "windDirectionDeg": current["windDirectionDeg"],
    }


def track_status_state(track_status_timeline, target, fallback):
    if not track_status_timeline:
        return fallback
    current = track_status_timeline[0]["status"]
    for entry in track_status_timeline:
        if entry["t"] <= target:
            current = entry["status"]
        else:
            break
    return current


def safety_car_state(track_status):
    if track_status == "SC":
        return "on_track"
    if track_status == "VSC":
        return "deploying"
    return "none"


def load_base_replay(base_dir: Path):
    replay_path = base_dir / "replay.json"
    if replay_path.exists():
        return read_json(replay_path)
    return None


def determine_output_base(args, resolved, session):
    if args.data_dir:
        return Path(args.data_dir)

    grand_prix_slug = resolved["grand_prix_slug"] or slugify(
        str(session.event["EventName"])
    )
    session_slug = resolved["session_slug"] or SESSION_SLUG_BY_CODE.get(
        resolved["session_code"], resolved["session_code"].lower()
    )
    return (
        DATA_ROOT
        / "packs"
        / "seasons"
        / str(args.year)
        / grand_prix_slug
        / session_slug
    )


def build_replay_pack(session, resolved, base_replay):
    session_start = session_start_ns(session)
    weather_timeline = build_weather_timeline(session.weather_data, session_start)
    weather_summary = build_weather_summary(session.weather_data)
    track_status_timeline = build_track_status_timeline(
        session.track_status, session_start
    )
    race_control_messages = build_race_control_timeline(
        getattr(session, "race_control_messages", None), session_start
    )
    track_ref, track_distances = build_track_reference(session)
    track_path = normalize_track_path(track_ref)
    total_track_distance = (
        float(track_distances[-1])
        if track_distances is not None and len(track_distances)
        else None
    )

    drivers_info = []
    telemetry_by_code = {}

    for driver_identifier in session.drivers:
        driver = session.get_driver(driver_identifier)
        driver_number = int(driver["DriverNumber"])
        code = str(driver["Abbreviation"])
        team = str(driver["TeamName"])
        info = {
            "driverCode": code,
            "driverNumber": driver_number,
            "fullName": str(driver["FullName"]),
            "team": team,
            "teamColor": TEAM_COLORS.get(team, "#888888"),
        }
        drivers_info.append(info)
        telemetry = build_driver_telemetry(session, driver_number, session_start)
        if telemetry is not None:
            telemetry_by_code[code] = telemetry

    lap_records = []
    for _, lap in session.laps.iterrows():
        if lap.get("LapTime") is None or lap["LapTime"] != lap["LapTime"]:
            continue
        lap_records.append(
            {
                "driverCode": str(
                    session.get_driver(str(lap["DriverNumber"]))["Abbreviation"]
                ),
                "lapNumber": int(lap["LapNumber"]),
                "lapTime": float(lap["LapTime"].total_seconds()),
                "compound": None
                if lap.get("Compound") is None or lap["Compound"] != lap["Compound"]
                else str(lap["Compound"]),
            }
        )
    lap_records.sort(key=lambda entry: (entry["lapNumber"], entry["driverCode"]))

    if base_replay and base_replay.get("frames"):
        frame_times = [float(frame["t"]) for frame in base_replay["frames"]]
        frames = []
        for index, frame_time in enumerate(frame_times):
            base_frame = base_replay["frames"][index]
            merged_drivers = {}
            for driver_code, base_driver in base_frame["drivers"].items():
                telemetry = telemetry_by_code.get(driver_code)
                if telemetry is None or len(telemetry["t"]) == 0:
                    merged_drivers[driver_code] = {
                        **base_driver,
                        "rpm": base_driver.get("rpm"),
                    }
                    continue

                x = interpolate_linear(telemetry["t"], telemetry["x"], frame_time)
                y = interpolate_linear(telemetry["t"], telemetry["y"], frame_time)
                speed = interpolate_linear(
                    telemetry["t"], telemetry["speed"], frame_time
                )
                throttle = interpolate_linear(
                    telemetry["t"], telemetry["throttle"], frame_time
                )
                brake = interpolate_linear(
                    telemetry["t"], telemetry["brake"], frame_time
                )
                rpm = interpolate_linear(telemetry["t"], telemetry["rpm"], frame_time)
                gear = interpolate_step(telemetry["t"], telemetry["gear"], frame_time)
                drs = interpolate_step(telemetry["t"], telemetry["drs"], frame_time)
                lap = interpolate_step(telemetry["t"], telemetry["lap"], frame_time)
                lap_info = lap_state(telemetry["lap_timeline"], frame_time)

                merged_drivers[driver_code] = {
                    **base_driver,
                    "x": x if x is not None else base_driver.get("x"),
                    "y": y if y is not None else base_driver.get("y"),
                    "speed": None if speed is None else round(speed, 3),
                    "throttle": None
                    if throttle is None
                    else round(max(0.0, min(100.0, throttle)), 3),
                    "brake": None
                    if brake is None
                    else round(max(0.0, min(100.0, brake)), 3),
                    "gear": None if gear is None else int(round(gear)),
                    "rpm": None if rpm is None else round(max(0.0, rpm), 3),
                    "drs": None if drs is None else int(round(drs)),
                    "lap": int(round(lap))
                    if lap is not None
                    else base_driver.get("lap"),
                    "tyreCompound": lap_info.get("compound")
                    or base_driver.get("tyreCompound"),
                    "tyreAge": lap_info.get("tyre_age")
                    if lap_info.get("tyre_age") is not None
                    else base_driver.get("tyreAge"),
                }

            track_status = track_status_state(
                track_status_timeline,
                frame_time,
                base_frame.get("trackStatus", "GREEN"),
            )
            sc_phase = safety_car_state(track_status)
            safety_car = dict(
                base_frame.get("safetyCar", {"phase": "none", "x": None, "y": None})
            )
            safety_car["phase"] = (
                sc_phase if sc_phase != "none" else safety_car.get("phase", "none")
            )

            frames.append(
                {
                    **base_frame,
                    "drivers": merged_drivers,
                    "trackStatus": track_status,
                    "safetyCar": safety_car,
                    "weather": weather_state(
                        weather_timeline, frame_time, weather_summary
                    ),
                }
            )
    else:
        duration = max(
            (telemetry["t"][-1] for telemetry in telemetry_by_code.values()),
            default=0.0,
        )
        frame_interval = max(1.0, duration / 2400.0)
        frame_times = np.arange(0.0, duration + frame_interval, frame_interval)
        frames = []
        for frame_time in frame_times:
            merged_drivers = {}
            driver_order = []
            for info in drivers_info:
                telemetry = telemetry_by_code.get(info["driverCode"])
                if telemetry is None or len(telemetry["t"]) == 0:
                    continue
                x = interpolate_linear(telemetry["t"], telemetry["x"], frame_time)
                y = interpolate_linear(telemetry["t"], telemetry["y"], frame_time)
                distance = interpolate_linear(
                    telemetry["t"], telemetry["distance"], frame_time
                )
                speed = interpolate_linear(
                    telemetry["t"], telemetry["speed"], frame_time
                )
                throttle = interpolate_linear(
                    telemetry["t"], telemetry["throttle"], frame_time
                )
                brake = interpolate_linear(
                    telemetry["t"], telemetry["brake"], frame_time
                )
                rpm = interpolate_linear(telemetry["t"], telemetry["rpm"], frame_time)
                gear = interpolate_step(telemetry["t"], telemetry["gear"], frame_time)
                drs = interpolate_step(telemetry["t"], telemetry["drs"], frame_time)
                lap = interpolate_step(telemetry["t"], telemetry["lap"], frame_time)
                lap_info = lap_state(telemetry["lap_timeline"], frame_time)
                if x is None or y is None:
                    continue
                race_progress = (lap_info["lap"] - 1) + (
                    (distance or 0.0) / total_track_distance
                    if total_track_distance
                    else 0.0
                )
                driver_order.append((info["driverCode"], race_progress))
                merged_drivers[info["driverCode"]] = {
                    "driverCode": info["driverCode"],
                    "driverNumber": info["driverNumber"],
                    "team": info["team"],
                    "position": 0,
                    "x": x,
                    "y": y,
                    "speed": speed,
                    "throttle": throttle,
                    "brake": brake,
                    "gear": int(round(gear)) if gear is not None else None,
                    "rpm": rpm,
                    "drs": int(round(drs)) if drs is not None else None,
                    "lap": lap_info["lap"],
                    "interval": 0,
                    "tyreCompound": lap_info.get("compound"),
                    "tyreAge": lap_info.get("tyre_age"),
                }
            driver_order.sort(key=lambda item: item[1], reverse=True)
            leader_progress = driver_order[0][1] if driver_order else 0.0
            for position, (driver_code, progress) in enumerate(driver_order, start=1):
                merged_drivers[driver_code]["position"] = position
                merged_drivers[driver_code]["interval"] = (
                    0
                    if position == 1
                    else round(max(0.0, leader_progress - progress) * 90.0, 3)
                )
            frames.append(
                {
                    "t": float(frame_time),
                    "lap": max(
                        (driver["lap"] or 0 for driver in merged_drivers.values()),
                        default=0,
                    )
                    or None,
                    "drivers": merged_drivers,
                    "safetyCar": {"phase": "none", "x": None, "y": None},
                    "trackStatus": track_status_state(
                        track_status_timeline, frame_time, "GREEN"
                    ),
                    "weather": weather_state(
                        weather_timeline, frame_time, weather_summary
                    ),
                }
            )

    event = session.event
    grand_prix_name = resolved["grand_prix_name"] or str(event["OfficialEventName"])
    session_name = resolved["session_name"] or str(session.name)
    track_id = resolved["track_id"] or slugify(str(event["Location"]))

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sessionKey": int(session.session_info["Key"]),
        "season": int(session.event["EventDate"].year),
        "grandPrix": grand_prix_name,
        "session": session_name,
        "trackId": track_id,
        "source": "fastf1",
        "note": "GPS-backed replay built from FastF1 telemetry and merged onto the richer static replay contract.",
        "weatherSummary": weather_summary,
        "drivers": drivers_info,
        "trackPath": track_path
        if track_path is not None
        else (base_replay.get("trackPath") if base_replay else None),
        "laps": lap_records
        if lap_records
        else (base_replay.get("laps", []) if base_replay else []),
        "raceControlMessages": race_control_messages
        if race_control_messages
        else (base_replay.get("raceControlMessages", []) if base_replay else []),
        "frames": frames,
    }


def main():
    args = parse_args()
    enable_cache(args.no_cache)
    resolved = resolve_session(args)

    print("FastF1 GPS Replay Builder")
    print(
        f"Year: {args.year} | Round: {resolved['round']} | Session: {resolved['session_code']}"
    )

    session = get_session(args.year, resolved["round"], resolved["session_code"])
    base_dir = determine_output_base(args, resolved, session)
    base_replay = load_base_replay(base_dir)

    if base_replay:
        print(f"Merging FastF1 GPS telemetry onto existing replay pack in {base_dir}")
    else:
        print(f"Building standalone FastF1 replay pack in {base_dir}")

    replay_pack = build_replay_pack(session, resolved, base_replay)

    if base_dir.is_absolute() and base_dir.is_relative_to(DATA_ROOT):
        relative_base = base_dir.relative_to(DATA_ROOT)
    else:
        relative_base = (
            Path("packs")
            / "seasons"
            / str(replay_pack["season"])
            / base_dir.parent.name
            / base_dir.name
        )
    write_mirrored(relative_base / "replay.json", replay_pack)

    manifest_relative = relative_base / "manifest.json"
    manifest_path = DATA_ROOT / manifest_relative
    manifest = {"sessionKey": replay_pack["sessionKey"]}
    if manifest_path.exists():
        manifest = read_json(manifest_path)
    manifest["replay"] = "replay.json"
    write_mirrored(manifest_relative, manifest)

    print(f"Wrote GPS-backed replay pack to {relative_base / 'replay.json'}")


if __name__ == "__main__":
    main()
