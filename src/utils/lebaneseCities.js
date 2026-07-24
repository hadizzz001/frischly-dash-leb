/**
 * Approximate lat/lng coordinates for the Lebanese cities offered in the
 * customer address city selector (see public/js/lebanese-cities.js).
 * Used server-side to resolve an order's delivery city to a point so we can
 * check it against a driver's delivery region pins (map pin + radius).
 */

const CITY_COORDS = {
	Beirut: { lat: 33.8938, lng: 35.5018 },
	Tripoli: { lat: 34.4367, lng: 35.8497 },
	Sidon: { lat: 33.5606, lng: 35.3758 },
	Tyre: { lat: 33.2704, lng: 35.2038 },
	Zahle: { lat: 33.8463, lng: 35.9019 },
	Baalbek: { lat: 34.0059, lng: 36.2181 },
	Byblos: { lat: 34.1208, lng: 35.6481 },
	Jounieh: { lat: 33.9808, lng: 35.6178 },
	Batroun: { lat: 34.2554, lng: 35.6581 },
	Nabatieh: { lat: 33.3789, lng: 35.4839 },
	Aley: { lat: 33.8047, lng: 35.6019 },
	Baabda: { lat: 33.8342, lng: 35.5442 },
	Bchamoun: { lat: 33.8103, lng: 35.4969 },
	Broummana: { lat: 33.8828, lng: 35.6197 },
	Choueifat: { lat: 33.8175, lng: 35.4808 },
	Damour: { lat: 33.7311, lng: 35.4519 },
	Dbayeh: { lat: 33.9481, lng: 35.5928 },
	Dekwaneh: { lat: 33.8794, lng: 35.5486 },
	Dora: { lat: 33.8886, lng: 35.5406 },
	Ghaziyeh: { lat: 33.5233, lng: 35.3608 },
	Halba: { lat: 34.5439, lng: 36.0808 },
	Hazmieh: { lat: 33.8531, lng: 35.5453 },
	Jezzine: { lat: 33.5433, lng: 35.5836 },
	Jiyeh: { lat: 33.6683, lng: 35.4231 },
	Kaslik: { lat: 33.9797, lng: 35.6136 },
	Koura: { lat: 34.2833, lng: 35.85 },
	"Mar Mikhael": { lat: 33.8961, lng: 35.5253 },
	Mina: { lat: 34.4483, lng: 35.8258 },
	Rashaya: { lat: 33.5017, lng: 35.85 },
	Saida: { lat: 33.5606, lng: 35.3758 },
	Sour: { lat: 33.2704, lng: 35.2038 },
	Verdun: { lat: 33.8811, lng: 35.4808 },
	Zgharta: { lat: 34.3986, lng: 35.8961 },
};

function getCityCoords(cityName) {
	if (!cityName) return null;
	const trimmed = String(cityName).trim();
	if (CITY_COORDS[trimmed]) return CITY_COORDS[trimmed];
	// Case-insensitive fallback lookup
	const match = Object.keys(CITY_COORDS).find(
		(key) => key.toLowerCase() === trimmed.toLowerCase()
	);
	return match ? CITY_COORDS[match] : null;
}

module.exports = { CITY_COORDS, getCityCoords };
