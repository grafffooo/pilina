//! 1D linear stock optimizer: packs cut lengths onto bars, sticks, and boards with kerf,
//! optional rough-end trim, and priority reuse of saved library offcuts.

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

use crate::model::Unplaced;
use crate::search::Rng;
use crate::{Control, Progress};

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn default_time_budget() -> u32 {
    200
}

fn default_seed() -> u64 {
    1_234_567
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearPartSpec {
    pub id: String,
    pub length: f64,
    pub qty: u32,
    #[serde(default)]
    pub label: String,
    /// Material key. A part only goes on stock with the same material; `None` on either
    /// side matches anything.
    #[serde(default)]
    pub material: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearStockSpec {
    pub id: String,
    pub length: f64,
    /// `None` = unlimited.
    #[serde(default)]
    pub qty: Option<u32>,
    /// Priority stock is used before other regular stock.
    #[serde(default)]
    pub priority: bool,
    /// A leftover from the offcut library. Offcuts are used first, skip rough-end trim, and
    /// their length doesn't count as new material.
    #[serde(default)]
    pub offcut: bool,
    #[serde(default)]
    pub material: Option<String>,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearOptions {
    #[serde(default = "default_time_budget")]
    pub time_budget_ms: u32,
    #[serde(default = "default_seed")]
    pub seed: u64,
}

impl Default for LinearOptions {
    fn default() -> Self {
        Self {
            time_budget_ms: default_time_budget(),
            seed: default_seed(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearJob {
    pub parts: Vec<LinearPartSpec>,
    pub stock: Vec<LinearStockSpec>,
    /// Saw blade thickness.
    pub kerf: f64,
    /// Rough-end margin trimmed off both ends of non-offcut stock before cutting.
    #[serde(default)]
    pub end_trim: f64,
    #[serde(default)]
    pub options: LinearOptions,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearPlacement {
    pub part_id: String,
    /// 0-based copy number within the part's quantity.
    pub instance: u32,
    /// Distance from the left end of the stock bar, in mm.
    pub x: f64,
    pub length: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearCut {
    /// 1-based, in sawing order.
    pub number: u32,
    /// 0 = rough-end trim, 1 = cross cut.
    pub stage: u8,
    /// Blade centre position from the left end of the bar, in mm.
    pub pos: f64,
    /// Stop-block measurement from the freshly squared/last cut edge, in mm.
    pub from_last_edge: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BarLayout {
    pub stock_id: String,
    pub length: f64,
    /// Identical bars are merged: this layout is cut `qty` times.
    pub qty: u32,
    pub placements: Vec<LinearPlacement>,
    pub cuts: Vec<LinearCut>,
    /// Reusable tail length remaining after the final cut (excluding right-end trim), in mm.
    pub waste: f64,
    /// Start coordinate of the leftover tail from the left end of the bar, in mm.
    pub offcut_start: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearTotals {
    /// Bars to cut, library offcuts included.
    pub bars: u32,
    /// Of `bars`, how many are library offcuts.
    pub offcuts_used: u32,
    pub stock_length: f64,
    pub used_length: f64,
    /// `stock_length - used_length` (saw kerf, end trim, and tail leftover included).
    pub waste_length: f64,
    pub cuts: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearPlan {
    pub bars: Vec<BarLayout>,
    pub unplaced: Vec<Unplaced>,
    pub totals: LinearTotals,
}

struct Group<'a> {
    spec: &'a LinearPartSpec,
    qty: u32,
}

struct Stock<'a> {
    spec: &'a LinearStockSpec,
    qty: u32,
    /// 0 = library offcut, 1 = priority stock, 2 = regular stock.
    tier: u8,
}

struct Ctx<'a> {
    groups: Vec<Group<'a>>,
    stocks: Vec<Stock<'a>>,
    kerf: f64,
    end_trim: f64,
}

impl Ctx<'_> {
    fn trim_for(&self, stock: &Stock<'_>) -> f64 {
        if stock.spec.offcut { 0.0 } else { self.end_trim }
    }

    fn usable_for(&self, stock: &Stock<'_>) -> f64 {
        stock.spec.length - 2.0 * self.trim_for(stock)
    }
}

fn compatible(part: &LinearPartSpec, stock: &LinearStockSpec) -> bool {
    match (&part.material, &stock.material) {
        (Some(a), Some(b)) => a == b,
        _ => true,
    }
}

/// Physical bar geometry from a multiset of `(group_index, count)` placed on `stock`.
fn build_bar(
    ctx: &Ctx<'_>,
    stock_idx: usize,
    items: &[(usize, u32)],
    next_instance: &mut [u32],
) -> BarLayout {
    let stock = &ctx.stocks[stock_idx];
    let l = stock.spec.length;
    let t = ctx.trim_for(stock);
    let kerf = ctx.kerf;
    let half = kerf / 2.0;

    // Expand and sort longest first so stop-block moves steadily inward.
    let mut seq: Vec<usize> = Vec::new();
    for &(gi, count) in items {
        for _ in 0..count {
            seq.push(gi);
        }
    }
    seq.sort_by(|&a, &b| {
        ctx.groups[b]
            .spec
            .length
            .total_cmp(&ctx.groups[a].spec.length)
            .then_with(|| a.cmp(&b))
    });

    let mut placements = Vec::with_capacity(seq.len());
    let mut cuts = Vec::with_capacity(seq.len() + 1);

    if t > 0.0 {
        let trim_pos = round2(t - half.min(t / 2.0));
        cuts.push(LinearCut {
            number: 1,
            stage: 0,
            pos: trim_pos,
            from_last_edge: round2(t),
        });
    }

    let mut cur_x = t;
    let mut last_end = t;
    let m = seq.len();
    for (i, &gi) in seq.iter().enumerate() {
        let part = ctx.groups[gi].spec;
        let len = part.length;
        let instance = next_instance[gi];
        next_instance[gi] += 1;
        placements.push(LinearPlacement {
            part_id: part.id.clone(),
            instance,
            x: round2(cur_x),
            length: round2(len),
        });
        let end = cur_x + len;
        last_end = end;
        if i + 1 < m || end < l - 1e-9 {
            let cut_pos = if i + 1 < m {
                round2(end + half)
            } else {
                round2(end + half.min((l - end) / 2.0))
            };
            cuts.push(LinearCut {
                number: cuts.len() as u32 + 1,
                stage: 1,
                pos: cut_pos,
                from_last_edge: round2(len),
            });
        }
        cur_x = end + kerf;
    }

    let tail_start = last_end + kerf;
    let (offcut_start, waste) = if tail_start < l - t - 1e-9 {
        let w = round2((l - t) - tail_start);
        if w > 0.0 {
            (round2(tail_start), w)
        } else {
            (round2(l - t), 0.0)
        }
    } else {
        (round2(l - t), 0.0)
    };

    BarLayout {
        stock_id: stock.spec.id.clone(),
        length: l,
        qty: 1,
        placements,
        cuts,
        waste,
        offcut_start,
    }
}

/// Bounded branch-and-bound subset fill for a single bar with `usable` capacity.
fn fill_bar_exact(
    ctx: &Ctx<'_>,
    usable: f64,
    remaining: &[u32],
    eligible: &[usize],
) -> Vec<(usize, u32)> {
    const NODE_LIMIT: usize = 4_000;
    const EPS: f64 = 1e-9;

    // Sort longest first (keeping group index tie-break) for fast pruning.
    let mut items: Vec<(usize, f64, u32)> = eligible
        .iter()
        .filter_map(|&gi| {
            let q = remaining[gi];
            let len = ctx.groups[gi].spec.length;
            (q > 0 && len <= usable + EPS).then_some((gi, len, q))
        })
        .collect();
    if items.is_empty() {
        return Vec::new();
    }
    items.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    let n = items.len();
    let mut suffix_max = vec![0.0; n + 1];
    let mut suffix_min_len = vec![f64::INFINITY; n + 1];
    for i in (0..n).rev() {
        suffix_max[i] = suffix_max[i + 1] + items[i].1 * f64::from(items[i].2);
        suffix_min_len[i] = suffix_min_len[i + 1].min(items[i].1);
    }

    struct State<'a> {
        items: &'a [(usize, f64, u32)],
        suffix_max: &'a [f64],
        suffix_min_len: &'a [f64],
        usable: f64,
        kerf: f64,
        nodes: usize,
        cur: Vec<u32>,
        best: Vec<u32>,
        best_used: f64,
        best_count: u32,
        exact: bool,
    }

    fn dfs(s: &mut State<'_>, idx: usize, span_used: f64, parts_used: f64, count: u32) {
        if s.exact || s.nodes >= NODE_LIMIT {
            return;
        }
        s.nodes += 1;

        let better = parts_used > s.best_used + 1e-7
            || ((parts_used - s.best_used).abs() <= 1e-7 && count < s.best_count);
        if count > 0 && better {
            s.best_used = parts_used;
            s.best_count = count;
            s.best.copy_from_slice(&s.cur);
            if s.usable - span_used <= 1e-6 {
                s.exact = true;
                return;
            }
        }

        if idx == s.items.len() {
            return;
        }
        if parts_used + s.suffix_max[idx] < s.best_used - 1e-7 {
            return;
        }
        let need_kerf = if count > 0 { s.kerf } else { 0.0 };
        let rem_span = s.usable - span_used;
        if rem_span + EPS < need_kerf + s.suffix_min_len[idx] {
            return;
        }

        let (_, len, avail) = s.items[idx];
        let step = len + s.kerf;
        let max_fit = if rem_span + EPS < need_kerf + len {
            0
        } else {
            let after_first = rem_span - need_kerf - len;
            let extra = if step > 0.0 {
                ((after_first + EPS) / step).floor().max(0.0) as u32
            } else {
                avail
            };
            (1 + extra).min(avail)
        };

        for k in (0..=max_fit).rev() {
            let (next_span, next_parts) = if k == 0 {
                (span_used, parts_used)
            } else {
                let k_f = f64::from(k);
                let add = need_kerf + k_f * len + f64::from(k - 1) * s.kerf;
                // Guard against tiny float drift exceeding `usable`.
                if span_used + add > s.usable + 1e-9 {
                    continue;
                }
                (span_used + add, parts_used + k_f * len)
            };
            s.cur[idx] = k;
            dfs(s, idx + 1, next_span, next_parts, count + k);
            s.cur[idx] = 0;
            if s.exact || s.nodes >= NODE_LIMIT {
                break;
            }
        }
    }

    let mut state = State {
        items: &items,
        suffix_max: &suffix_max,
        suffix_min_len: &suffix_min_len,
        usable,
        kerf: ctx.kerf,
        nodes: 0,
        cur: vec![0; n],
        best: vec![0; n],
        best_used: 0.0,
        best_count: u32::MAX,
        exact: false,
    };
    dfs(&mut state, 0, 0.0, 0.0, 0);

    items
        .iter()
        .zip(state.best)
        .filter(|(_, k)| *k > 0)
        .map(|(&(gi, _, _), k)| (gi, k))
        .collect()
}

#[derive(Clone, Copy)]
enum StockPolicy {
    BestFill,
    LargestFirst,
    SmallestSufficient,
}

#[derive(Clone)]
struct PassBar {
    stock_idx: usize,
    items: Vec<(usize, u32)>,
    waste: f64,
}

#[derive(Clone)]
struct Pass {
    bars: Vec<PassBar>,
    remaining: Vec<u32>,
    stock_left: Vec<u32>,
}

#[derive(Clone, PartialEq, Eq)]
struct Score {
    unplaced: u32,
    new_stock_length_q: i64,
    total_stock_length_q: i64,
    neg_max_tail_q: i64,
    bars: u32,
    cuts: u32,
}

impl Score {
    fn cmp(&self, other: &Self) -> Ordering {
        self.unplaced
            .cmp(&other.unplaced)
            .then(self.new_stock_length_q.cmp(&other.new_stock_length_q))
            .then(self.total_stock_length_q.cmp(&other.total_stock_length_q))
            .then(self.neg_max_tail_q.cmp(&other.neg_max_tail_q))
            .then(self.bars.cmp(&other.bars))
            .then(self.cuts.cmp(&other.cuts))
    }
}

fn bar_used_and_tail(ctx: &Ctx<'_>, stock_idx: usize, items: &[(usize, u32)]) -> (f64, f64, u32) {
    let stock = &ctx.stocks[stock_idx];
    let l = stock.spec.length;
    let t = ctx.trim_for(stock);
    let mut count = 0u32;
    let mut parts_sum = 0.0;
    for &(gi, c) in items {
        count += c;
        parts_sum += ctx.groups[gi].spec.length * f64::from(c);
    }
    let span = parts_sum + if count > 1 { f64::from(count - 1) * ctx.kerf } else { 0.0 };
    let tail_start = t + span + ctx.kerf;
    let waste = if tail_start < l - t - 1e-9 {
        round2((l - t) - tail_start).max(0.0)
    } else {
        0.0
    };
    let end = t + span;
    let cuts = u32::from(t > 0.0) + if count > 0 { count - 1 + u32::from(end < l - 1e-9) } else { 0 };
    (parts_sum, waste, cuts)
}

fn score_pass(ctx: &Ctx<'_>, pass: &Pass) -> Score {
    let mut new_len = 0.0;
    let mut total_len = 0.0;
    let mut max_tail = 0.0_f64;
    let mut cuts = 0u32;
    for b in &pass.bars {
        let stock = &ctx.stocks[b.stock_idx];
        total_len += stock.spec.length;
        if stock.tier > 0 {
            new_len += stock.spec.length;
        }
        max_tail = max_tail.max(b.waste);
        let (_, _, c) = bar_used_and_tail(ctx, b.stock_idx, &b.items);
        cuts += c;
    }
    Score {
        unplaced: pass.remaining.iter().sum(),
        new_stock_length_q: (new_len * 100.0).round() as i64,
        total_stock_length_q: (total_len * 100.0).round() as i64,
        neg_max_tail_q: -(max_tail * 100.0).round() as i64,
        bars: pass.bars.len() as u32,
        cuts,
    }
}

struct RankedBar {
    rank: f64,
    bar: PassBar,
}

fn step_candidates(ctx: &Ctx<'_>, pass: &Pass, policy: StockPolicy) -> Vec<PassBar> {
    // Try lowest tier first that can place at least one remaining part.
    for tier in 0..=2u8 {
        let mut best_all_fit: Option<PassBar> = None;
        let mut candidates: Vec<RankedBar> = Vec::new();
        let mut seen: Vec<(u64, &Option<String>)> = Vec::new();

        for (si, stock) in ctx.stocks.iter().enumerate() {
            if stock.tier != tier || pass.stock_left[si] == 0 {
                continue;
            }
            let usable = ctx.usable_for(stock);
            if usable <= 0.0 {
                continue;
            }
            let key = (usable.to_bits(), &stock.spec.material);
            if seen.contains(&key) {
                continue;
            }
            let eligible: Vec<usize> = (0..ctx.groups.len())
                .filter(|&gi| {
                    pass.remaining[gi] > 0
                        && compatible(ctx.groups[gi].spec, stock.spec)
                        && ctx.groups[gi].spec.length <= usable + 1e-9
                })
                .collect();
            if eligible.is_empty() {
                continue;
            }
            seen.push(key);

            let items = fill_bar_exact(ctx, usable, &pass.remaining, &eligible);
            if items.is_empty() {
                continue;
            }
            let placed_all_eligible = eligible.iter().all(|&gi| {
                let used_q = items.iter().find(|x| x.0 == gi).map_or(0, |x| x.1);
                used_q == pass.remaining[gi]
            });
            let (used, waste, _) = bar_used_and_tail(ctx, si, &items);
            let bar = PassBar {
                stock_idx: si,
                items,
                waste,
            };
            if placed_all_eligible
                && best_all_fit
                    .as_ref()
                    .is_none_or(|b| stock.spec.length < ctx.stocks[b.stock_idx].spec.length)
            {
                best_all_fit = Some(bar.clone());
            }

            let rank = match policy {
                StockPolicy::BestFill => used / stock.spec.length + if waste >= 300.0 { 1e-4 } else { 0.0 },
                StockPolicy::LargestFirst => stock.spec.length * 1e3 + used,
                StockPolicy::SmallestSufficient => {
                    let max_elig = eligible
                        .iter()
                        .map(|&gi| ctx.groups[gi].spec.length)
                        .fold(0.0_f64, f64::max);
                    // Only consider stocks fitting the longest eligible part; prefer smallest stock.
                    let fits_longest = used > 0.0 && usable + 1e-9 >= max_elig;
                    if fits_longest {
                        1e9 - stock.spec.length + used * 1e-3
                    } else {
                        used / stock.spec.length
                    }
                }
            };
            candidates.push(RankedBar { rank, bar });
        }

        if let Some(bar) = best_all_fit
            && matches!(policy, StockPolicy::BestFill | StockPolicy::SmallestSufficient)
        {
            return vec![bar];
        }
        if !candidates.is_empty() {
            candidates.sort_by(|a, b| {
                b.rank
                    .total_cmp(&a.rank)
                    .then_with(|| a.bar.stock_idx.cmp(&b.bar.stock_idx))
            });
            return candidates.into_iter().map(|c| c.bar).collect();
        }
    }
    Vec::new()
}

fn apply_bar(ctx: &Ctx<'_>, pass: &mut Pass, bar: PassBar) {
    for &(gi, c) in &bar.items {
        pass.remaining[gi] -= c;
    }
    if ctx.stocks[bar.stock_idx].qty != u32::MAX {
        pass.stock_left[bar.stock_idx] -= 1;
    }
    pass.bars.push(bar);
}

fn finish_greedy(ctx: &Ctx<'_>, mut pass: Pass, policy: StockPolicy) -> Pass {
    while let Some(bar) = step_candidates(ctx, &pass, policy).into_iter().next() {
        apply_bar(ctx, &mut pass, bar);
    }
    pass
}

fn run_pilot(ctx: &Ctx<'_>, out_of_time: &dyn Fn() -> bool) -> Pass {
    let mut pass = Pass {
        bars: Vec::new(),
        remaining: ctx.groups.iter().map(|g| g.qty).collect(),
        stock_left: ctx.stocks.iter().map(|s| s.qty).collect(),
    };
    const PILOT_WIDTH: usize = 3;

    loop {
        let mut cands = step_candidates(ctx, &pass, StockPolicy::BestFill);
        if cands.is_empty() {
            break;
        }
        if cands.len() == 1 || out_of_time() {
            apply_bar(ctx, &mut pass, cands.remove(0));
            continue;
        }
        cands.truncate(PILOT_WIDTH);
        let mut best: Option<(Score, PassBar)> = None;
        for bar in cands {
            let mut trial = pass.clone();
            apply_bar(ctx, &mut trial, bar.clone());
            let done = finish_greedy(ctx, trial, StockPolicy::BestFill);
            let s = score_pass(ctx, &done);
            if best.as_ref().is_none_or(|b| s.cmp(&b.0).is_lt()) {
                best = Some((s, bar));
            }
        }
        apply_bar(ctx, &mut pass, best.unwrap().1);
    }
    pass
}

/// FFD / BFD multi-bar pass over an explicit part-group ordering.
fn run_bin_pack(ctx: &Ctx<'_>, order: &[usize], best_fit: bool, smallest_new: bool) -> Pass {
    struct OpenBar {
        stock_idx: usize,
        usable: f64,
        span_used: f64,
        counts: Vec<u32>,
    }

    let mut stock_left: Vec<u32> = ctx.stocks.iter().map(|s| s.qty).collect();
    let mut open: Vec<OpenBar> = Vec::new();
    let mut remaining: Vec<u32> = ctx.groups.iter().map(|g| g.qty).collect();
    let n_groups = ctx.groups.len();

    for &gi in order {
        let len = ctx.groups[gi].spec.length;
        for _ in 0..ctx.groups[gi].qty {
            // Try already-open bars first.
            let mut chosen: Option<(usize, f64)> = None;
            for (bi, bar) in open.iter().enumerate() {
                if !compatible(ctx.groups[gi].spec, ctx.stocks[bar.stock_idx].spec) {
                    continue;
                }
                let rem = bar.usable - bar.span_used;
                if rem + 1e-9 >= ctx.kerf + len {
                    let after = rem - ctx.kerf - len;
                    if !best_fit {
                        chosen = Some((bi, after));
                        break;
                    }
                    if chosen.is_none_or(|c| after < c.1) {
                        chosen = Some((bi, after));
                    }
                }
            }
            if let Some((bi, _)) = chosen {
                open[bi].span_used += ctx.kerf + len;
                open[bi].counts[gi] += 1;
                remaining[gi] -= 1;
                continue;
            }

            // Open a new bar in the lowest available tier that fits this part.
            let mut pick_stock: Option<usize> = None;
            for tier in 0..=2u8 {
                let mut tier_cands: Vec<(usize, f64)> = ctx
                    .stocks
                    .iter()
                    .enumerate()
                    .filter(|&(si, s)| {
                        s.tier == tier
                            && stock_left[si] > 0
                            && compatible(ctx.groups[gi].spec, s.spec)
                            && ctx.usable_for(s) + 1e-9 >= len
                    })
                    .map(|(si, s)| (si, ctx.usable_for(s)))
                    .collect();
                if !tier_cands.is_empty() {
                    if smallest_new {
                        tier_cands.sort_by(|a, b| a.1.total_cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
                    } else {
                        tier_cands.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
                    }
                    pick_stock = Some(tier_cands[0].0);
                    break;
                }
            }

            if let Some(si) = pick_stock {
                if ctx.stocks[si].qty != u32::MAX {
                    stock_left[si] -= 1;
                }
                let mut counts = vec![0; n_groups];
                counts[gi] = 1;
                open.push(OpenBar {
                    stock_idx: si,
                    usable: ctx.usable_for(&ctx.stocks[si]),
                    span_used: len,
                    counts,
                });
                remaining[gi] -= 1;
            }
        }
    }

    let bars = open
        .into_iter()
        .map(|b| {
            let items: Vec<(usize, u32)> = b
                .counts
                .into_iter()
                .enumerate()
                .filter(|&(_, c)| c > 0)
                .collect();
            let (_, waste, _) = bar_used_and_tail(ctx, b.stock_idx, &items);
            PassBar {
                stock_idx: b.stock_idx,
                items,
                waste,
            }
        })
        .collect();

    Pass {
        bars,
        remaining,
        stock_left,
    }
}

fn finish_linear_plan(ctx: &Ctx<'_>, pass: Option<Pass>) -> LinearPlan {
    let remaining: Vec<u32> = match &pass {
        Some(p) => p.remaining.clone(),
        None => ctx.groups.iter().map(|g| g.qty).collect(),
    };
    let unplaced = ctx
        .groups
        .iter()
        .zip(&remaining)
        .filter(|(_, left)| **left > 0)
        .map(|(g, &count)| Unplaced {
            part_id: g.spec.id.clone(),
            count,
        })
        .collect();

    let mut next_instance = vec![0u32; ctx.groups.len()];
    let mut bars: Vec<BarLayout> = Vec::new();
    let mut totals = LinearTotals::default();

    for bar in pass.map(|p| p.bars).unwrap_or_default() {
        let layout = build_bar(ctx, bar.stock_idx, &bar.items, &mut next_instance);
        totals.bars += 1;
        if ctx.stocks[bar.stock_idx].tier == 0 {
            totals.offcuts_used += 1;
        }
        totals.stock_length += layout.length;
        totals.used_length += layout.placements.iter().map(|p| p.length).sum::<f64>();
        totals.cuts += layout.cuts.len() as u32;

        if let Some(prev) = bars.iter_mut().find(|prev| same_bar(prev, &layout)) {
            prev.qty += 1;
        } else {
            bars.push(layout);
        }
    }
    totals.stock_length = round2(totals.stock_length);
    totals.used_length = round2(totals.used_length);
    totals.waste_length = round2((totals.stock_length - totals.used_length).max(0.0));

    LinearPlan {
        bars,
        unplaced,
        totals,
    }
}

fn same_bar(a: &BarLayout, b: &BarLayout) -> bool {
    a.stock_id == b.stock_id
        && a.placements.len() == b.placements.len()
        && a.placements
            .iter()
            .zip(&b.placements)
            .all(|(p, q)| p.part_id == q.part_id && (p.length - q.length).abs() < 1e-6)
}

#[cfg(not(target_arch = "wasm32"))]
struct StdClock(std::time::Instant);

#[cfg(not(target_arch = "wasm32"))]
impl Control for StdClock {
    fn elapsed_ms(&self) -> f64 {
        self.0.elapsed().as_secs_f64() * 1000.0
    }
}

/// Optimizes a 1D linear cutting job using the system clock for the time budget.
pub fn optimize_linear(job: &LinearJob) -> LinearPlan {
    #[cfg(not(target_arch = "wasm32"))]
    {
        optimize_linear_with(job, &mut StdClock(std::time::Instant::now()))
    }
    #[cfg(target_arch = "wasm32")]
    {
        optimize_linear_with(job, &mut crate::NoClock)
    }
}

/// Optimizes a 1D linear cutting job with a host-supplied clock and progress hook.
pub fn optimize_linear_with(job: &LinearJob, control: &mut dyn Control) -> LinearPlan {
    let kerf = if job.kerf.is_finite() {
        job.kerf.max(0.0)
    } else {
        0.0
    };
    let end_trim = if job.end_trim.is_finite() {
        job.end_trim.max(0.0)
    } else {
        0.0
    };

    let groups: Vec<Group<'_>> = job
        .parts
        .iter()
        .filter(|p| p.qty > 0 && p.length.is_finite() && p.length > 0.0)
        .map(|p| Group { spec: p, qty: p.qty })
        .collect();

    let mut stocks: Vec<Stock<'_>> = job
        .stock
        .iter()
        .filter(|s| s.length.is_finite() && s.length > 0.0 && s.qty != Some(0))
        .map(|s| Stock {
            spec: s,
            qty: s.qty.unwrap_or(u32::MAX),
            tier: if s.offcut {
                0
            } else if s.priority {
                1
            } else {
                2
            },
        })
        .collect();
    stocks.sort_by(|a, b| a.tier.cmp(&b.tier).then(b.spec.length.total_cmp(&a.spec.length)));

    let ctx = Ctx {
        groups,
        stocks,
        kerf,
        end_trim,
    };
    let n = ctx.groups.len();
    if n == 0 {
        return finish_linear_plan(&ctx, None);
    }

    let mut search = LinearSearch {
        ctx: &ctx,
        control,
        budget: f64::from(job.options.time_budget_ms),
        best: None,
        passes: 0,
        stopped: false,
    };

    let initial = Pass {
        bars: Vec::new(),
        remaining: ctx.groups.iter().map(|g| g.qty).collect(),
        stock_left: ctx.stocks.iter().map(|s| s.qty).collect(),
    };

    // 1. Greedy exact-subset fills across stock policies.
    for policy in [
        StockPolicy::BestFill,
        StockPolicy::LargestFirst,
        StockPolicy::SmallestSufficient,
    ] {
        if search.done() {
            break;
        }
        let pass = finish_greedy(&ctx, initial.clone(), policy);
        search.record(pass);
    }

    // 2. Classic FFD / BFD passes over fixed orderings (longest first, natural).
    let mut by_len: Vec<usize> = (0..n).collect();
    by_len.sort_by(|&a, &b| ctx.groups[b].spec.length.total_cmp(&ctx.groups[a].spec.length));
    let natural: Vec<usize> = (0..n).collect();
    let mut fixed_orders = vec![by_len.clone()];
    if natural != by_len {
        fixed_orders.push(natural);
    }
    for order in &fixed_orders {
        for best_fit in [false, true] {
            for smallest_new in [false, true] {
                if search.done() {
                    break;
                }
                let pass = run_bin_pack(&ctx, order, best_fit, smallest_new);
                search.record(pass);
            }
        }
    }

    // 3. Pilot lookahead pass.
    if !search.done() {
        let pilot = {
            let c = &*search.control;
            let budget = search.budget;
            let out_of_time = || c.elapsed_ms() >= budget;
            run_pilot(&ctx, &out_of_time)
        };
        search.record(pilot);
    }

    // 4. Seeded random orderings for multi-bar synergy if budget remains.
    const MAX_SHUFFLES: usize = 120;
    const STALL_LIMIT: usize = 40;
    if n > 1 && !search.done() {
        let mut rng = Rng::new(job.options.seed);
        let mut stall = 0usize;
        for _ in 0..MAX_SHUFFLES {
            if stall >= STALL_LIMIT || search.done() {
                break;
            }
            let mut order: Vec<usize> = (0..n).collect();
            rng.shuffle(&mut order);
            let mut improved = false;
            for best_fit in [false, true] {
                if search.done() {
                    break;
                }
                let pass = run_bin_pack(&ctx, &order, best_fit, true);
                improved |= search.record(pass);
            }
            stall = if improved { 0 } else { stall + 1 };
        }
    }

    finish_linear_plan(&ctx, search.best.map(|b| b.0))
}

struct LinearSearch<'s, 'a> {
    ctx: &'s Ctx<'a>,
    control: &'s mut dyn Control,
    budget: f64,
    best: Option<(Pass, Score)>,
    passes: u32,
    stopped: bool,
}

impl LinearSearch<'_, '_> {
    fn done(&self) -> bool {
        self.best.is_some() && (self.stopped || self.control.elapsed_ms() >= self.budget)
    }

    fn record(&mut self, pass: Pass) -> bool {
        self.passes += 1;
        let s = score_pass(self.ctx, &pass);
        let better = self.best.as_ref().is_none_or(|b| s.cmp(&b.1).is_lt());
        if better {
            self.best = Some((pass, s));
        }
        let b = self.best.as_ref().expect("a pass ran");
        let progress = Progress {
            passes: self.passes,
            best_sheets: b.0.bars.len() as u32,
            best_unplaced: b.1.unplaced,
            elapsed_ms: self.control.elapsed_ms(),
        };
        if !self.control.progress(&progress) {
            self.stopped = true;
        }
        better
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn part(id: &str, length: f64, qty: u32) -> LinearPartSpec {
        LinearPartSpec {
            id: id.into(),
            length,
            qty,
            label: id.into(),
            material: None,
        }
    }

    fn stock(id: &str, length: f64) -> LinearStockSpec {
        LinearStockSpec {
            id: id.into(),
            length,
            qty: None,
            priority: false,
            offcut: false,
            material: None,
            label: id.into(),
        }
    }

    #[test]
    fn linear_job_round_trips_and_uses_defaults() {
        let job: LinearJob = serde_json::from_str(
            r#"{"parts":[{"id":"a","length":800,"qty":2}],"stock":[{"id":"s","length":2400}],"kerf":3}"#,
        )
        .unwrap();
        assert_eq!(job.end_trim, 0.0);
        assert_eq!(job.options.time_budget_ms, 200);
        let json = serde_json::to_string(&job).unwrap();
        assert!(json.contains("\"endTrim\""));
        let back: LinearJob = serde_json::from_str(&json).unwrap();
        assert_eq!(job, back);
    }

    #[test]
    fn exact_subset_packing_beats_naive_ffd() {
        let job = LinearJob {
            parts: vec![part("a", 1100.0, 2), part("b", 700.0, 2), part("c", 600.0, 2)],
            stock: vec![stock("s", 2400.0)],
            kerf: 0.0,
            end_trim: 0.0,
            options: LinearOptions::default(),
        };
        let plan = optimize_linear(&job);
        assert!(plan.unplaced.is_empty());
        assert_eq!(plan.totals.bars, 2);
        assert_eq!(plan.totals.waste_length, 0.0);
        assert_eq!(plan.bars.len(), 1);
        assert_eq!(plan.bars[0].qty, 2);
    }

    #[test]
    fn kerf_boundary_is_exact() {
        let mut job = LinearJob {
            parts: vec![part("p", 1000.0, 2)],
            stock: vec![stock("s", 2000.0)],
            kerf: 4.0,
            end_trim: 0.0,
            options: LinearOptions::default(),
        };
        assert_eq!(optimize_linear(&job).totals.bars, 2);
        job.stock[0].length = 2004.0;
        let one = optimize_linear(&job);
        assert_eq!(one.totals.bars, 1);
        assert_eq!(one.bars[0].cuts.len(), 1);
        assert_eq!(one.bars[0].cuts[0].pos, 1002.0);
        assert_eq!(one.bars[0].cuts[0].from_last_edge, 1000.0);
    }

    #[test]
    fn end_trim_squares_raw_lumber_but_not_offcuts() {
        let job = LinearJob {
            parts: vec![part("p", 900.0, 2)],
            stock: vec![
                LinearStockSpec {
                    offcut: true,
                    qty: Some(1),
                    ..stock("off", 900.0)
                },
                stock("raw", 1000.0),
            ],
            kerf: 4.0,
            end_trim: 20.0,
            options: LinearOptions::default(),
        };
        let plan = optimize_linear(&job);
        assert!(plan.unplaced.is_empty());
        assert_eq!(plan.totals.bars, 2);
        assert_eq!(plan.totals.offcuts_used, 1);
        assert_eq!(plan.bars[0].stock_id, "off");
        assert!(plan.bars[0].cuts.is_empty());
        assert_eq!(plan.bars[1].stock_id, "raw");
        assert_eq!(plan.bars[1].placements[0].x, 20.0);
        // Cut 1 squares left end (20 mm); cut 2 stops at 900 mm from the squared edge.
        assert_eq!(plan.bars[1].cuts.len(), 2);
        assert_eq!(plan.bars[1].cuts[0].stage, 0);
        assert_eq!(plan.bars[1].cuts[0].from_last_edge, 20.0);
        assert_eq!(plan.bars[1].cuts[1].stage, 1);
        assert_eq!(plan.bars[1].cuts[1].from_last_edge, 900.0);
        // 1000 - 20 (left trim) - 900 (part) - 4 (kerf) - 20 (right trim) = 56 mm leftover.
        assert_eq!(plan.bars[1].waste, 56.0);
        assert_eq!(plan.bars[1].offcut_start, 924.0);
    }

    #[test]
    fn selects_tightest_stock_and_respects_tiers() {
        let job = LinearJob {
            parts: vec![part("rail", 800.0, 1), part("post", 1800.0, 1)],
            stock: vec![
                LinearStockSpec {
                    offcut: true,
                    qty: Some(1),
                    ..stock("off-big", 2000.0)
                },
                LinearStockSpec {
                    offcut: true,
                    qty: Some(1),
                    ..stock("off-tight", 900.0)
                },
                stock("s-4000", 4000.0),
                stock("s-2400", 2400.0),
            ],
            kerf: 4.0,
            end_trim: 0.0,
            options: LinearOptions::default(),
        };
        let plan = optimize_linear(&job);
        assert!(plan.unplaced.is_empty());
        assert_eq!(plan.totals.offcuts_used, 2);
        // Tight offcut takes the 800 mm rail, big offcut takes the 1800 mm post, 0 new stock bought!
        assert_eq!(plan.totals.bars, 2);
    }

    #[test]
    fn reports_unplaced_for_material_mismatch_and_oversized() {
        let job = LinearJob {
            parts: vec![
                LinearPartSpec {
                    material: Some("oak".into()),
                    ..part("oak-part", 1000.0, 2)
                },
                part("huge", 3000.0, 1),
            ],
            stock: vec![LinearStockSpec {
                material: Some("spruce".into()),
                qty: Some(2),
                ..stock("spruce", 2400.0)
            }],
            kerf: 4.0,
            end_trim: 0.0,
            options: LinearOptions::default(),
        };
        let plan = optimize_linear(&job);
        let mut missing: Vec<_> = plan
            .unplaced
            .iter()
            .map(|u| (u.part_id.as_str(), u.count))
            .collect();
        missing.sort();
        assert_eq!(missing, [("huge", 1), ("oak-part", 2)]);
        assert_eq!(plan.totals.bars, 0);
    }
}
