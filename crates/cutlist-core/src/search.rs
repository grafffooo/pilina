//! Whole-job search: greedy sheet-by-sheet passes over many part orderings, best plan wins.

use std::cmp::Ordering;

use crate::layout::{self, Built};
use crate::pack::{self, FrameGroup, Packed};
use crate::prep::{self, Group, Stock};

/// How a pass judges candidate sheets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum EvalMode {
    /// Most placed area.
    Area,
    /// Also reward one big untouched leftover.
    Offcut,
    /// Penalize cuts more.
    FewCuts,
}

pub(crate) const EVAL_MODES: [EvalMode; 3] = [EvalMode::Area, EvalMode::Offcut, EvalMode::FewCuts];

pub(crate) struct Ctx<'a> {
    pub groups: Vec<Group<'a>>,
    pub stocks: Vec<Stock<'a>>,
    pub kerf: f64,
    pub trim: f64,
}

#[derive(Clone)]
pub(crate) struct PassSheet {
    pub built: Built,
    pub stock: usize,
}

/// A (partial) plan: sheets so far plus what's left to place and to cut from.
#[derive(Clone)]
pub(crate) struct Pass {
    pub sheets: Vec<PassSheet>,
    /// Copies left per job group.
    pub remaining: Vec<u32>,
    stock_left: Vec<u32>,
    next_instance: Vec<u32>,
}

struct Candidate {
    score: f64,
    packed: Packed,
    transposed: bool,
    /// Job group index for each frame group.
    frame_groups: Vec<usize>,
    left: u32,
}

/// Candidate sheets on `stock` for the `eligible` groups (both orientations × all
/// strategies), best first, without duplicates.
fn pack_sheet_candidates(
    ctx: &Ctx<'_>,
    stock: &Stock<'_>,
    remaining: &[u32],
    eligible: &[usize],
    mode: EvalMode,
) -> Vec<Candidate> {
    let usable_w = stock.spec.width - 2.0 * ctx.trim;
    let usable_h = stock.spec.length - 2.0 * ctx.trim;
    if usable_w <= 0.0 || usable_h <= 0.0 {
        return Vec::new();
    }
    let real: Vec<_> = eligible
        .iter()
        .map(|&g| prep::orientations(ctx.groups[g].spec, usable_w, usable_h))
        .collect();
    if real.iter().all(Vec::is_empty) {
        return Vec::new();
    }

    let mut list: Vec<Candidate> = Vec::new();
    for transposed in [false, true] {
        let (fw, fh) = if transposed {
            (usable_h, usable_w)
        } else {
            (usable_w, usable_h)
        };
        let fg: Vec<FrameGroup> = eligible
            .iter()
            .zip(&real)
            .map(|(&g, orients)| FrameGroup {
                orients: if transposed {
                    orients.iter().map(|o| o.transposed()).collect()
                } else {
                    orients.clone()
                },
                count: remaining[g],
            })
            .collect();

        let mut memo = pack::StripMemo::default();
        for strategy in pack::STRATEGIES {
            let packed = pack::pack_frame(fw, fh, &fg, ctx.kerf, strategy, &mut memo);
            if packed.strips.is_empty() {
                continue;
            }
            // Strategies often agree; keep one copy of each distinct packing.
            let duplicate = list.iter().any(|c| {
                c.transposed == transposed
                    && c.packed.counts == packed.counts
                    && c.packed.strips.len() == packed.strips.len()
                    && c.packed.used_w == packed.used_w
            });
            if duplicate {
                continue;
            }
            let left: u32 = packed.counts.iter().sum();
            let mut placed_area = 0.0;
            let mut rows = 0usize;
            let mut parts = 0usize;
            for strip in &packed.strips {
                rows += strip.rows.len();
                for row in &strip.rows {
                    parts += row.parts.len();
                    placed_area += row.parts.iter().map(|p| p.o.area()).sum::<f64>();
                }
            }
            // Proxy for the largest reusable leftover: the untouched area right of the last strip.
            let free_right = (fw - packed.used_w - ctx.kerf).max(0.0) * fh;
            let est_cuts = (packed.strips.len() + rows + parts) as f64;
            let score = if left == 0 { 1e12 } else { 0.0 }
                + placed_area * 10.0
                + free_right * if mode == EvalMode::Offcut { 2.0 } else { 0.5 }
                - est_cuts * if mode == EvalMode::FewCuts { 5000.0 } else { 500.0 };
            list.push(Candidate {
                score,
                packed,
                transposed,
                frame_groups: eligible.to_vec(),
                left,
            });
        }
    }
    list.sort_by(|a, b| b.score.total_cmp(&a.score));
    list
}

