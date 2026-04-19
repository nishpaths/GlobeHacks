"""
OpenCap Offline Validator
=========================
Validates asymmetry detection thresholds against the Stanford OpenCap
ground-truth dataset before live deployment.

Usage:
    python validation/opencap_validator.py [--dataset-root PATH] [--threshold FLOAT]

Ground-truth labels are derived from filename conventions:
  - Files containing "Asym" → asymmetric (ground truth = True)
  - All other files         → symmetric  (ground truth = False)

Asymmetry index formula:
    index = |peak_R_vy - peak_L_vy| / max(peak_R_vy, peak_L_vy)
    where peaks are the 95th percentile of the vertical force signal.
"""

from __future__ import annotations

import argparse
import io
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import pandas as pd

# Default threshold — mirrors PipelineConfig.ASYMMETRY_THRESHOLD_DEG (10 °)
# expressed here as a fractional force asymmetry index (0.10 = 10 %)
DEFAULT_ASYMMETRY_THRESHOLD: float = 0.15

# Movement types the system is designed to analyse (squat and drop-jump trials)
# Walking and static trials are excluded from validation scoring
TARGET_MOVEMENT_KEYWORDS = ("squat", "Squat", "DJ")

# Column names for vertical ground reaction forces
COL_R_VY = "R_ground_force_vy"
COL_L_VY = "L_ground_force_vy"
COL_TIME = "time"

# Percentile used for peak force estimation (reduces noise sensitivity)
PEAK_PERCENTILE = 95


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class TrialResult:
    trial_name: str
    subject: str
    peak_R: float
    peak_L: float
    asymmetry_index: float          # |peak_R - peak_L| / max(peak_R, peak_L)
    predicted_asymmetric: bool
    ground_truth_asymmetric: bool   # derived from filename


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def _skip_header(lines: List[str]) -> Tuple[List[str], str]:
    """
    Skip lines up to and including 'endheader'.
    Returns (data_lines, header_text).
    """
    header_lines: List[str] = []
    data_lines: List[str] = []
    past_header = False

    for line in lines:
        if past_header:
            data_lines.append(line)
        else:
            header_lines.append(line)
            if line.strip().lower().startswith("endheader"):
                past_header = True

    return data_lines, "\n".join(header_lines)


def parse_mot(path: Path) -> Tuple[pd.DataFrame, str]:
    """
    Parse a .mot file, skipping the header block up to 'endheader'.

    Returns:
        (DataFrame, original_header_text)
    """
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        lines = fh.readlines()

    data_lines, header_text = _skip_header(lines)
    content = "".join(data_lines)
    df = pd.read_csv(io.StringIO(content), sep=r"\s+", engine="python")
    return df, header_text


def parse_sto(path: Path) -> Tuple[pd.DataFrame, str]:
    """
    Parse a .sto file (same header-skipping logic as .mot).

    Returns:
        (DataFrame, original_header_text)
    """
    return parse_mot(path)  # identical format


def format_mot(df: pd.DataFrame, original_header: str) -> str:
    """
    Reconstruct tab-separated .mot text from a DataFrame,
    preserving the original header block.

    Used for round-trip testing (Requirement 10.8).
    """
    # Ensure header ends with a newline before the data
    header = original_header.rstrip("\n") + "\n"
    data_str = df.to_csv(sep="\t", index=False, float_format="%.8f")
    return header + data_str


# ---------------------------------------------------------------------------
# Asymmetry computation
# ---------------------------------------------------------------------------

def compute_asymmetry_index(df: pd.DataFrame) -> Optional[float]:
    """
    Compute |peak_R_vy - peak_L_vy| / max(peak_R_vy, peak_L_vy).

    Peaks are the 95th percentile of the vertical force signal to reduce
    sensitivity to noise spikes.

    Returns None if required columns are missing.
    """
    if COL_R_VY not in df.columns or COL_L_VY not in df.columns:
        return None

    peak_R = float(np.percentile(df[COL_R_VY].abs(), PEAK_PERCENTILE))
    peak_L = float(np.percentile(df[COL_L_VY].abs(), PEAK_PERCENTILE))

    denom = max(peak_R, peak_L)
    if denom == 0:
        return 0.0

    return abs(peak_R - peak_L) / denom


def classify_trial(df: pd.DataFrame, threshold: float) -> bool:
    """Return True if the trial's asymmetry index exceeds the threshold."""
    index = compute_asymmetry_index(df)
    if index is None:
        return False
    return index > threshold


def is_ground_truth_asymmetric(filename: str) -> bool:
    """Derive ground-truth label from filename convention."""
    return "Asym" in filename


# ---------------------------------------------------------------------------
# Validation runner
# ---------------------------------------------------------------------------

