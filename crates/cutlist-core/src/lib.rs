//! CutList core: the cut optimizer and related calculations.
//!
//! Milestone 0 ships the data model and the public entry point. The guillotine packer
//! itself lands in milestone 1 (see `PLAN.md`); until then `optimize` places nothing
//! and reports every part as unplaced, so the bindings and apps can be wired up.

pub mod model;

pub use model::*;

/// Crate version, exposed so the apps can show which engine they run.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Optimizes a cutting job.
pub fn optimize(job: &Job) -> Plan {
    let unplaced = job
        .parts
        .iter()
        .filter(|p| p.qty > 0 && p.length > 0.0 && p.width > 0.0)
        .map(|p| Unplaced {
            part_id: p.id.clone(),
            count: p.qty,
        })
        .collect();
    Plan {
        sheets: Vec::new(),
        unplaced,
        totals: Totals::default(),
    }
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
                material: None,
                label: "DTD Black 18mm".into(),
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
    fn stub_reports_every_part_unplaced() {
        let plan = optimize(&skrinky());
        assert!(plan.sheets.is_empty());
        let total: u32 = plan.unplaced.iter().map(|u| u.count).sum();
        assert_eq!(total, 14);
    }
}
