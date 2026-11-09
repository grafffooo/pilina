//! Property tests: every plan for a random job must be physically cuttable and complete.

use pilina_core::*;
use proptest::prelude::*;

const EPS: f64 = 0.011; // coordinates are rounded to 0.01 mm

fn material() -> impl Strategy<Value = Option<String>> {
    prop_oneof![
        3 => Just(None),
        1 => Just(Some("oak".to_string())),
        1 => Just(Some("dtd".to_string())),
    ]
}

fn grain() -> impl Strategy<Value = Grain> {
    prop_oneof![3 => Just(Grain::None), 1 => Just(Grain::Length), 1 => Just(Grain::Width)]
}

fn part(i: usize) -> impl Strategy<Value = PartSpec> {
    (
        50u32..2200,
        30u32..1100,
        0u32..7,
        grain(),
        material(),
        any::<[bool; 4]>(),
        prop::bool::weighted(0.2),
    )
        .prop_map(move |(length, width, qty, grain, material, e, half)| PartSpec {
            id: format!("p{i}"),
            // Some sizes with a fractional part, like 18.5 mm.
            length: f64::from(length) + if half { 0.5 } else { 0.0 },
            width: f64::from(width),
            qty,
            label: String::new(),
            grain,
            material,
            edges: Edges {
                top: e[0],
                bottom: e[1],
                left: e[2],
                right: e[3],
            },
        })
}

fn stock(i: usize) -> impl Strategy<Value = StockSpec> {
    (
        400u32..2900,
        300u32..2100,
        prop::option::weighted(0.5, 1u32..4),
        any::<bool>(),
        prop::bool::weighted(0.25),
        material(),
    )
        .prop_map(
            move |(length, width, qty, priority, offcut, material)| StockSpec {
                id: format!("s{i}"),
                length: f64::from(length),
                width: f64::from(width),
                qty,
                priority,
                offcut,
                material,
                label: String::new(),
            },
        )
}

fn job() -> impl Strategy<Value = Job> {
    (
        prop::collection::vec(0usize..1, 1..12),
        prop::collection::vec(0usize..1, 1..4),
        prop_oneof![Just(0.0), Just(3.2), Just(4.0), 0.0f64..6.0],
        prop_oneof![2 => Just(0.0), 1 => 1.0f64..15.0],
    )
        .prop_flat_map(|(parts, stocks, kerf, trim)| {
            let parts: Vec<_> = (0..parts.len()).map(part).collect();
            let stocks: Vec<_> = (0..stocks.len()).map(stock).collect();
            (parts, stocks, Just(kerf), Just(trim))
        })
        .prop_map(|(parts, stock, kerf, trim)| Job {
            parts,
            stock,
            kerf,
            trim,
            options: Options {
                time_budget_ms: 40,
                seed: 7,
            },
        })
}

fn overlaps_1d(a0: f64, a1: f64, b0: f64, b1: f64) -> bool {
    a0 < b1 - EPS && b0 < a1 - EPS
}

