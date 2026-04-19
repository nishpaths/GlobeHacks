"""Recovery Intelligence telemetry ingest endpoint and validation helpers.

This module provides a lightweight `POST /api/telemetry` endpoint using only
the Python standard library so the contract can be exercised immediately during
the hackathon without adding framework dependencies first.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from uuid import UUID


SCHEMA_VERSION = "1.0.0"
ALLOWED_PAD_TYPES = {"Sun", "Moon"}


def _is_iso8601(value: Any) -> bool:
    if not isinstance(value, str):
        return False

    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _is_uuid(value: Any) -> bool:
    if not isinstance(value, str):
        return False

    try:
        UUID(value)
        return True
    except (ValueError, TypeError):
        return False


def _validate_number(value: Any, field_path: str, errors: list[str]) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        errors.append(f"{field_path} must be a number")


def _validate_position(position: Any, field_path: str, errors: list[str]) -> None:
    if not isinstance(position, dict):
        errors.append(f"{field_path} must be an object")
        return

    required_keys = {"x", "y"}
    extra_keys = set(position.keys()) - required_keys
    missing_keys = required_keys - set(position.keys())

    if missing_keys:
        errors.append(f"{field_path} is missing required keys: {sorted(missing_keys)}")
    if extra_keys:
        errors.append(f"{field_path} contains unsupported keys: {sorted(extra_keys)}")

    for axis in ("x", "y"):
        value = position.get(axis)
        _validate_number(value, f"{field_path}.{axis}", errors)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if value < 0 or value > 1:
                errors.append(f"{field_path}.{axis} must be between 0 and 1")


def validate_telemetry_request(payload: Any) -> list[str]:
    """Validate the telemetry ingest payload against the v1 contract."""

    errors: list[str] = []

    if not isinstance(payload, dict):
        return ["payload must be a JSON object"]

    required_top_level = {"schemaVersion", "sessionId", "timestamp", "movements"}
    allowed_top_level = required_top_level

    missing_top_level = required_top_level - set(payload.keys())
    extra_top_level = set(payload.keys()) - allowed_top_level

    if missing_top_level:
        errors.append(
            f"payload is missing required keys: {sorted(missing_top_level)}"
        )
    if extra_top_level:
        errors.append(f"payload contains unsupported keys: {sorted(extra_top_level)}")

    if payload.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(f"schemaVersion must be '{SCHEMA_VERSION}'")

    if not _is_uuid(payload.get("sessionId")):
        errors.append("sessionId must be a valid UUID")

    if not _is_iso8601(payload.get("timestamp")):
        errors.append("timestamp must be a valid ISO 8601 string")

    movements = payload.get("movements")
    if not isinstance(movements, list) or not movements:
        errors.append("movements must be a non-empty array")
        return errors

    for movement_index, movement in enumerate(movements):
        base_path = f"movements[{movement_index}]"
        if not isinstance(movement, dict):
            errors.append(f"{base_path} must be an object")
            continue

        required_movement = {
            "movementType",
            "captureWindow",
            "repCount",
            "jointTelemetry",
            "alignmentValidated",
            "asymmetryAnalysis",
            "recommendedPads",
            "protocolSuggestion",
        }
        missing_movement = required_movement - set(movement.keys())
        if missing_movement:
            errors.append(
                f"{base_path} is missing required keys: {sorted(missing_movement)}"
            )

        if not isinstance(movement.get("movementType"), str) or not movement.get(
            "movementType"
        ):
            errors.append(f"{base_path}.movementType must be a non-empty string")

        capture_window = movement.get("captureWindow")
        if not isinstance(capture_window, dict):
            errors.append(f"{base_path}.captureWindow must be an object")
        else:
            required_capture = {"startedAt", "endedAt", "durationMs"}
            missing_capture = required_capture - set(capture_window.keys())
            if missing_capture:
                errors.append(
                    f"{base_path}.captureWindow is missing required keys: "
                    f"{sorted(missing_capture)}"
                )
            if not _is_iso8601(capture_window.get("startedAt")):
                errors.append(f"{base_path}.captureWindow.startedAt must be ISO 8601")
            if not _is_iso8601(capture_window.get("endedAt")):
                errors.append(f"{base_path}.captureWindow.endedAt must be ISO 8601")
            _validate_number(
                capture_window.get("durationMs"),
                f"{base_path}.captureWindow.durationMs",
                errors,
            )

        rep_count = movement.get("repCount")
        if not isinstance(rep_count, int) or rep_count < 1:
            errors.append(f"{base_path}.repCount must be an integer >= 1")

        joint_telemetry = movement.get("jointTelemetry")
        if not isinstance(joint_telemetry, dict) or not joint_telemetry:
            errors.append(f"{base_path}.jointTelemetry must be a non-empty object")
        else:
            for joint_name, telemetry in joint_telemetry.items():
                joint_path = f"{base_path}.jointTelemetry.{joint_name}"
                if not isinstance(joint_name, str) or not joint_name:
                    errors.append(f"{joint_path} uses an invalid joint name")
                    continue
                if not isinstance(telemetry, dict):
                    errors.append(f"{joint_path} must be an object")
                    continue
                required_joint = {"angleSeries", "maxFlexion"}
                missing_joint = required_joint - set(telemetry.keys())
                if missing_joint:
                    errors.append(
                        f"{joint_path} is missing required keys: {sorted(missing_joint)}"
                    )
                angle_series = telemetry.get("angleSeries")
                if not isinstance(angle_series, list) or not angle_series:
                    errors.append(f"{joint_path}.angleSeries must be a non-empty array")
                else:
                    for angle_index, value in enumerate(angle_series):
                        _validate_number(
                            value, f"{joint_path}.angleSeries[{angle_index}]", errors
                        )
                _validate_number(telemetry.get("maxFlexion"), f"{joint_path}.maxFlexion", errors)

        if not isinstance(movement.get("alignmentValidated"), bool):
            errors.append(f"{base_path}.alignmentValidated must be a boolean")

        asymmetry_analysis = movement.get("asymmetryAnalysis")
        if not isinstance(asymmetry_analysis, list) or not asymmetry_analysis:
            errors.append(f"{base_path}.asymmetryAnalysis must be a non-empty array")
        else:
            for analysis_index, analysis in enumerate(asymmetry_analysis):
                analysis_path = f"{base_path}.asymmetryAnalysis[{analysis_index}]"
                if not isinstance(analysis, dict):
                    errors.append(f"{analysis_path} must be an object")
                    continue
                required_analysis = {
                    "jointType",
                    "leftPeak",
                    "rightPeak",
                    "delta",
                    "thresholdExceeded",
                }
                missing_analysis = required_analysis - set(analysis.keys())
                if missing_analysis:
                    errors.append(
                        f"{analysis_path} is missing required keys: "
                        f"{sorted(missing_analysis)}"
                    )
                if not isinstance(analysis.get("jointType"), str) or not analysis.get(
                    "jointType"
                ):
                    errors.append(f"{analysis_path}.jointType must be a non-empty string")
                _validate_number(analysis.get("leftPeak"), f"{analysis_path}.leftPeak", errors)
                _validate_number(analysis.get("rightPeak"), f"{analysis_path}.rightPeak", errors)
                _validate_number(analysis.get("delta"), f"{analysis_path}.delta", errors)
                if not isinstance(analysis.get("thresholdExceeded"), bool):
                    errors.append(f"{analysis_path}.thresholdExceeded must be a boolean")

        recommended_pads = movement.get("recommendedPads")
        if not isinstance(recommended_pads, list) or not recommended_pads:
            errors.append(f"{base_path}.recommendedPads must be a non-empty array")
        else:
            for pad_index, pad in enumerate(recommended_pads):
                pad_path = f"{base_path}.recommendedPads[{pad_index}]"
                if not isinstance(pad, dict):
                    errors.append(f"{pad_path} must be an object")
                    continue
                required_pad = {"padType", "targetMuscle", "position"}
                missing_pad = required_pad - set(pad.keys())
                if missing_pad:
                    errors.append(
                        f"{pad_path} is missing required keys: {sorted(missing_pad)}"
                    )
                if pad.get("padType") not in ALLOWED_PAD_TYPES:
                    errors.append(f"{pad_path}.padType must be one of {sorted(ALLOWED_PAD_TYPES)}")
                if not isinstance(pad.get("targetMuscle"), str) or not pad.get(
                    "targetMuscle"
                ):
                    errors.append(f"{pad_path}.targetMuscle must be a non-empty string")
                _validate_position(pad.get("position"), f"{pad_path}.position", errors)

        protocol = movement.get("protocolSuggestion")
        if not isinstance(protocol, dict):
            errors.append(f"{base_path}.protocolSuggestion must be an object")
        else:
            required_protocol = {
                "thermalCycleSeconds",
                "photobiomodulation",
                "mechanicalFrequencyHz",
            }
            missing_protocol = required_protocol - set(protocol.keys())
            if missing_protocol:
                errors.append(
                    f"{base_path}.protocolSuggestion is missing required keys: "
                    f"{sorted(missing_protocol)}"
                )
            _validate_number(
                protocol.get("thermalCycleSeconds"),
                f"{base_path}.protocolSuggestion.thermalCycleSeconds",
                errors,
            )
            _validate_number(
                protocol.get("mechanicalFrequencyHz"),
                f"{base_path}.protocolSuggestion.mechanicalFrequencyHz",
                errors,
            )
            photobiomodulation = protocol.get("photobiomodulation")
            if not isinstance(photobiomodulation, dict):
                errors.append(
                    f"{base_path}.protocolSuggestion.photobiomodulation must be an object"
                )
            else:
                required_photo = {"redNm", "blueNm"}
                missing_photo = required_photo - set(photobiomodulation.keys())
                if missing_photo:
                    errors.append(
                        f"{base_path}.protocolSuggestion.photobiomodulation is missing "
                        f"required keys: {sorted(missing_photo)}"
                    )
                _validate_number(
                    photobiomodulation.get("redNm"),
                    f"{base_path}.protocolSuggestion.photobiomodulation.redNm",
                    errors,
                )
                _validate_number(
                    photobiomodulation.get("blueNm"),
                    f"{base_path}.protocolSuggestion.photobiomodulation.blueNm",
                    errors,
                )

    return errors


def build_telemetry_response(session_id: str) -> dict[str, Any]:
    """Build the success envelope returned after a telemetry session is stored."""

    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "success": True,
        "message": "Recovery telemetry session created successfully.",
        "sessionId": session_id,
        "createdAt": created_at,
    }


class TelemetryRequestHandler(BaseHTTPRequestHandler):
    """Minimal HTTP handler exposing `POST /api/telemetry`."""

    server_version = "RecoveryTelemetryHTTP/1.0"

    def _send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if self.path != "/api/telemetry":
            self._send_json(
                HTTPStatus.NOT_FOUND,
                {"success": False, "message": "Route not found."},
            )
            return

        content_length = self.headers.get("Content-Length")
        if content_length is None:
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"success": False, "message": "Content-Length header is required."},
            )
            return

        try:
            body = self.rfile.read(int(content_length))
            payload = json.loads(body.decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"success": False, "message": "Request body must be valid JSON."},
            )
            return

        errors = validate_telemetry_request(payload)
        if errors:
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {
                    "success": False,
                    "message": "Telemetry payload failed contract validation.",
                    "errors": errors,
                },
            )
            return

        self._send_json(HTTPStatus.CREATED, build_telemetry_response(payload["sessionId"]))

    def log_message(self, format: str, *args: Any) -> None:
        """Silence the default access log during local tests."""


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    """Run the local telemetry development server."""

    server = ThreadingHTTPServer((host, port), TelemetryRequestHandler)
    print(f"Recovery telemetry server listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
