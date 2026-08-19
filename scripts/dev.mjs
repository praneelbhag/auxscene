import { existsSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const isWindows = process.platform === "win32";
const venvPython = isWindows
  ? join(rootDir, ".venv", "Scripts", "python.exe")
  : join(rootDir, ".venv", "bin", "python");
const pythonCommand = process.env.PYTHON || (
  existsSync(venvPython) ? venvPython : isWindows ? "python" : "python3"
);
const viteBin = join(rootDir, "frontend", "node_modules", "vite", "bin", "vite.js");
const backendPort = Number(process.env.BACKEND_PORT || 8000);
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);
const backendUrl = `http://127.0.0.1:${backendPort}/api/health`;
const backendOnly = process.argv.includes("--backend-only");
const backendStartupGraceMs = 30_000;

let backend = null;
let frontend = null;
let backendStartedAt = 0;
let backendFailures = 0;
let shuttingDown = false;

function validateBackendRuntime() {
  const versionCheck = spawnSync(
    pythonCommand,
    [
      "-c",
      "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)",
    ],
    { cwd: rootDir, encoding: "utf8" },
  );

  if (versionCheck.error || versionCheck.status !== 0) {
    console.error(
      "\n[dev] Backend requires Python 3.11+ and a project virtual environment.",
    );
    console.error("[dev] Create it, then install dependencies:");
    console.error("      python3.12 -m venv .venv");
    console.error("      .venv/bin/python -m pip install -r backend/requirements.txt");
    process.exit(1);
  }

  const dependencyCheck = spawnSync(
    pythonCommand,
    ["-c", "import anthropic, fastapi, uvicorn"],
    { cwd: rootDir, encoding: "utf8" },
  );

  if (dependencyCheck.status !== 0) {
    console.error("\n[dev] Backend dependencies are missing.");
    console.error(
      `[dev] Run: ${pythonCommand} -m pip install -r backend/requirements.txt`,
    );
    process.exit(1);
  }
}

function cleanupWindowsDevProcesses() {

  const escapedRootDir = rootDir.replaceAll("'", "''");
  const currentNodePid = process.pid;
  const script = `
$rootDir = '${escapedRootDir}'
$currentNodePid = ${currentNodePid}
$matches = Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $PID -and
  $_.CommandLine -and (
    ($_.Name -eq 'node.exe' -and $_.ProcessId -ne $currentNodePid -and ($_.CommandLine -like "*scripts/dev.mjs*" -or $_.CommandLine -like "*scripts\\dev.mjs*")) -or
    ($_.Name -eq 'python.exe' -and $_.CommandLine -like "*backend.app.main:app*--port*8000*") -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -like "*$rootDir*frontend*node_modules*vite*bin*vite.js*") -or
    ($_.Name -eq 'esbuild.exe' -and $_.CommandLine -like "*$rootDir*frontend*node_modules*@esbuild*") -or
    ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like "*vite --host*")
  )
}
foreach ($process in $matches) {
  & taskkill /PID $process.ProcessId /T /F 2>$null | Out-Null
}
`;

  spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    cwd: rootDir,
    stdio: "inherit",
  });
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function processCommand(pid) {
  const result = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
  return result.status === 0 ? (result.stdout || "").trim() : "";
}

function processCwd(pid) {
  const result = spawnSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) return null;
  const entry = result.stdout.split("\n").find((line) => line.startsWith("n"));
  return entry ? entry.slice(1) : null;
}

// Our own pid plus every ancestor. `npm run dev` spawns a shell whose command
// line also contains "scripts/dev.mjs", so matching on that alone would make
// the cleanup kill the very process tree it is running inside.
function ownProcessChain() {
  const chain = new Set();
  let current = process.pid;

  for (let depth = 0; depth < 20 && current > 1; depth += 1) {
    chain.add(current);
    const result = spawnSync("ps", ["-o", "ppid=", "-p", String(current)], { encoding: "utf8" });
    const parent = Number.parseInt((result.stdout || "").trim(), 10);
    if (!Number.isInteger(parent) || parent <= 1) break;
    current = parent;
  }

  return chain;
}

function parsePids(output, ownChain) {
  return (output || "")
    .split("\n")
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 1 && !ownChain.has(pid));
}

function terminate(pid, label) {
  console.log(`[dev] Stopping stale ${label} (pid ${pid})...`);

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    sleepSync(200);
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process exited between the check and the signal.
  }
  sleepSync(300);
}

