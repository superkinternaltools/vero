/**
 * One-off ops script: copies email from every existing "Store Partner"
 * profile onto the new partner_email field on their mapped FOFO store(s)
 * (see migration 0036_store_partner_contact.sql).
 *
 * display_name is deliberately NOT copied to partner_name — it turns out to
 * mostly hold the store's own name (not the partner's actual name), and for
 * the one partner mapped to two different stores that value only matches
 * one of them, so copying it would mislabel the other. Name needs to be
 * collected fresh by hand instead. partner_phone is also left untouched —
 * no phone number has ever been captured for these profiles.
 *
 * This does NOT touch the existing profiles rows or their login access —
 * Store Partners keep their Vero accounts exactly as before; this only adds
 * the new WhatsApp-reachable contact field alongside them.
 *
 * A store already carrying a partner_email is left alone (idempotent — safe
 * to re-run, and won't clobber anything entered by hand since).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-store-partners.ts            (dry run — just prints)
 *   npx tsx --env-file=.env.local scripts/backfill-store-partners.ts --execute  (actually writes)
 */
import { createAdminClient } from "../src/core/db/admin";

async function main() {
  const execute = process.argv.includes("--execute");
  const supabase = createAdminClient();

  const { data: jobTitle } = await supabase
    .from("job_titles")
    .select("id")
    .eq("name", "Store Partner")
    .maybeSingle();
  if (!jobTitle) {
    console.log('No "Store Partner" job title found — nothing to do.');
    return;
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .eq("job_title_id", jobTitle.id)
    .is("deleted_at", null);

  const partnerIds = (profiles ?? []).map((p) => p.id);
  if (partnerIds.length === 0) {
    console.log("No Store Partner profiles found — nothing to do.");
    return;
  }

  const { data: mappings } = await supabase
    .from("user_stores")
    .select("user_id, store_id")
    .in("user_id", partnerIds);

  const { data: stores } = await supabase
    .from("stores")
    .select("id, code, store_type, partner_email")
    .in("id", [...new Set((mappings ?? []).map((m) => m.store_id))]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));

  let updated = 0;
  let skippedNonFofo = 0;
  let skippedAlreadySet = 0;

  for (const m of mappings ?? []) {
    const profile = profileById.get(m.user_id);
    const store = storeById.get(m.store_id);
    if (!profile || !store) continue;

    if (store.store_type !== "FOFO") {
      skippedNonFofo++;
      continue;
    }
    if (store.partner_email) {
      skippedAlreadySet++;
      continue;
    }

    console.log(
      `${execute ? "Updating" : "[dry run] Would update"} store ${store.code}: partner_email="${profile.email}"`,
    );
    if (execute) {
      const { error } = await supabase
        .from("stores")
        .update({ partner_email: profile.email })
        .eq("id", store.id);
      if (error) {
        console.error(`  failed: ${error.message}`);
        continue;
      }
    }
    updated++;
  }

  console.log(
    `\n${execute ? "Updated" : "Would update"} ${updated} store(s). Skipped ${skippedNonFofo} non-FOFO mapping(s), ${skippedAlreadySet} already-set store(s).`,
  );
  if (!execute) console.log("Re-run with --execute to actually write.");
}

main().then(() => process.exit(0));
