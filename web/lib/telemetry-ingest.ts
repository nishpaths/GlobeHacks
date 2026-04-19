import { buildInFilter, InsforgeApiClient } from "@/lib/insforge-api";
import {
  generateProtocolSuggestion,
  type HistoricalMovementSummary
} from "@/lib/protocol-engine";
import {
  validateTelemetryRequest,
  type MovementTelemetry,
  type ProtocolSuggestion,
  type TelemetryIngestRequest,
  type TelemetryIngestResponse
} from "@/lib/telemetry-contract";

interface ClinicStaffRow {
  id: string;
  clinic_id: string;
  role: string;
}

interface RecoveryProfileRow {
  id: string;
  clinic_id: string;
}

interface RecoverySessionRow {
  id: string;
  captured_at: string;
}

interface SessionMovementRow {
  id: string;
  session_id: string;
  movement_type: string;
  alignment_validated: boolean;
}

interface AsymmetryRow {
  movement_id: string;
  joint_type: string;
  left_peak: number;
  right_peak: number;
  delta: number;
  threshold_exceeded: boolean;
}

interface ProtocolRecommendationRow {
  movement_id: string;
  thermal_cycle_seconds: number;
  photobiomodulation_red_nm: number;
  photobiomodulation_blue_nm: number;
  mechanical_frequency_hz: number;
}

export class TelemetryHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>
  ) {
    super(body.message as string);
  }
}

export interface TelemetryIngestOptions {
  payload: unknown;
  authorization: string | null;
  baseUrl: string;
  apiClient?: Pick<
    InsforgeApiClient,
    "queryRecords" | "createRecords" | "chatCompletion"
  >;
  now?: () => string;
}

function error(
  status: number,
  message: string,
  extra?: Record<string, unknown>
): never {
  throw new TelemetryHttpError(status, {
    success: false,
    message,
    ...extra
  });
}

async function ensureRecoveryProfile(
  apiClient: Pick<InsforgeApiClient, "queryRecords" | "createRecords">,
  payload: TelemetryIngestRequest,
  recoveryProfileId: string,
  clinicId: string,
  userId: string
) {
  const profiles = await apiClient.queryRecords<RecoveryProfileRow>("recovery_profiles", {
    select: "id,clinic_id",
    id: `eq.${recoveryProfileId}`,
    limit: 1
  });

  if (profiles.length === 0) {
    await apiClient.createRecords("recovery_profiles", [
      {
        id: recoveryProfileId,
        clinic_id: clinicId,
        created_by: userId
      }
    ]);
    return;
  }

  if (profiles[0].clinic_id !== clinicId) {
    error(
      403,
      "Recovery profile belongs to a different clinic and cannot be used here."
    );
  }
}

