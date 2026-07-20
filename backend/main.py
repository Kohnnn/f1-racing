from __future__ import annotations

import asyncio
import json
import math
import os
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data"
MANIFEST_ROOT = DATA_ROOT / "manifests"
SEASON_PACK_ROOT = DATA_ROOT / "packs" / "seasons"
TEAM_ROOT = DATA_ROOT / "teams"


def parse_cors_origins() -> list[str]:
    raw = (
        os.getenv("F1_CORS_ALLOWED_ORIGINS")
        or os.getenv("VLEGAL_CORS_ALLOWED_ORIGINS")
        or ""
    )
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    if not origins:
        origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    return origins


app = FastAPI(title="F1 Racing API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


IDENTIFIER_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
SEASON_RE = re.compile(r"[0-9]{4}")


def invalid_request(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


def validate_season(season: int | str) -> str:
    value = str(season)
    if not SEASON_RE.fullmatch(value):
        raise invalid_request("Invalid season")
    return value


def validate_identifier(value: str, label: str) -> str:
    if not isinstance(value, str) or not IDENTIFIER_RE.fullmatch(value):
        raise invalid_request(f"Invalid {label}")
    return value


def validate_chunk_index(chunk_index: Any) -> int:
    if isinstance(chunk_index, bool) or not isinstance(chunk_index, int) or chunk_index < 0:
        raise invalid_request("Replay chunk index must be a nonnegative integer")
    return chunk_index


def validate_seek_time(time_seconds: Any) -> float:
    if isinstance(time_seconds, bool) or not isinstance(time_seconds, (int, float)):
        raise invalid_request("Replay seek time must be a nonnegative number")
    value = float(time_seconds)
    if not math.isfinite(value) or value < 0:
        raise invalid_request("Replay seek time must be a nonnegative number")
    return value


def safe_path(root: Path, *parts: str) -> Path:
    resolved_root = root.resolve()
    resolved_path = root.joinpath(*parts).resolve()
    if not resolved_path.is_relative_to(resolved_root):
        raise invalid_request("Invalid file path")
    return resolved_path


def read_json(path: Path, root: Path) -> Any:
    resolved_path = path.resolve()
    if not resolved_path.is_relative_to(root.resolve()):
        raise invalid_request("Invalid file path")
    try:
        return json.loads(resolved_path.read_text("utf-8"))
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=404, detail=f"File not found: {path.name}"
        ) from error


def session_base_path(season: int | str, grand_prix: str, session: str) -> Path:
    return safe_path(
        SEASON_PACK_ROOT,
        validate_season(season),
        validate_identifier(grand_prix, "grand prix"),
        validate_identifier(session, "session"),
    )


def compare_key_path(
    season: int | str, grand_prix: str, session: str, key: str
) -> Path:
    return safe_path(
        session_base_path(season, grand_prix, session),
        "compare",
        f"{validate_identifier(key, 'compare key')}.json",
    )


def replay_meta_path(season: int | str, grand_prix: str, session: str) -> Path:
    return safe_path(session_base_path(season, grand_prix, session), "replay.meta.json")


def replay_full_path(season: int | str, grand_prix: str, session: str) -> Path:
    return safe_path(session_base_path(season, grand_prix, session), "replay.json")


def session_file_path(
    season: int | str, grand_prix: str, session: str, filename: str
) -> Path:
    return safe_path(session_base_path(season, grand_prix, session), filename)


def read_replay_meta(
    season: int | str, grand_prix: str, session: str
) -> dict[str, Any]:
    base_path = session_base_path(season, grand_prix, session)
    meta_path = replay_meta_path(season, grand_prix, session)
    if meta_path.exists():
        return read_json(meta_path, base_path)
    return read_json(replay_full_path(season, grand_prix, session), base_path)


def read_replay_full(
    season: int | str, grand_prix: str, session: str
) -> dict[str, Any]:
    base_path = session_base_path(season, grand_prix, session)
    return read_json(replay_full_path(season, grand_prix, session), base_path)


def read_latest_session_ref() -> dict[str, Any] | None:
    manifest = read_json(safe_path(MANIFEST_ROOT, "latest.json"), MANIFEST_ROOT)
    latest = manifest.get("latest")
    if not isinstance(latest, dict):
        return None
    return latest


def replay_chunk_entries(meta: dict[str, Any]) -> list[dict[str, Any]]:
    entries = meta.get("frameChunkIndex") or []
    if not isinstance(entries, list) or not all(isinstance(entry, dict) for entry in entries):
        raise HTTPException(status_code=500, detail="Replay chunk index is invalid")
    return entries


def read_replay_chunk_payload(
    season: int | str, grand_prix: str, session: str, entry: dict[str, Any]
) -> dict[str, Any]:
    chunk_path = entry.get("path")
    if not isinstance(chunk_path, str) or not chunk_path:
        raise HTTPException(status_code=500, detail="Replay chunk path is invalid")
    base_path = session_base_path(season, grand_prix, session)
    return read_json(safe_path(base_path, chunk_path), base_path)


def resolve_replay_chunk(
    season: int | str, grand_prix: str, session: str, chunk_index: int
) -> dict[str, Any]:
    validated_chunk_index = validate_chunk_index(chunk_index)
    for entry in replay_chunk_entries(read_replay_meta(season, grand_prix, session)):
        if entry.get("index") == validated_chunk_index:
            return read_replay_chunk_payload(season, grand_prix, session, entry)
    raise HTTPException(
        status_code=404, detail=f"Replay chunk {validated_chunk_index} not found"
    )


def resolve_replay_chunk_for_time(
    season: int | str, grand_prix: str, session: str, time_seconds: float
) -> dict[str, Any]:
    validated_time = validate_seek_time(time_seconds)
    chunk_entries = replay_chunk_entries(read_replay_meta(season, grand_prix, session))
    for entry in chunk_entries:
        from_time = entry.get("fromTime")
        to_time = entry.get("toTime")
        if (
            isinstance(from_time, (int, float))
            and not isinstance(from_time, bool)
            and isinstance(to_time, (int, float))
            and not isinstance(to_time, bool)
            and from_time <= validated_time <= to_time
        ):
            return {
                "entry": entry,
                "payload": read_replay_chunk_payload(season, grand_prix, session, entry),
            }
    if chunk_entries:
        entry = chunk_entries[-1]
        return {
            "entry": entry,
            "payload": read_replay_chunk_payload(season, grand_prix, session, entry),
        }
    raise HTTPException(status_code=404, detail="Replay chunk index is unavailable")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "f1-racing-api",
    }


