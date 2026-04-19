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
const pythonCommand = existsSync(venvPython) ? venvPython : "python";
const viteBin = join(rootDir, "frontend", "node_modules", "vite", "bin", "vite.js");
const backendUrl = "http://127.0.0.1:8000/api/health";

let backend = null;
let frontend = null;
let backendStartedAt = 0;
let backendFailures = 0;
let shuttingDown = false;

function cleanupExistingDevProcesses() {
  if (!isWindows) return;

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
    "8000",
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
    const stillStarting = Date.now() - backendStartedAt < 8000;
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

if (!existsSync(viteBin)) {
  console.error("\n[dev] Missing frontend dependencies. Run: npm --prefix frontend install");
  process.exit(1);
}

cleanupExistingDevProcesses();
startBackend();
startFrontend();
startBackendWatchdog();
