import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

import type { TelemetryIngestRequest } from "@globe/contracts";
import telemetrySchema from "../../contracts/telemetry.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(telemetrySchema);

export function assertTelemetryRequestValid(payload: TelemetryIngestRequest): void {
  if (!validate(payload)) {
    const msg = validate.errors ? ajv.errorsText(validate.errors, { separator: "\n" }) : "unknown";
    throw new Error(`TelemetryIngestRequest failed JSON Schema validation:\n${msg}`);
  }
}
