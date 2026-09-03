/**
 * Background sweep that keeps driver assignment fully hands-off.
 *
 * Orders are normally assigned the instant they become "ready for pickup"
 * (autoDriverAssignment.autoAssignDriverForOrder). That can legitimately fail —
 * every driver for the zone is offline, a zone has not been drawn yet, a driver
 * has not been given the zone. Those orders would then sit forever waiting for
 * somebody to press something.
 *
 * So this runs on a timer instead. Every tick it finds each tenant that has
 * orders waiting on a driver and drains what it can. Nothing to do is the
 * normal case and costs one indexed `distinct` query. The moment a driver comes
 * on shift or a zone is drawn, the backlog clears by itself within one tick.
 */

const {
	assignTenantBacklog,
	tenantsWithBacklog,
} = require("./autoDriverAssignment");
const { notifyCustomerOrderStatus } = require("./orderStatusNotification");

const DEFAULT_INTERVAL_MS = 60 * 1000;

let timer = null;
// Guards against overlapping runs: a slow sweep must never have a second one
// start on top of it, or two ticks could both try to claim the same order.
let running = false;
let stats = { ticks: 0, assigned: 0, lastRunAt: null, lastError: null };

const intervalMs = () => {
	const raw = Number(process.env.AUTO_ASSIGN_INTERVAL_MS);
	if (Number.isFinite(raw) && raw >= 5000) return raw;
	return DEFAULT_INTERVAL_MS;
};

/**
 * One pass over every tenant with pending work.
 * @returns {Promise<{assigned: number, failed: number, tenants: number}>}
 */
async function runAutoAssignSweep() {
	if (running) return { assigned: 0, failed: 0, tenants: 0, skipped: true };
	running = true;
	let assigned = 0;
	let failed = 0;
	let tenants = 0;
	try {
		const marketIds = await tenantsWithBacklog();
		tenants = marketIds.length;
		for (const marketId of marketIds) {
			const result = await assignTenantBacklog(marketId, {
				// Fire the same customer push the interactive paths send, so an
				// order dispatched by the sweep is indistinguishable from one
				// dispatched the moment it became ready.
				onDispatched: (order) =>
					notifyCustomerOrderStatus(order, order.status).catch((e) =>
						console.error("Auto-assign sweep notification failed:", e.message),
					),
			});
			assigned += result.assigned.length;
			failed += result.failed.length;
			result.assigned.forEach((a) =>
				console.log(
					`[auto-assign] ${a.orderNumber} → ${a.riderName} (${a.zoneName})${marketId ? ` [market ${marketId}]` : ""}`,
				),
			);
		}
		stats.ticks += 1;
		stats.assigned += assigned;
		stats.lastRunAt = new Date();
		stats.lastError = null;
	} catch (err) {
		// A failing sweep must never take the process down — it will simply try
		// again on the next tick.
		stats.lastError = err.message;
		console.error("[auto-assign] sweep failed:", err.message);
	} finally {
		running = false;
	}
	return { assigned, failed, tenants };
}

/** Start the timer. Safe to call once; a second call is ignored. */
function startAutoAssignScheduler() {
	if (timer) return timer;
	const ms = intervalMs();
	// unref() so the timer never holds the process open on shutdown.
	timer = setInterval(() => {
		runAutoAssignSweep();
	}, ms);
	if (typeof timer.unref === "function") timer.unref();
	console.log(`🚚 Auto-assign sweep running every ${Math.round(ms / 1000)}s`);
	// Run once shortly after boot so a restart drains any backlog immediately
	// rather than after a full interval.
	setTimeout(() => runAutoAssignSweep(), 5000).unref?.();
	return timer;
}

function stopAutoAssignScheduler() {
	if (timer) clearInterval(timer);
	timer = null;
}

const getAutoAssignStats = () => ({ ...stats, intervalMs: intervalMs(), running });

module.exports = {
	runAutoAssignSweep,
	startAutoAssignScheduler,
	stopAutoAssignScheduler,
	getAutoAssignStats,
};
