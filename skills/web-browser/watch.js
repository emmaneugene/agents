#!/usr/bin/env node

/**
 * Background daemon that monitors browser tabs and logs activity to JSONL.
 *
 * Captures: console messages, JS exceptions, network requests/responses,
 * and browser log entries. Each target gets its own log file.
 *
 * Logs are written to: ${XDG_STATE_HOME:-$HOME/.local/state}/cdp/watch/<date>/<target>.jsonl
 *
 * Usage:
 *   watch.js                  # Start watching (foreground)
 *   watch.js --port 9223      # Watch a different CDP port
 *   watch.js &                # Run in background
 *
 * The `cdp start` script does NOT auto-start this. Run it manually if needed.
 */

import { connect } from "./lib/client.js";
import { mkdirSync, appendFileSync, existsSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const args = process.argv.slice(2);
let port = 9222;

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--port") {
		port = parseInt(args[++i], 10);
	}
}

// ── Directories ─────────────────────────────────────────────────────

const stateDir = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
const watchDir = join(stateDir, "cdp", "watch");
const dateStr = new Date().toISOString().slice(0, 10);
const logDir = join(watchDir, dateStr);
mkdirSync(logDir, { recursive: true });

// PID file to prevent duplicates
const pidFile = join(watchDir, `watcher-${port}.pid`);
if (existsSync(pidFile)) {
	const oldPid = readFileSync(pidFile, "utf8").trim();
	try {
		process.kill(parseInt(oldPid, 10), 0);
		console.error(`Watcher already running (PID ${oldPid})`);
		process.exit(1);
	} catch {
		// Stale pid file
	}
}
writeFileSync(pidFile, String(process.pid));
process.on("exit", () => {
	try { unlinkSync(pidFile); } catch {}
});
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

// ── Logging helpers ─────────────────────────────────────────────────

const targetFiles = new Map();

function logFile(targetId) {
	if (!targetFiles.has(targetId)) {
		const safe = targetId.replace(/[^a-zA-Z0-9_-]/g, "_");
		targetFiles.set(targetId, join(logDir, `${safe}.jsonl`));
	}
	return targetFiles.get(targetId);
}

function write(targetId, type, data) {
	const record = { ts: new Date().toISOString(), type, ...data };
	appendFileSync(logFile(targetId), JSON.stringify(record) + "\n");
}

function safeSerialize(remoteObject) {
	if (!remoteObject) return undefined;
	if (remoteObject.value !== undefined) return remoteObject.value;
	if (remoteObject.description) return remoteObject.description;
	return remoteObject.type || "unknown";
}

function compactStack(stack, maxFrames = 8) {
	if (!stack) return undefined;
	const lines = stack.split("\n");
	if (lines.length <= maxFrames + 1) return stack;
	return lines.slice(0, maxFrames + 1).join("\n") + `\n  ... ${lines.length - maxFrames - 1} more`;
}

// ── Main ────────────────────────────────────────────────────────────

const cdp = await connect({ port });
const sessions = new Map(); // sessionId -> targetId

async function attachTarget(targetId, url) {
	try {
		const sessionId = await cdp.attachToPage(targetId);
		sessions.set(sessionId, targetId);

		// Enable domains we care about
		await Promise.all([
			cdp.send("Runtime.enable", {}, sessionId),
			cdp.send("Network.enable", {}, sessionId),
			cdp.send("Log.enable", {}, sessionId),
		]);

		write(targetId, "attached", { url });
	} catch {
		// Page may have closed before we could attach
	}
}

// Event routing
function targetFor(sessionId) {
	return sessions.get(sessionId);
}

cdp.on("Runtime.consoleAPICalled", (params, sessionId) => {
	const tid = targetFor(sessionId);
	if (!tid) return;
	write(tid, "console", {
		level: params.type,
		args: params.args?.map(safeSerialize),
		stack: compactStack(params.stackTrace?.callFrames?.map(
			(f) => `  at ${f.functionName || "(anonymous)"} (${f.url}:${f.lineNumber}:${f.columnNumber})`,
		).join("\n")),
	});
});

cdp.on("Runtime.exceptionThrown", (params, sessionId) => {
	const tid = targetFor(sessionId);
	if (!tid) return;
	const ex = params.exceptionDetails;
	write(tid, "exception", {
		text: ex.text,
		description: ex.exception?.description,
		stack: compactStack(ex.exception?.description),
	});
});

cdp.on("Network.requestWillBeSent", (params, sessionId) => {
	const tid = targetFor(sessionId);
	if (!tid) return;
	write(tid, "network.request", {
		requestId: params.requestId,
		method: params.request.method,
		url: params.request.url,
	});
});

cdp.on("Network.responseReceived", (params, sessionId) => {
	const tid = targetFor(sessionId);
	if (!tid) return;
	write(tid, "network.response", {
		requestId: params.requestId,
		status: params.response.status,
		url: params.response.url,
		mimeType: params.response.mimeType,
	});
});

cdp.on("Network.loadingFailed", (params, sessionId) => {
	const tid = targetFor(sessionId);
	if (!tid) return;
	write(tid, "network.failure", {
		requestId: params.requestId,
		errorText: params.errorText,
	});
});

cdp.on("Log.entryAdded", (params, sessionId) => {
	const tid = targetFor(sessionId);
	if (!tid) return;
	write(tid, "log", {
		level: params.entry.level,
		text: params.entry.text,
		url: params.entry.url,
	});
});

// Discover existing pages and watch for new ones
await cdp.send("Target.setDiscoverTargets", { discover: true });

cdp.on("Target.targetCreated", (params) => {
	if (params.targetInfo.type === "page") {
		attachTarget(params.targetInfo.targetId, params.targetInfo.url);
	}
});

cdp.on("Target.targetDestroyed", (params) => {
	for (const [sid, tid] of sessions) {
		if (tid === params.targetId) {
			sessions.delete(sid);
			write(tid, "detached", {});
			break;
		}
	}
});

cdp.on("Target.targetInfoChanged", (params) => {
	const info = params.targetInfo;
	if (info.type !== "page") return;
	write(info.targetId, "info", { url: info.url, title: info.title });
});

// Attach to pages that already exist
const pages = await cdp.getPages();
for (const page of pages) {
	await attachTarget(page.targetId, page.url);
}

console.log(`Watching browser on :${port} — logging to ${logDir}`);
console.log("Press Ctrl+C to stop.");
