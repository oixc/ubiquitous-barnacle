// js/recommendations.js — Recommendation ranking (09, 11, 02, 03).
// Gathers the pivot (added-together) and restock signals, normalizes and fuses
// them into the flat weighted score, ranks, truncates, and hands the strip to
// the render layer. Pure computation: reads the event stream, on-List Items,
// and the current adding session from the caller's inputs — never touches
// IndexedDB or the write path (those belong to the bootstrap).

const MAX_RECOMMENDATIONS = 20;

// --- Added-together (09): co-occurrence over adding sessions ---
// Adds are segmented into adding sessions (bursts separated by a time gap) and
// a pair of Products qualifies as added-together only after co-occurring in at
// least MIN_COOCCUR_SESSIONS sessions (noise guard).
const SESSION_GAP_MS = 30 * 60 * 1000;
const MIN_COOCCUR_SESSIONS = 3;
const PIVOT_WINDOW_MS = 2 * 60 * 1000;

// Score fusion (02) — tuning knobs. Each signal normalizes to 0..1 and mixes
// into one flat weighted score; the weights are constant (no context gate, the
// pivot is naturally 0 outside its window because no companions exist then).
// PIVOT_SATURATION is the companion count at which the pivot term saturates.
const PIVOT_WEIGHT = 1.0;
const RESTOCK_WEIGHT = 0.6;
const PIVOT_SATURATION = 6;

// Segments events (sorted by `at`) into bursts: a new burst starts when the gap
// to the previous event exceeds gapMs. Duplicated from catalog.js (whose copy
// serves shopping trips) so the two modules stay decoupled.
function segmentEvents(events, gapMs) {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const bursts = [];
  let current = [];
  for (const e of sorted) {
    if (current.length && e.at - current[current.length - 1].at > gapMs) {
      bursts.push(current);
      current = [];
    }
    current.push(e);
  }
  if (current.length) bursts.push(current);
  return bursts;
}

// Latest event satisfying `match` (any when omitted), or null.
function latestEvent(events, match) {
  let latest = null;
  for (const e of events) {
    if (match && !match(e)) continue;
    if (!latest || e.at > latest.at) latest = e;
  }
  return latest;
}

// Counts how many adding sessions each pair of Products co-occurred in. The
// result maps every Product to its per-companion counts, so both orderings of a
// pair are stored under the two Products and no id-format parsing is needed.
function coOccurrenceCounts(sessions) {
  const counts = new Map();
  for (const session of sessions) {
    const products = [...new Set(session.map((e) => e.productId))];
    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        for (const [a, b] of [
          [products[i], products[j]],
          [products[j], products[i]],
        ]) {
          let row = counts.get(a);
          if (!row) {
            row = new Map();
            counts.set(a, row);
          }
          row.set(b, (row.get(b) || 0) + 1);
        }
      }
    }
  }
  return counts;
}

// Pivot companions for the whole current adding session: the union of every
// on-List session Item's added-together companions (noise guard per pair), each
// companion once. A companion reachable via several session Items reports the
// rounded average of its per-Item co-occurrence counts and ranks among pivot
// chips by that average, highest first.
function sessionPivotCompanions(session, onList, productById, sessions) {
  const counts = coOccurrenceCounts(sessions);
  const sessionProductIds = [...new Set(session.map((e) => e.productId))];
  const byCompanion = new Map();
  for (const sessionProductId of sessionProductIds) {
    if (!onList.has(sessionProductId)) continue;
    const row = counts.get(sessionProductId) || new Map();
    for (const [companion, count] of row) {
      if (count < MIN_COOCCUR_SESSIONS || onList.has(companion)) continue;
      const arr = byCompanion.get(companion) || [];
      arr.push(count);
      byCompanion.set(companion, arr);
    }
  }
  const companions = [];
  for (const [companion, countsPerSource] of byCompanion) {
    const product = productById.get(companion);
    if (!product) continue;
    const avg =
      countsPerSource.reduce((a, b) => a + b, 0) / countsPerSource.length;
    companions.push({ product, count: Math.round(avg), avg });
  }
  return companions.sort((a, b) => b.avg - a.avg);
}

