//! `cutlist [--stats] [job.json]` prints the optimized plan as JSON. Reads stdin when no
//! file is given. `--stats` prints a one-line summary to stderr instead of the plan.

use std::io::Read;
use std::process::ExitCode;
use std::time::Instant;

use cutlist_core::{Control, Progress};

struct Clock {
    start: Instant,
    last: Option<Progress>,
}

impl Control for Clock {
    fn elapsed_ms(&self) -> f64 {
        self.start.elapsed().as_secs_f64() * 1000.0
    }

    fn progress(&mut self, progress: &Progress) -> bool {
        self.last = Some(*progress);
        true
    }
}

fn main() -> ExitCode {
    let mut stats = false;
    let mut path = None;
    for arg in std::env::args().skip(1) {
        match arg.as_str() {
            "--version" => {
                println!("cutlist {}", cutlist_core::version());
                return ExitCode::SUCCESS;
            }
            "--stats" => stats = true,
            _ => path = Some(arg),
        }
    }

    let input = match &path {
        Some(path) => match std::fs::read_to_string(path) {
            Ok(text) => text,
            Err(e) => {
                eprintln!("cannot read {path}: {e}");
                return ExitCode::FAILURE;
            }
        },
        None => {
            let mut text = String::new();
            if let Err(e) = std::io::stdin().read_to_string(&mut text) {
                eprintln!("cannot read stdin: {e}");
                return ExitCode::FAILURE;
            }
            text
        }
    };

    let job: cutlist_core::Job = match serde_json::from_str(&input) {
        Ok(job) => job,
        Err(e) => {
            eprintln!("invalid job JSON: {e}");
            return ExitCode::FAILURE;
        }
    };

    let mut clock = Clock {
        start: Instant::now(),
        last: None,
    };
    let plan = cutlist_core::optimize_with(&job, &mut clock);

    if stats {
        let t = &plan.totals;
        let unplaced: u32 = plan.unplaced.iter().map(|u| u.count).sum();
        let passes = clock.last.map_or(0, |p| p.passes);
        println!(
            "sheets {} (offcuts {})  used {:.1}%  cuts {}  cut length {:.0} mm  unplaced {}  passes {}  {:.0} ms",
            t.sheets,
            t.offcuts_used,
            if t.sheet_area > 0.0 {
                t.used_area / t.sheet_area * 100.0
            } else {
                0.0
            },
            t.cuts,
            t.cut_length,
            unplaced,
            passes,
            clock.elapsed_ms()
        );
    } else {
        println!(
            "{}",
            serde_json::to_string_pretty(&plan).expect("plan serializes")
        );
    }
    ExitCode::SUCCESS
}
