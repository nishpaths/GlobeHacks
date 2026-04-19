export default function HomePage() {
  return (
    <main
      style={{
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        maxWidth: 720,
        margin: "0 auto",
        padding: "4rem 1.5rem",
        lineHeight: 1.6
      }}
    >
      <h1>Recovery Intelligence Backend</h1>
      <p>
        This deployment exposes the authenticated <code>POST /api/telemetry</code>{" "}
        proxy for the Hydrawav3 Recovery Intelligence workflow.
      </p>
    </main>
  );
}
