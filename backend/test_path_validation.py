import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from backend.main import (
    SEASON_PACK_ROOT,
    compare_key_path,
    safe_path,
    session_base_path,
    validate_chunk_index,
    validate_identifier,
    validate_season,
)


class PathValidationTests(unittest.TestCase):
    def test_valid_identifiers_build_a_session_path(self) -> None:
        path = session_base_path(2025, "australian-grand-prix", "race")
        self.assertEqual(
            path,
            SEASON_PACK_ROOT / "2025" / "australian-grand-prix" / "race",
        )

    def test_traversal_identifiers_are_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            session_base_path(2025, "../teams", "race")

    def test_resolved_path_escape_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "root"
            root.mkdir()
            with self.assertRaises(HTTPException):
                safe_path(root, "..", "outside.json")

    def test_season_and_chunk_validation(self) -> None:
        self.assertEqual(validate_season(2025), "2025")
        self.assertEqual(validate_identifier("red-bull-racing", "team"), "red-bull-racing")
        self.assertEqual(
            compare_key_path(2025, "australian-grand-prix", "race", "ver-nor").name,
            "ver-nor.json",
        )
        self.assertEqual(validate_chunk_index(0), 0)
        with self.assertRaises(HTTPException):
            validate_season("2025/../2026")
        with self.assertRaises(HTTPException):
            validate_chunk_index(-1)


if __name__ == "__main__":
    unittest.main()
