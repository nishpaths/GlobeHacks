"use client";

import React from "react";

/**
 * Rendered when the PoseEngine fails to initialise within 10 seconds.
 * Halts pipeline rendering — no webcam or downstream components are shown.
 */
export default function PoseEngineErrorState() {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-red-300 bg-red-50 p-10 text-center"
    >
      <div className="mb-4 text-5xl">🔧</div>
      <h2 className="mb-2 text-xl font-semibold text-red-800">
        Mobility Analysis Unavailable
      </h2>
      <p className="mb-4 max-w-sm text-sm text-red-700">
        The motion tracking engine could not be loaded. This may be due to a
        slow connection or an unsupported browser.
      </p>
      <ul className="mb-4 list-inside list-disc text-left text-sm text-red-600">
        <li>Check your internet connection</li>
        <li>Try a modern browser (Chrome, Edge, or Firefox)</li>
        <li>Disable browser extensions that may block scripts</li>
      </ul>
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg bg-red-700 px-5 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        Retry
      </button>
    </div>
  );
}
