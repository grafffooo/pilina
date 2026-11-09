//! Thin wasm-bindgen layer: JS objects in, JS objects out. All logic lives in `cutlist-core`.

use wasm_bindgen::prelude::*;

/// Engine version string.
#[wasm_bindgen]
pub fn version() -> String {
    cutlist_core::version().to_string()
}

/// Optimizes a job. Takes a plain JS object shaped like `Job` and returns one shaped like `Plan`.
#[wasm_bindgen]
pub fn optimize(job: JsValue) -> Result<JsValue, JsError> {
    let job: cutlist_core::Job = serde_wasm_bindgen::from_value(job)?;
    let plan = cutlist_core::optimize(&job);
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    Ok(serde::Serialize::serialize(&plan, &serializer)?)
}