impl Pass {
    pub fn new(ctx: &Ctx<'_>) -> Self {
        Self {
            sheets: Vec::new(),
            remaining: ctx.groups.iter().map(|g| g.qty).collect(),
            stock_left: ctx.stocks.iter().map(|s| s.qty).collect(),
            next_instance: vec![0; ctx.groups.len()],
        }
    }

    /// The stock for the next sheet and its candidate packings, best first; `None` when
    /// nothing more can be placed.
    ///
    /// Within the first tier that can place anything: the smallest sheet that finishes its
    /// parts, otherwise the first (largest) sheet that places something.
    fn next_options(
        &self,
        ctx: &Ctx<'_>,
        order: &[usize],
        mode: EvalMode,
    ) -> Option<(usize, Vec<Candidate>)> {
        let mut by_tier: [Vec<(usize, Vec<usize>)>; 3] = Default::default();
        for (si, stock) in ctx.stocks.iter().enumerate() {
            if self.stock_left[si] == 0 {
                continue;
            }
            let eligible: Vec<usize> = order
                .iter()
                .copied()
                .filter(|&g| self.remaining[g] > 0 && prep::compatible(ctx.groups[g].spec, stock.spec))
                .collect();
            if !eligible.is_empty() {
                by_tier[stock.tier as usize].push((si, eligible));
            }
        }

        for tier in &by_tier {
            let mut first_ok: Option<(usize, Vec<Candidate>)> = None;
            let mut best_final: Option<(usize, Vec<Candidate>, f64)> = None;
            for (si, eligible) in tier {
                let stock = &ctx.stocks[*si];
                let cands = pack_sheet_candidates(ctx, stock, &self.remaining, eligible, mode);
                let Some(top) = cands.first() else { continue };
                let area = stock.spec.length * stock.spec.width;
                if top.left == 0 {
                    if best_final.as_ref().is_none_or(|b| area < b.2) {
                        best_final = Some((*si, cands, area));
                    }
                } else if first_ok.is_none() {
                    first_ok = Some((*si, cands));
                }
            }
            if let Some(found) = best_final.map(|(si, c, _)| (si, c)).or(first_ok) {
                return Some(found);
            }
        }
        None
    }

    fn apply(&mut self, ctx: &Ctx<'_>, si: usize, cand: &Candidate) {
        let built = layout::build(
            ctx.stocks[si].spec,
            &cand.packed.strips,
            &ctx.groups,
            &cand.frame_groups,
            &mut self.next_instance,
            ctx.kerf,
            ctx.trim,
            cand.transposed,
        );
        for (fi, &g) in cand.frame_groups.iter().enumerate() {
            self.remaining[g] = cand.packed.counts[fi];
        }
        if self.stock_left[si] != u32::MAX {
            self.stock_left[si] -= 1;
        }
        self.sheets.push(PassSheet { built, stock: si });
    }
}

