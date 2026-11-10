//! Project cost from a plan: board material, edge banding and extra lines.
//!
//! The host passes prices already resolved per stock row and per part (it owns the
//! material library); this module only does the arithmetic, so every platform gets the
//! same numbers. Money is in the host's currency and is not rounded here.

use serde::{Deserialize, Serialize};

use crate::model::{Job, Plan, Rect};

/// How board material is charged.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PricingMode {
    /// Every sheet started is paid in full; kept leftovers can be credited back.
    #[default]
    Sheets,
    /// Only the area of the parts is paid, plus a waste percentage.
    Area,
}

/// Leftovers at least this big count as reusable offcuts.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffcutRule {
    pub min_length: f64,
    pub min_width: f64,
}

impl Default for OffcutRule {
    fn default() -> Self {
        Self {
            min_length: 300.0,
            min_width: 100.0,
        }
    }
}

impl OffcutRule {
    pub fn is_reusable(&self, r: &Rect) -> bool {
        r.w.max(r.h) >= self.min_length && r.w.min(r.h) >= self.min_width
    }
}

/// Prices for one stock row. Either may be missing; the other is derived from the sheet area.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockPrice {
    pub stock_id: String,
    /// Material name the cost is grouped under.
    pub material: String,
    #[serde(default)]
    pub per_sheet: Option<f64>,
    #[serde(default)]
    pub per_sqm: Option<f64>,
}

