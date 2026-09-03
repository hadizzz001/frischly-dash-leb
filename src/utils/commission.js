// Platform commission: the share of a market's delivered product sales that the
// main store (Freshly.lb) keeps.
//
// The rate lives on each market as `Market.commissionRate` and is always a
// PERCENT (2 means 2%), never a fraction. Every helper here takes and returns
// percents so the unit never has to be inferred at a call site — the one place
// it becomes a fraction is inside commissionOn()/the aggregation `$divide`.

const DEFAULT_COMMISSION_RATE = 2;
const MAX_COMMISSION_RATE = 100;

/**
 * Normalise an incoming commission rate from a form field, JSON body or query
 * string (multipart FormData sends everything as a string).
 * @param {unknown} raw
 * @returns {number|null} A rate in [0, MAX_COMMISSION_RATE] rounded to 2
 *   decimals, or null when the value is absent or unusable — callers decide
 *   whether that means "leave unchanged" or "reject".
 */
const parseCommissionRate = (raw) => {
	if (raw === undefined || raw === null || raw === "") return null;
	const rate = Number(raw);
	if (!Number.isFinite(rate)) return null;
	if (rate < 0 || rate > MAX_COMMISSION_RATE) return null;
	return Math.round(rate * 100) / 100;
};

/**
 * The commission owed on `sales` at `rate` percent, rounded to cents.
 * @param {number} sales
 * @param {number} rate Percent (2 = 2%)
 * @returns {number}
 */
const commissionOn = (sales, rate) => {
	const amount = ((Number(sales) || 0) * (Number(rate) || 0)) / 100;
	return Math.round(amount * 100) / 100;
};

/**
 * The blended rate a set of per-market commissions works out to overall, so the
 * dashboard can label a mixed-rate total honestly instead of quoting one
 * market's rate. Weighted by sales, expressed as a percent.
 * @param {number} totalCommission
 * @param {number} totalSales
 * @returns {number}
 */
const effectiveRate = (totalCommission, totalSales) => {
	if (!totalSales) return 0;
	return Math.round((totalCommission / totalSales) * 100 * 100) / 100;
};

module.exports = {
	DEFAULT_COMMISSION_RATE,
	MAX_COMMISSION_RATE,
	parseCommissionRate,
	commissionOn,
	effectiveRate,
};
