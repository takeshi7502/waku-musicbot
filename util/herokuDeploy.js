const HEROKU_API_BASE = "https://api.heroku.com";
const HEROKU_ACCEPT = "application/vnd.heroku+json; version=3";

function getHerokuDeployConfig(config) {
  const deploy = config?.herokuDeploy;
  if (!deploy || typeof deploy !== "object") return null;

  const appName = String(deploy.appName || "").trim();
  const apiKey = String(deploy.apiKey || "").trim();
  const repository = String(deploy.repository || "").trim();
  const branch = String(deploy.branch || "v5").trim();
  if (!appName || !apiKey || !repository || !branch) return null;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) return null;
  if (!/^[\w./-]+$/.test(branch)) return null;

  return { appName, apiKey, repository, branch };
}

function getHeaders(apiKey, json = false) {
  return {
    Accept: HEROKU_ACCEPT,
    Authorization: `Bearer ${apiKey}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function getLatestCommit({ repository, branch }) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(branch)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "waku-musicbot",
      },
    }
  );
  if (!response.ok) {
    throw new Error(`GitHub source lookup failed (HTTP ${response.status}).`);
  }

  const commit = await response.json();
  if (!/^[0-9a-f]{40}$/i.test(commit?.sha || "")) {
    throw new Error("GitHub did not return a valid commit SHA.");
  }
  return commit.sha;
}

async function createHerokuBuild(config) {
  const deploy = getHerokuDeployConfig(config);
  if (!deploy) {
    const error = new Error("Heroku deployment is not configured.");
    error.code = "HEROKU_DEPLOY_UNAVAILABLE";
    throw error;
  }

  const commit = await getLatestCommit(deploy);
  const sourceUrl = `https://codeload.github.com/${deploy.repository}/tar.gz/${commit}`;
  const response = await fetch(
    `${HEROKU_API_BASE}/apps/${encodeURIComponent(deploy.appName)}/builds`,
    {
      method: "POST",
      headers: getHeaders(deploy.apiKey, true),
      body: JSON.stringify({
        source_blob: {
          url: sourceUrl,
          version: commit,
          version_description: `${deploy.repository}@${deploy.branch}`,
        },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Heroku build request failed (HTTP ${response.status}).`);
  }

  const build = await response.json();
  if (!build?.id) throw new Error("Heroku did not return a build ID.");
  return { id: build.id, commit, status: build.status || "pending" };
}

async function getHerokuBuild(config, buildId) {
  const deploy = getHerokuDeployConfig(config);
  if (!deploy || !buildId) {
    throw new Error("Heroku deployment settings are unavailable.");
  }

  const response = await fetch(
    `${HEROKU_API_BASE}/apps/${encodeURIComponent(deploy.appName)}/builds/${encodeURIComponent(buildId)}`,
    { headers: getHeaders(deploy.apiKey) }
  );
  if (!response.ok) {
    throw new Error(`Heroku build status failed (HTTP ${response.status}).`);
  }

  const build = await response.json();
  const succeeded = ["succeeded", "successful"].includes(build.status);
  return {
    state: succeeded ? "success" : build.status === "failed" ? "failed" : "running",
    commit: build.source_blob?.version || null,
    error: build.failure_message || null,
  };
}

module.exports = {
  getHerokuDeployConfig,
  createHerokuBuild,
  getHerokuBuild,
};
