//! Turns packed strips into real sheet geometry: placements, numbered cuts and leftovers.

use crate::model::{Axis, Cut, Placement, Rect, SheetLayout, StockSpec};
use crate::pack::Strip;
use crate::prep::Group;

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// A cut in frame coordinates, before mapping onto the sheet.
struct FrameCut {
    axis: Axis,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    length: f64,
    stage: u8,
}

#[derive(Clone)]
pub(crate) struct Built {
    pub layout: SheetLayout,
    pub used_area: f64,
    pub edge_length: f64,
}

/// `frame_groups[i]` is the job group behind frame group `i`; `next_instance` counts the
/// copies of each job group placed so far. `transposed` means the frame's x axis runs
/// along the stock length.
#[allow(clippy::too_many_arguments)]
pub(crate) fn build(
    stock: &StockSpec,
    strips: &[Strip],
    groups: &[Group<'_>],
    frame_groups: &[usize],
    next_instance: &mut [u32],
    kerf: f64,
    trim: f64,
    transposed: bool,
) -> Built {
    let sheet_w = stock.width;
    let sheet_h = stock.length;
    let usable_w = sheet_w - 2.0 * trim;
    let usable_h = sheet_h - 2.0 * trim;
    let (fw, fh) = if transposed {
        (usable_h, usable_w)
    } else {
        (usable_w, usable_h)
    };
    let half = kerf / 2.0;

    let mut parts: Vec<(usize, Rect)> = Vec::new();
    let mut waste: Vec<Rect> = Vec::new();
    let mut cuts: Vec<FrameCut> = Vec::new();

    // Cut centre half a kerf past `edge`, or the middle of a sliver thinner than a kerf.
    let cut_pos = |edge: f64, limit: f64| round2(edge + half.min((limit - edge) / 2.0));

    let mut cur_x = 0.0;
    let mut prev_rip = 0.0;
    for (s_idx, strip) in strips.iter().enumerate() {
        let strip_x = cur_x;
        let strip_w = strip.col_w;
        let prev_cut_x = if s_idx == 0 { 0.0 } else { prev_rip };
        let right_has_cut = strip_x + strip_w < fw;
        let next_cut_x = if right_has_cut {
            cut_pos(strip_x + strip_w, fw)
        } else {
            fw
        };
        prev_rip = next_cut_x;
        if right_has_cut {
            let cx = next_cut_x;
            cuts.push(FrameCut {
                axis: Axis::X,
                x1: cx,
                y1: 0.0,
                x2: cx,
                y2: fh,
                length: fh,
                stage: 1,
            });
        }

        let mut cur_y = 0.0;
        let mut prev_row_cut = 0.0;
        for (r_idx, row) in strip.rows.iter().enumerate() {
            let row_y = cur_y;
            let bottom_has_cut = row_y + row.h < fh;
            let row_bottom = if bottom_has_cut {
                cut_pos(row_y + row.h, fh)
            } else {
                fh
            };
            let row_top = if r_idx == 0 { 0.0 } else { prev_row_cut };
            prev_row_cut = row_bottom;
            if bottom_has_cut {
                cuts.push(FrameCut {
                    axis: Axis::Y,
                    x1: prev_cut_x,
                    y1: row_bottom,
                    x2: next_cut_x,
                    y2: row_bottom,
                    length: round2(next_cut_x - prev_cut_x),
                    stage: 2,
                });
            }

            let mut px = strip_x;
            let mut prev_part_cut = strip_x;
            for (p_idx, rp) in row.parts.iter().enumerate() {
                let part_right_has_cut = px + rp.o.w < strip_x + strip_w;
                let seg_left = if p_idx == 0 { prev_cut_x } else { prev_part_cut };
                let seg_right = if part_right_has_cut {
                    cut_pos(px + rp.o.w, strip_x + strip_w)
                } else {
                    next_cut_x
                };
                if part_right_has_cut {
                    cuts.push(FrameCut {
                        axis: Axis::X,
                        x1: seg_right,
                        y1: row_top,
                        x2: seg_right,
                        y2: row_bottom,
                        length: round2(row_bottom - row_top),
                        stage: 3,
                    });
                }
                prev_part_cut = seg_right;
                if rp.o.h < row.h {
                    let ty = cut_pos(row_y + rp.o.h, row_y + row.h);
                    cuts.push(FrameCut {
                        axis: Axis::Y,
                        x1: seg_left,
                        y1: ty,
                        x2: seg_right,
                        y2: ty,
                        length: round2(seg_right - seg_left),
                        stage: 4,
                    });
                    let wh = row.h - rp.o.h - kerf;
                    if wh > 0.0 {
                        waste.push(Rect {
                            x: px,
                            y: row_y + rp.o.h + kerf,
                            w: rp.o.w,
                            h: wh,
                        });
                    }
                }
                parts.push((
                    frame_groups[rp.g],
                    Rect {
                        x: px,
                        y: row_y,
                        w: rp.o.w,
                        h: rp.o.h,
                    },
                ));
                px += rp.o.w + kerf;
            }
            let row_used = px - kerf - strip_x;
            let rem_row_w = strip_w - row_used - kerf;
            if rem_row_w > 0.0 {
                waste.push(Rect {
                    x: strip_x + row_used + kerf,
                    y: row_y,
                    w: rem_row_w,
                    h: row.h,
                });
            }
            cur_y += row.h + kerf;
        }

        let used_h = strip.total_h;
        let rem_h = fh - used_h - if used_h < fh { kerf } else { 0.0 };
        if rem_h > 0.0 {
            waste.push(Rect {
                x: strip_x,
                y: used_h + kerf,
                w: strip_w,
                h: rem_h,
            });
        }
        cur_x += strip_w + kerf;
    }

    let strips_w: f64 = strips
        .iter()
        .enumerate()
        .map(|(i, s)| s.col_w + if i > 0 { kerf } else { 0.0 })
        .sum();
    let rem_w = fw - strips_w - if strips_w < fw { kerf } else { 0.0 };
    if rem_w > 0.0 {
        waste.push(Rect {
            x: strips_w + kerf,
            y: 0.0,
            w: rem_w,
            h: fh,
        });
    }

    // Frame → sheet: swap axes when transposed, then offset by the trim margin.
    let map_rect = |r: Rect| -> Rect {
        let r = if transposed {
            Rect {
                x: r.y,
                y: r.x,
                w: r.h,
                h: r.w,
            }
        } else {
            r
        };
        Rect {
            x: round2(r.x + trim),
            y: round2(r.y + trim),
            w: round2(r.w),
            h: round2(r.h),
        }
    };

    let mut all_cuts: Vec<Cut> = Vec::with_capacity(cuts.len() + 4);
    let mut push_cut = |axis: Axis, x1: f64, y1: f64, x2: f64, y2: f64, length: f64, stage: u8| {
        let number = all_cuts.len() as u32 + 1;
        all_cuts.push(Cut {
            number,
            stage,
            axis,
            pos: if axis == Axis::X { x1 } else { y1 },
            x1,
            y1,
            x2,
            y2,
            length,
        });
    };

    // Edge trims come first in the sawing order.
    if trim > 0.0 {
        push_cut(Axis::Y, 0.0, trim, sheet_w, trim, sheet_w, 0);
        let bottom = sheet_h - trim;
        push_cut(Axis::Y, 0.0, bottom, sheet_w, bottom, sheet_w, 0);
        push_cut(Axis::X, trim, trim, trim, bottom, usable_h, 0);
        let right = sheet_w - trim;
        push_cut(Axis::X, right, trim, right, bottom, usable_h, 0);
    }
    for c in &cuts {
        let (axis, x1, y1, x2, y2) = if transposed {
            let axis = if c.axis == Axis::X { Axis::Y } else { Axis::X };
            (axis, c.y1, c.x1, c.y2, c.x2)
        } else {
            (c.axis, c.x1, c.y1, c.x2, c.y2)
        };
        push_cut(
            axis,
            round2(x1 + trim),
            round2(y1 + trim),
            round2(x2 + trim),
            round2(y2 + trim),
            c.length,
            c.stage,
        );
    }

    let mut used_area = 0.0;
    let mut edge_length = 0.0;
    let placements = parts
        .into_iter()
        .map(|(gi, r)| {
            let group = &groups[gi];
            let spec = group.spec;
            let rect = map_rect(r);
            used_area += rect.w * rect.h;
            edge_length += group.edge_length;
            let instance = next_instance[gi];
            next_instance[gi] += 1;
            Placement {
                part_id: spec.id.clone(),
                instance,
                rect,
                // In the sheet frame `h` runs along the stock length.
                rotated: spec.length != spec.width && (rect.h - spec.length).abs() > 0.005,
            }
        })
        .collect();

    let mut waste: Vec<Rect> = waste
        .into_iter()
        .map(map_rect)
        .filter(|r| r.w > 0.0 && r.h > 0.0)
        .collect();
    waste.sort_by(|a, b| (b.w * b.h).total_cmp(&(a.w * a.h)));

    Built {
        layout: SheetLayout {
            stock_id: stock.id.clone(),
            width: sheet_w,
            length: sheet_h,
            qty: 1,
            placements,
            cuts: all_cuts,
            waste,
        },
        used_area,
        edge_length,
    }
}
