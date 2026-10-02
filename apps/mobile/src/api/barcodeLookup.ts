/**
 * Multi-API barcode enrichment with fallback chain.
 *
 * All sources are zero-signup free (researched 2026-10-02):
 *  1. Open Food Facts      — food/grocery, best documented Indian coverage
 *  2. UPCitemdb (trial)    — general retail, richest fields (100 req/day)
 *  3. Open Products Facts  — general non-food
 *  4. Open Beauty Facts    — cosmetics / personal care
 *  5. barcode.monster      — last resort (sparse)
 *
 * Each API is queried in parallel; fields are merged with first-non-empty
 * priority in the order above. A per-API timeout keeps one slow source
 * from blocking the rest.
 */

export interface EnrichedProduct {
  name?: string;
  brand?: string;
  category?: string;
  description?: string;
  manufacturer?: string;
  imageUrl?: string;
  model?: string;
  weightOrSize?: string;
  /** Lowest offer price reported by the source, if any. Currency unknown — treat as hint only. */
  price?: number;
  /** Names of the APIs that contributed at least one field, in chain order. */
  sources: string[];
}

type PartialProduct = Partial<Omit<EnrichedProduct, 'sources'>>;

const UA = 'RaghuMayaShop/1.0 (shop inventory app)';

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** 1. Open Food Facts v2 — `status: 1` means a hit. */
async function fromOpenFoodFacts(barcode: string): Promise<PartialProduct | null> {
  const d = await fetchJson(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
      `?fields=product_name,brands,categories,generic_name,image_url,quantity`,
  );
  if (!isRecord(d) || d.status !== 1 || !isRecord(d.product)) return null;
  const p = d.product;
  return {
    name: str(p.product_name),
    brand: str(p.brands),
    category: str(p.categories)?.split(',')[0]?.trim() || undefined,
    description: str(p.generic_name),
    imageUrl: str(p.image_url),
    weightOrSize: str(p.quantity),
  };
}

/** 2. UPCitemdb trial — no key, 100 req/day. Richest fields incl. model + offers. */
async function fromUPCitemdb(barcode: string): Promise<PartialProduct | null> {
  // UPCitemdb zero-pads short codes; skip sub-12-digit values.
  if (barcode.replace(/\D/g, '').length < 12) return null;
  const d = await fetchJson(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
  );
  if (!isRecord(d) || d.code !== 'OK' || !Array.isArray(d.items) || d.items.length === 0) return null;
  const it = d.items[0] as Record<string, unknown>;
  const offers = Array.isArray(it.offers) ? (it.offers as Record<string, unknown>[]) : [];
  const prices = offers
    .map((o) => (typeof o.price === 'number' ? o.price : Number(o.price)))
    .filter((n) => Number.isFinite(n) && n > 0);
  const images = Array.isArray(it.images) ? (it.images as unknown[]) : [];
  return {
    name: str(it.title),
    brand: str(it.brand),
    category: str(it.category),
    description: str(it.description),
    imageUrl: str(images[0]),
    model: str(it.model),
    weightOrSize: str(it.size),
    price: prices.length > 0 ? Math.min(...prices) : undefined,
  };
}

/** 3 & 4. Open Products / Open Beauty Facts — same v2 semantics as OFF. */
async function fromOpenFactsFamily(host: string, barcode: string): Promise<PartialProduct | null> {
  const d = await fetchJson(
    `https://${host}/api/v2/product/${encodeURIComponent(barcode)}.json` +
      `?fields=product_name,brands,categories,generic_name,image_url,quantity`,
  );
  if (!isRecord(d) || d.status !== 1 || !isRecord(d.product)) return null;
  const p = d.product;
  return {
    name: str(p.product_name),
    brand: str(p.brands),
    category: str(p.categories)?.split(',')[0]?.trim() || undefined,
    description: str(p.generic_name),
    imageUrl: str(p.image_url),
    weightOrSize: str(p.quantity),
  };
}

/** 5. barcode.monster — last resort, sparse fields. */
async function fromBarcodeMonster(barcode: string): Promise<PartialProduct | null> {
  const d = await fetchJson(`https://barcode.monster/api/${encodeURIComponent(barcode)}`);
  if (!isRecord(d) || d.status !== 'ok') return null;
  return {
    name: str(d.description),
    manufacturer: str(d.company),
    imageUrl: str(d.image_url),
    weightOrSize: str(d.size),
  };
}

const FIELDS = [
  'name',
  'brand',
  'category',
  'description',
  'manufacturer',
  'imageUrl',
  'model',
  'weightOrSize',
  'price',
] as const;

function merge(parts: (PartialProduct | null)[], sourceNames: string[]): EnrichedProduct {
  const out: EnrichedProduct = { sources: [] };
  parts.forEach((part, i) => {
    if (!part) return;
    let contributed = false;
    for (const f of FIELDS) {
      const v = part[f];
      if (v !== undefined && v !== null && v !== '' && out[f] === undefined) {
        (out as unknown as Record<string, unknown>)[f] = v;
        contributed = true;
      }
    }
    if (contributed && !out.sources.includes(sourceNames[i])) out.sources.push(sourceNames[i]);
  });
  return out;
}

/**
 * Normalize a scanned barcode for lookup/storage.
 * UPC-A (12 digits) is a subset of EAN-13 — prepend a leading zero so the
 * value matches what's printed on the box and what databases index.
 * Other formats (EAN-13, Code128 alphanumerics, etc.) are left untouched.
 */
export function normalizeBarcode(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12) return `0${digits}`;
  return raw.trim();
}

/**
 * Look up a barcode across all free sources and return merged product data.
 * Returns null when no source knows the barcode (or at least its name).
 */
export async function lookupBarcode(barcode: string): Promise<EnrichedProduct | null> {
  const code = normalizeBarcode(barcode);
  if (!code) return null;

  const results = await Promise.allSettled([
    fromOpenFoodFacts(code),
    fromUPCitemdb(code),
    fromOpenFactsFamily('world.openproductsfacts.org', code),
    fromOpenFactsFamily('world.openbeautyfacts.org', code),
    fromBarcodeMonster(code),
  ]);

  const parts = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
  const merged = merge(parts, [
    'Open Food Facts',
    'UPCitemdb',
    'Open Products Facts',
    'Open Beauty Facts',
    'barcode.monster',
  ]);

  // Name is the minimum useful signal; without it the hit is not actionable.
  return merged.name ? merged : null;
}
