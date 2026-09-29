"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import { downloadCsv, money } from "./csv";
import type { SubmitterPayoutRow } from "../types";

const FIELD_TITLES = ["SAE", "ASM"];

type Evaluated = SubmitterPayoutRow & { shared: boolean; toStore: number; toField: number; rule: string };

type StoreSplit = {
  storeName: string;
  fromOwn: number;
  ownCount: number;
  fromField: number;
  fieldCount: number;
  payout: number;
  potential: number;
  photos: Evaluated[];
};

type FieldEarner = { name: string; title: string; photos: number; stores: Set<string>; payout: number };

const VERDICT: Record<SubmitterPayoutRow["verdict"], { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-success/10 text-success" },
  pending: { label: "Awaiting review", cls: "bg-muted text-muted-foreground" },
  rejected: { label: "Rejected", cls: "bg-danger/10 text-danger" },
  none: { label: "No photo", cls: "bg-muted text-muted-foreground" },
};

/** Every photo pays what it pays under the normal rules — the split only
 * decides who receives it. A photo the store sent goes 100% to the store.
 * A photo an SAE/ASM sent is divided: the store gets the set share, the
 * SAE/ASM who sent it gets the rest. The share % and Store Manager handling
 * are page controls, not saved settings. */
export function PayoutSplitSection({ month, rows }: { month: string; rows: SubmitterPayoutRow[] }) {
  const [storePct, setStorePct] = useState(60);
  const [managerIsStore, setManagerIsStore] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const pct = Math.min(100, Math.max(0, Number.isFinite(storePct) ? storePct : 0));
  const fieldPct = 100 - pct;
  const fieldTitles = useMemo(() => (managerIsStore ? FIELD_TITLES : [...FIELD_TITLES, "Store Manager"]), [managerIsStore]);

  const { stores, earners, totals } = useMemo(() => {
    const byStore = new Map<string, StoreSplit>();
    const byEarner = new Map<string, FieldEarner>();
    let payout = 0, potential = 0, toStores = 0, toField = 0, sharedPhotos = 0;

    for (const r of rows) {
      const s = byStore.get(r.storeCode) ?? {
        storeName: r.storeName, fromOwn: 0, ownCount: 0, fromField: 0, fieldCount: 0, payout: 0, potential: 0, photos: [],
      };
      s.potential += r.baseAmount;
      potential += r.baseAmount;
      byStore.set(r.storeCode, s);
      if (r.verdict === "none") continue;

      const amount = r.fullPayout;
      const shared = !!r.submitterTitle && fieldTitles.includes(r.submitterTitle);
      const storeShare = shared ? (amount * pct) / 100 : amount;
      const fieldShare = amount - storeShare;

      let rule: string;
      if (r.verdict === "rejected") rule = "Rejected · nobody is paid";
      else if (r.verdict === "pending") rule = "Awaiting review · nothing to split yet";
      else if (shared) rule = `SAE/ASM sent · store ${pct}%, sender ${fieldPct}% of ${money(amount)}`;
      else rule = r.tierLabel ? `Store sent · 100% (tier ${r.tierLabel})` : "Store sent · 100%";

      if (shared) {
        s.fromField += storeShare;
        s.fieldCount += 1;
        sharedPhotos += 1;
        const key = r.submitterId ?? r.submitterName ?? "unknown";
        const e = byEarner.get(key) ?? { name: r.submitterName ?? "—", title: r.submitterTitle ?? "—", photos: 0, stores: new Set<string>(), payout: 0 };
        e.photos += 1;
        e.stores.add(r.storeCode);
        e.payout += fieldShare;
        byEarner.set(key, e);
      } else {
        s.fromOwn += storeShare;
        s.ownCount += 1;
      }
      s.payout += storeShare;
      payout += amount;
      toStores += storeShare;
      toField += fieldShare;
      s.photos.push({ ...r, shared, toStore: storeShare, toField: fieldShare, rule });
    }

    return {
      stores: [...byStore.values()].sort((a, b) => a.storeName.localeCompare(b.storeName)),
      earners: [...byEarner.values()].sort((a, b) => b.payout - a.payout),
      totals: { payout, potential, toStores, toField, sharedPhotos },
    };
  }, [rows, pct, fieldPct, fieldTitles]);

  function toggle(storeName: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(storeName)) next.delete(storeName);
      else next.add(storeName);
      return next;
    });
  }

  function exportStoresCsv() {
    downloadCsv(
      `payout-split-stores-${month}.csv`,
      ["StoreName", "SentByStore", "SentBySAE_ASM", "Payout", "PotentialPayout"],
      stores.map((s) => [s.storeName, Math.round(s.fromOwn), Math.round(s.fromField), Math.round(s.payout), Math.round(s.potential)]),
    );
  }

  function exportEarnersCsv() {
    downloadCsv(
      `payout-split-sae-asm-${month}.csv`,
      ["Name", "JobTitle", "Photos", "Stores", "Payout"],
      earners.map((e) => [e.name, e.title, e.photos, e.stores.size, Math.round(e.payout)]),
    );
  }

  const storeTitles = managerIsStore ? ["Store Partner", "Store Manager"] : ["Store Partner"];

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Payout split by who submitted</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Each photo pays its normal amount. If the store sent it, the store gets all of it. If an SAE or ASM sent it, the amount is split
        between the store and the person who sent it.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-success">Store sends the photo</p>
          <p className="mt-1.5 text-sm font-semibold text-foreground">Store gets 100%</p>
          <p className="mt-1 text-xs text-muted-foreground">Normal payout rules: approved pays in full (or at its tier %), rejected pays ₹0.</p>
          <TitleChips titles={storeTitles} />
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-info">SAE / ASM sends the photo</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            Store gets
            <input
              type="number"
              min={0}
              max={100}
              value={storePct}
              onChange={(e) => setStorePct(Number(e.target.value))}
              aria-label="Store's share when an SAE or ASM sent the photo"
              className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-right text-base font-bold tabular-nums focus:border-primary focus:outline-none"
            />
            % · sender gets <span className="tabular-nums">{fieldPct}%</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Split of the same amount the photo pays. Rejected pays nobody.</p>
          <TitleChips titles={fieldTitles} />
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">
        <input type="checkbox" checked={managerIsStore} onChange={(e) => setManagerIsStore(e.target.checked)} className="h-4 w-4 accent-warning" />
        <span>
          <b>Store Manager photos count as sent by the store</b> (store gets 100%). Untick to split them like SAE/ASM photos.
        </span>
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total payout" value={money(totals.payout)} sub={`of ${money(totals.potential)} potential`} />
        <Stat label="Paid to stores" value={money(totals.toStores)} sub="own photos + their share of SAE/ASM photos" />
        <Stat label="Paid to SAE / ASM" value={money(totals.toField)} sub={`${fieldPct}% of the photos they sent`} />
        <Stat label="Photos sent by SAE / ASM" value={String(totals.sharedPhotos)} sub="split between store and sender" />
      </div>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Stores</h3>
      <div className="mt-2 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-semibold">Store</th>
              <th className="px-4 py-2.5 text-right font-semibold">Sent by store</th>
              <th className="px-4 py-2.5 text-right font-semibold">Sent by SAE / ASM</th>
              <th className="px-4 py-2.5 text-right font-semibold">Payout</th>
              <th className="px-4 py-2.5 text-right font-semibold">PotentialPayout</th>
            </tr>
          </thead>
          <tbody>
            {stores.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No tasks in this selection.</td>
              </tr>
            )}
            {stores.map((s) => {
              const isOpen = open.has(s.storeName);
              return (
                <Fragment key={s.storeName}>
                  <tr onClick={() => toggle(s.storeName)} className="cursor-pointer border-b border-border tabular-nums hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <ChevronRight className={cn("mr-1 inline h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                      {s.storeName}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {money(s.fromOwn)}
                      <span className="block text-[11px] text-muted-foreground">{s.ownCount} photo{s.ownCount === 1 ? "" : "s"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {money(s.fromField)}
                      <span className="block text-[11px] text-muted-foreground">
                        store&apos;s {pct}% of {s.fieldCount} photo{s.fieldCount === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{money(s.payout)}</td>
                    <td className="px-4 py-3 text-right">{money(s.potential)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border bg-muted/20">
                      <td colSpan={5} className="px-4 py-2 pl-9">
                        {s.photos.length === 0 ? (
                          <p className="py-2 text-xs text-muted-foreground">No photos submitted yet this month.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                                <th className="py-1.5 pr-3 text-left font-semibold">Photo</th>
                                <th className="py-1.5 pr-3 text-left font-semibold">Sent by</th>
                                <th className="py-1.5 pr-3 text-left font-semibold">Verdict</th>
                                <th className="py-1.5 pr-3 text-left font-semibold">Rule</th>
                                <th className="py-1.5 pr-3 text-right font-semibold">Store gets</th>
                                <th className="py-1.5 text-right font-semibold">Sender gets</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.photos.map((p) => (
                                <tr key={p.taskId} className="border-t border-dashed border-border">
                                  <td className="py-2 pr-3 text-foreground">{p.campaignName} · W{p.week}</td>
                                  <td className="py-2 pr-3">
                                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", p.shared ? "bg-info/10 text-info" : "bg-success/10 text-success")}>
                                      {p.submitterTitle ?? "No job title"}
                                    </span>{" "}
                                    <span className="text-muted-foreground">{p.submitterName ?? "—"}</span>
                                  </td>
                                  <td className="py-2 pr-3">
                                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", VERDICT[p.verdict].cls)}>{VERDICT[p.verdict].label}</span>
                                  </td>
                                  <td className="py-2 pr-3 text-muted-foreground">{p.rule}</td>
                                  <td className="py-2 pr-3 text-right font-semibold tabular-nums text-foreground">{money(p.toStore)}</td>
                                  <td className="py-2 text-right tabular-nums text-foreground">{p.shared ? money(p.toField) : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex justify-end">
        <Button variant="outline" onClick={exportStoresCsv} disabled={stores.length === 0}>
          <Download className="h-4 w-4" /> Export stores CSV
        </Button>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-foreground">SAE / ASM earnings</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Each person&apos;s {fieldPct}% share of the photos they sent.</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-semibold">Name</th>
              <th className="px-4 py-2.5 text-left font-semibold">Job title</th>
              <th className="px-4 py-2.5 text-right font-semibold">Photos</th>
              <th className="px-4 py-2.5 text-right font-semibold">Stores</th>
              <th className="px-4 py-2.5 text-right font-semibold">Payout</th>
            </tr>
          </thead>
          <tbody>
            {earners.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No SAE/ASM photos in this selection.</td>
              </tr>
            )}
            {earners.map((e) => (
              <tr key={`${e.name}-${e.title}`} className="border-b border-border tabular-nums last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{e.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.title}</td>
                <td className="px-4 py-3 text-right">{e.photos}</td>
                <td className="px-4 py-3 text-right">{e.stores.size}</td>
                <td className="px-4 py-3 text-right font-semibold text-foreground">{money(e.payout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">The share % isn&apos;t saved — set it each time before exporting.</p>
        <Button variant="outline" onClick={exportEarnersCsv} disabled={earners.length === 0}>
          <Download className="h-4 w-4" /> Export SAE / ASM CSV
        </Button>
      </div>
    </section>
  );
}

function TitleChips({ titles }: { titles: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {titles.map((t) => (
        <span key={t} className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", t === "Store Manager" ? "bg-warning/10 text-warning" : "bg-muted text-foreground")}>
          {t}
        </span>
      ))}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