/// One pass over the job: fill sheet after sheet, groups considered in `order`.
///
/// With `pilot` > 1 each sheet is chosen by lookahead: the `pilot` best candidate packings
/// are each followed by a greedy finish of the whole job, and the one leading to the best
/// plan wins. `pilot` ≤ 1 is the plain greedy pass. Once `out_of_time` returns true the
/// pass finishes greedily.
pub(crate) fn run_pass(
    ctx: &Ctx<'_>,
    order: &[usize],
    mode: EvalMode,
    pilot: usize,
    out_of_time: &dyn Fn() -> bool,
) -> Pass {
    let mut pass = Pass::new(ctx);
    while let Some((si, cands)) = pass.next_options(ctx, order, mode) {
        let mut chosen = 0;
        if pilot > 1 && cands.len() > 1 && !out_of_time() {
            let mut best: Option<Score> = None;
            for (i, cand) in cands.iter().take(pilot).enumerate() {
                let mut trial = pass.clone();
                trial.apply(ctx, si, cand);
                finish_greedy(ctx, &mut trial, order, mode);
                let s = score(ctx, &trial);
                if best.as_ref().is_none_or(|b| s.cmp(b).is_lt()) {
                    best = Some(s);
                    chosen = i;
                }
            }
        }
        pass.apply(ctx, si, &cands[chosen]);
    }
    pass
}

fn finish_greedy(ctx: &Ctx<'_>, pass: &mut Pass, order: &[usize], mode: EvalMode) {
    while let Some((si, cands)) = pass.next_options(ctx, order, mode) {
        pass.apply(ctx, si, &cands[0]);
    }
}

/// Lexicographic plan quality, lower is better: fewest unplaced parts, least new sheet area
/// (library offcuts are free), biggest leftover on the last sheet, fewest cuts.
#[derive(Debug, Clone)]
pub(crate) struct Score {
    unplaced: u32,
    sheet_area: f64,
    neg_last_offcut: f64,
    cuts: usize,
}

pub(crate) fn score(ctx: &Ctx<'_>, pass: &Pass) -> Score {
    let sheet_area = pass
        .sheets
        .iter()
        .filter(|s| ctx.stocks[s.stock].tier != 0)
        .map(|s| s.built.layout.width * s.built.layout.length)
        .sum();
    let last_offcut = pass
        .sheets
        .last()
        .and_then(|s| s.built.layout.waste.first())
        .map_or(0.0, |r| r.w * r.h);
    Score {
        unplaced: pass.remaining.iter().sum(),
        sheet_area,
        neg_last_offcut: -last_offcut,
        cuts: pass.sheets.iter().map(|s| s.built.layout.cuts.len()).sum(),
    }
}

impl Score {
    pub fn cmp(&self, other: &Self) -> Ordering {
        self.unplaced
            .cmp(&other.unplaced)
            .then(self.sheet_area.total_cmp(&other.sheet_area))
            .then(self.neg_last_offcut.total_cmp(&other.neg_last_offcut))
            .then(self.cuts.cmp(&other.cuts))
    }
}

/// SplitMix64: tiny, fast and deterministic across platforms.
pub(crate) struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(seed)
    }

    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in `0..n` (n > 0).
    pub fn below(&mut self, n: usize) -> usize {
        ((self.next_u64() >> 11) as f64 / (1u64 << 53) as f64 * n as f64) as usize
    }

    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.below(i + 1);
            items.swap(i, j);
        }
    }
}

/// Fixed orderings tried first: input order, largest part, longest side, largest total area.
pub(crate) fn base_orderings(ctx: &Ctx<'_>) -> Vec<Vec<usize>> {
    let n = ctx.groups.len();
    let natural: Vec<usize> = (0..n).collect();
    let sorted_by = |key: &dyn Fn(&Group<'_>) -> f64| {
        let mut v = natural.clone();
        v.sort_by(|&a, &b| key(&ctx.groups[b]).total_cmp(&key(&ctx.groups[a])));
        v
    };
    let by_area = sorted_by(&|g| g.area);
    let by_side = sorted_by(&|g| g.spec.length.max(g.spec.width));
    let by_total = sorted_by(&|g| g.area * g.qty as f64);
    let mut list = vec![natural, by_area, by_side, by_total];
    list.dedup();
    list
}
