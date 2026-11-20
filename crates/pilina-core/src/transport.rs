//! Transport pre-cut breakdown: partitions oversized stock sheets and linear bars
//! into sub-pieces that fit inside a user's vehicle, recording the store breakdown cuts.

use std::collections::HashSet;

use crate::linear::{LinearJob, LinearPlan, LinearStockSpec, LinearTransportLimit, PreCutBar};
use crate::model::{
    Axis, Job, Plan, PreCutCut, PreCutPiece, PreCutSheet, StockSpec, TransportLimit,
};

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

pub fn fits_2d(length: f64, width: f64, limit: TransportLimit) -> bool {
    let max_l = limit.max_length.max(limit.max_width);
    let max_w = limit.max_length.min(limit.max_width);
    let l = length.max(width);
    let w = length.min(width);
    l <= max_l + 1e-6 && w <= max_w + 1e-6
}

fn split_axis(total: f64, limit: f64, kerf: f64) -> Vec<f64> {
    if total <= limit + 1e-6 || limit <= kerf {
        return vec![round2(total)];
    }
    let n = ((total + kerf) / (limit + kerf)).ceil().max(2.0) as usize;
    let piece = round2(((total - (n as f64 - 1.0) * kerf) / n as f64).max(1.0));
    vec![piece; n]
}

/// Breaks down any oversized non-offcut 2D stock sheets into sub-sheets fitting `limit`.
pub fn apply_2d_transport(job: &Job) -> (Job, Vec<PreCutSheet>) {
    let Some(limit) = job.transport else {
        return (job.clone(), Vec::new());
    };
    if limit.max_length <= 0.0 || limit.max_width <= 0.0 {
        return (job.clone(), Vec::new());
    }
    let kerf = limit.store_kerf.max(0.0);
    let mut new_stock = Vec::with_capacity(job.stock.len());
    let mut pre_cuts = Vec::new();

    for s in &job.stock {
        if s.offcut || fits_2d(s.length, s.width, limit) {
            new_stock.push(s.clone());
            continue;
        }
        // Try both orientations of the cargo box against (s.length, s.width).
        let ys_a = split_axis(s.length, limit.max_length, kerf);
        let xs_a = split_axis(s.width, limit.max_width, kerf);
        let cuts_a = (ys_a.len() - 1) + ys_a.len() * (xs_a.len() - 1);

        let ys_b = split_axis(s.length, limit.max_width, kerf);
        let xs_b = split_axis(s.width, limit.max_length, kerf);
        let cuts_b = (ys_b.len() - 1) + ys_b.len() * (xs_b.len() - 1);

        let (ys, xs) = if cuts_b < cuts_a {
            (ys_b, xs_b)
        } else {
            (ys_a, xs_a)
        };

        let mut cuts = Vec::new();
        let mut y_acc = 0.0;
        for (yi, &plen) in ys.iter().enumerate() {
            if yi + 1 < ys.len() {
                let cut_y = round2(y_acc + plen + kerf / 2.0);
                cuts.push(PreCutCut {
                    axis: Axis::Y,
                    pos: cut_y,
                    x1: 0.0,
                    y1: cut_y,
                    x2: s.width,
                    y2: cut_y,
                });
            }
            y_acc += plen + kerf;
        }
        let mut x_acc = 0.0;
        for (xi, &pwid) in xs.iter().enumerate() {
            if xi + 1 < xs.len() {
                let cut_x = round2(x_acc + pwid + kerf / 2.0);
                cuts.push(PreCutCut {
                    axis: Axis::X,
                    pos: cut_x,
                    x1: cut_x,
                    y1: 0.0,
                    x2: cut_x,
                    y2: s.length,
                });
            }
            x_acc += pwid + kerf;
        }

        let mut pieces = Vec::new();
        let mut y_pos = 0.0;
        let mut idx = 0usize;
        for &plen in &ys {
            let mut x_pos = 0.0;
            for &pwid in &xs {
                idx += 1;
                let pid = format!("precut:{}:{}", s.id, idx);
                pieces.push(PreCutPiece {
                    stock_id: pid.clone(),
                    length: plen,
                    width: pwid,
                    x: round2(x_pos),
                    y: round2(y_pos),
                });
                new_stock.push(StockSpec {
                    id: pid,
                    length: plen,
                    width: pwid,
                    qty: s.qty,
                    priority: s.priority,
                    offcut: false,
                    material: s.material.clone(),
                    label: s.label.clone(),
                    grain: s.grain,
                });
                x_pos += pwid + kerf;
            }
            y_pos += plen + kerf;
        }

        pre_cuts.push(PreCutSheet {
            source_stock_id: s.id.clone(),
            label: s.label.clone(),
            material: s.material.clone(),
            length: s.length,
            width: s.width,
            store_kerf: kerf,
            cuts,
            pieces,
        });
    }

    let mut out = job.clone();
    out.stock = new_stock;
    (out, pre_cuts)
}

