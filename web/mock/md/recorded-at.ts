// The instant the workspace files were written, minute precision. `rebaseWorkspace` shifts
// every timestamp and date by (now − RECORDED_AT) at load, so relative times read the same
// each day. Times written into the files by hand are relative to this instant.
export const RECORDED_AT = "2026-10-22T16:27+05:30";