// Gets a product's signal row, creating it with the Product when first touched.
function signalRow(signals, product) {
  let row = signals.get(product.id);
  if (!row) {
    row = { product };
    signals.set(product.id, row);
  }
  return row;
}

// Score-fused recommendations (09 + 11 + 02). Signals normalize to 0..1 and mix
// into one flat weighted score — no hard tiers, no context gate.
// Returns { recommendations, expiresAt }: `expiresAt` is the soonest moment a
// visible signal lapses (so the caller can re-render), or null when the strip
// is static.
export function computeRecommendations({ products, items, events }) {
  const history = events || [];
  const onList = new Set(items.map((i) => i.productId));
  const productById = new Map(products.map((p) => [p.id, p]));
  const now = Date.now();

  const signals = new Map();
  let expiresAt = null;

  const pivotExpiry = gatherPivotSignals(signals, history, onList, productById, now);
  if (pivotExpiry != null) expiresAt = pivotExpiry;

  gatherRestockSignals(signals, products, onList, now);

  return { recommendations: rankRecommendations(signals, now), expiresAt };
}

// Pivot companions: co-occurring Products in the current adding session.
function gatherPivotSignals(signals, history, onList, productById, now) {
  const adds = history.filter((e) => e.kind === "add");
  const latestAdd = latestEvent(adds);
  if (!latestAdd || now - latestAdd.at > PIVOT_WINDOW_MS) return null;
  const sessions = segmentEvents(adds, SESSION_GAP_MS);
  const session = sessions.find((burst) => burst.includes(latestAdd));
  if (!session.some((e) => onList.has(e.productId))) return null;
  for (const c of sessionPivotCompanions(session, onList, productById, sessions)) {
    signalRow(signals, c.product).pivot = c.count;
  }
  return latestAdd.at + PIVOT_WINDOW_MS;
}

// Restock-due Products.
function gatherRestockSignals(signals, products, onList, now) {
  for (const p of products) {
    if (onList.has(p.id)) continue;
    if (!p.restockInterval || p.lastPurchase == null) continue;
    if (now - p.lastPurchase < p.restockInterval) continue;
    const row = signalRow(signals, p);
    row.restockInterval = p.restockInterval;
    row.restockDueAt = p.lastPurchase + p.restockInterval;
  }
}

// Normalize, score, sort, truncate.
function rankRecommendations(signals, now) {
  const normalized = (row) => ({
    pivot: row.pivot == null ? 0 : Math.min(1, row.pivot / PIVOT_SATURATION),
    restock:
      row.restockDueAt == null
        ? 0
        : Math.min(1, (now - row.restockDueAt) / row.restockInterval),
  });

  const reasonsFor = (row) => {
    const reasons = [];
    if (row.pivot != null) reasons.push({ kind: "pivot", count: row.pivot });
    if (row.restockDueAt != null) {
      reasons.push({
        kind: "restock",
        interval: row.restockInterval,
        dueAt: row.restockDueAt,
      });
    }
    return reasons;
  };

  const built = [];
  for (const row of signals.values()) {
    const n = normalized(row);
    const weighted = {
      pivot: n.pivot * PIVOT_WEIGHT,
      restock: n.restock * RESTOCK_WEIGHT,
    };
    const reasons = reasonsFor(row);
    const best = Math.max(weighted.pivot, weighted.restock);
    let kind = "restock";
    // Restock override (03): a due restock signal wins the colour over the
    // pivot regardless of how strongly the pivot fires; the pivot colour is
    // reserved for companions that are genuinely due-free.
    if (best > 0 && weighted.pivot === best && row.restockDueAt == null) {
      kind = "pivot";
    }
    built.push({
      recommendation: {
        product: row.product,
        kind,
        score: weighted.pivot + weighted.restock,
        reasons,
      },
      strongest: best,
    });
  }

  built.sort(
    (a, b) =>
      b.recommendation.score - a.recommendation.score ||
      b.recommendation.reasons.length - a.recommendation.reasons.length ||
      b.strongest - a.strongest ||
      a.recommendation.product.defaultSpelling.localeCompare(
        b.recommendation.product.defaultSpelling,
      ),
  );
  return built.map((b) => b.recommendation).slice(0, MAX_RECOMMENDATIONS);
}
