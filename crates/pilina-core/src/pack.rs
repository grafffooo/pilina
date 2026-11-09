//! Packs one sheet in an abstract frame with a 3-stage guillotine model:
//!
//! - stage 1: full-height rip cuts split the frame into vertical strips,
//! - stage 2: cross cuts split each strip into rows,
//! - stage 3: cuts split a row into parts side by side,
//! - stage 4 (trim): a part shorter than its row gets one more cut.
//!
//! The frame's x axis is either the stock width or (transposed) the stock length; the
//! caller tries both. Strips are chosen greedily, each by simulating every candidate
//! strip width and scoring the result with one of several strategies.

use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

use crate::prep::Orient;

/// A part type as the packer sees it: allowed orientations and how many copies are left.
pub(crate) struct FrameGroup {
    pub orients: Vec<Orient>,
    pub count: u32,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct RowPart {
    /// Index into the `FrameGroup` slice.
    pub g: usize,
    pub o: Orient,
}

#[derive(Debug, Clone)]
pub(crate) struct Row {
    pub h: f64,
    pub parts: Vec<RowPart>,
}

#[derive(Debug, Clone)]
pub(crate) struct Strip {
    pub col_w: f64,
    pub rows: Vec<Row>,
    pub total_h: f64,
}

pub(crate) struct Packed {
    pub strips: Vec<Strip>,
    /// Copies left per frame group after this sheet.
    pub counts: Vec<u32>,
    pub used_w: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Strategy {
    FillRatio,
    NarrowHighFill,
    WideFirst,
    AllowSubcuts,
}

pub(crate) const STRATEGIES: [Strategy; 4] = [
    Strategy::FillRatio,
    Strategy::NarrowHighFill,
    Strategy::WideFirst,
    Strategy::AllowSubcuts,
];

fn fitting(g: &FrameGroup, max_w: f64, max_h: f64) -> impl Iterator<Item = &Orient> {
    g.orients.iter().filter(move |o| o.w <= max_w && o.h <= max_h)
}

/// Raw result of filling one strip; the strategy score is derived from it.
#[derive(Clone)]
struct SimResult {
    strip: Strip,
    counts: Vec<u32>,
    parts_area: f64,
    exact_parts: u32,
}

/// FxHash: a fast non-cryptographic hasher (the keys are our own numbers).
#[derive(Default)]
pub(crate) struct FxHasher(u64);

impl Hasher for FxHasher {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.write_u64(u64::from(b));
        }
    }

    fn write_u8(&mut self, n: u8) {
        self.write_u64(u64::from(n));
    }

    fn write_u32(&mut self, n: u32) {
        self.write_u64(u64::from(n));
    }

    fn write_usize(&mut self, n: usize) {
        self.write_u64(n as u64);
    }

    fn write_u64(&mut self, n: u64) {
        self.0 = (self.0.rotate_left(5) ^ n).wrapping_mul(0x51_7c_c1_b7_27_22_0a_95);
    }
}

pub(crate) type FxBuild = BuildHasherDefault<FxHasher>;

/// Strip simulations depend only on the strip width, the counts left, the row order and
/// whether sub-row leaders are allowed, so all strategies on one frame can share them.
#[derive(Default)]
pub(crate) struct StripMemo {
    map: HashMap<(u64, bool, bool, Vec<u32>), SimResult, FxBuild>,
}

/// Packs a `fw` × `fh` frame. `memo` must only be shared between calls with the same
/// frame, groups and kerf.
pub(crate) fn pack_frame(
    fw: f64,
    fh: f64,
    groups: &[FrameGroup],
    kerf: f64,
    strategy: Strategy,
    memo: &mut StripMemo,
) -> Packed {
    let mut counts: Vec<u32> = groups.iter().map(|g| g.count).collect();
    let mut strips: Vec<Strip> = Vec::new();
    let mut used_w = 0.0;

    loop {
        let avail_w = if strips.is_empty() { fw } else { fw - used_w - kerf };
        if avail_w <= 0.0 {
            break;
        }

        // Candidate strip widths, in first-seen order (keeps tie-breaking stable).
        let mut widths: Vec<f64> = Vec::new();
        for (gi, g) in groups.iter().enumerate() {
            if counts[gi] == 0 {
                continue;
            }
            for o in fitting(g, avail_w, fh) {
                if !widths.contains(&o.w) {
                    widths.push(o.w);
                }
            }
        }
        if widths.is_empty() {
            break;
        }

        let mut best: Option<(f64, Strip, Vec<u32>)> = None;
        for &col_w in &widths {
            for tall_first in [true, false] {
                let subcuts = strategy == Strategy::AllowSubcuts;
                let key = (col_w.to_bits(), tall_first, subcuts, counts.clone());
                let sim = memo
                    .map
                    .entry(key)
                    .or_insert_with(|| simulate_strip(col_w, fh, groups, &counts, kerf, subcuts, tall_first));
                if sim.strip.rows.is_empty() {
                    continue;
                }
                let score = strip_score(sim, fh, strategy);
                if best.as_ref().is_none_or(|b| score > b.0) {
                    best = Some((score, sim.strip.clone(), sim.counts.clone()));
                }
            }
        }

        let Some((_, strip, c)) = best else { break };
        let gap = if strips.is_empty() { 0.0 } else { kerf };
        used_w += gap + strip.col_w;
        strips.push(strip);
        counts = c;
    }

    Packed {
        strips,
        counts,
        used_w,
    }
}