async function loadHistory(
  apiClient: Pick<InsforgeApiClient, "queryRecords">,
  recoveryProfileId: string
): Promise<HistoricalMovementSummary[]> {
  const sessions = await apiClient.queryRecords<RecoverySessionRow>("recovery_sessions", {
    select: "id,captured_at",
    recovery_profile_id: `eq.${recoveryProfileId}`,
    order: "captured_at.desc",
    limit: 5
  });

  if (sessions.length === 0) {
    return [];
  }

  const sessionIds = sessions.map((session) => session.id);
  const movements = await apiClient.queryRecords<SessionMovementRow>("session_movements", {
    select: "id,session_id,movement_type,alignment_validated",
    session_id: buildInFilter(sessionIds)
  });

  if (movements.length === 0) {
    return [];
  }

  const movementIds = movements.map((movement) => movement.id);
  const asymmetryRows = await apiClient.queryRecords<AsymmetryRow>(
    "asymmetry_indicators",
    {
      select:
        "movement_id,joint_type,left_peak,right_peak,delta,threshold_exceeded",
      movement_id: buildInFilter(movementIds)
    }
  );
  const protocolRows = await apiClient.queryRecords<ProtocolRecommendationRow>(
    "protocol_recommendations",
    {
      select:
        "movement_id,thermal_cycle_seconds,photobiomodulation_red_nm,photobiomodulation_blue_nm,mechanical_frequency_hz",
      movement_id: buildInFilter(movementIds)
    }
  );

  const sessionTimes = new Map(sessions.map((session) => [session.id, session.captured_at]));
  const asymmetryByMovement = new Map<string, HistoricalMovementSummary["asymmetryAnalysis"]>();

  for (const row of asymmetryRows) {
    const current = asymmetryByMovement.get(row.movement_id) ?? [];
    current.push({
      jointType: row.joint_type,
      leftPeak: row.left_peak,
      rightPeak: row.right_peak,
      delta: row.delta,
      thresholdExceeded: row.threshold_exceeded
    });
    asymmetryByMovement.set(row.movement_id, current);
  }

  const protocolByMovement = new Map<string, ProtocolSuggestion>();
  for (const row of protocolRows) {
    protocolByMovement.set(row.movement_id, {
      thermalCycleSeconds: row.thermal_cycle_seconds,
      photobiomodulation: {
        redNm: row.photobiomodulation_red_nm,
        blueNm: row.photobiomodulation_blue_nm
      },
      mechanicalFrequencyHz: row.mechanical_frequency_hz
    });
  }

  return movements
    .map((movement) => ({
      movementType: movement.movement_type,
      capturedAt: sessionTimes.get(movement.session_id) ?? new Date(0).toISOString(),
      alignmentValidated: movement.alignment_validated,
      asymmetryAnalysis: asymmetryByMovement.get(movement.id) ?? [],
      protocolSuggestion: protocolByMovement.get(movement.id) ?? null
    }))
    .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
}

function buildMovementRows(
  sessionId: string,
  movements: MovementTelemetry[]
): Array<
  {
    row: Record<string, unknown>;
    source: MovementTelemetry;
  }
> {
  return movements.map((movement) => ({
    source: movement,
    row: {
      id: crypto.randomUUID(),
      session_id: sessionId,
      movement_type: movement.movementType,
      started_at: movement.captureWindow.startedAt,
      ended_at: movement.captureWindow.endedAt,
      duration_ms: movement.captureWindow.durationMs,
      rep_count: movement.repCount,
      alignment_validated: movement.alignmentValidated
    }
  }));
}

/** Demo bypass: hardcoded staff and clinic UUIDs used until auth is implemented. */
const DEMO_USER_ID = "11111111-1111-1111-1111-111111111111";
const DEMO_CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const DEMO_RECOVERY_PROFILE_ID = "22222222-2222-2222-2222-222222222222";

