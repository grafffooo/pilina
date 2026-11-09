//! `cutlist <job.json>` prints the optimized plan as JSON. Reads stdin when no file is given.

use std::io::Read;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let input = match args.next().as_deref() {
        Some("--version") => {
            println!("cutlist {}", cutlist_core::version());
            return ExitCode::SUCCESS;
        }
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
    let plan = cutlist_core::optimize(&job);
    println!(
        "{}",
        serde_json::to_string_pretty(&plan).expect("plan serializes")
    );
    ExitCode::SUCCESS
}
