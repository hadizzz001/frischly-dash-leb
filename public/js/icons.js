/*
 * Freshly.lb admin — lucide icon bootstrap.
 * ---------------------------------------------------------------------------
 * Every page marks icons as <i data-lucide="name"></i>. lucide.createIcons()
 * swaps them for inline SVGs. Because most of the dashboard is rendered from
 * JS templates AFTER load, a MutationObserver re-runs the swap whenever new
 * nodes appear. The swap is only triggered while un-rendered <i data-lucide>
 * elements exist, so replacing them never re-triggers itself.
 */
(function () {
	"use strict";

	function render() {
		if (!window.lucide || typeof window.lucide.createIcons !== "function") return;
		if (!document.querySelector("i[data-lucide]")) return;
		try {
			window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
		} catch (e) {
			/* never let an icon break a page */
		}
	}

	var timer = null;
	function schedule() {
		if (timer) return;
		timer = setTimeout(function () {
			timer = null;
			render();
		}, 50);
	}

	function start() {
		render();
		if (!("MutationObserver" in window) || !document.body) return;
		new MutationObserver(function (mutations) {
			for (var i = 0; i < mutations.length; i++) {
				if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
					schedule();
					return;
				}
			}
		}).observe(document.body, { childList: true, subtree: true });
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", start);
	} else {
		start();
	}

	// For code that wants to force a pass (e.g. right after a big innerHTML).
	window.renderIcons = render;
})();