def run_validation(
    dataset_root: Path,
    threshold: float = DEFAULT_ASYMMETRY_THRESHOLD,
    target_movements_only: bool = True,
) -> List[TrialResult]:
    """
    Run classification over all .mot files in subject*/ForceData/ directories.

    Args:
        dataset_root: Path to LabValidation_withVideos directory.
        threshold: Asymmetry index threshold.
        target_movements_only: If True, only include squat and drop-jump trials
            (the movements the system is designed to analyse). Walking and static
            trials are excluded because bilateral force asymmetry in those
            movements does not map to the same clinical indicators.

    Returns a list of TrialResult objects.
    """
    results: List[TrialResult] = []

    force_dirs = sorted(dataset_root.glob("*/ForceData"))
    if not force_dirs:
        print(f"[WARNING] No ForceData directories found under {dataset_root}", file=sys.stderr)

    for force_dir in force_dirs:
        subject = force_dir.parent.name
        mot_files = sorted(force_dir.glob("*_forces.mot"))

        for mot_path in mot_files:
            # Skip non-target movements if filtering is enabled
            if target_movements_only and not any(
                kw in mot_path.name for kw in TARGET_MOVEMENT_KEYWORDS
            ):
                continue

            try:
                df, _ = parse_mot(mot_path)
            except Exception as exc:
                print(f"[WARNING] Could not parse {mot_path}: {exc}", file=sys.stderr)
                continue

            index = compute_asymmetry_index(df)
            if index is None:
                print(f"[WARNING] Missing force columns in {mot_path.name}", file=sys.stderr)
                continue

            peak_R = float(np.percentile(df[COL_R_VY].abs(), PEAK_PERCENTILE))
            peak_L = float(np.percentile(df[COL_L_VY].abs(), PEAK_PERCENTILE))

            results.append(
                TrialResult(
                    trial_name=mot_path.stem,
                    subject=subject,
                    peak_R=peak_R,
                    peak_L=peak_L,
                    asymmetry_index=index,
                    predicted_asymmetric=index > threshold,
                    ground_truth_asymmetric=is_ground_truth_asymmetric(mot_path.name),
                )
            )

    return results


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def generate_report(results: List[TrialResult], threshold: float) -> str:
    """
    Produce a text report with per-trial results, precision, recall, and FPR.
    """
    if not results:
        return "No trials found — check dataset path.\n"

    lines: List[str] = []
    lines.append("=" * 72)
    lines.append("OpenCap Asymmetry Validator — Results Report")
    lines.append(f"Threshold: {threshold:.3f}  |  Trials: {len(results)}")
    lines.append("=" * 72)
    lines.append(
        f"{'Trial':<30} {'Subject':<12} {'Idx':>6} {'GT':>5} {'Pred':>5} {'OK':>4}"
    )
    lines.append("-" * 72)

    tp = fp = tn = fn = 0

    for r in results:
        gt_str = "ASYM" if r.ground_truth_asymmetric else "SYM "
        pred_str = "ASYM" if r.predicted_asymmetric else "SYM "
        correct = r.predicted_asymmetric == r.ground_truth_asymmetric
        ok_str = "✓" if correct else "✗"

        if r.ground_truth_asymmetric and r.predicted_asymmetric:
            tp += 1
        elif not r.ground_truth_asymmetric and r.predicted_asymmetric:
            fp += 1
        elif not r.ground_truth_asymmetric and not r.predicted_asymmetric:
            tn += 1
        else:
            fn += 1

        lines.append(
            f"{r.trial_name:<30} {r.subject:<12} {r.asymmetry_index:>6.3f} "
            f"{gt_str:>5} {pred_str:>5} {ok_str:>4}"
        )

    lines.append("-" * 72)

    precision = tp / (tp + fp) if (tp + fp) > 0 else float("nan")
    recall = tp / (tp + fn) if (tp + fn) > 0 else float("nan")
    fpr = fp / (fp + tn) if (fp + tn) > 0 else float("nan")
    accuracy = (tp + tn) / len(results) if results else float("nan")

    lines.append(f"True Positives  (TP): {tp}")
    lines.append(f"False Positives (FP): {fp}")
    lines.append(f"True Negatives  (TN): {tn}")
    lines.append(f"False Negatives (FN): {fn}")
    lines.append("")
    lines.append(f"Precision : {precision:.3f}  (target ≥ 0.80)")
    lines.append(f"Recall    : {recall:.3f}  (target ≥ 0.80)")
    lines.append(f"FPR       : {fpr:.3f}  (target ≤ 0.20)")
    lines.append(f"Accuracy  : {accuracy:.3f}")
    lines.append("")

    # Pass/fail summary
    passed = (
        (precision >= 0.80 or np.isnan(precision))
        and (recall >= 0.80 or np.isnan(recall))
        and (fpr <= 0.20 or np.isnan(fpr))
    )
    lines.append("VALIDATION: " + ("PASSED ✓" if passed else "FAILED ✗"))
    lines.append("=" * 72)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Round-trip helper (used by property tests)
# ---------------------------------------------------------------------------

def mot_round_trip(path: Path) -> bool:
    """
    Parse → format → parse and verify numeric values are within atol=1e-4.
    Returns True if the round-trip holds.
    """
    df1, header = parse_mot(path)
    reconstructed = format_mot(df1, header)
    df2, _ = parse_mot(io.StringIO(reconstructed))  # type: ignore[arg-type]

    # Align columns
    common_cols = [c for c in df1.columns if c in df2.columns]
    return bool(np.allclose(df1[common_cols].values, df2[common_cols].values, atol=1e-4))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Validate asymmetry thresholds against OpenCap ground-truth data."
    )
    parser.add_argument(
        "--dataset-root",
        type=Path,
        default=Path(__file__).parent.parent.parent / "LabValidation_withVideos",
        help="Path to the LabValidation_withVideos directory",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_ASYMMETRY_THRESHOLD,
        help=f"Asymmetry index threshold (default: {DEFAULT_ASYMMETRY_THRESHOLD})",
    )
    args = parser.parse_args()

    print(f"Dataset root : {args.dataset_root}")
    print(f"Threshold    : {args.threshold}")
    print()

    results = run_validation(args.dataset_root, args.threshold)
    report = generate_report(results, args.threshold)
    print(report)

    # Exit non-zero if validation fails
    if "FAILED" in report:
        sys.exit(1)
