from __future__ import annotations

import asyncio
import json
import os
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


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text("utf-8"))
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=404, detail=f"File not found: {path.name}"
        ) from error


def session_base_path(season: int | str, grand_prix: str, session: str) -> Path:
    return SEASON_PACK_ROOT / str(season) / grand_prix / session


def compare_key_path(
    season: int | str, grand_prix: str, session: str, key: str
) -> Path:
    return session_base_path(season, grand_prix, session) / "compare" / f"{key}.json"


def replay_meta_path(season: int | str, grand_prix: str, session: str) -> Path:
    return session_base_path(season, grand_prix, session) / "replay.meta.json"


def replay_full_path(season: int | str, grand_prix: str, session: str) -> Path:
    return session_base_path(season, grand_prix, session) / "replay.json"


def read_replay_meta(
    season: int | str, grand_prix: str, session: str
) -> dict[str, Any]:
    meta_path = replay_meta_path(season, grand_prix, session)
    if meta_path.exists():
        return read_json(meta_path)
    return read_json(replay_full_path(season, grand_prix, session))


def read_replay_full(
    season: int | str, grand_prix: str, session: str
) -> dict[str, Any]:
    return read_json(replay_full_path(season, grand_prix, session))


def read_latest_session_ref() -> dict[str, Any] | None:
    manifest = read_json(MANIFEST_ROOT / "latest.json")
    latest = manifest.get("latest")
    if not isinstance(latest, dict):
        return None
    return latest


def resolve_replay_chunk(
    season: int | str, grand_prix: str, session: str, chunk_index: int
) -> dict[str, Any]:
    meta = read_replay_meta(season, grand_prix, session)
    chunk_entries = meta.get("frameChunkIndex") or []
    for entry in chunk_entries:
        if entry.get("index") == chunk_index:
            return read_json(
                session_base_path(season, grand_prix, session) / entry["path"]
            )
    raise HTTPException(status_code=404, detail=f"Replay chunk {chunk_index} not found")


def resolve_replay_chunk_for_time(
    season: int | str, grand_prix: str, session: str, time_seconds: float
) -> dict[str, Any]:
    meta = read_replay_meta(season, grand_prix, session)
    chunk_entries = meta.get("frameChunkIndex") or []
    for entry in chunk_entries:
        if entry["fromTime"] <= time_seconds <= entry["toTime"]:
            payload = read_json(
                session_base_path(season, grand_prix, session) / entry["path"]
            )
            return {
                "entry": entry,
                "payload": payload,
            }
    if chunk_entries:
        entry = chunk_entries[-1]
        payload = read_json(
            session_base_path(season, grand_prix, session) / entry["path"]
        )
        return {
            "entry": entry,
            "payload": payload,
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
    return read_json(MANIFEST_ROOT / "latest.json")


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
    season_index = read_json(MANIFEST_ROOT / "seasons.json")
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
    return read_json(TEAM_ROOT / f"{team_id}.json")


@app.get("/api/sessions/{season}/{grand_prix}/{session}/manifest")
def session_manifest(season: int, grand_prix: str, session: str) -> Any:
    return read_json(session_base_path(season, grand_prix, session) / "manifest.json")


@app.get("/api/sessions/{season}/{grand_prix}/{session}/summary")
def session_summary(season: int, grand_prix: str, session: str) -> Any:
    return read_json(session_base_path(season, grand_prix, session) / "summary.json")


@app.get("/api/sessions/{season}/{grand_prix}/{session}/drivers")
def session_drivers(season: int, grand_prix: str, session: str) -> Any:
    return read_json(session_base_path(season, grand_prix, session) / "drivers.json")


@app.get("/api/sessions/{season}/{grand_prix}/{session}/laps")
def session_laps(season: int, grand_prix: str, session: str) -> Any:
    return read_json(session_base_path(season, grand_prix, session) / "laps.json")


@app.get("/api/sessions/{season}/{grand_prix}/{session}/strategy")
def session_strategy(season: int, grand_prix: str, session: str) -> Any:
    return read_json(session_base_path(season, grand_prix, session) / "strategy.json")


@app.get("/api/sessions/{season}/{grand_prix}/{session}/stints")
def session_stints(season: int, grand_prix: str, session: str) -> Any:
    return read_json(session_base_path(season, grand_prix, session) / "stints.json")


@app.get("/api/sessions/{season}/{grand_prix}/{session}/compare/{compare_key}")
def session_compare(
    season: int, grand_prix: str, session: str, compare_key: str
) -> Any:
    return read_json(compare_key_path(season, grand_prix, session, compare_key))


@app.get("/api/replay/{season}/{grand_prix}/{session}/meta")
def replay_meta(season: int, grand_prix: str, session: str) -> Any:
    return read_replay_meta(season, grand_prix, session)


@app.get("/api/replay/{season}/{grand_prix}/{session}/full")
def replay_full(season: int, grand_prix: str, session: str) -> Any:
    return read_json(replay_full_path(season, grand_prix, session))


@app.get("/api/replay/{season}/{grand_prix}/{session}/chunk/{chunk_index}")
def replay_chunk(season: int, grand_prix: str, session: str, chunk_index: int) -> Any:
    return resolve_replay_chunk(season, grand_prix, session, chunk_index)


@app.websocket("/ws/replay/{season}/{grand_prix}/{session}")
async def replay_socket(
    websocket: WebSocket, season: int, grand_prix: str, session: str
) -> None:
    await websocket.accept()
    meta = read_replay_meta(season, grand_prix, session)
    await websocket.send_json({"type": "meta", "payload": meta})

    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")

            if message_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if message_type == "meta":
                await websocket.send_json({"type": "meta", "payload": meta})
                continue

            if message_type == "chunk":
                chunk_index = int(message.get("index", 0))
                payload = resolve_replay_chunk(season, grand_prix, session, chunk_index)
                await websocket.send_json(
                    {"type": "chunk", "index": chunk_index, "payload": payload}
                )
                continue

            if message_type == "seek":
                target_time = float(message.get("time", 0))
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

            await websocket.send_json(
                {
                    "type": "error",
                    "message": f"Unsupported message type: {message_type}",
                }
            )
    except WebSocketDisconnect:
        return


@app.websocket("/ws/live/{season}/{grand_prix}/{session}")
async def live_socket(
    websocket: WebSocket,
    season: int,
    grand_prix: str,
    session: str,
    speed: float = 8.0,
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
    race_control_messages = replay.get("raceControlMessages") or []
    visible_messages: list[dict[str, Any]] = []
    rc_index = 0

    await websocket.send_json(
        {
            "type": "status",
            "message": "Starting simulated live feed",
            "source": "simulated-replay",
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
            "source": "simulated-replay",
        }
    )

    try:
        for index, frame in enumerate(frames):
            frame_time = float(frame.get("t", 0))
            while rc_index < len(race_control_messages):
                message_time = float(race_control_messages[rc_index].get("t", 0))
                if message_time > frame_time:
                    break
                visible_messages.append(race_control_messages[rc_index])
                rc_index += 1

            await websocket.send_json(
                {
                    "type": "frame",
                    "frame": frame,
                    "rcMessages": visible_messages[-6:],
                    "source": "simulated-replay",
                }
            )

            if index >= len(frames) - 1:
                break

            next_time = float(frames[index + 1].get("t", frame_time))
            delay_seconds = max(
                0.05, min(1.25, (next_time - frame_time) / speed_factor)
            )
            await asyncio.sleep(delay_seconds)

        await websocket.send_json({"type": "finished", "source": "simulated-replay"})
    except (WebSocketDisconnect, RuntimeError):
        return
