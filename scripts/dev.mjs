import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? process.env.ComSpec ?? "cmd.exe" : "npm";
const frontendArgs = isWindows
  ? ["/d", "/s", "/c", "npm.cmd --prefix frontend run dev"]
  : ["--prefix", "frontend", "run", "dev"];
const venvPython = isWindows
  ? join(rootDir, ".venv", "Scripts", "python.exe")
  : join(rootDir, ".venv", "bin", "python");
const pythonCommand = existsSync(venvPython) ? venvPython : "python";

const children = [];
let shuttingDown = false;

function start(name, command, args) {
  console.log(`\n[dev] Starting ${name}...`);
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
    detached: !isWindows,
  });

  children.push({ name, child });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`\n[dev] ${name} exited with ${reason}. Stopping dev stack.`);
    stopAll(code ?? 1);
  });

  child.on("error", (error) => {
    if (shuttingDown) {
      return;
    }

    console.error(`\n[dev] Could not start ${name}: ${error.message}`);
    stopAll(1);
  });
}

function killProcessTree(pid) {
  if (!pid) {
    return;
  }

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
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log("\n[dev] Stopping dev stack...");

  for (const { child } of children) {
    killProcessTree(child.pid);
  }

  setTimeout(() => process.exit(exitCode), 500);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

start("backend", pythonCommand, [
  "-m",
  "uvicorn",
  "backend.app.main:app",
  "--host",
  "127.0.0.1",
  "--port",
  "8000",
  "--reload",
]);

start("frontend", npmCommand, frontendArgs);
