# Backyard Olympics Manager

Backyard Olympics Manager is a dependency-free browser application for managing participants, individual scored or timed events, bracket-style team events, tie-break priorities, and overall standings.

## Supported application

`index.html` is the authoritative application and the only production entry point. Open it directly in a modern browser or serve the repository with any static file server.

The supported team-event format is the knockout bracket in `index.html`. The two other HTML files are retained temporarily as historical reference while the application is consolidated:

- `backyard_olympics_team_bracket_v2.html` is an alternate bracket prototype.
- `backyard_olympics_full-1.html` is the obsolete win-count team-event prototype.

Do not add features or fixes to the historical files. They will be removed after the production behavior and saved-data migration path are covered by tests.

## Development

The application has no runtime dependencies or build step. `index.html` loads the shared domain helpers from `app-core.js`, while its DOM rendering remains inline during the incremental refactor. Node.js 18 or newer is required only for repository checks.

```bash
npm test
npm run check:syntax
```

The test suite uses Node's built-in test runner. Pure state, scoring, standings, team grouping, bracket, shuffle, ID, and time helpers are tested through `app-core.js`; a small DOM fixture also verifies that `index.html` remains connected to the core module.

## Data storage

Competition data remains in the browser unless it is exported as JSON. Saving in the browser continues to use the existing `localStorage` key `byo_manager_state_v2` so older browser saves can be found and migrated.

Saved and exported competitions use schema version 3. Participants and events have stable internal IDs, results are keyed by event ID, and displayed totals are rebuilt from the saved raw results. Existing unversioned and v2 browser saves or JSON exports are migrated automatically when loaded; malformed data and saves from unsupported future schema versions are rejected before the current competition is replaced.

Equal individual results use shared competition placement (`1, 1, 3`). Teams eliminated in the same bracket round also share a placement.

## Import and browser security

Imports are limited to 5 MB, validated and migrated before they can replace the open competition, and summarized for confirmation. Failed or cancelled imports leave the current competition unchanged.

The production page loads its styles and logic from `styles.css`, `app-core.js`, and `app-ui.js`, uses delegated button listeners instead of inline JavaScript handlers, and applies a Content Security Policy that blocks inline or third-party scripts and styles.
