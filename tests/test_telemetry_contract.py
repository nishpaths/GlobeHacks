"""Contract tests for the Recovery Intelligence telemetry payload."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from backend.main import build_telemetry_response, validate_telemetry_request


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE_REQUEST_PATH = ROOT / "contracts" / "examples" / "telemetry.request.example.json"


def load_example_request() -> dict:
    return json.loads(EXAMPLE_REQUEST_PATH.read_text(encoding="utf-8"))


class TelemetryContractTests(unittest.TestCase):
    def test_example_request_is_valid(self) -> None:
        payload = load_example_request()
        errors = validate_telemetry_request(payload)
        self.assertEqual(errors, [])

    def test_success_response_contains_expected_fields(self) -> None:
        payload = load_example_request()
        response = build_telemetry_response(payload["sessionId"])

        self.assertTrue(response["success"])
        self.assertEqual(
            response["message"], "Recovery telemetry session created successfully."
        )
        self.assertEqual(response["sessionId"], payload["sessionId"])
        self.assertIn("createdAt", response)

    def test_rejects_malformed_uuid(self) -> None:
        payload = load_example_request()
        payload["sessionId"] = "not-a-uuid"
        errors = validate_telemetry_request(payload)
        self.assertIn("sessionId must be a valid UUID", errors)

    def test_rejects_malformed_timestamp(self) -> None:
        payload = load_example_request()
        payload["timestamp"] = "04/18/2026 17:35:42"
        errors = validate_telemetry_request(payload)
        self.assertIn("timestamp must be a valid ISO 8601 string", errors)

    def test_rejects_missing_movements(self) -> None:
        payload = load_example_request()
        del payload["movements"]
        errors = validate_telemetry_request(payload)
        self.assertTrue(
            any("payload is missing required keys" in error for error in errors)
        )

    def test_rejects_empty_angle_series(self) -> None:
        payload = load_example_request()
        payload["movements"][0]["jointTelemetry"]["left_knee"]["angleSeries"] = []
        errors = validate_telemetry_request(payload)
        self.assertIn(
            "movements[0].jointTelemetry.left_knee.angleSeries must be a non-empty array",
            errors,
        )

    def test_rejects_out_of_bounds_overlay_position(self) -> None:
        payload = load_example_request()
        payload["movements"][0]["recommendedPads"][0]["position"]["x"] = 1.2
        errors = validate_telemetry_request(payload)
        self.assertIn(
            "movements[0].recommendedPads[0].position.x must be between 0 and 1",
            errors,
        )

    def test_rejects_unsupported_pad_type(self) -> None:
        payload = load_example_request()
        payload["movements"][0]["recommendedPads"][0]["padType"] = "Star"
        errors = validate_telemetry_request(payload)
        self.assertIn(
            "movements[0].recommendedPads[0].padType must be one of ['Moon', 'Sun']",
            errors,
        )

    def test_rejects_missing_protocol_field(self) -> None:
        payload = load_example_request()
        del payload["movements"][0]["protocolSuggestion"]["mechanicalFrequencyHz"]
        errors = validate_telemetry_request(payload)
        self.assertTrue(
            any("protocolSuggestion is missing required keys" in error for error in errors)
        )


if __name__ == "__main__":
    unittest.main()