pub fn filter_used_pre_cuts_2d(plan: &mut Plan, candidates: Vec<PreCutSheet>) {
    if candidates.is_empty() {
        return;
    }
    let used: HashSet<&str> = plan.sheets.iter().map(|s| s.stock_id.as_str()).collect();
    plan.pre_cuts = candidates
        .into_iter()
        .filter(|pc| pc.pieces.iter().any(|p| used.contains(p.stock_id.as_str())))
        .collect();
}

/// Breaks down any oversized non-offcut 1D bars into sub-bars fitting `limit`.
pub fn apply_1d_transport(job: &LinearJob) -> (LinearJob, Vec<PreCutBar>) {
    let Some(limit): Option<LinearTransportLimit> = job.transport else {
        return (job.clone(), Vec::new());
    };
    if limit.max_length <= 0.0 {
        return (job.clone(), Vec::new());
    }
    let kerf = limit.store_kerf.max(0.0);
    let mut new_stock = Vec::with_capacity(job.stock.len());
    let mut pre_cuts = Vec::new();

    for s in &job.stock {
        if s.offcut || s.length <= limit.max_length + 1e-6 {
            new_stock.push(s.clone());
            continue;
        }
        let lengths = split_axis(s.length, limit.max_length, kerf);
        let mut cut_positions = Vec::new();
        let mut pos = 0.0;
        for (i, &len) in lengths.iter().enumerate() {
            let pid = format!("precut:{}:{}", s.id, i + 1);
            new_stock.push(LinearStockSpec {
                id: pid,
                length: len,
                qty: s.qty,
                priority: s.priority,
                offcut: false,
                material: s.material.clone(),
                label: s.label.clone(),
            });
            if i + 1 < lengths.len() {
                cut_positions.push(round2(pos + len + kerf / 2.0));
            }
            pos += len + kerf;
        }
        pre_cuts.push(PreCutBar {
            source_stock_id: s.id.clone(),
            label: s.label.clone(),
            material: s.material.clone(),
            length: s.length,
            store_kerf: kerf,
            cut_positions,
            piece_lengths: lengths,
        });
    }

    let mut out = job.clone();
    out.stock = new_stock;
    (out, pre_cuts)
}

pub fn filter_used_pre_cuts_1d(plan: &mut LinearPlan, candidates: Vec<PreCutBar>) {
    if candidates.is_empty() {
        return;
    }
    let used: HashSet<&str> = plan.bars.iter().map(|b| b.stock_id.as_str()).collect();
    plan.pre_cuts = candidates
        .into_iter()
        .filter(|pc| {
            (1..=pc.piece_lengths.len())
                .any(|i| used.contains(format!("precut:{}:{}", pc.source_stock_id, i).as_str()))
        })
        .collect();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Edges, Grain, Options, PartSpec};

    #[test]
    fn splits_oversized_2d_sheet_for_car_trunk() {
        let job = Job {
            parts: vec![PartSpec {
                id: "p1".into(),
                length: 600.0,
                width: 400.0,
                qty: 2,
                label: "Shelf".into(),
                grain: Grain::None,
                material: Some("m1".into()),
                edges: Edges::default(),
            }],
            stock: vec![StockSpec {
                id: "s1".into(),
                length: 2800.0,
                width: 2070.0,
                qty: None,
                priority: true,
                offcut: false,
                material: Some("m1".into()),
                label: "Birch".into(),
                grain: Grain::Length,
            }],
            kerf: 4.0,
            trim: 0.0,
            options: Options::default(),
            transport: Some(TransportLimit {
                max_length: 1000.0,
                max_width: 900.0,
                store_kerf: 4.5,
            }),
        };
        let (split_job, pre_cuts) = apply_2d_transport(&job);
        assert_eq!(pre_cuts.len(), 1);
        assert!(split_job.stock.iter().all(|s| fits_2d(s.length, s.width, job.transport.unwrap())));
        assert!(!pre_cuts[0].cuts.is_empty());
    }
}
