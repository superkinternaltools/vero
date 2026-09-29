"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { Button } from "@/core/ui/button";
import { MultiSelect } from "@/core/ui/multi-select";
import { cn } from "@/core/lib/utils";
import { downloadCsv, money } from "./csv";
import type { SubmitterPayoutRow } from "../types";

const STORE_PARTNER = "Store Partner";

/** Who sent a photo, for payout purposes:
 *  partner      — the Store Partner: they get 100%.
 *  authorized   — a job title picked as an authorized sender: the Store
 *                 Partner gets the set share, the sender gets the rest.
 *  unauthorized — anyone else: the Store Partner still gets 100%; the
 *                 sender gets nothing. */
type SenderKind = "partner" | "authorized" | "unauthorized";

type Evaluated = SubmitterPayoutRow & { kind: SenderKind; toPartner: number; toSender: number; rule: string };

type StoreSplit = {
  storeName: string;
  inFull: number;
  ownCount: number;
  otherFullCount: number;
  split: number;
  splitCount: number;
  toPartner: number;
  toSenders: number;
  potential: number;
  photos: Evaluated[];
};

type SenderEarner = { name: string; title: string; photos: number; stores: Set<string>; payout: number };

const VERDICT: Record<SubmitterPayoutRow["verdict"], { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-success/10 text-success" },
  pending: { label: "Awaiting review", cls: "bg-muted text-muted-foreground" },
  rejected: { label: "Rejected", cls: "bg-danger/10 text-danger" },
  none: { label: "No photo", cls: "bg-muted text-muted-foreground" },
};

const KIND_BADGE: Record<SenderKind, string> = {
  partner: "bg-success/10 text-success",
  authorized: "bg-info/10 text-info",
  unauthorized: "bg-muted text-muted-foreground",
};

/** Every photo pays its normal-rules amount no matter who sent it — this
 * only decides who receives that amount. The share % and the authorized
 * sender list are page controls, not saved settings. */
