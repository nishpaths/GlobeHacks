"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import Webcam from "react-webcam";
import PipelineEventBus from "@/lib/pipelineEventBus";
import { PipelineConfig } from "@/config/pipelineConfig";

interface WebcamStreamProps {
  onStreamReady: (videoEl: HTMLVideoElement) => void;
  onStreamError: (error: Error) => void;
  onStreamInterrupted: () => void;
}

type StreamState = "initialising" | "active" | "error" | "interrupted";

/**
 * Wraps react-webcam and exposes the underlying HTMLVideoElement to the pipeline.
 * Handles permission denial, stream interruption, and error UI states.
 */
export default function WebcamStream({
  onStreamReady,
  onStreamError,
  onStreamInterrupted,
}: WebcamStreamProps) {
  const webcamRef = useRef<Webcam>(null);
  const [streamState, setStreamState] = useState<StreamState>("initialising");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const handleUserMedia = useCallback(
    (stream: MediaStream) => {
      const videoEl = webcamRef.current?.video;
      if (!videoEl) return;

      // Listen for track ending (stream interrupted)
      const track = stream.getVideoTracks()[0];
      if (track) {
        trackRef.current = track;
        track.addEventListener("ended", () => {
          setStreamState("interrupted");
          PipelineEventBus.emit("stream-interrupted");
          onStreamInterrupted();
        });
      }

      setStreamState("active");
      onStreamReady(videoEl);
    },
    [onStreamReady, onStreamInterrupted]
  );

  const handleUserMediaError = useCallback(
    (error: string | DOMException) => {
      const message =
        error instanceof DOMException
          ? `Camera access denied: ${error.message}. Please allow camera access to use this feature.`
          : `Camera error: ${error}. Camera access is required for mobility analysis.`;

      setStreamState("error");
      setErrorMessage(message);
      PipelineEventBus.emit("camera-permission-denied", { message });
      onStreamError(new Error(message));
    },
    [onStreamError]
  );

  // Cleanup track listener on unmount
  useEffect(() => {
    return () => {
      if (trackRef.current) {
        trackRef.current.stop();
      }
    };
  }, []);

  if (streamState === "error") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-red-300 bg-red-50 p-8 text-center">
        <div className="mb-3 text-4xl">📷</div>
        <h2 className="mb-2 text-lg font-semibold text-red-800">
          Camera Access Required
        </h2>
        <p className="max-w-sm text-sm text-red-700">{errorMessage}</p>
        <p className="mt-3 text-xs text-red-500">
          Please refresh the page and allow camera access when prompted.
        </p>
      </div>
    );
  }

  if (streamState === "interrupted") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-yellow-300 bg-yellow-50 p-8 text-center">
        <div className="mb-3 text-4xl">⚠️</div>
        <h2 className="mb-2 text-lg font-semibold text-yellow-800">
          Camera Stream Interrupted
        </h2>
        <p className="max-w-sm text-sm text-yellow-700">
          The camera feed was disconnected. Please refresh the page to restart
          your mobility session.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {streamState === "initialising" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-gray-900/80">
          <div className="text-center text-white">
            <div className="mb-2 text-2xl">⏳</div>
            <p className="text-sm">Initialising camera…</p>
          </div>
        </div>
      )}
      <Webcam
        ref={webcamRef}
        audio={false}
        width={PipelineConfig.WEBCAM_WIDTH}
        height={PipelineConfig.WEBCAM_HEIGHT}
        videoConstraints={{
          width: PipelineConfig.WEBCAM_WIDTH,
          height: PipelineConfig.WEBCAM_HEIGHT,
          facingMode: "user",
        }}
        onUserMedia={handleUserMedia}
        onUserMediaError={handleUserMediaError}
        className="rounded-lg"
        mirrored={true}
      />
    </div>
  );
}
