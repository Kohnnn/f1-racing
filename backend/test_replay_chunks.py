import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

import backend.main as main


class ReplayChunksTests(unittest.TestCase):
    def test_chunked_replay_endpoints_and_live_stream(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            session_path = Path(directory) / "2025" / "test-grand-prix" / "race"
            frames_path = session_path / "replay.frames"
            frames_path.mkdir(parents=True)
            (session_path / "replay.meta.json").write_text(
                json.dumps(
                    {
                        "sessionKey": 1,
                        "grandPrix": "Test Grand Prix",
                        "session": "Race",
                        "trackId": "test-track",
                        "frameCount": 2,
                        "frameChunkIndex": [
                            {
                                "index": 1,
                                "fromTime": 1,
                                "toTime": 1,
                                "path": "replay.frames/chunk-001.json",
                            },
                            {
                                "index": 0,
                                "fromTime": 0,
                                "toTime": 0,
                                "path": "replay.frames/chunk-000.json",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            (frames_path / "chunk-000.json").write_text(
                json.dumps(
                    {"index": 0, "fromTime": 0, "toTime": 0, "frames": [{"t": 0}]}
                ),
                encoding="utf-8",
            )
            (frames_path / "chunk-001.json").write_text(
                json.dumps(
                    {"index": 1, "fromTime": 1, "toTime": 1, "frames": [{"t": 1}]}
                ),
                encoding="utf-8",
            )
            (session_path / "replay.race-control.json").write_text("[]", encoding="utf-8")

            original_root = main.SEASON_PACK_ROOT
            main.SEASON_PACK_ROOT = Path(directory)
            try:
                with TestClient(main.app) as client:
                    self.assertEqual(
                        client.get("/api/replay/2025/test-grand-prix/race/meta").status_code,
                        200,
                    )
                    self.assertEqual(
                        client.get("/api/replay/2025/test-grand-prix/race/chunk/0").json()["index"],
                        0,
                    )
                    self.assertEqual(
                        client.get("/api/replay/2025/test-grand-prix/race/full").status_code,
                        404,
                    )
                    with client.websocket_connect("/ws/live/2025/test-grand-prix/race?speed=64") as socket:
                        self.assertEqual(socket.receive_json()["type"], "status")
                        self.assertEqual(socket.receive_json()["type"], "ready")
                        self.assertEqual(socket.receive_json()["frame"]["t"], 0)
                        self.assertEqual(socket.receive_json()["frame"]["t"], 1)
            finally:
                main.SEASON_PACK_ROOT = original_root

    def test_chunk_headers_must_match_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            session_path = Path(directory) / "2025" / "test-grand-prix" / "race"
            frames_path = session_path / "replay.frames"
            frames_path.mkdir(parents=True)
            (session_path / "replay.meta.json").write_text(
                json.dumps(
                    {
                        "frameCount": 1,
                        "frameChunkIndex": [
                            {
                                "index": 0,
                                "fromTime": 0,
                                "toTime": 0,
                                "path": "replay.frames/chunk-000.json",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            (frames_path / "chunk-000.json").write_text(
                json.dumps(
                    {"index": 0, "fromTime": 1, "toTime": 1, "frames": [{"t": 1}]}
                ),
                encoding="utf-8",
            )

            original_root = main.SEASON_PACK_ROOT
            main.SEASON_PACK_ROOT = Path(directory)
            try:
                with self.assertRaises(main.HTTPException):
                    main.resolve_replay_chunk(2025, "test-grand-prix", "race", 0)
            finally:
                main.SEASON_PACK_ROOT = original_root

    def test_chunk_time_ranges_must_not_overlap(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            session_path = Path(directory) / "2025" / "test-grand-prix" / "race"
            session_path.mkdir(parents=True)
            (session_path / "replay.meta.json").write_text(
                json.dumps(
                    {
                        "frameCount": 4,
                        "frameChunkIndex": [
                            {
                                "index": 0,
                                "fromTime": 0,
                                "toTime": 1,
                                "path": "replay.frames/chunk-000.json",
                            },
                            {
                                "index": 1,
                                "fromTime": 1,
                                "toTime": 2,
                                "path": "replay.frames/chunk-001.json",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            original_root = main.SEASON_PACK_ROOT
            main.SEASON_PACK_ROOT = Path(directory)
            try:
                with self.assertRaises(main.HTTPException):
                    main.read_replay_meta(2025, "test-grand-prix", "race")
            finally:
                main.SEASON_PACK_ROOT = original_root


if __name__ == "__main__":
    unittest.main()