export function PayoutSplitSection({ month, rows, jobTitles }: { month: string; rows: SubmitterPayoutRow[]; jobTitles: string[] }) {
  const [partnerPct, setPartnerPct] = useState(60);
  const [authorized, setAuthorized] = useState<string[]>(() => ["SAE", "ASM"].filter((t) => jobTitles.includes(t)));
  const [open, setOpen] = useState<Set<string>>(new Set());

  const pct = Math.min(100, Math.max(0, Number.isFinite(partnerPct) ? partnerPct : 0));
  const senderPct = 100 - pct;
  const senderOptions = jobTitles.filter((t) => t !== STORE_PARTNER).map((t) => ({ id: t, label: t }));

  const { stores, earners, totals } = useMemo(() => {
    const byStore = new Map<string, StoreSplit>();
    const byEarner = new Map<string, SenderEarner>();
    let payout = 0, potential = 0, toPartners = 0, toSenders = 0, unauthorizedPhotos = 0;

    for (const r of rows) {
      const s = byStore.get(r.storeCode) ?? {
        storeName: r.storeName, inFull: 0, ownCount: 0, otherFullCount: 0, split: 0, splitCount: 0, toPartner: 0, toSenders: 0, potential: 0, photos: [],
      };
      s.potential += r.baseAmount;
      potential += r.baseAmount;
      byStore.set(r.storeCode, s);
      if (r.verdict === "none") continue;

      const amount = r.fullPayout;
      const kind: SenderKind =
        r.submitterTitle === STORE_PARTNER ? "partner" : r.submitterTitle && authorized.includes(r.submitterTitle) ? "authorized" : "unauthorized";
      const partnerShare = kind === "authorized" ? (amount * pct) / 100 : amount;
      const senderShare = amount - partnerShare;

      const sender = r.submitterTitle ?? "someone with no job title";
      let rule: string;
      if (r.verdict === "rejected") rule = "Rejected · nobody is paid";
      else if (r.verdict === "pending") rule = "Awaiting review · nothing paid yet";
      else if (kind === "partner") rule = r.tierLabel ? `Store Partner sent · 100% (tier ${r.tierLabel})` : "Store Partner sent · 100%";
      else if (kind === "authorized") rule = `Authorized sender · Store Partner ${pct}%, sender ${senderPct}% of ${money(amount)}`;
      else rule = `${sender} isn't an authorized sender · Store Partner gets 100%`;

      if (kind === "authorized") {
        s.split += partnerShare;
        s.splitCount += 1;
        const key = r.submitterId ?? r.submitterName ?? "unknown";
        const e = byEarner.get(key) ?? { name: r.submitterName ?? "—", title: r.submitterTitle ?? "—", photos: 0, stores: new Set<string>(), payout: 0 };
        e.photos += 1;
        e.stores.add(r.storeCode);
        e.payout += senderShare;
        byEarner.set(key, e);
      } else {
        s.inFull += partnerShare;
        if (kind === "partner") s.ownCount += 1;
        else {
          s.otherFullCount += 1;
          unauthorizedPhotos += 1;
        }
      }
      s.toPartner += partnerShare;
      s.toSenders += senderShare;
      payout += amount;
      toPartners += partnerShare;
      toSenders += senderShare;
      s.photos.push({ ...r, kind, toPartner: partnerShare, toSender: senderShare, rule });
    }

    return {
      stores: [...byStore.values()].sort((a, b) => a.storeName.localeCompare(b.storeName)),
      earners: [...byEarner.values()].sort((a, b) => b.payout - a.payout),
      totals: { payout, potential, toPartners, toSenders, unauthorizedPhotos },
    };
  }, [rows, pct, senderPct, authorized]);

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
      ["StoreName", "PaidInFull", "SplitWithSender", "StorePartnerPayout", "PaidToSenders", "PotentialPayout"],
      stores.map((s) => [s.storeName, Math.round(s.inFull), Math.round(s.split), Math.round(s.toPartner), Math.round(s.toSenders), Math.round(s.potential)]),
    );
  }

  function exportSendersCsv() {
    downloadCsv(
      `payout-split-senders-${month}.csv`,
      ["Name", "JobTitle", "Photos", "Stores", "Payout"],
      earners.map((e) => [e.name, e.title, e.photos, e.stores.size, Math.round(e.payout)]),
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Payout split by who submitted</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Each photo pays its normal amount. Who sent it decides who receives that amount.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-success">Store Partner sends</p>
          <p className="mt-1.5 text-sm font-semibold text-foreground">Store Partner gets 100%</p>
          <p className="mt-1 text-xs text-muted-foreground">Normal payout rules: approved pays in full (or at its tier %), rejected pays ₹0.</p>
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-info">Authorized sender sends</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            Store Partner gets
            <input
              type="number"
              min={0}
              max={100}
              value={partnerPct}
              onChange={(e) => setPartnerPct(Number(e.target.value))}
              aria-label="Store Partner's share when an authorized sender sent the photo"
              className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-right text-base font-bold tabular-nums focus:border-primary focus:outline-none"
            />
            % · sender gets <span className="tabular-nums">{senderPct}%</span>
          </div>
          <label className="mt-3 mb-1 block text-xs font-semibold text-muted-foreground">Authorized senders</label>
          <MultiSelect options={senderOptions} selected={authorized} onChange={setAuthorized} placeholder="Pick who counts as a sender…" />
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anyone else sends</p>
          <p className="mt-1.5 text-sm font-semibold text-foreground">Store Partner gets 100%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Someone who isn&apos;t an authorized sender gets nothing for sending it.
            {senderOptions.filter((o) => !authorized.includes(o.id)).length > 0 && (
              <> Right now that&apos;s: {senderOptions.filter((o) => !authorized.includes(o.id)).map((o) => o.label).join(", ")}.</>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total payout" value={money(totals.payout)} sub={`of ${money(totals.potential)} potential`} />
        <Stat label="Paid to Store Partners" value={money(totals.toPartners)} sub="100% of their own + unauthorized photos, plus their share of the rest" />
        <Stat label="Paid to authorized senders" value={money(totals.toSenders)} sub={`${senderPct}% of the photos they sent`} />
        <Stat label="Unauthorized senders" value={String(totals.unauthorizedPhotos)} sub="photos paid 100% to the Store Partner" />
      </div>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Stores</h3>
      <div className="mt-2 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-semibold">Store</th>
              <th className="px-4 py-2.5 text-right font-semibold">Paid in full</th>
              <th className="px-4 py-2.5 text-right font-semibold">Split with sender</th>
              <th className="px-4 py-2.5 text-right font-semibold">Store Partner gets</th>
              <th className="px-4 py-2.5 text-right font-semibold">Senders get</th>
              <th className="px-4 py-2.5 text-right font-semibold">PotentialPayout</th>
            </tr>
          </thead>
          <tbody>
            {stores.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No tasks in this selection.</td>
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
                      {money(s.inFull)}
                      <span className="block text-[11px] text-muted-foreground">
                        {s.ownCount} own{s.otherFullCount > 0 ? ` · ${s.otherFullCount} unauthorized` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {money(s.split)}
                      <span className="block text-[11px] text-muted-foreground">
                        {pct}% of {s.splitCount} photo{s.splitCount === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{money(s.toPartner)}</td>
                    <td className="px-4 py-3 text-right">{money(s.toSenders)}</td>
                    <td className="px-4 py-3 text-right">{money(s.potential)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border bg-muted/20">
                      <td colSpan={6} className="px-4 py-2 pl-9">
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
                                <th className="py-1.5 pr-3 text-right font-semibold">Store Partner gets</th>
                                <th className="py-1.5 text-right font-semibold">Sender gets</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.photos.map((p) => (
                                <tr key={p.taskId} className="border-t border-dashed border-border">
                                  <td className="py-2 pr-3 text-foreground">{p.campaignName} · W{p.week}</td>
                                  <td className="py-2 pr-3">
                                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", KIND_BADGE[p.kind])}>
                                      {p.submitterTitle ?? "No job title"}
                                    </span>{" "}
                                    <span className="text-muted-foreground">{p.submitterName ?? "—"}</span>
                                  </td>
                                  <td className="py-2 pr-3">
                                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", VERDICT[p.verdict].cls)}>{VERDICT[p.verdict].label}</span>
                                  </td>
                                  <td className="py-2 pr-3 text-muted-foreground">{p.rule}</td>
                                  <td className="py-2 pr-3 text-right font-semibold tabular-nums text-foreground">{money(p.toPartner)}</td>
                                  <td className="py-2 text-right tabular-nums text-foreground">{p.kind === "authorized" ? money(p.toSender) : "—"}</td>
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

      <h3 className="mt-6 text-sm font-semibold text-foreground">Authorized sender earnings</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Each authorized sender&apos;s {senderPct}% share of the photos they sent.</p>
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
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {authorized.length === 0 ? "No authorized senders picked — every photo pays the Store Partner 100%." : "No photos from authorized senders in this selection."}
                </td>
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
        <p className="text-xs text-muted-foreground">The share % and authorized senders aren&apos;t saved — set them each time before exporting.</p>
        <Button variant="outline" onClick={exportSendersCsv} disabled={earners.length === 0}>
          <Download className="h-4 w-4" /> Export senders CSV
        </Button>
      </div>
    </section>
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
