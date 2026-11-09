//! Pilina core: the cut optimizer and related calculations.
//!
//! [`optimize`] packs parts onto stock sheets with a 3-stage guillotine model (see
//! `pack.rs`), so every layout can be cut on a panel saw. It runs many greedy passes with
//! different part orderings and keeps the best plan, within `Options::time_budget_ms`.

mod layout;
pub mod model;
mod pack;
mod prep;
pub mod pricing;
mod search;

pub use model::*;
pub use pricing::{CostBreakdown, PriceInput, price};

use search::{Ctx, EVAL_MODES, EvalMode, Rng};

/// Crate version, exposed so the apps can show which engine they run.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Search progress, reported after each part ordering.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Progress {
    /// Greedy passes run so far.
    pub passes: u32,
    /// Sheets in the best plan so far.
    pub best_sheets: u32,
    /// Parts the best plan couldn't place.
    pub best_unplaced: u32,
    pub elapsed_ms: f64,
}

/// Lets the host supply a clock and watch or stop the search.
pub trait Control {
    /// Milliseconds since the search started.
    fn elapsed_ms(&self) -> f64;
    /// Called after each ordering. Return `false` to stop and keep the best plan so far.
    fn progress(&mut self, _progress: &Progress) -> bool {
        true
    }
}

/// A `Control` that never stops early and has no clock, so the search ends only when it
/// stops improving. Used where there is no system clock (plain `wasm32`).
pub struct NoClock;

impl Control for NoClock {
    fn elapsed_ms(&self) -> f64 {
        0.0
    }
}

#[cfg(not(target_arch = "wasm32"))]
struct StdClock(std::time::Instant);

#[cfg(not(target_arch = "wasm32"))]
impl Control for StdClock {
    fn elapsed_ms(&self) -> f64 {
        self.0.elapsed().as_secs_f64() * 1000.0
    }
}

/// Most random part orderings tried after the fixed ones.
const MAX_SHUFFLES: usize = 500;
/// Stop shuffling after this many orderings in a row without a better plan.
const STALL_LIMIT: usize = 80;
/// Candidate sheets compared by lookahead at each step of a pilot pass.
const PILOT_WIDTH: usize = 3;

/// Optimizes a cutting job using the system clock for the time budget.
pub fn optimize(job: &Job) -> Plan {
    #[cfg(not(target_arch = "wasm32"))]
    {
        optimize_with(job, &mut StdClock(std::time::Instant::now()))
    }
    #[cfg(target_arch = "wasm32")]
    {
        optimize_with(job, &mut NoClock)
    }
}

/// Optimizes a cutting job with a host-supplied clock and progress hook.
pub fn optimize_with(job: &Job, control: &mut dyn Control) -> Plan {
    let kerf = if job.kerf.is_finite() {
        job.kerf.max(0.0)
    } else {
        0.0
    };
    let trim = if job.trim.is_finite() {
        job.trim.max(0.0)
    } else {
        0.0
    };
    let ctx = Ctx {
        groups: prep::groups(job),
        stocks: prep::stocks(job),
        kerf,
        trim,
    };
    let n = ctx.groups.len();
    if n == 0 {
        return finish(&ctx, None);
    }

    let mut search = Search {
        ctx: &ctx,
        control,
        budget: f64::from(job.options.time_budget_ms),
        best: None,
        passes: 0,
        stopped: false,
    };

    // 1. Greedy passes over the fixed orderings, all evaluation modes.
    let fixed = search::base_orderings(&ctx);
    let mut tried: Vec<(search::Score, usize, EvalMode)> = Vec::new();
    for (oi, order) in fixed.iter().enumerate() {
        for mode in EVAL_MODES {
            if let Some((score, _)) = search.run(order, mode, 1) {
                tried.push((score, oi, mode));
            }
        }
    }

    // 2. Lookahead passes, most promising starting points first.
    tried.sort_by(|a, b| a.0.cmp(&b.0));
    for (_, oi, mode) in &tried {
        search.run(&fixed[*oi], *mode, PILOT_WIDTH);
    }

    // 3. Random orderings with whatever time is left, until they stop paying off.
    if n > 1 {
        let mut rng = Rng::new(job.options.seed);
        let mut stall = 0;
        for _ in 0..MAX_SHUFFLES {
            if stall >= STALL_LIMIT {
                break;
            }
            let mut order: Vec<usize> = (0..n).collect();
            rng.shuffle(&mut order);
            let mut improved = false;
            for mode in EVAL_MODES {
                if let Some((_, better)) = search.run(&order, mode, 1) {
                    improved |= better;
                }
            }
            if search.done() {
                break;
            }
            stall = if improved { 0 } else { stall + 1 };
        }
    }

    let best = search.best.map(|b| b.0);
    finish(&ctx, best)
}