@app.get("/api/latest")
def latest_manifest() -> Any:
    return read_json(safe_path(MANIFEST_ROOT, "latest.json"), MANIFEST_ROOT)


@app.get("/api/live/status")
def live_status() -> dict[str, Any]:
    latest = read_latest_session_ref()
    if not latest:
        return {"live": None}

    return {
        "live": {
            "season": latest.get("season"),
            "grandPrixSlug": latest.get("grandPrixSlug"),
            "grandPrixName": latest.get("grandPrixName"),
            "sessionSlug": latest.get("sessionSlug"),
            "sessionName": latest.get("sessionName"),
            "trackId": latest.get("trackId"),
            "sessionKey": latest.get("sessionKey"),
            "path": latest.get("path"),
            "source": "simulated-replay",
        }
    }


@app.get("/api/search")
def search_sessions(q: str = Query(default="")) -> dict[str, Any]:
    query = q.strip().lower()
    season_index = read_json(safe_path(MANIFEST_ROOT, "seasons.json"), MANIFEST_ROOT)
    matches = []
    for season in season_index.get("seasons", []):
        for grand_prix in season.get("grandsPrix", []):
            for session in grand_prix.get("sessions", []):
                haystack = [
                    str(season.get("season", "")),
                    grand_prix.get("grandPrixName", ""),
                    grand_prix.get("grandPrixSlug", ""),
                    session.get("sessionName", ""),
                    session.get("trackId", ""),
                ]
                if query and not any(query in value.lower() for value in haystack):
                    continue
                matches.append(
                    {
                        "season": season.get("season"),
                        "grandPrix": grand_prix.get("grandPrixName"),
                        "session": session.get("sessionName"),
                        "trackId": session.get("trackId"),
                        "path": session.get("path"),
                    }
                )
    return {
        "query": q,
        "count": len(matches),
        "matches": matches,
    }


