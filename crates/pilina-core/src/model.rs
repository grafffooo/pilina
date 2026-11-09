//! Plain data types shared by every platform (web via WASM, Android/iOS via UniFFI later).
//!
//! Conventions:
//! - All sizes are millimetres (`f64`).
//! - A sheet's coordinate system: origin at its top-left corner, `x` along the stock
//!   **width**, `y` along the stock **length**. The same numbers drive the SVG drawing,
//!   the PDF and (later) the AR overlay.
//! - Field names serialize as camelCase so JSON matches the TypeScript side.

use serde::{Deserialize, Serialize};

/// Which way a part's grain must run relative to the stock's length.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Grain {
    /// Free rotation.
    #[default]
    None,
    /// The part's length runs along the stock's length.
    Length,
    /// The part's length runs along the stock's width.
    Width,
}

/// Edge banding per part edge. Top/bottom are the length edges, left/right the width edges.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edges {
    pub top: bool,
    pub bottom: bool,
    pub left: bool,
    pub right: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartSpec {
    pub id: String,
    pub length: f64,
    pub width: f64,
    pub qty: u32,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub grain: Grain,
    /// Material key. A part only goes on stock with the same material; `None` on either
    /// side matches anything.
    #[serde(default)]
    pub material: Option<String>,
    #[serde(default)]
    pub edges: Edges,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockSpec {
    pub id: String,
    pub length: f64,
    pub width: f64,
    /// `None` = unlimited.
    #[serde(default)]
    pub qty: Option<u32>,
    /// Priority stock is used before other stock.
    #[serde(default)]
    pub priority: bool,
    /// A leftover from the offcut library. Offcuts are used before any stock and their area
    /// doesn't count as new material.
    #[serde(default)]
    pub offcut: bool,
    /// Material key, see `PartSpec::material` (`None` takes any part).
    #[serde(default)]
    pub material: Option<String>,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    /// Wall-clock budget for the search, in milliseconds.
    pub time_budget_ms: u32,
    /// Seed for the randomized part orderings (results are deterministic for a given seed).
    pub seed: u64,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            time_budget_ms: 600,
            seed: 1_234_567,
        }
    }
}

/// Everything the optimizer needs.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub parts: Vec<PartSpec>,
    pub stock: Vec<StockSpec>,
    /// Saw blade thickness.
    pub kerf: f64,
    /// Margin trimmed off every sheet edge before cutting.
    #[serde(default)]
    pub trim: f64,
    #[serde(default)]
    pub options: Options,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Axis {
    /// A cut at a fixed `x` (runs along the stock length).
    X,
    /// A cut at a fixed `y` (runs along the stock width).
    Y,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub part_id: String,
    /// 0-based copy number within the part's quantity.
    pub instance: u32,
    pub rect: Rect,
    /// True when the part's length runs along the stock's width.
    pub rotated: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cut {
    /// 1-based, in sawing order.
    pub number: u32,
    /// 0 = edge trim, 1 = rip through the whole (trimmed) sheet, 2 = cross cut of a strip,
    /// 3 = split a row, 4 = trim a part to its length.
    pub stage: u8,
    pub axis: Axis,
    pub pos: f64,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub length: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetLayout {
    pub stock_id: String,
    /// Sheet size: `width` runs along x, `length` along y.
    pub width: f64,
    pub length: f64,
    /// Identical sheets are merged: this layout is cut `qty` times.
    pub qty: u32,
    pub placements: Vec<Placement>,
    pub cuts: Vec<Cut>,
    /// Leftover rectangles, largest first.
    pub waste: Vec<Rect>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Unplaced {
    pub part_id: String,
    pub count: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    /// Sheets to cut, library offcuts included.
    pub sheets: u32,
    /// Of `sheets`, how many are library offcuts.
    pub offcuts_used: u32,
    pub sheet_area: f64,
    pub used_area: f64,
    /// `sheet_area - used_area` (saw kerf and trim included).
    pub waste_area: f64,
    pub cuts: u32,
    pub cut_length: f64,
    pub edge_band_length: f64,
}

/// The optimizer's answer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub sheets: Vec<SheetLayout>,
    pub unplaced: Vec<Unplaced>,
    pub totals: Totals,
}
