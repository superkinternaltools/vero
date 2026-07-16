"use client";

import { useEffect, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, MapPin, Check, Clock } from "lucide-react";
import { createClient } from "@/core/db/client";
import { cn } from "@/core/lib/utils";
import { recordPunch } from "../actions";
import type { PunchContext } from "../types";

type Kind = "check_in" | "check_out" | "mid";

function CaptureButton({
  kind,
  label,
  busy,
  onFile,
}: {
  kind: Kind;
  label: string;
  busy: boolean;
  onFile: (e: ChangeEvent<HTMLInputElement>, kind: Kind) => void;
}) {
  const id = `cap-${kind}`;
  return (
    <>
      <label
        htmlFor={id}
        className={cn(
          "rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background",
          busy ? "pointer-events-none opacity-50" : "cursor-pointer",
        )}
      >
        {label}
      </label>
      <input id={id} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onFile(e, kind)} />
    </>
  );
}

export function PunchClient({ ctx }: { ctx: PunchContext }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function onFile(e: ChangeEvent<HTMLInputElement>, kind: Kind) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !a) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${ctx.date}/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await supabase.storage.from("attendance").upload(path, file);
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const photoUrl = supabase.storage.from("attendance").getPublicUrl(path).data.publicUrl;
    setUploading(false);
    start(async () => {
      const res = await recordPunch({
        kind,
        workDate: ctx.date,
        assignmentId: a.assignmentId,
        rosterId: a.rosterId,
        storeId: a.storeId,
        photoUrl,
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

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">My attendance</h1>
      <p className="mt-1 text-sm text-muted-foreground">{dateLabel}</p>

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
                        <CaptureButton kind={kind} label="Take photo" busy={busy} onFile={onFile} />
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
                        <CaptureButton kind={kind} label="Take photo" busy={busy} onFile={onFile} />
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
              <CaptureButton kind="mid" label="Add" busy={busy} onFile={onFile} />
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
            Live camera only. Your first photo becomes your reference. Every photo is recorded — being
            outside the store just adds a flag, it never blocks you.
          </p>
        </div>
      )}
    </div>
  );
}