@app.get("/api/teams/{team_id}")
def team_profile(team_id: str) -> Any:
    path = safe_path(TEAM_ROOT, f"{validate_identifier(team_id, 'team')}.json")
    return read_json(path, TEAM_ROOT)


@app.get("/api/sessions/{season}/{grand_prix}/{session}/manifest")
def session_manifest(season: int, grand_prix: str, session: str) -> Any:
    base_path = session_base_path(season, grand_prix, session)
    return read_json(session_file_path(season, grand_prix, session, "manifest.json"), base_path)


@app.get("/api/sessions/{season}/{grand_prix}/{session}/summary")
def session_summary(season: int, grand_prix: str, session: str) -> Any:
    base_path = session_base_path(season, grand_prix, session)
    return read_json(session_file_path(season, grand_prix, session, "summary.json"), base_path)


@app.get("/api/sessions/{season}/{grand_prix}/{session}/drivers")
def session_drivers(season: int, grand_prix: str, session: str) -> Any:
    base_path = session_base_path(season, grand_prix, session)
    return read_json(session_file_path(season, grand_prix, session, "drivers.json"), base_path)


@app.get("/api/sessions/{season}/{grand_prix}/{session}/laps")
def session_laps(season: int, grand_prix: str, session: str) -> Any:
    base_path = session_base_path(season, grand_prix, session)
    return read_json(session_file_path(season, grand_prix, session, "laps.json"), base_path)


@app.get("/api/sessions/{season}/{grand_prix}/{session}/strategy")
def session_strategy(season: int, grand_prix: str, session: str) -> Any:
    base_path = session_base_path(season, grand_prix, session)
    return read_json(session_file_path(season, grand_prix, session, "strategy.json"), base_path)


@app.get("/api/sessions/{season}/{grand_prix}/{session}/stints")
def session_stints(season: int, grand_prix: str, session: str) -> Any:
    base_path = session_base_path(season, grand_prix, session)
    return read_json(session_file_path(season, grand_prix, session, "stints.json"), base_path)


@app.get("/api/sessions/{season}/{grand_prix}/{session}/compare/{compare_key}")
def session_compare(
    season: int, grand_prix: str, session: str, compare_key: str
) -> Any:
    base_path = session_base_path(season, grand_prix, session)
    return read_json(compare_key_path(season, grand_prix, session, compare_key), base_path)


@app.get("/api/replay/{season}/{grand_prix}/{session}/meta")
def replay_meta(season: int, grand_prix: str, session: str) -> Any:
    return read_replay_meta(season, grand_prix, session)


@app.get("/api/replay/{season}/{grand_prix}/{session}/full")
def replay_full(season: int, grand_prix: str, session: str) -> Any:
    return read_replay_full(season, grand_prix, session)


@app.get("/api/replay/{season}/{grand_prix}/{session}/chunk/{chunk_index}")
def replay_chunk(season: int, grand_prix: str, session: str, chunk_index: int) -> Any:
    return resolve_replay_chunk(season, grand_prix, session, chunk_index)


@app.websocket("/ws/replay/{season}/{grand_prix}/{session}")
async def replay_socket(
    websocket: WebSocket, season: int, grand_prix: str, session: str
) -> None:
    await websocket.accept()
    try:
        meta = read_replay_meta(season, grand_prix, session)
    except HTTPException as error:
        await websocket.send_json({"type": "error", "message": str(error.detail)})
        await websocket.close(code=4400)
        return
    await websocket.send_json({"type": "meta", "payload": meta})

    try:
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict):
                await websocket.send_json({"type": "error", "message": "Invalid message"})
                continue
            message_type = message.get("type")

            if message_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if message_type == "meta":
                await websocket.send_json({"type": "meta", "payload": meta})
                continue

            try:
                if message_type == "chunk":
                    chunk_index = validate_chunk_index(message.get("index"))
                    payload = resolve_replay_chunk(season, grand_prix, session, chunk_index)
                    await websocket.send_json(
                        {"type": "chunk", "index": chunk_index, "payload": payload}
                    )
                    continue

                if message_type == "seek":
                    target_time = validate_seek_time(message.get("time"))
                    chunk = resolve_replay_chunk_for_time(
                        season, grand_prix, session, target_time
                    )
                    await websocket.send_json(
                        {
                            "type": "chunk",
                            "index": chunk["entry"]["index"],
                            "payload": chunk["payload"],
                        }
                    )
                    continue
            except HTTPException as error:
                await websocket.send_json({"type": "error", "message": str(error.detail)})
                continue

            await websocket.send_json(
                {
                    "type": "error",
                    "message": f"Unsupported message type: {message_type}",
                }
            )
    except (WebSocketDisconnect, ValueError):
        return


