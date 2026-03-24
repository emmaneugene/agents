/**
 * Minimal Chrome DevTools Protocol client over raw WebSocket.
 *
 * No puppeteer, no chrome-remote-interface — just `ws` and fetch.
 * Handles CDP message routing, session multiplexing, and event dispatch.
 */

import WebSocket from "ws";

/**
 * Connect to a Chrome instance's CDP endpoint.
 * @param {object} opts
 * @param {number} [opts.port=9222] - CDP port
 * @param {number} [opts.timeout=5000] - Connection timeout in ms
 * @returns {Promise<CDP>}
 */
export async function connect({ port = 9222, timeout = 5000 } = {}) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	let resp;
	try {
		resp = await fetch(`http://localhost:${port}/json/version`, {
			signal: controller.signal,
		});
	} catch (e) {
		clearTimeout(timeoutId);
		if (e.name === "AbortError") {
			throw new Error(`Connection timeout — is Chrome running with --remote-debugging-port=${port}?`);
		}
		throw new Error(`Cannot reach CDP on port ${port} — run: cdp start`);
	}

	const { webSocketDebuggerUrl } = await resp.json();
	clearTimeout(timeoutId);

	return new Promise((resolve, reject) => {
		const ws = new WebSocket(webSocketDebuggerUrl);
		const connectTimeout = setTimeout(() => {
			ws.close();
			reject(new Error("WebSocket connect timeout"));
		}, timeout);

		ws.on("open", () => {
			clearTimeout(connectTimeout);
			resolve(new CDP(ws));
		});
		ws.on("error", (e) => {
			clearTimeout(connectTimeout);
			reject(e);
		});
	});
}

class CDP {
	constructor(ws) {
		this.ws = ws;
		this._id = 0;
		this._callbacks = new Map();
		this._eventHandlers = new Map();

		ws.on("message", (data) => {
			const msg = JSON.parse(data.toString());

			// Response to a send() call
			if (msg.id && this._callbacks.has(msg.id)) {
				const { resolve, reject } = this._callbacks.get(msg.id);
				this._callbacks.delete(msg.id);
				if (msg.error) reject(new Error(msg.error.message));
				else resolve(msg.result);
				return;
			}

			// Event
			if (msg.method) {
				this._emit(msg.method, msg.params || {}, msg.sessionId || null);
			}
		});
	}

	// ── Event handling ──────────────────────────────────────────────────

	on(method, handler) {
		if (!this._eventHandlers.has(method)) {
			this._eventHandlers.set(method, new Set());
		}
		this._eventHandlers.get(method).add(handler);
		return () => this.off(method, handler);
	}

	off(method, handler) {
		const handlers = this._eventHandlers.get(method);
		if (!handlers) return;
		handlers.delete(handler);
		if (handlers.size === 0) this._eventHandlers.delete(method);
	}

	_emit(method, params, sessionId) {
		const handlers = this._eventHandlers.get(method);
		if (!handlers) return;
		for (const handler of handlers) {
			try {
				handler(params, sessionId);
			} catch {
				// Ignore handler errors to keep the CDP session alive
			}
		}
	}

	// ── Core protocol ───────────────────────────────────────────────────

	send(method, params = {}, sessionId = null, timeout = 10000) {
		return new Promise((resolve, reject) => {
			const msgId = ++this._id;
			const msg = { id: msgId, method, params };
			if (sessionId) msg.sessionId = sessionId;

			const timer = setTimeout(() => {
				this._callbacks.delete(msgId);
				reject(new Error(`CDP timeout: ${method}`));
			}, timeout);

			this._callbacks.set(msgId, {
				resolve: (result) => {
					clearTimeout(timer);
					resolve(result);
				},
				reject: (err) => {
					clearTimeout(timer);
					reject(err);
				},
			});

			this.ws.send(JSON.stringify(msg));
		});
	}

	// ── Convenience methods ─────────────────────────────────────────────

	async getPages() {
		const { targetInfos } = await this.send("Target.getTargets");
		return targetInfos.filter((t) => t.type === "page");
	}

	async attachToPage(targetId) {
		const { sessionId } = await this.send("Target.attachToTarget", {
			targetId,
			flatten: true,
		});
		return sessionId;
	}

	/**
	 * Get the active page (last tab) and attach to it.
	 * @returns {{ targetId: string, sessionId: string, url: string, title: string }}
	 */
	async getActivePage() {
		const pages = await this.getPages();
		const page = pages.at(-1);
		if (!page) throw new Error("No active tab found");
		const sessionId = await this.attachToPage(page.targetId);
		return { targetId: page.targetId, sessionId, url: page.url, title: page.title };
	}

	async evaluate(sessionId, expression, timeout = 30000) {
		const result = await this.send(
			"Runtime.evaluate",
			{ expression, returnByValue: true, awaitPromise: true },
			sessionId,
			timeout,
		);

		if (result.exceptionDetails) {
			throw new Error(
				result.exceptionDetails.exception?.description || result.exceptionDetails.text,
			);
		}
		return result.result?.value;
	}

	async screenshot(sessionId, timeout = 10000) {
		const { data } = await this.send(
			"Page.captureScreenshot",
			{ format: "png" },
			sessionId,
			timeout,
		);
		return Buffer.from(data, "base64");
	}

	async navigate(sessionId, url, timeout = 30000) {
		return this.send("Page.navigate", { url }, sessionId, timeout);
	}

	async getDocument(sessionId) {
		const { root } = await this.send("DOM.getDocument", { depth: -1, pierce: true }, sessionId);
		const { outerHTML } = await this.send("DOM.getOuterHTML", { nodeId: root.nodeId }, sessionId);
		return outerHTML;
	}

	async getFrameTree(sessionId) {
		const { frameTree } = await this.send("Page.getFrameTree", {}, sessionId);
		return frameTree;
	}

	close() {
		this.ws.close();
	}
}