fn strip_score(sim: &SimResult, fh: f64, strategy: Strategy) -> f64 {
    let col_w = sim.strip.col_w;
    let fill = sim.parts_area / (col_w * fh);
    let exact_ratio = f64::from(sim.exact_parts) / sim.strip.rows.len() as f64;
    let v_fill = sim.strip.total_h / fh;
    match strategy {
        Strategy::FillRatio => fill * 1000.0 + exact_ratio * 250.0 + v_fill * 100.0 - col_w * 0.01,
        Strategy::NarrowHighFill => fill * 1200.0 + exact_ratio * 200.0 + v_fill * 300.0 - col_w * 0.05,
        Strategy::WideFirst => fill * 800.0 + col_w * 0.25 + exact_ratio * 200.0,
        Strategy::AllowSubcuts => sim.parts_area + fill * 400_000.0,
    }
}

/// Fills one strip of width `col_w`.
fn simulate_strip(
    col_w: f64,
    fh: f64,
    groups: &[FrameGroup],
    counts: &[u32],
    kerf: f64,
    subcuts: bool,
    tall_first: bool,
) -> SimResult {
    // Candidates exactly as wide as the strip, and narrower ones, each in group order.
    let mut exact: Vec<RowPart> = Vec::new();
    let mut narrower: Vec<RowPart> = Vec::new();
    for (gi, g) in groups.iter().enumerate() {
        if counts[gi] == 0 {
            continue;
        }
        for &o in &g.orients {
            if o.w == col_w {
                exact.push(RowPart { g: gi, o });
            } else if o.w < col_w && o.h <= fh {
                narrower.push(RowPart { g: gi, o });
            }
        }
    }

    let mut c = counts.to_vec();
    let mut rows: Vec<Row> = Vec::new();
    let mut cur_y = 0.0;
    let mut exact_parts = 0u32;
    let mut parts_area = 0.0;

    // Row leader among `list`: by height order (taller or shorter first), then wider.
    let pick_lead = |list: &[RowPart], c: &[u32], avail_h: f64, by_area: bool| -> Option<RowPart> {
        let mut lead: Option<RowPart> = None;
        for &cand in list {
            if c[cand.g] == 0 || cand.o.h > avail_h {
                continue;
            }
            let Some(l) = lead else {
                lead = Some(cand);
                continue;
            };
            let better = if by_area {
                cand.o.area() > l.o.area()
            } else {
                let taller = if tall_first {
                    cand.o.h > l.o.h
                } else {
                    cand.o.h < l.o.h
                };
                taller || (cand.o.h == l.o.h && cand.o.w > l.o.w)
            };
            if better {
                lead = Some(cand);
            }
        }
        lead
    };

    loop {
        let avail_h = if rows.is_empty() { fh } else { fh - cur_y - kerf };
        if avail_h <= 0.0 {
            break;
        }

        // Exact-width parts always lead first.
        let (lead, lead_exact) = match pick_lead(&exact, &c, avail_h, false) {
            Some(l) => (l, true),
            None => {
                // Most strategies only start a narrower row once exact-width parts are used up.
                if !subcuts && !rows.is_empty() && exact.iter().any(|p| c[p.g] > 0) {
                    break;
                }
                match pick_lead(&narrower, &c, avail_h, subcuts) {
                    Some(l) => (l, false),
                    None => break,
                }
            }
        };

        let mut row = Row {
            h: lead.o.h,
            parts: vec![lead],
        };
        c[lead.g] -= 1;
        let mut row_used = lead.o.w;
        if lead_exact {
            exact_parts += 1;
        }

        // Fill the rest of the row: same height first, then the largest part that fits.
        while row_used + kerf < col_w {
            let rem = col_w - row_used - kerf;
            let mut pick: Option<(RowPart, f64)> = None;
            for &cand in &narrower {
                if c[cand.g] == 0 || cand.o.w > rem || cand.o.h > row.h {
                    continue;
                }
                let same = if cand.o.h == row.h { 1e12 } else { 0.0 };
                let score = same + cand.o.area();
                if pick.is_none_or(|p| score > p.1) {
                    pick = Some((cand, score));
                }
            }
            let Some((p, _)) = pick else { break };
            row.parts.push(p);
            c[p.g] -= 1;
            row_used += kerf + p.o.w;
        }

        parts_area += row.parts.iter().map(|p| p.o.area()).sum::<f64>();
        let gap = if rows.is_empty() { 0.0 } else { kerf };
        cur_y += gap + row.h;
        rows.push(row);
    }

    SimResult {
        strip: Strip {
            col_w,
            rows,
            total_h: cur_y,
        },
        counts: c,
        parts_area,
        exact_parts,
    }
}
