const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const ENABLED_MARKER = path.join(DATA_DIR, "managed-update.enabled");
const REQUEST_FILE = path.join(DATA_DIR, "managed-update-request.json");
const RESULT_FILE = path.join(DATA_DIR, "managed-update-result.json");

function isHerokuRuntime() {
  // DYNO is set by Heroku for every running dyno. Do not use a configured app
  // name as a runtime signal: developers may keep that value in a local env
  // file, where /reload must remain the ordinary local workflow.
  return Boolean(process.env.DYNO);
}

function getManagedUpdateMode() {
  if (isHerokuRuntime()) return "heroku";
  if (fs.existsSync(ENABLED_MARKER)) return "managed";
  return "unavailable";
}

function writeJsonAtomically(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    // The host-side systemd service runs as the VPS user while the container
    // normally runs as root. This request carries no secrets, so it must be
    // readable by both processes.
    mode: 0o644,
  });
  fs.renameSync(temporaryPath, filePath);
}

function requestManagedUpdate(request) {
  writeJsonAtomically(REQUEST_FILE, request);
}

function readManagedUpdateResult() {
  try {
    return JSON.parse(fs.readFileSync(RESULT_FILE, "utf8"));
  } catch {
    return null;
  }
}

module.exports = {
  ENABLED_MARKER,
  REQUEST_FILE,
  RESULT_FILE,
  isHerokuRuntime,
  getManagedUpdateMode,
  requestManagedUpdate,
  readManagedUpdateResult,
};
