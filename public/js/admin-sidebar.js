/*
 * Freshly.lb — Shared admin sidebar for the standalone admin pages
 * (markets.html, market-manage.html, market-products.html, market-orders.html).
 * ---------------------------------------------------------------------------
 * These pages are admin-only (each one redirects non-admins), so they always
 * show the FULL admin menu — identical in items, order, labels and icons to the
 * main dashboard. This keeps the sidebar STATIC: it no longer changes shape as
 * you move between the dashboard and the market pages.
 *
 * Operational items navigate back to the dashboard SPA and open the matching
 * section via `/dashboard?section=XXX`. "Market Management" stays on `/markets`.
 * "Backup" triggers the dashboard's backup download via `/dashboard?action=backup`.
 *
 * Usage on a page:
 *   1. Put an empty list where the menu should go:
 *        <ul class="sidebar-menu" id="admin-sidebar-menu"></ul>
 *   2. Mark which item is active on the <body>:
 *        <body data-active-menu="markets">
 *   3. Include this script (after the body content is fine; it self-defers):
 *        <script src="js/admin-sidebar.js"></script>
 */
(function () {
	"use strict";

	// Canonical admin menu — MUST stay in sync with the dashboard sidebar.
	var MENU = [
		{ key: "users", icon: "👥", label: "Staff Management", section: "users" },
		{ key: "categories", icon: "📂", label: "Categories", section: "categories" },
		{ key: "products", icon: "📦", label: "Products", section: "products" },
		{ key: "markets", icon: "🏪", label: "Market Management", href: "/markets" },
		{ key: "orders", icon: "🛒", label: "Orders", section: "orders" },
		{ key: "statistics", icon: "📊", label: "Sales Statistics", section: "statistics" },
		{ key: "riders", icon: "🏍️", label: "Riders Management", section: "riders" },
		{ key: "waste", icon: "♻️", label: "Waste Management", section: "waste" },
		{ key: "promocodes", icon: "🏷️", label: "Promo Codes", section: "promocodes" },
		{ key: "announcements", icon: "📢", label: "Announcements", section: "announcements" },
		{ key: "kitchens", icon: "🍳", label: "For Kitchens", section: "kitchens" },
		{ key: "kitchencategories", icon: "🗂️", label: "Kitchen Categories", section: "kitchencategories" },
		{ key: "settings", icon: "⚙️", label: "Settings", section: "settings" },
		{ key: "profile", icon: "👤", label: "Profile", section: "profile" },
		{ key: "backup", icon: "💾", label: "Backup", href: "/dashboard?action=backup" },
	];

	function escapeHtml(s) {
		return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
		});
	}

	function render() {
		var container = document.getElementById("admin-sidebar-menu");
		if (!container) return;

		var active = (document.body.getAttribute("data-active-menu") || "").trim();

		var html = MENU.map(function (m) {
			var href = m.href ? m.href : "/dashboard?section=" + m.section;
			var isActive = active && active === m.key ? " active" : "";
			return (
				'<li class="menu-item' +
				isActive +
				'"><a href="' +
				href +
				'"><span class="menu-icon">' +
				m.icon +
				'</span><span class="menu-text">' +
				escapeHtml(m.label) +
				"</span></a></li>"
			);
		}).join("");

		// Sign Out always last; uses the page's own logout() if present.
		html +=
			'<li class="menu-item"><a href="#" onclick="if(window.logout){logout();}return false;">' +
			'<span class="menu-icon">🚪</span><span class="menu-text">Sign Out</span></a></li>';

		container.innerHTML = html;
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", render);
	} else {
		render();
	}
})();
