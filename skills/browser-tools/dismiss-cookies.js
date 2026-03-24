#!/usr/bin/env node

/**
 * Automatically dismiss cookie consent dialogs on the active tab.
 *
 * Targets major CMPs: OneTrust, Cookiebot, Didomi, Quantcast, Usercentrics,
 * TrustArc, Klaro, CookieYes, and generic cookie/consent/GDPR banners.
 *
 * Usage:
 *   dismiss-cookies.js                # Accept cookies (default)
 *   dismiss-cookies.js --reject       # Reject/decline cookies
 *   dismiss-cookies.js --port 9223
 */

import { connect } from "./lib/client.js";

const args = process.argv.slice(2);
let port = 9222;
let mode = "accept";

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--port") {
		port = parseInt(args[++i], 10);
	} else if (args[i] === "--reject") {
		mode = "reject";
	}
}

const globalTimeout = setTimeout(() => {
	console.error("Timeout (30s)");
	process.exit(1);
}, 30000);

// ── Consent dismissal logic (runs in browser context) ───────────────

const dismissScript = (mode) => `
(function() {
	const MODE = "${mode}";

	function isVisible(el) {
		if (!el) return false;
		const s = getComputedStyle(el);
		return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0"
			&& el.offsetWidth > 0 && el.offsetHeight > 0;
	}

	function clickFirst(selectors) {
		for (const sel of selectors) {
			try {
				const el = document.querySelector(sel);
				if (el && isVisible(el)) { el.click(); return sel; }
			} catch {}
		}
		return null;
	}

	function clickByText(container, patterns) {
		const buttons = (container || document).querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']");
		for (const btn of buttons) {
			if (!isVisible(btn)) continue;
			const text = btn.textContent?.trim().toLowerCase() || "";
			for (const p of patterns) {
				if (text.includes(p) || (text.length < 30 && p.test?.(text))) {
					btn.click();
					return text;
				}
			}
		}
		return null;
	}

	const acceptPatterns = [
		"accept all", "accept cookies", "allow all", "allow cookies",
		"agree", "i agree", "got it", "ok", "okay",
		"alle akzeptieren", "akzeptieren", "zustimmen",
		"tout accepter", "accepter", "j'accepte",
		"accetta tutto", "accetta", "aceptar todo", "aceitar tudo",
	];

	const rejectPatterns = [
		"reject all", "decline all", "deny all", "refuse all",
		"necessary only", "only necessary", "essential only",
		"manage preferences", "cookie settings",
		"alle ablehnen", "ablehnen", "nur notwendige",
		"tout refuser", "refuser", "rechazar todo", "recusar tudo",
	];

	const patterns = MODE === "reject" ? rejectPatterns : acceptPatterns;

	// ── Platform-specific selectors ───────────────────────────────

	const acceptSelectors = [
		"#onetrust-accept-btn-handler",                          // OneTrust
		"#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", // Cookiebot
		".didomi-continue-without-agreeing, #didomi-notice-agree-button", // Didomi
		".qc-cmp2-summary-buttons button:first-child",          // Quantcast
		"[data-testid='uc-accept-all-button']",                  // Usercentrics
		"#truste-consent-button",                                // TrustArc
		".klaro .cm-btn-accept",                                 // Klaro
		"#cookie_action_close_header",                           // CookieYes
	];

	const rejectSelectors = [
		"#onetrust-reject-all-handler",
		"#CybotCookiebotDialogBodyButtonDecline",
		"#didomi-notice-disagree-button",
		".qc-cmp2-summary-buttons button:last-child",
		"[data-testid='uc-deny-all-button']",
		"#truste-consent-required",
		".klaro .cm-btn-decline",
	];

	const selectors = MODE === "reject" ? rejectSelectors : acceptSelectors;

	// Try platform-specific selectors first
	const hit = clickFirst(selectors);
	if (hit) return "dismissed (selector: " + hit + ")";

	// Try generic containers
	const genericSelectors = [
		"[class*='cookie' i]", "[class*='consent' i]", "[class*='gdpr' i]",
		"[id*='cookie' i]", "[id*='consent' i]", "[id*='gdpr' i]",
	];

	for (const sel of genericSelectors) {
		try {
			const containers = document.querySelectorAll(sel);
			for (const c of containers) {
				if (!isVisible(c)) continue;
				const found = clickByText(c, patterns);
				if (found) return "dismissed (text: " + found + ")";
			}
		} catch {}
	}

	// Global text-based fallback
	const found = clickByText(document, patterns);
	if (found) return "dismissed (text fallback: " + found + ")";

	return "no cookie dialog found";
})()
`;

try {
	const cdp = await connect({ port });
	const { sessionId } = await cdp.getActivePage();

	// Wait briefly for dialog to render
	await new Promise((r) => setTimeout(r, 500));

	const result = await cdp.evaluate(sessionId, dismissScript(mode));
	console.log(result);

	// Also try iframes (many CMPs use them)
	try {
		const frameTree = await cdp.getFrameTree(sessionId);
		const frames = [];
		const collect = (node) => {
			if (node.childFrames) {
				for (const child of node.childFrames) {
					frames.push(child.frame);
					collect(child);
				}
			}
		};
		collect(frameTree);

		for (const frame of frames) {
			try {
				const { executionContextId } = await cdp.send(
					"Page.createIsolatedWorld",
					{ frameId: frame.id, worldName: "cookie-dismiss" },
					sessionId,
				);
				const frameResult = await cdp.send(
					"Runtime.evaluate",
					{ expression: dismissScript(mode), contextId: executionContextId, returnByValue: true, awaitPromise: true },
					sessionId,
				);
				const val = frameResult.result?.value;
				if (val && !val.includes("no cookie dialog")) {
					console.log(`iframe(${frame.url?.slice(0, 60)}): ${val}`);
				}
			} catch {
				// Frame may have navigated
			}
		}
	} catch {
		// Frame tree may not be available
	}

	cdp.close();
} catch (e) {
	console.error(e.message);
	process.exit(1);
} finally {
	clearTimeout(globalTimeout);
	setTimeout(() => process.exit(0), 100);
}
