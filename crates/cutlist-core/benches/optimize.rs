//! `cargo bench -p cutlist-core`. Runs without a clock, so each benchmark does a fixed
//! amount of work (the search stops when it stops improving).

use criterion::{Criterion, criterion_group, criterion_main};
use cutlist_core::{Job, NoClock, optimize_with};
use std::hint::black_box;

fn job(json: &str) -> Job {
    serde_json::from_str(json).expect("valid job")
}

const STOCK: &str = r#"[{"id":"s","length":2800,"width":2070,"priority":true}]"#;

fn skrinky() -> Job {
    job(&format!(
        r#"{{"kerf":4,"stock":{STOCK},"parts":[
            {{"id":"a","length":1000,"width":300,"qty":2}},
            {{"id":"b","length":764,"width":300,"qty":10}},
            {{"id":"c","length":764,"width":80,"qty":2}}]}}"#
    ))
}

fn kitchen() -> Job {
    job(&format!(
        r#"{{"kerf":4,"stock":{STOCK},"parts":[
            {{"id":"side","length":720,"width":560,"qty":12}},
            {{"id":"bottom","length":564,"width":560,"qty":12}},
            {{"id":"rail","length":564,"width":100,"qty":12}},
            {{"id":"door","length":716,"width":396,"qty":10}},
            {{"id":"shelf","length":520,"width":300,"qty":8}}]}}"#
    ))
}

/// 15 random part types (same generator as the JS test harness).
fn random(seed0: u64, types: usize) -> Job {
    let mut seed = seed0;
    let mut rnd = || {
        seed = seed * 16807 % 2_147_483_647;
        seed as f64 / 2_147_483_647.0
    };
    let parts: Vec<String> = (0..types)
        .map(|i| {
            let length = (200.0 + rnd() * 1800.0).round();
            let width = (80.0 + rnd() * 600.0).round();
            let qty = 1 + (rnd() * 6.0) as u32;
            let grain = if rnd() < 0.2 { "length" } else { "none" };
            format!(r#"{{"id":"p{i}","length":{length},"width":{width},"qty":{qty},"grain":"{grain}"}}"#)
        })
        .collect();
    job(&format!(
        r#"{{"kerf":4,"stock":{STOCK},"parts":[{}]}}"#,
        parts.join(",")
    ))
}

fn benches(c: &mut Criterion) {
    let mut g = c.benchmark_group("optimize");
    g.sample_size(10);
    for (name, job) in [
        ("skrinky", skrinky()),
        ("kitchen", kitchen()),
        ("random15", random(42, 15)),
    ] {
        g.bench_function(name, |b| b.iter(|| optimize_with(black_box(&job), &mut NoClock)));
    }
    g.finish();
}

criterion_group!(optimize, benches);
criterion_main!(optimize);