/// Every rule a plan must obey; returns the first violation.
fn check(job: &Job, plan: &Plan) -> Result<(), String> {
    let part = |id: &str| job.parts.iter().find(|p| p.id == id).unwrap();
    let mut placed = std::collections::HashMap::<&str, u32>::new();

    for (si, sheet) in plan.sheets.iter().enumerate() {
        let stock = job
            .stock
            .iter()
            .find(|s| s.id == sheet.stock_id)
            .ok_or("unknown stock")?;
        // Library offcuts already have sawn edges and aren't trimmed.
        let t = if stock.offcut { 0.0 } else { job.trim };
        let (w, l) = (sheet.width, sheet.length);
        if sheet.qty == 0 {
            return Err(format!("sheet {si} has qty 0"));
        }

        for p in &sheet.placements {
            let spec = part(&p.part_id);
            let r = p.rect;
            *placed.entry(spec.id.as_str()).or_default() += sheet.qty;

            if r.x < t - EPS || r.y < t - EPS || r.x + r.w > w - t + EPS || r.y + r.h > l - t + EPS {
                return Err(format!(
                    "sheet {si}: {} outside the trimmed sheet: {r:?}",
                    p.part_id
                ));
            }
            // Size matches the part; `h` runs along the stock length.
            let along = (r.w - spec.width).abs() < EPS && (r.h - spec.length).abs() < EPS;
            let across = (r.w - spec.length).abs() < EPS && (r.h - spec.width).abs() < EPS;
            if !along && !across {
                return Err(format!("sheet {si}: {} has the wrong size {r:?}", p.part_id));
            }
            match spec.grain {
                Grain::Length if !along => return Err(format!("{} breaks length grain", p.part_id)),
                Grain::Width if !across => return Err(format!("{} breaks width grain", p.part_id)),
                _ => {}
            }
            if p.rotated == along && spec.length != spec.width {
                return Err(format!("{} has the wrong rotated flag", p.part_id));
            }
            if let (Some(a), Some(b)) = (&spec.material, &stock.material)
                && a != b
            {
                return Err(format!("{} ({a}) placed on {b}", p.part_id));
            }
        }

        // Parts never overlap and keep at least one kerf apart.
        let ps = &sheet.placements;
        for i in 0..ps.len() {
            for j in i + 1..ps.len() {
                let (a, b) = (ps[i].rect, ps[j].rect);
                let k = job.kerf;
                let x_apart = a.x + a.w + k <= b.x + EPS || b.x + b.w + k <= a.x + EPS;
                let y_apart = a.y + a.h + k <= b.y + EPS || b.y + b.h + k <= a.y + EPS;
                if !x_apart && !y_apart {
                    return Err(format!(
                        "sheet {si}: {} and {} too close: {a:?} {b:?}",
                        ps[i].part_id, ps[j].part_id
                    ));
                }
            }
        }

        // Cuts are numbered in order, stay on the sheet and never run through a part.
        for (ci, c) in sheet.cuts.iter().enumerate() {
            if c.number as usize != ci + 1 {
                return Err(format!("sheet {si}: cut {ci} numbered {}", c.number));
            }
            if c.x1.min(c.x2) < -EPS
                || c.x1.max(c.x2) > w + EPS
                || c.y1.min(c.y2) < -EPS
                || c.y1.max(c.y2) > l + EPS
            {
                return Err(format!("sheet {si}: cut {} leaves the sheet: {c:?}", c.number));
            }
            for p in ps {
                let r = p.rect;
                let hits = match c.axis {
                    Axis::X => {
                        c.pos > r.x + EPS
                            && c.pos < r.x + r.w - EPS
                            && overlaps_1d(c.y1, c.y2, r.y, r.y + r.h)
                    }
                    Axis::Y => {
                        c.pos > r.y + EPS
                            && c.pos < r.y + r.h - EPS
                            && overlaps_1d(c.x1, c.x2, r.x, r.x + r.w)
                    }
                };
                if hits {
                    return Err(format!(
                        "sheet {si}: cut {} runs through {}: {c:?} {r:?}",
                        c.number, p.part_id
                    ));
                }
            }
        }

        // Leftovers sit inside the sheet and don't overlap parts.
        for r in &sheet.waste {
            if r.w <= 0.0 || r.h <= 0.0 {
                return Err(format!("sheet {si}: empty leftover {r:?}"));
            }
            for p in ps {
                let q = p.rect;
                if overlaps_1d(r.x, r.x + r.w, q.x, q.x + q.w) && overlaps_1d(r.y, r.y + r.h, q.y, q.y + q.h)
                {
                    return Err(format!("sheet {si}: leftover {r:?} overlaps {}", p.part_id));
                }
            }
        }
    }

    // Stock quantities are respected.
    for s in &job.stock {
        let used: u32 = plan
            .sheets
            .iter()
            .filter(|l| l.stock_id == s.id)
            .map(|l| l.qty)
            .sum();
        if let Some(q) = s.qty
            && used > q
        {
            return Err(format!("stock {} used {used} times, only {q} available", s.id));
        }
    }

    // Every valid part is either placed or reported, exactly as many times as ordered.
    for p in job.parts.iter().filter(|p| p.qty > 0) {
        let got = placed.get(p.id.as_str()).copied().unwrap_or(0);
        let missing = plan
            .unplaced
            .iter()
            .filter(|u| u.part_id == p.id)
            .map(|u| u.count)
            .sum::<u32>();
        if got + missing != p.qty {
            return Err(format!(
                "{}: {got} placed + {missing} unplaced != {}",
                p.id, p.qty
            ));
        }
    }

    let t = &plan.totals;
    let sheets: u32 = plan.sheets.iter().map(|l| l.qty).sum();
    if t.sheets != sheets || t.used_area > t.sheet_area + EPS {
        return Err(format!("totals don't add up: {t:?}"));
    }
    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 256, ..ProptestConfig::default() })]

    #[test]
    fn every_plan_is_cuttable_and_complete(job in job()) {
        let plan = optimize(&job);
        if let Err(e) = check(&job, &plan) {
            prop_assert!(false, "{e}\njob: {}", serde_json::to_string(&job).unwrap());
        }
    }

    #[test]
    fn same_seed_gives_the_same_plan(job in job()) {
        // Without a deadline the search is fully deterministic.
        let a = optimize_with(&job, &mut NoClock);
        let b = optimize_with(&job, &mut NoClock);
        prop_assert_eq!(a, b);
    }
}

/// Jobs that once broke a rule, kept as fixed regression cases.
#[test]
fn past_failures_stay_fixed() {
    let cases = [
        // Less than a kerf left below the last row: the cut was drawn past the sheet edge.
        r#"{"parts":[{"id":"p0","length":747.0,"width":30.0,"qty":2}],
            "stock":[{"id":"s0","length":1193.0,"width":1552.0},{"id":"s1","length":1498.0,"width":300.0}],
            "kerf":3.2}"#,
        // A leftover 0.004 mm wide rounded to zero width.
        r#"{"parts":[{"id":"p0","length":50.0,"width":495.0,"qty":2}],
            "stock":[{"id":"s0","length":400.0,"width":1026.0}],
            "kerf":4.0,"trim":13.998163159042253}"#,
    ];
    for json in cases {
        let job: Job = serde_json::from_str(json).unwrap();
        let plan = optimize(&job);
        check(&job, &plan).unwrap();
    }
}
