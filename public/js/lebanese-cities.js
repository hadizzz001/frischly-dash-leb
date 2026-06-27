(function () {
	const cities = [
		"Beirut",
		"Tripoli",
		"Sidon",
		"Tyre",
		"Zahle",
		"Baalbek",
		"Byblos",
		"Jounieh",
		"Batroun",
		"Nabatieh",
		"Aley",
		"Baabda",
		"Bchamoun",
		"Broummana",
		"Choueifat",
		"Damour",
		"Dbayeh",
		"Dekwaneh",
		"Dora",
		"Ghaziyeh",
		"Halba",
		"Hazmieh",
		"Jezzine",
		"Jiyeh",
		"Kaslik",
		"Koura",
		"Mar Mikhael",
		"Mina",
		"Rashaya",
		"Saida",
		"Sour",
		"Verdun",
		"Zgharta",
	];

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	function renderLebaneseCityOptions(selectedCity) {
		const selected = selectedCity || "";
		return ["<option value=\"\">Select city</option>"]
			.concat(
				cities.map((city) => {
					const escapedCity = escapeHtml(city);
					const selectedAttr = city === selected ? " selected" : "";
					return `<option value="${escapedCity}"${selectedAttr}>${escapedCity}</option>`;
				})
			)
			.join("");
	}

	function populateLebaneseCitySelects(root) {
		const scope = root || document;
		scope
			.querySelectorAll("select[data-lebanese-city-select]")
			.forEach((select) => {
				const selected = select.value || select.dataset.value || "";
				select.innerHTML = renderLebaneseCityOptions(selected);
				if (selected) select.value = selected;
			});
	}

	/* ------------------------------------------------------------------ *
	 *  Multi-select dropdown (chips + searchable checkbox panel).
	 *  Lets the user pick several Lebanese cities. No external libraries.
	 *
	 *  Programmatic:
	 *      const api = createLebaneseCityMultiSelect(mountElOrId, {
	 *          selected: ["Beirut"], placeholder: "Select cities",
	 *          onChange: (arr) => {}
	 *      });
	 *      api.getSelected();           // -> ["Beirut", ...]
	 *      api.setSelected(["Tyre"]);   // replace selection
	 *
	 *  Declarative: any element with [data-lebanese-city-multiselect] is
	 *  auto-initialised; read/write via element._cityMultiSelect, or via
	 *  getLebaneseCityMultiSelect(idOrEl). Initial value can be supplied as a
	 *  comma-separated data-value="Beirut,Tyre".
	 * ------------------------------------------------------------------ */
	let stylesInjected = false;
	function injectStyles() {
		if (stylesInjected) return;
		stylesInjected = true;
		const css = `
		.lcms{position:relative;width:100%;font-size:14px;box-sizing:border-box;}
		.lcms *,.lcms *::before,.lcms *::after{box-sizing:border-box;}
		.lcms-control{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:42px;padding:6px 34px 6px 10px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;position:relative;}
		.lcms-control::after{content:"";position:absolute;right:14px;top:50%;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #888;transform:translateY(-50%);pointer-events:none;}
		.lcms.open .lcms-control{border-color:#f1c40f;box-shadow:0 0 0 2px rgba(241,196,15,.2);}
		.lcms-placeholder{color:#999;}
		.lcms-chip{display:inline-flex;align-items:center;gap:6px;background:#fff3cd;border:1px solid #ffe69c;color:#5b4b00;border-radius:14px;padding:2px 8px;font-size:12px;line-height:1.7;}
		.lcms-chip button{border:none;background:transparent;cursor:pointer;font-size:14px;line-height:1;color:#8a6d00;padding:0;margin:0;}
		.lcms-chip button:hover{color:#000;}
		.lcms-panel{position:absolute;z-index:100000;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.16);padding:8px;display:none;}
		.lcms.open .lcms-panel{display:block;}
		.lcms-search{width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;}
		.lcms-bar{display:flex;justify-content:space-between;margin-bottom:6px;}
		.lcms-bar button{border:none;background:transparent;color:#2563eb;cursor:pointer;font-size:12px;padding:2px 4px;}
		.lcms-bar button:hover{text-decoration:underline;}
		.lcms-list{max-height:220px;overflow-y:auto;}
		.lcms-option{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;cursor:pointer;}
		.lcms-option:hover{background:#f6f6f6;}
		.lcms-option input{width:16px;height:16px;margin:0;cursor:pointer;}
		.lcms-empty{padding:10px;color:#999;text-align:center;font-size:13px;}
		[dir="rtl"] .lcms-control{padding:6px 10px 6px 34px;}
		[dir="rtl"] .lcms-control::after{right:auto;left:14px;}
		[dir="rtl"] .lcms-panel,[dir="rtl"] .lcms-option{text-align:right;}
		`;
		const style = document.createElement("style");
		style.setAttribute("data-lcms-styles", "");
		style.textContent = css;
		document.head.appendChild(style);
	}

	// Keep only known cities, in the canonical list order, de-duplicated.
	function normalizeCities(arr) {
		const set = new Set(
			(Array.isArray(arr) ? arr : [])
				.map((s) => String(s == null ? "" : s).trim())
				.filter(Boolean)
		);
		return cities.filter((c) => set.has(c));
	}

	function createLebaneseCityMultiSelect(mount, options) {
		options = options || {};
		injectStyles();

		if (typeof mount === "string") {
			mount =
				document.getElementById(mount) || document.querySelector(mount);
		}
		if (!mount) return null;

		let selected = normalizeCities(options.selected || []);
		const placeholderText = options.placeholder || "Select cities";

		const root = document.createElement("div");
		root.className = "lcms";
		// City names are proper nouns and the panel is dynamic — keep the
		// runtime translator from touching it.
		root.setAttribute("data-no-translate", "");

		const control = document.createElement("div");
		control.className = "lcms-control";
		control.tabIndex = 0;
		control.setAttribute("role", "button");
		control.setAttribute("aria-haspopup", "listbox");
		control.setAttribute("aria-expanded", "false");

		const panel = document.createElement("div");
		panel.className = "lcms-panel";

		const search = document.createElement("input");
		search.type = "text";
		search.className = "lcms-search";
		search.placeholder = "Search cities…";

		const bar = document.createElement("div");
		bar.className = "lcms-bar";
		const selectAllBtn = document.createElement("button");
		selectAllBtn.type = "button";
		selectAllBtn.textContent = "Select all";
		const clearBtn = document.createElement("button");
		clearBtn.type = "button";
		clearBtn.textContent = "Clear";
		bar.appendChild(selectAllBtn);
		bar.appendChild(clearBtn);

		const list = document.createElement("div");
		list.className = "lcms-list";

		panel.appendChild(search);
		panel.appendChild(bar);
		panel.appendChild(list);
		root.appendChild(control);
		root.appendChild(panel);

		mount.innerHTML = "";
		mount.appendChild(root);

		function fireChange() {
			if (typeof options.onChange === "function") {
				try {
					options.onChange(getSelected());
				} catch (e) {
					/* ignore consumer errors */
				}
			}
		}

		function renderControl() {
			control.innerHTML = "";
			if (!selected.length) {
				const ph = document.createElement("span");
				ph.className = "lcms-placeholder";
				ph.textContent = placeholderText;
				control.appendChild(ph);
				return;
			}
			selected.forEach((city) => {
				const chip = document.createElement("span");
				chip.className = "lcms-chip";
				const label = document.createElement("span");
				label.textContent = city;
				const x = document.createElement("button");
				x.type = "button";
				x.setAttribute("aria-label", "Remove " + city);
				x.textContent = "×";
				x.addEventListener("click", (e) => {
					e.stopPropagation();
					toggle(city, false);
				});
				chip.appendChild(label);
				chip.appendChild(x);
				control.appendChild(chip);
			});
		}

		function renderList() {
			const q = search.value.trim().toLowerCase();
			const filtered = q
				? cities.filter((c) => c.toLowerCase().includes(q))
				: cities;
			list.innerHTML = "";
			if (!filtered.length) {
				const empty = document.createElement("div");
				empty.className = "lcms-empty";
				empty.textContent = "No cities found";
				list.appendChild(empty);
				return;
			}
			const chosen = new Set(selected);
			filtered.forEach((city) => {
				const row = document.createElement("label");
				row.className = "lcms-option";
				const cb = document.createElement("input");
				cb.type = "checkbox";
				cb.checked = chosen.has(city);
				cb.addEventListener("change", () => toggle(city, cb.checked));
				const span = document.createElement("span");
				span.textContent = city;
				row.appendChild(cb);
				row.appendChild(span);
				list.appendChild(row);
			});
		}

		function toggle(city, on) {
			const set = new Set(selected);
			if (on) set.add(city);
			else set.delete(city);
			selected = cities.filter((c) => set.has(c));
			renderControl();
			if (root.classList.contains("open")) renderList();
			fireChange();
		}

		function open() {
			if (root.classList.contains("open")) return;
			root.classList.add("open");
			control.setAttribute("aria-expanded", "true");
			renderList();
			setTimeout(() => search.focus(), 0);
		}
		function close() {
			if (!root.classList.contains("open")) return;
			root.classList.remove("open");
			control.setAttribute("aria-expanded", "false");
			search.value = "";
		}

		control.addEventListener("click", () =>
			root.classList.contains("open") ? close() : open()
		);
		control.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				root.classList.contains("open") ? close() : open();
			} else if (e.key === "Escape") {
				close();
			}
		});
		search.addEventListener("input", renderList);
		search.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				close();
				control.focus();
			}
		});
		selectAllBtn.addEventListener("click", (e) => {
			e.preventDefault();
			selected = cities.slice();
			renderControl();
			renderList();
			fireChange();
		});
		clearBtn.addEventListener("click", (e) => {
			e.preventDefault();
			selected = [];
			renderControl();
			renderList();
			fireChange();
		});
		// Close when clicking outside this component.
		document.addEventListener("click", (e) => {
			if (!root.contains(e.target)) close();
		});

		function getSelected() {
			return selected.slice();
		}
		function setSelected(arr) {
			selected = normalizeCities(arr || []);
			renderControl();
			if (root.classList.contains("open")) renderList();
		}

		renderControl();

		const api = {
			root,
			element: root,
			mount,
			getSelected,
			setSelected,
			open,
			close,
		};
		root._cityMultiSelect = api;
		mount._cityMultiSelect = api;
		return api;
	}

	function initLebaneseCityMultiSelects(root) {
		const scope = root || document;
		scope
			.querySelectorAll("[data-lebanese-city-multiselect]")
			.forEach((el) => {
				if (el._cityMultiSelect) return; // already initialised
				const value = el.getAttribute("data-value") || "";
				const initial = value
					? value.split(",").map((s) => s.trim()).filter(Boolean)
					: [];
				createLebaneseCityMultiSelect(el, {
					selected: initial,
					placeholder: el.getAttribute("data-placeholder") || "Select cities",
				});
			});
	}

	function getLebaneseCityMultiSelect(idOrEl) {
		const el =
			typeof idOrEl === "string"
				? document.getElementById(idOrEl) || document.querySelector(idOrEl)
				: idOrEl;
		return el ? el._cityMultiSelect || null : null;
	}

	window.LEBANESE_CITIES = cities;
	window.normalizeLebaneseCities = normalizeCities;
	window.renderLebaneseCityOptions = renderLebaneseCityOptions;
	window.populateLebaneseCitySelects = populateLebaneseCitySelects;
	window.createLebaneseCityMultiSelect = createLebaneseCityMultiSelect;
	window.initLebaneseCityMultiSelects = initLebaneseCityMultiSelects;
	window.getLebaneseCityMultiSelect = getLebaneseCityMultiSelect;

	function initAll() {
		populateLebaneseCitySelects();
		initLebaneseCityMultiSelects();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initAll);
	} else {
		initAll();
	}
})();
