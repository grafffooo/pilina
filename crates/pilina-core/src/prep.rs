//! Turns a `Job` into the optimizer's working form: valid part groups and sorted stock.

use crate::model::{Grain, Job, PartSpec, StockSpec};

/// A part orientation in a packing frame: `w` runs along the frame's x axis, `h` along its y axis.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Orient {
    pub w: f64,
    pub h: f64,
    pub rotated: bool,
}

impl Orient {
    pub fn area(&self) -> f64 {
        self.w * self.h
    }

    pub fn transposed(self) -> Self {
        Self {
            w: self.h,
            h: self.w,
            rotated: self.rotated,
        }
    }
}

/// One part row of the job (all its copies are interchangeable).
pub(crate) struct Group<'a> {
    pub spec: &'a PartSpec,
    pub qty: u32,
    pub area: f64,
    pub edge_length: f64,
}

/// One stock row, with how many sheets are left (`u32::MAX` = unlimited).
pub(crate) struct Stock<'a> {
    pub spec: &'a StockSpec,
    pub qty: u32,
    /// 0 = library offcut, 1 = priority stock, 2 = other stock. Lower tiers are used first.
    pub tier: u8,
}

fn valid_size(length: f64, width: f64) -> bool {
    length.is_finite() && width.is_finite() && length > 0.0 && width > 0.0
}

/// Parts with a quantity and a positive size. Anything else is ignored (it isn't "unplaced").
pub(crate) fn groups(job: &Job) -> Vec<Group<'_>> {
    job.parts
        .iter()
        .filter(|p| p.qty > 0 && valid_size(p.length, p.width))
        .map(|p| {
            let e = p.edges;
            let edge_length = (u8::from(e.top) + u8::from(e.bottom)) as f64 * p.length
                + (u8::from(e.left) + u8::from(e.right)) as f64 * p.width;
            Group {
                spec: p,
                qty: p.qty,
                area: p.length * p.width,
                edge_length,
            }
        })
        .collect()
}

/// Usable stock, sorted by tier (offcuts, then priority, then the rest), then largest first.
pub(crate) fn stocks(job: &Job) -> Vec<Stock<'_>> {
    let mut list: Vec<Stock<'_>> = job
        .stock
        .iter()
        .filter(|s| valid_size(s.length, s.width) && s.qty != Some(0))
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
    list.sort_by(|a, b| {
        a.tier
            .cmp(&b.tier)
            .then((b.spec.length * b.spec.width).total_cmp(&(a.spec.length * a.spec.width)))
    });
    list
}

/// A part may go on a stock unless both name a material and the names differ.
pub(crate) fn compatible(part: &PartSpec, stock: &StockSpec) -> bool {
    match (&part.material, &stock.material) {
        (Some(a), Some(b)) => a == b,
        _ => true,
    }
}

/// Orientations of a part that fit a `usable_w` × `usable_h` area in the real sheet frame
/// (`w` along the stock width, `h` along the stock length), on a sheet whose grain runs
/// `sheet_grain`.
pub(crate) fn orientations(part: &PartSpec, sheet_grain: Grain, usable_w: f64, usable_h: f64) -> Vec<Orient> {
    let along = Orient {
        w: part.width,
        h: part.length,
        rotated: false,
    };
    let across = Orient {
        w: part.length,
        h: part.width,
        rotated: true,
    };
    let fits = |o: &Orient| o.w <= usable_w && o.h <= usable_h;
    // Which of the part's sides has to run along the sheet's length. A sheet without grain
    // (or a part without one) leaves both ways open.
    let part_length_along_sheet_length = match (part.grain, sheet_grain) {
        (Grain::None, _) | (_, Grain::None) => None,
        (Grain::Length, Grain::Length) | (Grain::Width, Grain::Width) => Some(true),
        (Grain::Length, Grain::Width) | (Grain::Width, Grain::Length) => Some(false),
    };
    let candidates: &[Orient] = match part_length_along_sheet_length {
        Some(true) => &[along],
        Some(false) => &[across],
        None if part.length == part.width => &[along],
        None => &[along, across],
    };
    candidates.iter().copied().filter(fits).collect()
}
