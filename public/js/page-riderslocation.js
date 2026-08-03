
			let currentToken = localStorage.getItem("authToken");

			if (!currentToken) {
				window.location.href = "signin.html";
			}

			async function loadRidersLocations() {
				try {
					const response = await fetch(`${API_BASE_URL}/riders`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const data = await response.json();
						const riders = data.data.riders || [];
						displayRiders(riders);
					} else {
						console.error("Failed to load riders");
						document.getElementById("loading").innerHTML =
							'<p class="rlx-2">Failed to load riders data</p>';
					}
				} catch (error) {
					console.error("Error:", error);
					document.getElementById("loading").innerHTML =
						'<p class="rlx-2">Error loading data</p>';
				}
			}

			function displayRiders(riders) {
				const grid = document.getElementById("riders-grid");
				document.getElementById("loading").style.display = "none";

				if (!riders || riders.length === 0) {
					grid.innerHTML =
						'<p class="rlx-3">No riders found.</p>';
					return;
				}

				const seen = new Set();

				riders.forEach((rider) => {
					seen.add(rider._id);
					const statusClass = `status-${rider.status || "offline"}`;
					const name =
						(rider.userInfo && rider.userInfo.name) ||
						(rider.user && rider.user.name) ||
						"Unknown Rider";
					const phone =
						(rider.userInfo && rider.userInfo.phoneNumber) ||
						(rider.user && rider.user.phoneNumber) ||
						"N/A";

					let card = document.getElementById(`rider-card-${rider._id}`);
					if (!card) {
						card = document.createElement("div");
						card.className = "rider-card";
						card.id = `rider-card-${rider._id}`;
						card.innerHTML = `
							<div class="rider-header">
								<span class="rider-name">${name}</span>
								<span class="rider-status ${statusClass}">${rider.status || "Unknown"}</span>
							</div>
							<div class="map-container" id="map-${rider._id}">
								<div class="no-location">🟡 Locating…</div>
							</div>
							<div class="rider-info">
								<span>🚗 ${rider.vehicleType || "N/A"}</span>
								<span>📞 ${phone}</span>
							</div>
						`;
						grid.appendChild(card);
					} else {
						card.querySelector(".rider-name").textContent = name;
						const st = card.querySelector(".rider-status");
						st.textContent = rider.status || "Unknown";
						st.className = `rider-status ${statusClass}`;
					}

					resolveRiderLocation(rider).then((coords) => {
						const container = document.getElementById(`map-${rider._id}`);
						if (!container) return;
						if (!coords) {
							container.innerHTML =
								'<div class="no-location">Location data not available</div>';
							return;
						}
						renderOsmEmbed(container, coords, name);
					});
				});

				// Remove cards for riders no longer present
				Array.from(grid.querySelectorAll(".rider-card")).forEach((c) => {
					const id = c.id.replace("rider-card-", "");
					if (!seen.has(id)) c.remove();
				});
			}

			// ----- Geocoding (Nominatim) with localStorage cache -----
			const __GEO_CACHE_KEY = "frischly_geo_cache_v1";
			function __getGeoCache() {
				try {
					return JSON.parse(localStorage.getItem(__GEO_CACHE_KEY) || "{}");
				} catch {
					return {};
				}
			}
			function __setGeoCache(c) {
				try {
					localStorage.setItem(__GEO_CACHE_KEY, JSON.stringify(c));
				} catch {}
			}
			async function geocodeAddress(q) {
				if (!q) return null;
				const key = q.toLowerCase().trim();
				const cache = __getGeoCache();
				if (cache[key]) return cache[key];
				try {
					const r = await fetch(
						`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
							q
						)}`,
						{ headers: { Accept: "application/json" } }
					);
					const arr = await r.json();
					if (Array.isArray(arr) && arr.length) {
						const hit = {
							lat: parseFloat(arr[0].lat),
							lng: parseFloat(arr[0].lon),
						};
						cache[key] = hit;
						__setGeoCache(cache);
						return hit;
					}
				} catch (e) {
					console.warn("Geocode failed:", e);
				}
				return null;
			}

			async function resolveRiderLocation(rider) {
				if (
					rider.currentLocation &&
					isFinite(rider.currentLocation.latitude) &&
					isFinite(rider.currentLocation.longitude)
				) {
					return {
						lat: rider.currentLocation.latitude,
						lng: rider.currentLocation.longitude,
						source: "live",
					};
				}
				const u = rider.userInfo || rider.user || {};
				const addr = u.address || rider.address || {};
				const full = [
					addr.street,
					addr.city,
					addr.region,
					addr.country || "Lebanon",
				]
					.filter(Boolean)
					.join(", ");
				if (full) {
					const hit = await geocodeAddress(full);
					if (hit) return { ...hit, source: "address" };
				}
				if (addr.city) {
					const hit = await geocodeAddress(addr.city + ", Lebanon");
					if (hit) return { ...hit, source: "city" };
				}
				if (Array.isArray(rider.zones) && rider.zones.length) {
					const hit = await geocodeAddress(rider.zones[0] + ", Lebanon");
					if (hit) return { ...hit, source: "zone" };
				}
				return null;
			}

			// ----- Open-in-new-tab button (no inline embed) -----
			function renderOsmEmbed(container, coords, name) {
				const { lat, lng } = coords;
				const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
				const sourceLabel =
					coords.source === "live"
						? "🟢 Live"
						: coords.source === "address"
						? "📍 Last known address"
						: coords.source === "city"
						? "🏙️ City"
						: "📍 Service zone";

				container.innerHTML = `
					<div class="rlx-4">
						<div class="rlx-5">🗺️</div>
						<div class="rlx-6">${sourceLabel}</div>
						<div class="rlx-7">
							${lat.toFixed(5)}, ${lng.toFixed(5)}
						</div>
						<a href="${url}" target="_blank" rel="noopener"
						 class="rlx-8">
							🌍 Open Map in New Tab
						</a>
					</div>
				`;
			}

			// Load initially
			loadRidersLocations();

			// Refresh every 30 seconds
			setInterval(loadRidersLocations, 30000);

			function toggleFullscreen() {
				if (!document.fullscreenElement) {
					document.documentElement.requestFullscreen().catch((err) => {
						console.error(
							`Error attempting to enable fullscreen: ${err.message}`
						);
					});
				} else {
					if (document.exitFullscreen) {
						document.exitFullscreen();
					}
				}
			}

			// Update button text on fullscreen change
			document.addEventListener("fullscreenchange", () => {
				const btn = document.getElementById("fullscreenBtn");
				if (document.fullscreenElement) {
					btn.textContent = "⛶ Exit Fullscreen";
				} else {
					btn.textContent = "⛶ Fullscreen";
				}
			});
		