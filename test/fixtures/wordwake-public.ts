// Synthetic publication receipt; only approved public summary fields. No private package import.
export function publicWordWakeRow() {
  return {
  "id": "yaw-002",
  "published_at": "2026-11-16T00:00:00.000Z",
  "package_version": "yaw-002-wordwake-ww-v1-r1",
  "contract_version": "ww-v1",
  "reviewed_on": "2026-11-13",
  "principles": [
    "Eight-neighbor adjacency, including diagonals",
    "Only authored solution paths accepted",
    "Next-cell hint behavior",
    "Selection-first undo under ww-v1",
    "Restart restores initial puzzle state",
    "T1 engine and one reference puzzle; T2 React player and two additional puzzles",
    "Shared frozen contract and independent fixtures"
  ],
  "t1_title": "Puzzle engine + reference puzzle",
  "t1_summary": "Build the rules engine and one original reference puzzle, with independently runnable validation.",
  "t2_title": "Player experience + two additional puzzles",
  "t2_summary": "Build the React player and two additional original puzzles, using the shared contract and a labeled test double."
};
}
