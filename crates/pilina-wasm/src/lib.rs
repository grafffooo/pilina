//! Thin wasm-bindgen layer: JS objects in, JS objects out. All logic lives in `pilina-core`.

use pilina_core::{Control, Progress};
use wasm_bindgen::prelude::*;

/// Engine version string.
#[wasm_bindgen]
pub fn version() -> String {
    pilina_core::version().to_string()
}

/// Uses the JS clock (wasm has no system clock) and forwards progress to an optional callback.
struct JsControl {
    start: f64,
    on_progress: Option<js_sys::Function>,
}

impl Control for JsControl {
    fn elapsed_ms(&self) -> f64 {
        js_sys::Date::now() - self.start
    }

    fn progress(&mut self, p: &Progress) -> bool {
        if let Some(f) = &self.on_progress {
            let info = js_sys::Object::new();
            let set = |k: &str, v: f64| js_sys::Reflect::set(&info, &k.into(), &v.into()).is_ok();
            let ok = set("passes", f64::from(p.passes))
                && set("bestSheets", f64::from(p.best_sheets))
                && set("bestUnplaced", f64::from(p.best_unplaced))
                && set("elapsedMs", p.elapsed_ms);
            // Returning exactly `false` stops the search and keeps the best plan so far.
            if ok && let Ok(ret) = f.call1(&JsValue::NULL, &info) {
                return ret != JsValue::FALSE;
            }
        }
        true
    }
}

/// Optimizes a job. Takes a plain JS object shaped like `Job` and returns one shaped like
/// `Plan`. `onProgress`, if given, is called after each search pass with
/// `{ passes, bestSheets, bestUnplaced, elapsedMs }`.
#[wasm_bindgen]
pub fn optimize(job: JsValue, on_progress: Option<js_sys::Function>) -> Result<JsValue, JsError> {
    let job: pilina_core::Job = serde_wasm_bindgen::from_value(job)?;
    let mut control = JsControl {
        start: js_sys::Date::now(),
        on_progress,
    };
    let plan = pilina_core::optimize_with(&job, &mut control);
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    Ok(serde::Serialize::serialize(&plan, &serializer)?)
}

/// Prices a plan: `price(job, plan, input)` with plain JS objects shaped like `Job`, `Plan`
/// and `PriceInput`; returns a `CostBreakdown`.
#[wasm_bindgen]
pub fn price(job: JsValue, plan: JsValue, input: JsValue) -> Result<JsValue, JsError> {
    let job: pilina_core::Job = serde_wasm_bindgen::from_value(job)?;
    let plan: pilina_core::Plan = serde_wasm_bindgen::from_value(plan)?;
    let input: pilina_core::PriceInput = serde_wasm_bindgen::from_value(input)?;
    let cost = pilina_core::price(&job, &plan, &input);
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    Ok(serde::Serialize::serialize(&cost, &serializer)?)
}
