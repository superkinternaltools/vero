"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, MapPin, Check, Clock, X } from "lucide-react";
import { createClient } from "@/core/db/client";
import { cn } from "@/core/lib/utils";
import { recordPunch } from "../actions";
import type { PunchContext } from "../types";

type Kind = "check_in" | "check_out" | "mid";

/** Live camera capture — no gallery/file picker. Requests the front camera,
 * shows a preview, and hands back a JPEG blob on capture. This is the only
 * way a punch photo gets taken; there is no <input type="file"> anywhere in
 * this screen. */
function CameraCapture({
  onCapture,
  onCancel,
}: {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr("This browser can't access the camera. Try a recent Chrome or Safari.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch {
        setErr("Camera access was blocked. Allow camera access for this site in your browser settings, then try again.");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    ctx2d.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      "image/jpeg",
      0.88,
    );
  }

  function cancel() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      {err ? (
        <div className="mx-auto max-w-sm px-6 text-center">
          <p className="text-sm text-white">{err}</p>
          <button
            onClick={cancel}
            className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <video ref={videoRef} playsInline muted className="max-h-full max-w-full" />
          <div className="absolute bottom-8 flex items-center gap-6">
            <button
              onClick={cancel}
              aria-label="Cancel"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={capture}
              disabled={!ready}
              aria-label="Take photo"
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/30 disabled:opacity-50"
            >
              <span className="h-12 w-12 rounded-full bg-white" />
            </button>
            <div className="w-12" />
          </div>
        </>
      )}
    </div>
  );
}

export function PunchClient({ ctx }: { ctx: PunchContext }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState<Kind | null>(null);

  const a = ctx.assignment;

  useEffect(() => {
    if (a && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setCoords({ lat: null, lng: null }),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  }, [a]);

  const doneKinds = new Set(ctx.punches.map((p) => p.kind));
  const punchTime = (kind: string) => {
    const p = ctx.punches.find((x) => x.kind === kind);
    return p ? new Date(p.capturedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : null;
  };

  async function onCapture(blob: Blob) {
    const kind = capturing;
    setCapturing(null);
    if (!kind || !a) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const path = `${ctx.date}/${crypto.randomUUID()}.jpg`;
    const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
    const { error: upErr } = await supabase.storage.from("attendance").upload(path, file);
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    // The bucket is private — there's no public URL to compute here. The
    // server generates short-lived signed URLs from the path when a photo
    // actually needs to be displayed (e.g. the log drill-down).
    setUploading(false);
    start(async () => {
      const res = await recordPunch({
        kind,
        workDate: ctx.date,
        assignmentId: a.assignmentId,
        rosterId: a.rosterId,
        storeId: a.storeId,
        photoPath: path,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const busy = uploading || pending;
  const dateLabel = new Date(ctx.date + "T00:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });

  function CaptureButton({ kind, label }: { kind: Kind; label: string }) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setCapturing(kind)}
        className={cn(
          "rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background",
          busy && "pointer-events-none opacity-50",
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      {capturing && <CameraCapture onCapture={onCapture} onCancel={() => setCapturing(null)} />}

      <h1 className="text-2xl font-semibold tracking-tight text-foreground">My attendance</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {ctx.carriedOver ? `Night shift · started ${dateLabel}` : dateLabel}
      </p>

      {!a ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card py-14 text-center">
          <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No shift scheduled for you today.</p>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="text-base font-semibold text-foreground">{a.storeName}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {a.mode === "open" ? "Open shift — log start and finish" : "Fixed shift"}
          </div>

          <div className="mt-4 space-y-2">
            {a.mode === "fixed"
              ? a.windows.map((w, i) => {
                  const kind: Kind = i === 0 ? "check_in" : "check_out";
                  const done = doneKinds.has(kind);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                        done ? "border-border" : "border-primary/40 bg-primary/5",
                      )}
                    >
                      {done ? <Check className="h-5 w-5 text-success" /> : <Camera className="h-5 w-5 text-primary" />}
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">{w.label}</div>
                        <div className="text-xs text-muted-foreground">{w.start}–{w.end}</div>
                      </div>
                      {done ? (
                        <span className="text-xs font-medium text-success">{punchTime(kind)}</span>
                      ) : (
                        <CaptureButton kind={kind} label="Take photo" />
                      )}
                    </div>
                  );
                })
              : (["check_in", "check_out"] as const).map((kind) => {
                  const done = doneKinds.has(kind);
                  return (
                    <div
                      key={kind}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                        done ? "border-border" : "border-primary/40 bg-primary/5",
                      )}
                    >
                      {done ? <Check className="h-5 w-5 text-success" /> : <Camera className="h-5 w-5 text-primary" />}
                      <div className="flex-1 text-sm font-medium text-foreground">
                        {kind === "check_in" ? "Start at store" : "Finish"}
                      </div>
                      {done ? (
                        <span className="text-xs font-medium text-success">{punchTime(kind)}</span>
                      ) : (
                        <CaptureButton kind={kind} label="Take photo" />
                      )}
                    </div>
                  );
                })}

            {/* Optional mid-shift photo */}
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5">
              <Camera className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">Mid-shift photo</div>
                <div className="text-xs text-muted-foreground">Optional · add any time</div>
              </div>
              <CaptureButton kind="mid" label="Add" />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium",
                coords.lat ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
              )}
            >
              <MapPin className="h-3.5 w-3.5" />
              {coords.lat ? "Location captured" : "Getting location…"}
            </span>
            {busy && <span className="text-muted-foreground">Saving…</span>}
          </div>

          {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
          <p className="mt-3 text-xs text-muted-foreground">
            Live camera only — no uploads from your gallery. Your first photo becomes your reference.
            Every photo is recorded — being outside the store just adds a flag, it never blocks you.
          </p>
        </div>
      )}
    </div>
  );
}
