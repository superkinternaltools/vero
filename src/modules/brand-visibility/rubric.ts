import type { SkuRequirement, SkuRow } from "./types";

/** Turns a structured requirement into rubric prose the AI (and a human
 * reading it) can act on. Callers decide whether to overwrite the existing
 * rubric with this — it's never applied silently. */
export function buildRubricFromRequirement(requirement: SkuRequirement, skus: SkuRow[]): string {
  const named = skus.filter((s) => s.skuName.trim());

  if (requirement.mode === "all") {
    const lines = named.map((s) => {
      const shelf = s.shelf ? ` — shelf ${s.shelf}` : "";
      const qty = s.qty != null ? `, at least ${s.qty} facings` : "";
      return `- ${s.skuName}${shelf}${qty}`;
    });
    return [
      "All of the following SKUs must be present on the display:",
      ...lines,
      "Price tags visible on every SKU. Shelf filled with no gaps.",
    ].join("\n");
  }

  if (requirement.mode === "any_list") {
    const min = requirement.minProducts ?? named.length;
    const qty = requirement.qty != null ? `, each with at least ${requirement.qty} facings` : "";
    const shelf = requirement.shelf ? ` on ${requirement.shelf}` : "";
    return [
      `At least ${min} of the following products must be present${shelf}${qty}:`,
      named.map((s) => s.skuName).join(", "),
      "Anything not on this list does not count toward the minimum.",
      "Price tags visible on qualifying products. No gaps on the shelf.",
    ].join("\n");
  }

  // any_category
  const min = requirement.minProducts ?? "several";
  const shelf = requirement.shelf ? ` on ${requirement.shelf}` : "";
  const qty = requirement.qty != null ? `, totaling at least ${requirement.qty} facings across the shelf` : "";
  return [
    `At least ${min} different products from the "${requirement.category ?? "approved"}" category must be present${shelf}${qty}.`,
    "Any product in this category counts — the specific mix is up to the store.",
    "Price tags visible. No gaps on the shelf.",
  ].join("\n");
}
