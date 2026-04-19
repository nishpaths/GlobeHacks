declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * Full URL for `POST` telemetry ingest. When unset, `postTelemetry` uses a mock response.
     * @example https://api.example.com/api/telemetry
     */
    NEXT_PUBLIC_TELEMETRY_API_URL?: string;
  }
}
