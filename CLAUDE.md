# Notes for Claude Code

The app is called **Pilina** (formerly CutList).

- The project lives in `~/Developer/pilina`. Don't move it into Desktop or Documents (iCloud-synced).
- After every commit, push to `origin` (the private GitHub repository).
- Commands are in [README.md](README.md); goals, decisions and milestones are in [PLAN.md](PLAN.md). Mark milestones done in PLAN.md as they finish.
- Keep the old internal names that hold user data: storage keys `cutlist.*`, the IndexedDB database `cutlist`, the bundle identifier `app.cutlist.desktop` and the file format tag `cutlist-project`. Renaming them would hide saved projects.