@app.websocket("/ws/live/{season}/{grand_prix}/{session}")
async def live_socket(
    websocket: WebSocket,
    season: int,
    grand_prix: str,
    session: str,
    speed: float = 8.0,
    delay: float = 0.0,
) -> None:
    await websocket.accept()

    try:
        replay = read_replay_full(season, grand_prix, session)
    except HTTPException as error:
        await websocket.send_json({"type": "error", "message": str(error.detail)})
        await websocket.close(code=4404)
        return

    frames = replay.get("frames") or []
    if not frames:
        await websocket.send_json(
            {"type": "error", "message": "Replay feed has no frames"}
        )
        await websocket.close(code=4404)
        return

    speed_factor = max(0.25, min(speed, 64.0))
    delay_seconds = max(0.0, min(delay, 60.0))
    race_control_messages = replay.get("raceControlMessages") or []
    visible_messages: list[dict[str, Any]] = []
    rc_index = 0

    await websocket.send_json(
        {
            "type": "status",
            "message": "Starting simulated live feed",
            "source": "simulated-replay",
            "delay": delay_seconds,
        }
    )
    await websocket.send_json(
        {
            "type": "ready",
            "sessionKey": replay.get("sessionKey"),
            "grandPrix": replay.get("grandPrix"),
            "session": replay.get("session"),
            "trackId": replay.get("trackId"),
            "speed": speed_factor,
            "delay": delay_seconds,
            "source": "simulated-replay",
        }
    )

    # Backend-side delay buffer: queue (sendAt, payload) tuples and release them
    # in order. Frames are produced at `speed_factor` x real time and held in
    # the queue for `delay_seconds` of wall-clock time before broadcasting.
    queue: list[tuple[float, dict[str, Any]]] = []

    async def flush_due_frames(now: float) -> bool:
        i = 0
        while i < len(queue) and queue[i][0] <= now:
            _, payload = queue[i]
            await websocket.send_json(payload)
            i += 1
        if i:
            del queue[:i]
        return True

    try:
        loop = asyncio.get_event_loop()
        for index, frame in enumerate(frames):
            frame_time = float(frame.get("t", 0))
            while rc_index < len(race_control_messages):
                message_time = float(race_control_messages[rc_index].get("t", 0))
                if message_time > frame_time:
                    break
                visible_messages.append(race_control_messages[rc_index])
                rc_index += 1

            payload = {
                "type": "frame",
                "frame": frame,
                "rcMessages": visible_messages[-6:],
                "source": "simulated-replay",
            }
            release_at = loop.time() + delay_seconds
            queue.append((release_at, payload))

            await flush_due_frames(loop.time())

            if index >= len(frames) - 1:
                break

            next_time = float(frames[index + 1].get("t", frame_time))
            inter_frame = max(
                0.05, min(1.25, (next_time - frame_time) / speed_factor)
            )
            await asyncio.sleep(inter_frame)

        # Drain the remaining buffered frames after the simulation finishes.
        if queue:
            tail_until = max(release for release, _ in queue)
            while queue and loop.time() < tail_until:
                await asyncio.sleep(0.05)
                await flush_due_frames(loop.time())
            await flush_due_frames(float("inf"))

        await websocket.send_json({"type": "finished", "source": "simulated-replay"})
    except (WebSocketDisconnect, RuntimeError):
        return
