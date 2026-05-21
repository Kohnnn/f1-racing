#!/usr/bin/env python3
"""
Hydrate `data/track-shapes/<trackId>.json` with corner Distance values
computed from a real reference lap of each session via FastF1.

This is an additive pass: we only fill in the `trackPosition` field of each
corner (cumulative distance along the centerline). The runtime falls back
to an even distribution if `trackPosition` is null, so this script is
optional but improves corner label placement.

Run:  python pipeline/fastf1/hydrate-corner-distances.py [--year 2025] [--limit N]
Requires: fastf1 (pip install fastf1)
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TRACK_SHAPES_DIR = REPO_ROOT / "data" / "track-shapes"

SLUG_TO_FILENAME = {
    "albert-park": "melbourne",
    "yas-marina": "yas-marina-circuit",
    "abu-dhabi": "yas-marina-circuit",
    "spa-francorchamps": "spa",
    "sao-paulo": "interlagos",
    "saopaulo": "interlagos",
    "s-o-paulo": "interlagos",
    "brazil": "interlagos",
    "miami-gardens": "miami",
    "miami": "miami",
    "catalunya": "barcelona",
    "red-bull-ring": "spielberg",
    "emilia-romagna": "imola",
    "hungaroring": "budapest",
    "cota": "austin",
    "china": "shanghai",
    "marina-bay": "singapore",
    "bahrain": "sakhir",
    "autodromo": "mexico",
    "azerbaijan": "baku",
    "saudi-arabian": "jeddah",
    "las-vegas": "lasvegas",
    "qatar": "lusail",
    "canada": "montreal",
    "yas-island": "yas-marina-circuit",
    "monte-carlo": "monaco",
    "mexico-city": "mexico",
}


def resolve_filename(track_id: str) -> str:
    return SLUG_TO_FILENAME.get(track_id, track_id)


def hydrate_corner_distances(
    year: int,
    limit: int | None = None,
    rounds: set[int] | None = None,
    circuits: set[str] | None = None,
) -> tuple[int, int]:
    try:
        import fastf1  # type: ignore
    except ImportError:
        print("FastF1 is not installed. Run: pip install fastf1")
        sys.exit(1)

    cache_dir = REPO_ROOT / "tmp_fastf1_cache"
    cache_dir.mkdir(exist_ok=True)
    fastf1.Cache.enable_cache(str(cache_dir))

    schedule = fastf1.get_event_schedule(year, include_testing=False)
    if schedule.empty:
        print(f"No events for year {year}")
        return (0, 0)

    # Pre-resolve which round numbers we actually want to hydrate so we never
    # load timing/laps data for skipped events. Without this filter the script
    # downloads every Grand Prix in the season just to discover which ones
    # match the requested circuits.
    target_rounds: set[int] | None = rounds.copy() if rounds is not None else None
    if circuits is not None:
        derived: set[int] = set()
        for index, event in schedule.iterrows():
            country = str(event.get("Country", "")).lower().replace(" ", "-")
            location = str(event.get("Location", "")).lower().replace(" ", "-")
            event_name = str(event.get("EventName", "")).lower().replace(" ", "-")
            for candidate in (location, country, event_name):
                if not candidate:
                    continue
                if candidate in circuits:
                    derived.add(int(event["RoundNumber"]))
                    break
                if resolve_filename(candidate) in circuits:
                    derived.add(int(event["RoundNumber"]))
                    break
        if derived:
            target_rounds = derived if target_rounds is None else (target_rounds & derived)
        else:
            print(f"No matching rounds found for circuits={circuits}")
            return (0, 0)

    ok = 0
    failed = 0

    for index, event in schedule.iterrows():
        if limit is not None and (ok + failed) >= limit:
            break

        round_num = int(event["RoundNumber"])
        if target_rounds is not None and round_num not in target_rounds:
            continue
        country = str(event.get("Country", ""))
        location = str(event.get("Location", ""))
        official = str(event.get("OfficialEventName", ""))
        print(f"\n=== Round {round_num}: {official} ({location}) ===")

        try:
            session = fastf1.get_session(year, round_num, "R")
            session.load(telemetry=True, weather=False, laps=True, messages=False)
            circuit = session.get_circuit_info()
            corners = circuit.corners
            if corners is None or corners.empty:
                print("  no corners returned, skipping")
                failed += 1
                continue

            # Add Distance column using the fastest lap as reference.
            try:
                fastest_lap = session.laps.pick_fastest()
                if fastest_lap is not None and "Distance" not in corners.columns:
                    circuit.add_marker_distance(fastest_lap)
                    corners = circuit.corners
            except Exception as error:
                print(f"  distance computation skipped: {error}")

            # Resolve which `data/track-shapes/<filename>.json` we should write to.
            short = str(getattr(circuit, "short_name", "")).lower().replace(" ", "-")
            candidates = [
                short,
                resolve_filename(short),
                resolve_filename(location.lower().replace(" ", "-")),
                resolve_filename(country.lower().replace(" ", "-")),
            ]

            target_path = None
            for candidate in candidates:
                if not candidate:
                    continue
                trial = TRACK_SHAPES_DIR / f"{candidate}.json"
                if trial.exists():
                    target_path = trial
                    break

            if target_path is None:
                print(f"  no canonical shape file for short={short} location={location}; skipped")
                failed += 1
                continue

            if circuits is not None and target_path.stem.lower() not in circuits:
                continue

            payload = json.loads(target_path.read_text(encoding="utf-8"))

            corner_records = []
            for _, row in corners.iterrows():
                distance = row.get("Distance", None)
                if distance is None or (isinstance(distance, float) and math.isnan(distance)):
                    track_position = None
                else:
                    track_position = float(distance)
                corner_records.append(
                    {
                        "number": int(row.get("Number", 0)),
                        "letter": str(row.get("Letter", "")),
                        "angleDeg": float(row.get("Angle", 0.0)),
                        "trackPosition": track_position,
                    }
                )

            payload["corners"] = corner_records
            payload["fastF1HydratedAt"] = "computed-via-fastf1-circuit-info"
            target_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            print(f"  hydrated {len(corner_records)} corners into {target_path.relative_to(REPO_ROOT)}")
            ok += 1
        except Exception as error:
            print(f"  FAIL: {error}")
            failed += 1

    return (ok, failed)


def main() -> None:
    parser = argparse.ArgumentParser(description="Hydrate corner distances into canonical track shapes via FastF1.")
    parser.add_argument("--year", type=int, default=2025)
    parser.add_argument("--limit", type=int, default=None, help="Stop after this many circuits (testing).")
    parser.add_argument(
        "--rounds",
        type=str,
        default=None,
        help="Comma-separated list of round numbers to hydrate (e.g. 6,21).",
    )
    parser.add_argument(
        "--circuits",
        type=str,
        default=None,
        help="Comma-separated list of canonical track-shape filenames (without .json) to hydrate.",
    )
    args = parser.parse_args()

    if not TRACK_SHAPES_DIR.exists():
        print(f"track-shapes directory missing: {TRACK_SHAPES_DIR}")
        sys.exit(1)

    rounds = None
    if args.rounds:
        rounds = {int(value.strip()) for value in args.rounds.split(",") if value.strip()}

    circuits = None
    if args.circuits:
        circuits = {value.strip().lower() for value in args.circuits.split(",") if value.strip()}

    ok, failed = hydrate_corner_distances(args.year, args.limit, rounds=rounds, circuits=circuits)
    print(f"\nDone. ok={ok} failed={failed}")


if __name__ == "__main__":
    main()
