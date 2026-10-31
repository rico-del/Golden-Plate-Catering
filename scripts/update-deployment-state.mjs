import { promises as fs } from "node:fs";
import path from "node:path";

const [statePath, outcome, releaseId, rawDuration] = process.argv.slice(2);
const duration = Number(rawDuration);
if (!statePath || !["success", "failure", "rollback"].includes(outcome) || !Number.isFinite(duration) || duration < 0) {
  throw new Error("Expected a state path, valid deployment outcome, release identifier, and non-negative duration.");
}
if (!/^(?:[a-f0-9]{40}|bootstrap|development|legacy)$/.test(releaseId || "")) {
  throw new Error("Invalid release identifier.");
}

let state = {
  successes: 0,
  failures: 0,
  rollbacks: 0,
  last_duration_seconds: 0,
  last_success_timestamp_seconds: 0,
  last_result: "unknown",
  current_release: "development"
};
try {
  state = { ...state, ...JSON.parse(await fs.readFile(statePath, "utf8")) };
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (outcome === "success") {
  state.successes += 1;
  state.last_success_timestamp_seconds = Math.floor(Date.now() / 1000);
} else if (outcome === "failure") {
  state.failures += 1;
} else {
  state.rollbacks += 1;
}
state.last_duration_seconds = duration;
state.last_result = outcome;
state.current_release = releaseId;

await fs.mkdir(path.dirname(statePath), { recursive: true });
const temporaryPath = `${statePath}.${process.pid}.tmp`;
await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
await fs.rename(temporaryPath, statePath);