export async function handleTelemetryIngest(
  options: TelemetryIngestOptions
): Promise<TelemetryIngestResponse> {
  const validation = validateTelemetryRequest(options.payload);
  if (!validation.valid || !validation.data) {
    error(400, "Telemetry payload failed contract validation.", {
      errors: validation.errors
    });
  }

  const payload = validation.data;

  // ── Demo auth bypass ────────────────────────────────────────────────────────
  // JWT checks are skipped until a real auth system is in place.
  // A dummy userId and clinicId are hardcoded so the DB writes proceed.
  const userId = DEMO_USER_ID;
  const clinicId = DEMO_CLINIC_ID;
  // Resolve recoveryProfileId — fall back to demo UUID if not supplied.
  const recoveryProfileId = payload.recoveryProfileId ?? DEMO_RECOVERY_PROFILE_ID;
  // ── End demo bypass ─────────────────────────────────────────────────────────

  // Use a dummy token for the API client (InsforgeApiClient requires a string).
  const dummyToken = "demo-bypass-token";
  const apiClient =
    options.apiClient ?? new InsforgeApiClient(options.baseUrl, process.env.INSFORGE_API_KEY || dummyToken);
  await ensureRecoveryProfile(apiClient, payload, recoveryProfileId, clinicId, userId);

  const existingSessions = await apiClient.queryRecords<RecoverySessionRow>(
    "recovery_sessions",
    {
      select: "id,captured_at",
      id: `eq.${payload.sessionId}`,
      limit: 1
    }
  );

  if (existingSessions.length > 0) {
    error(409, "A telemetry session with this sessionId already exists.");
  }

  const history = await loadHistory(apiClient, recoveryProfileId);

  await apiClient.createRecords("recovery_sessions", [
    {
      id: payload.sessionId,
      recovery_profile_id: recoveryProfileId,
      clinic_id: clinicId,
      captured_at: payload.timestamp,
      schema_version: payload.schemaVersion,
      created_by: userId
    }
  ]);

  const movementRows = buildMovementRows(payload.sessionId, payload.movements);
  await apiClient.createRecords(
    "session_movements",
    movementRows.map(({ row }) => row)
  );

  const jointTelemetryRows: Record<string, unknown>[] = [];
  const asymmetryRows: Record<string, unknown>[] = [];
  const padRows: Record<string, unknown>[] = [];
  const protocolRows: Record<string, unknown>[] = [];
  const movementRecommendations: TelemetryIngestResponse["movementRecommendations"] = [];

  for (const { row, source } of movementRows) {
    const movementId = row.id as string;

    for (const [jointName, telemetry] of Object.entries(source.jointTelemetry)) {
      jointTelemetryRows.push({
        id: crypto.randomUUID(),
        movement_id: movementId,
        joint_name: jointName,
        angle_series: telemetry.angleSeries,
        max_flexion: telemetry.maxFlexion
      });
    }

    for (const asymmetry of source.asymmetryAnalysis) {
      asymmetryRows.push({
        id: crypto.randomUUID(),
        movement_id: movementId,
        joint_type: asymmetry.jointType,
        left_peak: asymmetry.leftPeak,
        right_peak: asymmetry.rightPeak,
        delta: asymmetry.delta,
        threshold_exceeded: asymmetry.thresholdExceeded
      });
    }

    for (const pad of source.recommendedPads) {
      padRows.push({
        id: crypto.randomUUID(),
        movement_id: movementId,
        pad_type: pad.padType,
        target_muscle: pad.targetMuscle,
        position_x: pad.position.x,
        position_y: pad.position.y
      });
    }

    const recommendation = await generateProtocolSuggestion(apiClient, source, history);
    movementRecommendations.push({
      movementType: source.movementType,
      protocolSuggestion: recommendation.protocolSuggestion
    });

    protocolRows.push({
      id: crypto.randomUUID(),
      movement_id: movementId,
      thermal_cycle_seconds: recommendation.protocolSuggestion.thermalCycleSeconds,
      photobiomodulation_red_nm:
        recommendation.protocolSuggestion.photobiomodulation.redNm,
      photobiomodulation_blue_nm:
        recommendation.protocolSuggestion.photobiomodulation.blueNm,
      mechanical_frequency_hz:
        recommendation.protocolSuggestion.mechanicalFrequencyHz,
      source: recommendation.source,
      model_name: recommendation.modelName,
      history_session_count: recommendation.historySessionCount,
      clamped_fields: recommendation.clampedFields,
      generated_at: options.now?.() ?? new Date().toISOString()
    });
  }

  if (jointTelemetryRows.length > 0) {
    await apiClient.createRecords("joint_telemetry", jointTelemetryRows);
  }
  if (asymmetryRows.length > 0) {
    await apiClient.createRecords("asymmetry_indicators", asymmetryRows);
  }
  if (padRows.length > 0) {
    await apiClient.createRecords("pad_recommendations", padRows);
  }
  if (protocolRows.length > 0) {
    await apiClient.createRecords("protocol_recommendations", protocolRows);
  }

  return {
    success: true,
    message: "Recovery telemetry session created successfully.",
    sessionId: payload.sessionId,
    recoveryProfileId,
    createdAt: options.now?.() ?? new Date().toISOString(),
    movementRecommendations
  };
}