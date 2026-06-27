/*
 * DOM-level test for the Lebanese city multi-select in public/js/lebanese-cities.js
 * (jsdom). Verifies declarative init, chip rendering, search filtering, toggle,
 * select-all/clear, the get/set API and the onChange callback.
 *
 *   node tests/_city-multiselect-check.js
 */
let JSDOM;
try {
	({ JSDOM } = require("jsdom"));
} catch (e) {
	console.log("SKIP: jsdom not installed (npm install --no-save jsdom)");
	process.exit(0);
}
const fs = require("fs");
const path = require("path");

let pass = 0,
	fail = 0;
const ok = (cond, msg) => {
	console.log((cond ? "  ✓ " : "  ✗ ") + msg);
	cond ? pass++ : fail++;
};

(async () => {
	const dom = new JSDOM(
		`<!doctype html><html><head></head><body>
		   <div id="m" data-lebanese-city-multiselect data-value="Beirut,Tyre" data-placeholder="Select cities"></div>
		 </body></html>`,
		{ url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true }
	);
	const { window } = dom;
	window.console = console;

	const code = fs.readFileSync(
		path.join(__dirname, "..", "public", "js", "lebanese-cities.js"),
		"utf8"
	);
	const s = window.document.createElement("script");
	s.textContent = code;
	window.document.body.appendChild(s);

	// In jsdom the script may load while readyState is still "loading", so the
	// IIFE defers init to DOMContentLoaded. Run the real declarative initializer
	// explicitly (idempotent) so the test doesn't race the event.
	if (window.initLebaneseCityMultiSelects) window.initLebaneseCityMultiSelects();

	const doc = window.document;
	const mount = doc.getElementById("m");

	ok(typeof window.createLebaneseCityMultiSelect === "function", "factory exposed");
	ok(typeof window.getLebaneseCityMultiSelect === "function", "getter exposed");
	ok(Array.isArray(window.LEBANESE_CITIES) && window.LEBANESE_CITIES.length > 10, "cities list exposed");

	const api = window.getLebaneseCityMultiSelect("m");
	ok(!!api, "declarative init created an instance");

	// Initial value parsed from data-value (canonical list order → Beirut before Tyre)
	ok(JSON.stringify(api.getSelected()) === JSON.stringify(["Beirut", "Tyre"]), "initial data-value applied");

	// Chips rendered for the two selected cities
	let chips = mount.querySelectorAll(".lcms-chip");
	ok(chips.length === 2, "two chips rendered");

	// Open panel and verify checkboxes reflect selection
	api.open();
	ok(mount.querySelector(".lcms").classList.contains("open"), "panel opens");
	const beirutRow = [...mount.querySelectorAll(".lcms-option")].find(
		(r) => r.textContent.trim() === "Beirut"
	);
	ok(beirutRow && beirutRow.querySelector("input").checked, "Beirut checkbox checked");

	// Search filters the list
	const search = mount.querySelector(".lcms-search");
	search.value = "trip";
	search.dispatchEvent(new window.Event("input"));
	const visible = [...mount.querySelectorAll(".lcms-option")].map((r) => r.textContent.trim());
	ok(visible.length === 1 && visible[0] === "Tripoli", "search filters to Tripoli");

	// Toggling a checkbox updates selection + fires onChange
	let changes = 0;
	let lastChange = null;
	// re-create with an onChange to test the callback path
	const api2 = window.createLebaneseCityMultiSelect(mount, {
		selected: ["Sidon"],
		placeholder: "Select cities",
		onChange: (arr) => {
			changes++;
			lastChange = arr;
		},
	});
	api2.open();
	const tyreRow = [...mount.querySelectorAll(".lcms-option")].find(
		(r) => r.textContent.trim() === "Tyre"
	);
	const cb = tyreRow.querySelector("input");
	cb.checked = true;
	cb.dispatchEvent(new window.Event("change"));
	ok(changes === 1, "onChange fired once on toggle");
	ok(lastChange && lastChange.includes("Tyre") && lastChange.includes("Sidon"), "onChange payload includes both cities");

	// setSelected replaces selection and re-renders chips
	api2.setSelected(["Beirut", "Aley", "NotACity"]);
	ok(JSON.stringify(api2.getSelected()) === JSON.stringify(["Beirut", "Aley"]), "setSelected normalizes + drops unknown");
	chips = mount.querySelectorAll(".lcms-chip");
	ok(chips.length === 2, "chips re-rendered after setSelected");

	// Select all / clear
	const [selectAll, clear] = mount.querySelectorAll(".lcms-bar button");
	selectAll.dispatchEvent(new window.Event("click"));
	ok(api2.getSelected().length === window.LEBANESE_CITIES.length, "select-all selects every city");
	clear.dispatchEvent(new window.Event("click"));
	ok(api2.getSelected().length === 0, "clear empties the selection");
	ok(mount.querySelector(".lcms-placeholder"), "placeholder shown when empty");

	// data-no-translate guard present (so the runtime translator skips it)
	ok(mount.querySelector(".lcms").hasAttribute("data-no-translate"), "root marked data-no-translate");

	console.log(`\n=== ${pass} passed, ${fail} failed ===`);
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