struct Search<'s, 'a> {
    ctx: &'s Ctx<'a>,
    control: &'s mut dyn Control,
    budget: f64,
    best: Option<(search::Pass, search::Score)>,
    passes: u32,
    stopped: bool,
}

impl Search<'_, '_> {
    /// Out of time, or the host asked to stop. The first pass always runs.
    fn done(&self) -> bool {
        self.best.is_some() && (self.stopped || self.control.elapsed_ms() >= self.budget)
    }

    /// Runs one pass unless the search is done; returns its score and whether it is the new best.
    fn run(&mut self, order: &[usize], mode: EvalMode, pilot: usize) -> Option<(search::Score, bool)> {
        if self.done() {
            return None;
        }
        let pass = {
            let control = &*self.control;
            let budget = self.budget;
            let out_of_time = || control.elapsed_ms() >= budget;
            search::run_pass(self.ctx, order, mode, pilot, &out_of_time)
        };
        self.passes += 1;
        let score = search::score(self.ctx, &pass);
        let better = self.best.as_ref().is_none_or(|b| score.cmp(&b.1).is_lt());
        if better {
            self.best = Some((pass, score.clone()));
        }
        let best = &self.best.as_ref().expect("a pass ran").0;
        let progress = Progress {
            passes: self.passes,
            best_sheets: best.sheets.len() as u32,
            best_unplaced: best.remaining.iter().sum(),
            elapsed_ms: self.control.elapsed_ms(),
        };
        if !self.control.progress(&progress) {
            self.stopped = true;
        }
        Some((score, better))
    }
}

/// Merges identical consecutive sheets and adds up the totals.
fn finish(ctx: &Ctx<'_>, pass: Option<search::Pass>) -> Plan {
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

    let mut sheets: Vec<SheetLayout> = Vec::new();
    let mut totals = Totals::default();
    for sheet in pass.map(|p| p.sheets).unwrap_or_default() {
        let built = sheet.built;
        let l = &built.layout;
        totals.sheets += 1;
        if ctx.stocks[sheet.stock].tier == 0 {
            totals.offcuts_used += 1;
        }
        totals.sheet_area += l.width * l.length;
        totals.used_area += built.used_area;
        totals.cuts += l.cuts.len() as u32;
        totals.cut_length += l.cuts.iter().map(|c| c.length).sum::<f64>();
        totals.edge_band_length += built.edge_length;

        match sheets.last_mut() {
            Some(prev) if same_layout(prev, l) => prev.qty += 1,
            _ => sheets.push(built.layout),
        }
    }
    totals.waste_area = totals.sheet_area - totals.used_area;

    Plan {
        sheets,
        unplaced,
        totals,
    }
}

