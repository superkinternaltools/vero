import { createAdminClient } from "@/core/db/admin";
import { hasAnyContestData } from "./queries";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DUMMY_CAMPAIGN = "Sample Campaign — Diwali Push";
const DUMMY_SKUS = ["500ml Bottle", "1L Bottle", "Combo Pack"];

/** Seeds 3 months of illustrative data, anchored to real stores, the first
 * time the report is viewed with nothing uploaded yet. Once any real sheet
 * is uploaded, clearDummyData() wipes all of this — see actions.ts. */
export async function ensureDummyData(): Promise<void> {
  if (await hasAnyContestData()) return;

  const admin = createAdminClient();
  const { data: stores } = await admin.from("stores").select("id, name").is("deleted_at", null).limit(20);
  const storeList = (stores as any[]) ?? [];
  if (storeList.length === 0) return;

  const now = new Date();
  const months: string[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const campaignRows: any[] = [];
  const inventoryRows: any[] = [];
  const sellRows: any[] = [];

  for (const month of months) {
    for (let week = 1; week <= 4; week++) {
      storeList.forEach((store, idx) => {
        const roll = (idx + week) % 5;
        const status = roll === 0 ? "Rejected" : roll === 1 ? "Half Approved" : roll <= 3 ? "Approved" : null;
        const boost = status === "Approved" || status === "Half Approved" ? 1.3 : status ? 1.05 : 1;

        if (status) {
          campaignRows.push({
            month: `${month}-01`,
            week,
            raw_campaign_name: DUMMY_CAMPAIGN,
            raw_store_name: store.name,
            store_id: store.id,
            status,
          });
        }

        const baseGmv = 800 + idx * 60;
        const gmv = Math.round(baseGmv * boost * (0.9 + Math.random() * 0.3));
        const lastMonthGmv = Math.round(baseGmv * (0.9 + Math.random() * 0.2));
        sellRows.push({
          month: `${month}-01`,
          week,
          raw_campaign_name: DUMMY_CAMPAIGN,
          raw_store_name: store.name,
          store_id: store.id,
          this_month_gmv: gmv,
          last_month_gmv: lastMonthGmv,
          last_year_gmv: lastMonthGmv,
          this_month_penetration: Number((0.02 + (boost - 1) * 0.1 + Math.random() * 0.01).toFixed(4)),
          last_month_penetration: Number((0.02 + Math.random() * 0.01).toFixed(4)),
          last_year_penetration: Number((0.02 + Math.random() * 0.01).toFixed(4)),
          this_month_avg_unit: Number((1.5 + (boost - 1)).toFixed(2)),
          last_month_avg_unit: 1.5,
          last_year_avg_unit: 1.5,
          this_month_category_contribution: Number((0.2 + (boost - 1) * 0.2).toFixed(4)),
          last_month_category_contribution: 0.2,
          last_year_category_contribution: 0.2,
          this_month_in_store_value: gmv * 3,
          last_month_in_store_value: lastMonthGmv * 3,
          last_year_in_store_value: lastMonthGmv * 3,
        });

        DUMMY_SKUS.forEach((sku, skuIdx) => {
          const storeAvailability = Math.min(100, Math.round((status ? boost * 75 : 55) * (0.85 + Math.random() * 0.3)));
          const whAvailability = Math.min(100, Math.round((status ? boost * 80 : 60) * (0.85 + Math.random() * 0.3)));
          inventoryRows.push({
            month: `${month}-01`,
            week,
            raw_campaign_name: DUMMY_CAMPAIGN,
            raw_store_name: store.name,
            store_id: store.id,
            sku_id: `DUMMY-${skuIdx}`,
            product_name: sku,
            store_availability: storeAvailability,
            wh_availability: whAvailability,
          });
        });
      });
    }
  }

  const [{ data: cBatch }, { data: iBatch }, { data: sBatch }] = await Promise.all([
    admin
      .from("contest_data_batches")
      .insert({ source_type: "campaign", origin: "dummy", row_count: campaignRows.length })
      .select("id")
      .single(),
    admin
      .from("contest_data_batches")
      .insert({ source_type: "inventory", origin: "dummy", row_count: inventoryRows.length })
      .select("id")
      .single(),
    admin
      .from("contest_data_batches")
      .insert({ source_type: "sell_side", origin: "dummy", row_count: sellRows.length })
      .select("id")
      .single(),
  ]);
  if (!cBatch || !iBatch || !sBatch) return;

  await Promise.all([
    admin.from("contest_campaign_rows").insert(campaignRows.map((r) => ({ ...r, batch_id: (cBatch as any).id }))),
    admin.from("contest_inventory_rows").insert(inventoryRows.map((r) => ({ ...r, batch_id: (iBatch as any).id }))),
    admin.from("contest_sell_side_rows").insert(sellRows.map((r) => ({ ...r, batch_id: (sBatch as any).id }))),
  ]);
}

export async function clearDummyData(): Promise<void> {
  const admin = createAdminClient();
  await admin.from("contest_data_batches").delete().eq("origin", "dummy");
}