/// Edge band used on a part.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeBandPrice {
    pub part_id: String,
    /// Band name the cost is grouped under.
    pub band: String,
    #[serde(default)]
    pub per_metre: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraCost {
    pub label: String,
    pub amount: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceInput {
    #[serde(default)]
    pub mode: PricingMode,
    /// Area mode: extra material on top of the parts' area, in percent.
    #[serde(default = "default_waste")]
    pub waste_pct: f64,
    /// Sheets mode: credit reusable leftovers back at their share of the price.
    #[serde(default)]
    pub offcut_credit: bool,
    #[serde(default)]
    pub offcut_rule: OffcutRule,
    #[serde(default)]
    pub stock: Vec<StockPrice>,
    #[serde(default)]
    pub edge_bands: Vec<EdgeBandPrice>,
    /// Extra band length per banded edge, in mm (for trimming the overhang).
    #[serde(default = "default_allowance")]
    pub edge_allowance: f64,
    #[serde(default)]
    pub extras: Vec<ExtraCost>,
}

fn default_waste() -> f64 {
    10.0
}

fn default_allowance() -> f64 {
    20.0
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialCost {
    pub material: String,
    /// Sheets started (library offcuts included).
    pub sheets: u32,
    /// mm².
    pub sheet_area: f64,
    /// mm² covered by parts.
    pub used_area: f64,
    /// mm² of reusable leftovers (only counted in sheets mode with offcut credit).
    pub credit_area: f64,
    /// Before the offcut credit.
    pub gross: f64,
    pub credit: f64,
    /// `gross - credit`.
    pub cost: f64,
    /// False when this material has no price, so its cost is missing from the total.
    pub priced: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeBandCost {
    pub band: String,
    /// mm, allowance included.
    pub length: f64,
    pub cost: f64,
    pub priced: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostBreakdown {
    pub materials: Vec<MaterialCost>,
    pub edge_bands: Vec<EdgeBandCost>,
    pub extras: f64,
    pub total: f64,
    /// True when every material and band in use has a price.
    pub complete: bool,
}

/// Prices a plan.
pub fn price(job: &Job, plan: &Plan, input: &PriceInput) -> CostBreakdown {
    let mut materials: Vec<MaterialCost> = Vec::new();

    for sheet in &plan.sheets {
        let qty = f64::from(sheet.qty);
        let area = sheet.width * sheet.length;
        let sp = input.stock.iter().find(|s| s.stock_id == sheet.stock_id);
        let is_offcut = job.stock.iter().any(|s| s.id == sheet.stock_id && s.offcut);
        let name = sp.map_or_else(|| sheet.stock_id.clone(), |s| s.material.clone());

        // Resolve both prices from whichever was given.
        let per_sheet = sp.and_then(|s| s.per_sheet.or(s.per_sqm.map(|p| p * area / 1e6)));
        let per_sqm = sp.and_then(|s| s.per_sqm.or(s.per_sheet.map(|p| p / (area / 1e6))));
        let used: f64 = sheet.placements.iter().map(|p| p.rect.w * p.rect.h).sum();
        let reusable: f64 = sheet
            .waste
            .iter()
            .filter(|r| input.offcut_rule.is_reusable(r))
            .map(|r| r.w * r.h)
            .sum();

        let idx = match materials.iter().position(|m| m.material == name) {
            Some(i) => i,
            None => {
                materials.push(MaterialCost {
                    material: name,
                    sheets: 0,
                    sheet_area: 0.0,
                    used_area: 0.0,
                    credit_area: 0.0,
                    gross: 0.0,
                    credit: 0.0,
                    cost: 0.0,
                    priced: true,
                });
                materials.len() - 1
            }
        };
        let m = &mut materials[idx];
        m.sheets += sheet.qty;
        m.sheet_area += area * qty;
        m.used_area += used * qty;

        // Library offcuts were paid for in an earlier project.
        if is_offcut {
            continue;
        }
        let (Some(per_sheet), Some(per_sqm)) = (per_sheet, per_sqm) else {
            m.priced = false;
            continue;
        };
        match input.mode {
            PricingMode::Sheets => {
                m.gross += per_sheet * qty;
                if input.offcut_credit {
                    m.credit_area += reusable * qty;
                    m.credit += reusable / 1e6 * per_sqm * qty;
                }
            }
            PricingMode::Area => {
                m.gross += used / 1e6 * per_sqm * (1.0 + input.waste_pct.max(0.0) / 100.0) * qty;
            }
        }
    }
    for m in &mut materials {
        m.cost = m.gross - m.credit;
    }

    // Edge banding, from the parts actually placed.
    let mut edge_bands: Vec<EdgeBandCost> = Vec::new();
    for sheet in &plan.sheets {
        for p in &sheet.placements {
            let Some(part) = job.parts.iter().find(|x| x.id == p.part_id) else {
                continue;
            };
            let e = part.edges;
            let long = f64::from(u8::from(e.top) + u8::from(e.bottom));
            let short = f64::from(u8::from(e.left) + u8::from(e.right));
            if long + short == 0.0 {
                continue;
            }
            let length =
                (long * part.length + short * part.width + (long + short) * input.edge_allowance.max(0.0))
                    * f64::from(sheet.qty);
            let bp = input.edge_bands.iter().find(|b| b.part_id == part.id);
            let name = bp.map_or_else(|| "Edge band".to_string(), |b| b.band.clone());
            let per_metre = bp.and_then(|b| b.per_metre);
            let i = match edge_bands.iter().position(|b| b.band == name) {
                Some(i) => i,
                None => {
                    edge_bands.push(EdgeBandCost {
                        band: name,
                        length: 0.0,
                        cost: 0.0,
                        priced: true,
                    });
                    edge_bands.len() - 1
                }
            };
            let b = &mut edge_bands[i];
            b.length += length;
            match per_metre {
                Some(price) => b.cost += length / 1000.0 * price,
                None => b.priced = false,
            }
        }
    }

    let extras: f64 = input.extras.iter().map(|x| x.amount).sum();
    let total = materials.iter().map(|m| m.cost).sum::<f64>()
        + edge_bands.iter().map(|b| b.cost).sum::<f64>()
        + extras;
    let complete = materials.iter().all(|m| m.priced) && edge_bands.iter().all(|b| b.priced);

    CostBreakdown {
        materials,
        edge_bands,
        extras,
        total,
        complete,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;

    fn plan_one_sheet() -> (Job, Plan) {
        let job: Job = serde_json::from_str(
            r#"{"kerf":0,"parts":[{"id":"a","length":1000,"width":500,"qty":2,
                "edges":{"top":true,"bottom":true,"left":false,"right":false}}],
               "stock":[{"id":"s","length":2000,"width":1000,"qty":1}]}"#,
        )
        .unwrap();
        let plan = Plan {
            sheets: vec![SheetLayout {
                stock_id: "s".into(),
                width: 1000.0,
                length: 2000.0,
                qty: 1,
                strips: vec![],
                placements: vec![
                    Placement {
                        part_id: "a".into(),
                        instance: 0,
                        rect: Rect {
                            x: 0.0,
                            y: 0.0,
                            w: 500.0,
                            h: 1000.0,
                        },
                        rotated: false,
                    },
                    Placement {
                        part_id: "a".into(),
                        instance: 1,
                        rect: Rect {
                            x: 500.0,
                            y: 0.0,
                            w: 500.0,
                            h: 1000.0,
                        },
                        rotated: false,
                    },
                ],
                cuts: vec![],
                // One reusable 1000 × 1000 leftover.
                waste: vec![Rect {
                    x: 0.0,
                    y: 1000.0,
                    w: 1000.0,
                    h: 1000.0,
                }],
            }],
            unplaced: vec![],
            totals: Totals::default(),
        };
        (job, plan)
    }

    fn input(mode: PricingMode) -> PriceInput {
        PriceInput {
            mode,
            waste_pct: 10.0,
            offcut_credit: false,
            offcut_rule: OffcutRule::default(),
            stock: vec![StockPrice {
                stock_id: "s".into(),
                material: "Oak".into(),
                per_sheet: Some(100.0),
                per_sqm: None,
            }],
            edge_bands: vec![EdgeBandPrice {
                part_id: "a".into(),
                band: "ABS 2mm".into(),
                per_metre: Some(1.5),
            }],
            edge_allowance: 20.0,
            extras: vec![ExtraCost {
                label: "Hinges".into(),
                amount: 12.0,
            }],
        }
    }

    #[test]
    fn whole_sheets_with_and_without_offcut_credit() {
        let (job, plan) = plan_one_sheet();
        let c = price(&job, &plan, &input(PricingMode::Sheets));
        assert_eq!(c.materials[0].cost, 100.0);
        // Edge: 2 parts × 2 long edges × (1000 + 20) mm = 4.08 m × 1.5
        assert!((c.edge_bands[0].length - 4080.0).abs() < 1e-9);
        assert!((c.edge_bands[0].cost - 6.12).abs() < 1e-9);
        assert!((c.total - 118.12).abs() < 1e-9);
        assert!(c.complete);

        let mut i = input(PricingMode::Sheets);
        i.offcut_credit = true;
        let c = price(&job, &plan, &i);
        // Half the sheet is a reusable leftover: half the price back.
        assert!((c.materials[0].credit - 50.0).abs() < 1e-9);
        assert!((c.materials[0].cost - 50.0).abs() < 1e-9);
    }

    #[test]
    fn area_mode_charges_used_area_plus_waste() {
        let (job, plan) = plan_one_sheet();
        let c = price(&job, &plan, &input(PricingMode::Area));
        // 1 m² used of a 2 m² sheet at 50 per m², +10 %.
        assert!((c.materials[0].cost - 55.0).abs() < 1e-9);
    }

    #[test]
    fn missing_prices_are_flagged_not_guessed() {
        let (job, plan) = plan_one_sheet();
        let mut i = input(PricingMode::Sheets);
        i.stock[0].per_sheet = None;
        i.edge_bands.clear();
        let c = price(&job, &plan, &i);
        assert!(!c.complete);
        assert!(!c.materials[0].priced);
        assert_eq!(c.materials[0].cost, 0.0);
        assert_eq!(c.edge_bands[0].band, "Edge band");
        assert!(!c.edge_bands[0].priced);
        assert_eq!(c.total, 12.0);
    }

    #[test]
    fn library_offcuts_are_free() {
        let (mut job, plan) = plan_one_sheet();
        job.stock[0].offcut = true;
        let c = price(&job, &plan, &input(PricingMode::Sheets));
        assert_eq!(c.materials[0].sheets, 1);
        assert_eq!(c.materials[0].cost, 0.0);
    }
}
