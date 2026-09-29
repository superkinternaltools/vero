"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import { downloadCsv, money } from "./csv";
import type { SubmitterPayoutRow } from "../types";

const FIELD_TITLES = ["SAE", "ASM"];

type Evaluated = SubmitterPayoutRow & { reduced: boolean; payout: number; rule: string };

type StoreSplit = {
  storeName: string;
  byStore: number;
  byStoreCount: number;
  byField: number;
  byFieldCount: number;
  payout: number;
  potential: number;
  photos: Evaluated[];
};

const VERDICT: Record<SubmitterPayoutRow["verdict"], { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-success/10 text-success" },
  pending: { label: "Awaiting review", cls: "bg-muted text-muted-foreground" },
  rejected: { label: "Rejected", cls: "bg-danger/10 text-danger" },
  none: { label: "No photo", cls: "bg-muted text-muted-foreground" },
};

/** Payout depends on who sent the photo: a store's own photo pays under the
 * normal rules; an SAE/ASM photo pays the store a share of the payout
 * amount, as long as it wasn't rejected (awaiting review still counts).
 * Every other submitter is paid under the normal rules too. The share % and
 * Store Manager handling are page controls, not saved settings. */
export function PayoutSplitSection({ month, rows }: { month: string; rows: SubmitterPayoutRow[] }) {
  const [sharePct, setSharePct] = useState(50);
  const [managerIsStore, setManagerIsStore] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const pct = Math.min(100, Math.max(0, Number.isFinite(sharePct) ? sharePct : 0));
  const fieldTitles = useMemo(() => (managerIsStore ? FIELD_TITLES : [...FIELD_TITLES, "Store Manager"]), [managerIsStore]);

  const { stores, totals } = useMemo(() => {
    const byStore = new Map<string, StoreSplit>();
    let payout = 0, potential = 0, storeCount = 0, fieldCount = 0, heldBack = 0;

    for (const r of rows) {
      const s = byStore.get(r.storeCode) ?? {
        storeName: r.storeName, byStore: 0, byStoreCount: 0, byField: 0, byFieldCount: 0, payout: 0, potential: 0, photos: [],
      };
      s.potential += r.baseAmount;
      potential += r.baseAmount;
      byStore.set(r.storeCode, s);
      if (r.verdict === "none") continue;

      const reduced = !!r.submitterTitle && fieldTitles.includes(r.submitterTitle);
      let amount: number;
      let rule: string;
      if (reduced) {
        amount = r.verdict === "rejected" ? 0 : (pct / 100) * r.baseAmount;
        rule = r.verdict === "rejected" ? "SAE/ASM sent · rejected, ₹0" : `SAE/ASM sent · ${pct}% of ${money(r.baseAmount)}`;
        s.byField += amount;
        s.byFieldCount += 1;
        fieldCount += 1;
        if (r.verdict !== "rejected") heldBack += r.baseAmount - amount;
      } else {
        amount = r.fullPayout;
        rule =
          r.verdict === "rejected" ? "Full amount rule · rejected, ₹0"
          : r.verdict === "pending" ? "Full amount rule · awaiting review"
          : r.tierLabel ? `Full amount rule · tier ${r.tierLabel}`
          : "Full amount rule";
        s.byStore += amount;
        s.byStoreCount += 1;
        storeCount += 1;
      }
      s.payout += amount;
      payout += amount;
      s.photos.push({ ...r, reduced, payout: amount, rule });
    }

    return {
      stores: [...byStore.values()].sort((a, b) => a.storeName.localeCompare(b.storeName)),
      totals: { payout, potential, storeCount, fieldCount, heldBack },
    };
  }, [rows, pct, fieldTitles]);

  function toggle(storeName: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(storeName)) next.delete(storeName);
      else next.add(storeName);
      return next;
    });
  }

  function exportCsv() {
    downloadCsv(
      `payout-split-${month}.csv`,
      ["StoreName", "SentByStore", "SentBySAE_ASM", "Payout", "PotentialPayout"],
      stores.map((s) => [s.storeName, Math.round(s.byStore), Math.round(s.byField), Math.round(s.payout), Math.round(s.potential)]),
    );
  }

  const storeTitles = managerIsStore ? ["Store Partner", "Store Manager"] : ["Store Partner"];

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Payout split by who submitted</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        If the store sent the execution photo, they get the full amount. If an SAE or ASM sent it for them, the store gets a share of the
        payout amount, as long as the photo wasn&apos;t rejected.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-success">Store sends the photo</p>
          <p className="mt-1.5 text-sm font-semibold text-foreground">Full payout amount</p>
          <p className="mt-1 text-xs text-muted-foreground">Normal payout rules apply: approved pays in full (or at its tier %), rejected pays ₹0.</p>
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
              value={sharePct}
              onChange={(e) => setSharePct(Number(e.target.value))}
              aria-label="Share paid to the store when an SAE or ASM sent the photo"
              className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-right text-base font-bold tabular-nums focus:border-primary focus:outline-none"
            />
            % of payout amount
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Counts once submitted, including while awaiting review. Only a rejection brings it to ₹0.</p>
          <TitleChips titles={fieldTitles} />
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">
        <input type="checkbox" checked={managerIsStore} onChange={(e) => setManagerIsStore(e.target.checked)} className="h-4 w-4 accent-warning" />
        <span>
          <b>Store Manager photos count as sent by the store</b> (full amount). Untick to pay them at the SAE/ASM share instead.
        </span>
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Payout after split" value={money(totals.payout)} sub={`of ${money(totals.potential)} potential`} />
        <Stat label="Sent by store" value={String(totals.storeCount)} sub="photos paid at the full amount" />
        <Stat label="Sent by SAE / ASM" value={String(totals.fieldCount)} sub={`photos paid at ${pct}%`} />
        <Stat label="Held back by the split" value={money(totals.heldBack)} sub="vs paying SAE/ASM photos in full" />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
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
                      {money(s.byStore)}
                      <span className="block text-[11px] text-muted-foreground">{s.byStoreCount} photo{s.byStoreCount === 1 ? "" : "s"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {money(s.byField)}
                      <span className="block text-[11px] text-muted-foreground">{s.byFieldCount} photo{s.byFieldCount === 1 ? "" : "s"}</span>
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
                            <tbody>
                              {s.photos.map((p) => (
                                <tr key={p.taskId} className="border-b border-dashed border-border last:border-0">
                                  <td className="py-2 pr-3 text-foreground">{p.campaignName} · W{p.week}</td>
                                  <td className="py-2 pr-3">
                                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", p.reduced ? "bg-info/10 text-info" : "bg-success/10 text-success")}>
                                      {p.submitterTitle ?? "No job title"}
                                    </span>{" "}
                                    <span className="text-muted-foreground">{p.submitterName ?? "—"}</span>
                                  </td>
                                  <td className="py-2 pr-3">
                                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", VERDICT[p.verdict].cls)}>{VERDICT[p.verdict].label}</span>
                                  </td>
                                  <td className="py-2 pr-3 text-muted-foreground">{p.rule}</td>
                                  <td className="py-2 text-right font-semibold tabular-nums text-foreground">
                                    {p.reduced && p.verdict !== "rejected" && (
                                      <span className="mr-1 font-normal text-muted-foreground line-through">{money(p.baseAmount)}</span>
                                    )}
                                    {money(p.payout)}
                                  </td>
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          CSV columns: StoreName, SentByStore, SentBySAE_ASM, Payout, PotentialPayout. The share % isn&apos;t saved — set it each time.
        </p>
        <Button variant="outline" onClick={exportCsv} disabled={stores.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
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
