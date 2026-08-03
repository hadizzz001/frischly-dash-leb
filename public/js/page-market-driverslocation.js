
			const currentToken =
				localStorage.getItem("marketToken") ||
				localStorage.getItem("authToken");

			if (!currentToken) {
				window.location.href = "signin.html";
			}

			function freshness(lastUpdated, status) {
				if (!lastUpdated) {
					if (status) return { label: status, cls: "status-" + status };
					return { label: "offline", cls: "status-offline" };
				}
				const ageMs = Date.now() - new Date(lastUpdated).getTime();
				if (ageMs < 2 * 60 * 1000) return { label: "live", cls: "status-live" };
				if (ageMs < 30 * 60 * 1000) return { label: "stale", cls: "status-stale" };
				return { label: "offline", cls: "status-offline" };
			}

			async function loadDrivers() {
				try {
					const response = await fetch(`${API_BASE_URL}/market-admin/drivers`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});
					if (!response.ok) {
						document.getElementById("loading").innerHTML =
							'<p class="text-error-red">Failed to load drivers (HTTP ' +
							response.status + ").</p>";
						return;
					}
					const data = await response.json();
					renderDrivers(data.data || []);
				} catch (e) {
					console.error(e);
					document.getElementById("loading").innerHTML =
						'<p class="text-error-red">Error loading drivers.</p>';
				}
			}

			function renderDrivers(riders) {
				const grid = document.getElementById("drivers-grid");
				document.getElementById("loading").classList.add("hidden");
				grid.innerHTML = "";

				if (!riders.length) {
					grid.innerHTML =
						'<p class="no-drivers-message">No market drivers found.</p>';
					return;
				}

				riders.forEach((r) => {
					const u = r.user || {};
					const loc = r.currentLocation || {};
					const hasCoords =
						isFinite(loc.latitude) && isFinite(loc.longitude);
					const f = freshness(loc.lastUpdated, r.status);
					const card = document.createElement("div");
					card.className = "rider-card";

					let mapInner;
					if (hasCoords) {
						const url = `https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}#map=15/${loc.latitude}/${loc.longitude}`;
						mapInner = `
							<div class="map-coords-panel">
								<div class="map-coords-icon">🗺️</div>
								<div class="map-coords-text">
									${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}
								</div>
								<div class="map-coords-updated">
									Updated: ${loc.lastUpdated ? new Date(loc.lastUpdated).toLocaleString() : "—"}
								</div>
								<a href="${url}" target="_blank" rel="noopener"
									class="map-open-link">
									🌍 Open Map in New Tab
								</a>
							</div>
						`;
					} else {
						mapInner =
							'<div class="no-location">No location pushed yet.<br/>Driver must sign in to profile and tap “Enable Live Location”.</div>';
					}

					card.innerHTML = `
						<div class="rider-header">
							<span class="rider-name">${u.name || "Unnamed driver"}</span>
							<span class="rider-status ${f.cls}">${f.label}</span>
						</div>
						<div class="map-container">${mapInner}</div>
						<div class="rider-info">
							<span>🚗 ${r.vehicleType || "N/A"}${r.vehicleNumber ? " · " + r.vehicleNumber : ""}</span>
							<span>📞 ${u.phoneNumber || "N/A"}</span>
						</div>
					`;
					grid.appendChild(card);
				});
			}

			loadDrivers();
			setInterval(loadDrivers, 30000);
		