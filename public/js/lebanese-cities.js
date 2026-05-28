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

	window.LEBANESE_CITIES = cities;
	window.renderLebaneseCityOptions = renderLebaneseCityOptions;
	window.populateLebaneseCitySelects = populateLebaneseCitySelects;

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => populateLebaneseCitySelects());
	} else {
		populateLebaneseCitySelects();
	}
})();