fn same_layout(a: &SheetLayout, b: &SheetLayout) -> bool {
    a.stock_id == b.stock_id
        && a.placements.len() == b.placements.len()
        && a.placements
            .iter()
            .zip(&b.placements)
            .all(|(p, q)| p.part_id == q.part_id && p.rect == q.rect)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn skrinky() -> Job {
        let part = |id: &str, length: f64, width: f64, qty: u32, label: &str| PartSpec {
            id: id.into(),
            length,
            width,
            qty,
            label: label.into(),
            grain: Grain::None,
            material: None,
            edges: Edges {
                top: true,
                bottom: true,
                left: true,
                right: true,
            },
        };
        Job {
            parts: vec![
                part("sides", 1000.0, 300.0, 2, "Sides"),
                part("shelves", 764.0, 300.0, 10, "Shelves and T/B"),
                part("stretchers", 764.0, 80.0, 2, "Stretchers"),
            ],
            stock: vec![StockSpec {
                id: "dtd".into(),
                length: 2800.0,
                width: 2070.0,
                qty: None,
                priority: true,
                offcut: false,
                material: None,
                label: "DTD Black 18mm".into(),
                grain: Grain::Length,
            }],
            kerf: 4.0,
            trim: 0.0,
            options: Options::default(),
        }
    }

    #[test]
    fn job_round_trips_through_json_in_camel_case() {
        let job = skrinky();
        let json = serde_json::to_string(&job).unwrap();
        assert!(json.contains("\"timeBudgetMs\""));
        let back: Job = serde_json::from_str(&json).unwrap();
        assert_eq!(job, back);
    }

    #[test]
    fn minimal_json_uses_defaults() {
        let job: Job = serde_json::from_str(
            r#"{"parts":[{"id":"a","length":500,"width":300,"qty":1}],
                "stock":[{"id":"s","length":2800,"width":2070}],"kerf":4}"#,
        )
        .unwrap();
        assert_eq!(job.parts[0].grain, Grain::None);
        assert_eq!(job.stock[0].qty, None);
        assert_eq!(job.trim, 0.0);
    }

    #[test]
    fn skrinky_fits_one_sheet_like_the_js_engine() {
        let plan = optimize(&skrinky());
        assert!(plan.unplaced.is_empty());
        assert_eq!(plan.totals.sheets, 1);
        assert_eq!(plan.sheets[0].placements.len(), 14);
        // The improved JS engine: 17 cuts, 16,386 mm of cutting.
        assert!(plan.totals.cuts <= 17, "cuts {}", plan.totals.cuts);
        assert!(
            plan.totals.cut_length <= 16_386.5,
            "cut length {}",
            plan.totals.cut_length
        );
    }

    #[test]
    fn oversized_and_unmatched_parts_are_reported() {
        let mut job = skrinky();
        job.parts.push(PartSpec {
            id: "huge".into(),
            length: 3000.0,
            width: 300.0,
            qty: 1,
            label: String::new(),
            grain: Grain::None,
            material: None,
            edges: Edges::default(),
        });
        job.parts.push(PartSpec {
            id: "oak".into(),
            length: 500.0,
            width: 300.0,
            qty: 2,
            label: String::new(),
            grain: Grain::None,
            material: Some("oak".into()),
            edges: Edges::default(),
        });
        job.stock[0].material = Some("dtd".into());
        let plan = optimize(&job);
        let mut unplaced: Vec<_> = plan
            .unplaced
            .iter()
            .map(|u| (u.part_id.as_str(), u.count))
            .collect();
        unplaced.sort();
        assert_eq!(unplaced, [("huge", 1), ("oak", 2)]);
    }

    #[test]
    fn offcuts_are_used_first_and_count_as_free() {
        let mut job = skrinky();
        job.parts = vec![PartSpec {
            id: "small".into(),
            length: 400.0,
            width: 300.0,
            qty: 2,
            label: String::new(),
            grain: Grain::None,
            material: None,
            edges: Edges::default(),
        }];
        job.stock.push(StockSpec {
            id: "off-1".into(),
            length: 900.0,
            width: 320.0,
            qty: Some(1),
            priority: false,
            offcut: true,
            material: None,
            label: "Offcut".into(),
            grain: Grain::Length,
        });
        let plan = optimize(&job);
        assert!(plan.unplaced.is_empty());
        assert_eq!(plan.totals.sheets, 1);
        assert_eq!(plan.totals.offcuts_used, 1);
        assert_eq!(plan.sheets[0].stock_id, "off-1");
    }

    #[test]
    fn offcuts_are_not_edge_trimmed() {
        let mut job = skrinky();
        job.trim = 10.0;
        job.parts = vec![PartSpec {
            id: "fits".into(),
            length: 900.0,
            width: 320.0,
            qty: 1,
            label: String::new(),
            grain: Grain::None,
            material: None,
            edges: Edges::default(),
        }];
        // Exactly the part's size: only usable because offcuts skip the trim.
        job.stock.push(StockSpec {
            id: "off".into(),
            length: 900.0,
            width: 320.0,
            qty: Some(1),
            priority: false,
            offcut: true,
            material: None,
            label: String::new(),
            grain: Grain::Length,
        });
        let plan = optimize(&job);
        assert_eq!(plan.sheets[0].stock_id, "off");
        assert!(plan.sheets[0].cuts.is_empty(), "no trim cuts on an offcut");
        assert_eq!(plan.sheets[0].placements[0].rect.x, 0.0);
    }

    #[test]
    fn identical_sheets_are_merged() {
        let mut job = skrinky();
        job.parts = vec![PartSpec {
            id: "panel".into(),
            length: 1380.0,
            width: 1030.0,
            qty: 8,
            label: String::new(),
            grain: Grain::Length,
            material: None,
            edges: Edges::default(),
        }];
        let plan = optimize(&job);
        assert!(plan.unplaced.is_empty());
        assert_eq!(plan.totals.sheets, 2);
        assert_eq!(plan.sheets.len(), 1);
        assert_eq!(plan.sheets[0].qty, 2);
    }

    /// One 600 × 300 part on a 1000 × 700 sheet: how it lies for each sheet grain.
    fn grain_job(part_grain: Grain, sheet_grain: Grain) -> Job {
        let mut job = skrinky();
        job.parts = vec![PartSpec {
            id: "door".into(),
            length: 600.0,
            width: 300.0,
            qty: 1,
            label: String::new(),
            grain: part_grain,
            material: None,
            edges: Edges::default(),
        }];
        job.stock[0].length = 1000.0;
        job.stock[0].width = 700.0;
        job.stock[0].grain = sheet_grain;
        job
    }

    /// Whether the placed part's length runs along the sheet's length.
    fn length_along_sheet_length(plan: &Plan) -> bool {
        let r = plan.sheets[0].placements[0].rect;
        (r.h - 600.0).abs() < 1e-6 && (r.w - 300.0).abs() < 1e-6
    }

    #[test]
    fn part_grain_follows_the_sheet_grain() {
        // Sheet grain along its length: a "length" part lies along the sheet's length.
        assert!(length_along_sheet_length(&optimize(&grain_job(
            Grain::Length,
            Grain::Length
        ))));
        assert!(!length_along_sheet_length(&optimize(&grain_job(
            Grain::Width,
            Grain::Length
        ))));
        // Sheet grain along its width: the same parts turn a quarter.
        assert!(!length_along_sheet_length(&optimize(&grain_job(
            Grain::Length,
            Grain::Width
        ))));
        assert!(length_along_sheet_length(&optimize(&grain_job(
            Grain::Width,
            Grain::Width
        ))));
    }

    #[test]
    fn a_sheet_without_grain_lets_parts_rotate() {
        // 600 × 300 fits a 650 × 320 sheet only with its length across the sheet's width.
        let mut job = grain_job(Grain::Length, Grain::None);
        job.stock[0].length = 320.0;
        job.stock[0].width = 650.0;
        let plan = optimize(&job);
        assert!(plan.unplaced.is_empty());
        assert!(!length_along_sheet_length(&plan));
        // With grain along the sheet's length, the same part doesn't fit.
        job.stock[0].grain = Grain::Length;
        assert_eq!(optimize(&job).unplaced.len(), 1);
    }

    #[test]
    fn sheet_grain_defaults_to_length_in_json() {
        let stock: StockSpec = serde_json::from_str(r#"{"id":"s","length":2800,"width":2070}"#).unwrap();
        assert_eq!(stock.grain, Grain::Length);
        let stock: StockSpec =
            serde_json::from_str(r#"{"id":"s","length":2800,"width":2070,"grain":"none"}"#).unwrap();
        assert_eq!(stock.grain, Grain::None);
    }

    #[test]
    fn trim_shrinks_the_usable_area() {
        let mut job = skrinky();
        job.trim = 10.0;
        let plan = optimize(&job);
        let first = &plan.sheets[0];
        assert_eq!(first.cuts[0].stage, 0);
        for p in &first.placements {
            assert!(p.rect.x >= 10.0 && p.rect.y >= 10.0);
            assert!(p.rect.x + p.rect.w <= first.width - 10.0);
            assert!(p.rect.y + p.rect.h <= first.length - 10.0);
        }
    }
}