function reclaimPort(port, label, ownChain) {
  const result = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });

  for (const pid of parsePids(result.stdout, ownChain)) {
    const command = processCommand(pid);
    if (!command) continue;

    // Only reclaim ports from this project. An unrelated listener is the
    // user's to deal with, so fail loudly instead of restarting forever.
    if (!command.includes(rootDir)) {
      console.error(`\n[dev] Port ${port} is held by an unrelated process (pid ${pid}):`);
      console.error(`      ${command}`);
      console.error(`[dev] Stop that process or free port ${port}, then rerun.`);
      process.exit(1);
    }

    terminate(pid, `${label} on port ${port}`);
  }
}

function cleanupPosixDevProcesses() {
  const ownChain = ownProcessChain();

  // Supervisors first: a stale dev.mjs restarts its children on exit, so
  // reclaiming the ports before it is gone just races against the restart.
  const supervisors = spawnSync("pgrep", ["-f", "scripts/dev.mjs"], { encoding: "utf8" });
  for (const pid of parsePids(supervisors.stdout, ownChain)) {
    if (processCwd(pid) !== rootDir) continue;
    terminate(pid, "dev supervisor");
  }

  reclaimPort(backendPort, "backend", ownChain);
  reclaimPort(frontendPort, "frontend", ownChain);
}

function cleanupExistingDevProcesses() {
  if (isWindows) {
    cleanupWindowsDevProcesses();
    return;
  }
  cleanupPosixDevProcesses();
}

function spawnChild(name, command, args, cwd) {
  console.log(`\n[dev] Starting ${name}...`);
  return spawn(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
    detached: !isWindows,
  });
}

function startBackend() {
  if (shuttingDown || backend) return;

  backendStartedAt = Date.now();
  backendFailures = 0;
  backend = spawnChild("backend", pythonCommand, [
    "-m",
    "uvicorn",
    "backend.app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    String(backendPort),
  ], rootDir);

  backend.on("exit", (code, signal) => {
    backend = null;
    if (shuttingDown) return;

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`\n[dev] backend exited with ${reason}. Restarting backend...`);
    setTimeout(startBackend, 1000);
  });

  backend.on("error", (error) => {
    backend = null;
    if (shuttingDown) return;

    console.error(`\n[dev] Could not start backend: ${error.message}`);
    setTimeout(startBackend, 1000);
  });
}

function startFrontend() {
  if (shuttingDown || frontend) return;

  frontend = spawnChild("frontend", process.execPath, [viteBin, "--host", "0.0.0.0"], join(rootDir, "frontend"));

  frontend.on("exit", (code, signal) => {
    frontend = null;
    if (shuttingDown) return;

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`\n[dev] frontend exited with ${reason}. Restarting frontend...`);
    setTimeout(startFrontend, 1000);
  });

  frontend.on("error", (error) => {
    frontend = null;
    if (shuttingDown) return;

    console.error(`\n[dev] Could not start frontend: ${error.message}`);
    setTimeout(startFrontend, 1000);
  });
}

function backendHealthy() {
  return new Promise((resolve) => {
    const req = http.get(backendUrl, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });

    req.on("error", () => resolve(false));
  });
}

function startBackendWatchdog() {
  setInterval(async () => {
    if (shuttingDown) return;

    const healthy = await backendHealthy();
    if (healthy) {
      backendFailures = 0;
      return;
    }

    backendFailures += 1;
    const stillStarting = Date.now() - backendStartedAt < backendStartupGraceMs;
    if (stillStarting || backendFailures < 2) return;

    console.error("\n[dev] backend health check failed. Restarting backend...");
    if (backend?.pid) {
      killProcessTree(backend.pid);
    } else {
      startBackend();
    }
  }, 4000);
}

function killProcessTree(pid) {
  if (!pid) return;

  if (isWindows) {
    spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process already exited.
    }
  }
}

function stopAll(exitCode = 0) {
  if (shuttingDown) return;

  shuttingDown = true;
  console.log("\n[dev] Stopping dev stack...");

  killProcessTree(backend?.pid);
  killProcessTree(frontend?.pid);

  setTimeout(() => process.exit(exitCode), 500);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

if (!backendOnly && !existsSync(viteBin)) {
  console.error("\n[dev] Missing frontend dependencies. Run: npm --prefix frontend install");
  process.exit(1);
}

validateBackendRuntime();
cleanupExistingDevProcesses();
startBackend();
if (!backendOnly) {
  startFrontend();
}
startBackendWatchdog();
