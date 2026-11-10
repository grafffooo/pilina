# Notes for Claude Code

The app is called **Pilina** (formerly CutList).

## Repository & Working Copy

- **Working copy:** `~/Developer/pilina` on the Mac. Keep it out of the iCloud-synced `Desktop` and `Documents` folders: iCloud sync and git repositories don't mix well, and an earlier copy in `Documents` was lost that way.
- **Remote:** private GitHub repository [`grafffooo/pilina`](https://github.com/grafffooo/pilina) (`origin`). Push after every commit, so GitHub always holds a full copy.
- **History:** the commits for milestones 0–5 were rebuilt on 9 Nov 2026 from Claude Code's session log after the original folder was lost. Content and messages match the originals; commit IDs differ.
- **Documentation:** commands are in [README.md](README.md); goals, decisions and milestones are in [PLAN.md](PLAN.md). Mark milestones done in `PLAN.md` as they finish.

To set up on another Mac:

```bash
git clone https://github.com/grafffooo/pilina.git ~/Developer/pilina
cd ~/Developer/pilina/web && npm install && npm run dev
```

## Internal Compatibility Names

Keep the old internal names that hold user data:
- Browser storage keys (`cutlist.*`)
- IndexedDB database (`cutlist`)
- Mac app bundle identifier (`app.cutlist.desktop`)
- Project file format tag (`cutlist-project`) and `.cutlist.json` import compatibility

Renaming these would hide projects saved before the rename.
