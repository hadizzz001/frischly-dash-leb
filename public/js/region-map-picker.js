/**
 * Single-pin OpenLayers map picker used on the Zones management page.
 * Third iteration: replaces MapLibre GL (which rendered only a green dot
 * with no basemap tiles visible inside the animated Zone modal) with
 * OpenLayers + raster OSM tiles, which is one of the most battle-tested
 * open-source map renderers and does not depend on WebGL/vector-style
 * loading the way MapLibre does.
 *
 * The user clicks the map to drop a center pin, then drags a small square
 * "radius handle" outward/inward to resize the coverage circle. The radius
 * (km) is derived purely from the distance between the center pin and the
 * handle — there is no manual numeric "Distance" textbox; callers should
 * display `radiusKm` read-only (e.g. "Coverage: 5.2 km").
 *
 * Usage:
 *   const picker = createSinglePinPicker({
 *     mapContainerId: "zone-map",
 *     center: [35.5018, 33.8938], // [lng, lat] Beirut default
 *     initialPin: { latitude, longitude, radiusKm },
 *     onChange: ({ latitude, longitude, radiusKm }) => { ... },
 *   });
 *   picker.setRadiusKm(7);
 *   picker.destroy();
 */
(function (global) {
	const EARTH_RADIUS_KM = 6371;

	function toRad(deg) {
		return (deg * Math.PI) / 180;
	}

	function haversineKm(lat1, lng1, lat2, lng2) {
		const dLat = toRad(lat2 - lat1);
		const dLng = toRad(lng2 - lng1);
		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return EARTH_RADIUS_KM * c;
	}

	// Returns a point `distanceKm` away from [lat,lng] at compass bearing (deg).
	function destinationPoint(lat, lng, distanceKm, bearingDeg) {
		const bearing = toRad(bearingDeg);
		const latR = toRad(lat);
		const lngR = toRad(lng);
		const d = distanceKm / EARTH_RADIUS_KM;
		const lat2 = Math.asin(
			Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(bearing)
		);
		const lng2 =
			lngR +
			Math.atan2(
				Math.sin(bearing) * Math.sin(d) * Math.cos(latR),
				Math.cos(d) - Math.sin(latR) * Math.sin(lat2)
			);
		return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
	}

	function circleLonLatRing(lat, lng, radiusKm, points) {
		const n = points || 64;
		const coords = [];
		for (let i = 0; i <= n; i++) {
			const bearing = (i * 360) / n;
			const p = destinationPoint(lat, lng, radiusKm, bearing);
			coords.push([p.lng, p.lat]);
		}
		return coords;
	}

	// Guards against NaN/Infinity or out-of-range coordinates, which can
	// happen if a map click/drag is registered before OpenLayers has computed
	// a valid pixel<->coordinate transform for the container (e.g. the very
	// first click right after switching into a CSS-hidden tab). A pin with
	// such a coordinate would otherwise be silently dropped by the server's
	// validation, making a freshly-placed pin look like it "didn't save".
	function isValidLatLng(lat, lng) {
		return (
			Number.isFinite(lat) &&
			Number.isFinite(lng) &&
			lat >= -90 &&
			lat <= 90 &&
			lng >= -180 &&
			lng <= 180
		);
	}

	function createSinglePinPicker(options) {
		const {
			mapContainerId,
			center = [35.5018, 33.8938], // [lng, lat] Beirut
			zoom = 12,
			initialPin = null,
			onChange = null,
		} = options;

		const mapEl = document.getElementById(mapContainerId);
		if (!mapEl) {
			console.error("[single-pin-picker] map container not found:", mapContainerId);
			return null;
		}
		if (typeof ol === "undefined") {
			console.error("[single-pin-picker] OpenLayers (ol) failed to load");
			mapEl.innerHTML =
				'<div class="map-load-error">Map library failed to load. Check your internet connection and reload the page.</div>';
			return null;
		}

		mapEl.innerHTML = "";

		let pin = initialPin
			? {
					latitude: initialPin.latitude,
					longitude: initialPin.longitude,
					radiusKm: initialPin.radiusKm || 5,
			  }
			: null;

		const startLonLat = pin ? [pin.longitude, pin.latitude] : center;

		const vectorSource = new ol.source.Vector();
		const vectorLayer = new ol.layer.Vector({
			source: vectorSource,
			style: new ol.style.Style({
				fill: new ol.style.Fill({ color: "rgba(40, 167, 69, 0.15)" }),
				stroke: new ol.style.Stroke({ color: "#28a745", width: 2 }),
			}),
		});

		const map = new ol.Map({
			target: mapEl,
			layers: [
				new ol.layer.Tile({ source: new ol.source.OSM() }),
				vectorLayer,
			],
			view: new ol.View({
				center: ol.proj.fromLonLat(startLonLat),
				zoom,
			}),
			controls: ol.control.defaults.defaults({ attribution: true }),
		});

		// Center pin + radius-handle rendered as absolutely-positioned DOM
		// overlays (dragged manually via pointer events) rather than OL
		// features, so styling/dragging behaves identically to the earlier
		// picker implementations.
		const centerEl = document.createElement("div");
		centerEl.style.cssText =
			"position:absolute;width:18px;height:18px;margin-left:-9px;margin-top:-9px;background:#28a745;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5);cursor:move;touch-action:none;";
		const centerOverlay = new ol.Overlay({
			element: centerEl,
			positioning: "center-center",
			stopEvent: true,
		});
		map.addOverlay(centerOverlay);

		const handleEl = document.createElement("div");
		handleEl.style.cssText =
			"position:absolute;width:14px;height:14px;margin-left:-7px;margin-top:-7px;background:#fff;border:3px solid #28a745;border-radius:3px;cursor:ew-resize;box-shadow:0 1px 3px rgba(0,0,0,0.4);touch-action:none;";
		const handleOverlay = new ol.Overlay({
			element: handleEl,
			positioning: "center-center",
			stopEvent: true,
		});
		map.addOverlay(handleOverlay);

		let circleFeature = null;

		function emitChange() {
			if (typeof onChange === "function" && pin) {
				onChange({ ...pin });
			}
		}

		function updateCircleFeature() {
			if (!pin) return;
			const ring = circleLonLatRing(pin.latitude, pin.longitude, pin.radiusKm).map((c) =>
				ol.proj.fromLonLat(c)
			);
			if (!circleFeature) {
				circleFeature = new ol.Feature({ geometry: new ol.geom.Polygon([ring]) });
				vectorSource.addFeature(circleFeature);
			} else {
				circleFeature.getGeometry().setCoordinates([ring]);
			}
		}

		function positionOverlays() {
			if (!pin) return;
			centerOverlay.setPosition(ol.proj.fromLonLat([pin.longitude, pin.latitude]));
			const handlePoint = destinationPoint(pin.latitude, pin.longitude, pin.radiusKm, 90);
			handleOverlay.setPosition(ol.proj.fromLonLat([handlePoint.lng, handlePoint.lat]));
		}

		function placePin(lat, lng) {
			pin = pin ? { ...pin, latitude: lat, longitude: lng } : { latitude: lat, longitude: lng, radiusKm: 5 };
			updateCircleFeature();
			positionOverlays();
			emitChange();
		}

		if (pin) {
			placePin(pin.latitude, pin.longitude);
		}

		map.on("click", (evt) => {
			const lonLat = ol.proj.toLonLat(evt.coordinate);
			const lng = lonLat[0];
			const lat = lonLat[1];
			if (!isValidLatLng(lat, lng)) {
				console.warn("[single-pin-picker] ignored click with invalid coordinate", { lat, lng });
				return;
			}
			placePin(lat, lng);
		});

		// --- Manual pointer-drag handling for the center pin & radius handle ---
		function makeDraggable(el, onMove) {
			let dragging = false;

			function toLonLat(clientX, clientY) {
				const rect = mapEl.getBoundingClientRect();
				const pixel = [clientX - rect.left, clientY - rect.top];
				const coordinate = map.getCoordinateFromPixel(pixel);
				if (!coordinate) return null;
				const lonLat = ol.proj.toLonLat(coordinate);
				return { lat: lonLat[1], lng: lonLat[0] };
			}

			function onPointerDown(e) {
				e.preventDefault();
				e.stopPropagation();
				dragging = true;
				window.addEventListener("pointermove", onPointerMove);
				window.addEventListener("pointerup", onPointerUp);
			}

			function onPointerMove(e) {
				if (!dragging) return;
				const ll = toLonLat(e.clientX, e.clientY);
				if (ll) onMove(ll.lat, ll.lng, false);
			}

			function onPointerUp(e) {
				if (!dragging) return;
				dragging = false;
				const ll = toLonLat(e.clientX, e.clientY);
				if (ll) onMove(ll.lat, ll.lng, true);
				window.removeEventListener("pointermove", onPointerMove);
				window.removeEventListener("pointerup", onPointerUp);
			}

			el.addEventListener("pointerdown", onPointerDown);
		}

		makeDraggable(centerEl, (lat, lng) => {
			if (!pin || !isValidLatLng(lat, lng)) return;
			pin.latitude = lat;
			pin.longitude = lng;
			updateCircleFeature();
			positionOverlays();
			emitChange();
		});

		makeDraggable(handleEl, (lat, lng) => {
			if (!pin || !isValidLatLng(lat, lng)) return;
			const km = haversineKm(pin.latitude, pin.longitude, lat, lng);
			pin.radiusKm = Math.max(0.2, Math.round(km * 10) / 10);
			updateCircleFeature();
			positionOverlays();
			emitChange();
		});

		// Forces the map to recompute its true rendered size, re-centers the
		// view on the current pin (guards against the view having been created
		// while the container was still 0x0, e.g. inside a modal that had just
		// been set to display:block), and re-positions the center/handle DOM
		// overlays so a previously-saved pin never appears to "vanish" after
		// the modal finishes laying out.
		function reposition() {
			map.updateSize();
			if (pin) {
				map.getView().setCenter(ol.proj.fromLonLat([pin.longitude, pin.latitude]));
				positionOverlays();
			}
		}

		let resizeObserver = null;
		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(() => {
				reposition();
			});
			resizeObserver.observe(mapEl);
		}
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				reposition();
			});
		});

		return {
			getPin: () => (pin ? { ...pin } : null),
			setRadiusKm: (km) => {
				if (!pin) return;
				pin.radiusKm = km;
				updateCircleFeature();
				positionOverlays();
				emitChange();
			},
			setPin: (newPin) => {
				if (!newPin) return;
				placePin(newPin.latitude, newPin.longitude);
				if (newPin.radiusKm) {
					pin.radiusKm = newPin.radiusKm;
					updateCircleFeature();
					positionOverlays();
				}
				map.getView().setCenter(ol.proj.fromLonLat([newPin.longitude, newPin.latitude]));
			},
			invalidateSize: () => reposition(),
			destroy: () => {
				if (resizeObserver) resizeObserver.disconnect();
				map.setTarget(null);
			},
		};
	}

	/**
	 * Multi-pin OpenLayers map picker used on the "Create/Edit Market" page.
	 * Same interaction model as createSinglePinPicker (click to drop a pin,
	 * drag a square handle to size its coverage circle), but supports an
	 * unlimited number of independent pin+radius regions at once — each pin
	 * gets its own draggable center dot, radius handle, and coverage circle,
	 * plus a small "×" remove button.
	 *
	 * Usage:
	 *   const picker = createMultiPinPicker({
	 *     mapContainerId: "market-map",
	 *     initialRegions: [{ latitude, longitude, radiusKm }, ...],
	 *     onChange: (regions) => { ... }, // called with the full array
	 *   });
	 *   picker.getRegions(); // -> [{ latitude, longitude, radiusKm }, ...]
	 *   picker.destroy();
	 */
	function createMultiPinPicker(options) {
		const {
			mapContainerId,
			center = [35.5018, 33.8938], // [lng, lat] Beirut
			zoom = 11,
			initialRegions = [],
			onChange = null,
		} = options;

		const mapEl = document.getElementById(mapContainerId);
		if (!mapEl) {
			console.error("[multi-pin-picker] map container not found:", mapContainerId);
			return null;
		}
		if (typeof ol === "undefined") {
			console.error("[multi-pin-picker] OpenLayers (ol) failed to load");
			mapEl.innerHTML =
				'<div class="map-load-error">Map library failed to load. Check your internet connection and reload the page.</div>';
			return null;
		}

		mapEl.innerHTML = "";

		// Each region: { id, latitude, longitude, radiusKm, feature, centerOverlay, handleOverlay, removeOverlay }
		let regions = [];
		let nextId = 1;

		const startCenter =
			Array.isArray(initialRegions) && initialRegions.length
				? [initialRegions[0].longitude, initialRegions[0].latitude]
				: center;

		const vectorSource = new ol.source.Vector();
		const vectorLayer = new ol.layer.Vector({
			source: vectorSource,
			style: new ol.style.Style({
				fill: new ol.style.Fill({ color: "rgba(40, 167, 69, 0.15)" }),
				stroke: new ol.style.Stroke({ color: "#28a745", width: 2 }),
			}),
		});

		const map = new ol.Map({
			target: mapEl,
			layers: [new ol.layer.Tile({ source: new ol.source.OSM() }), vectorLayer],
			view: new ol.View({ center: ol.proj.fromLonLat(startCenter), zoom }),
			controls: ol.control.defaults.defaults({ attribution: true }),
		});

		function emitChange() {
			if (typeof onChange === "function") {
				onChange(regions.map((r) => ({ latitude: r.latitude, longitude: r.longitude, radiusKm: r.radiusKm })));
			}
		}

		function updateCircleFeature(region) {
			const ring = circleLonLatRing(region.latitude, region.longitude, region.radiusKm).map((c) =>
				ol.proj.fromLonLat(c)
			);
			if (!region.feature) {
				region.feature = new ol.Feature({ geometry: new ol.geom.Polygon([ring]) });
				vectorSource.addFeature(region.feature);
			} else {
				region.feature.getGeometry().setCoordinates([ring]);
			}
		}

		function positionOverlays(region) {
			region.centerOverlay.setPosition(ol.proj.fromLonLat([region.longitude, region.latitude]));
			const handlePoint = destinationPoint(region.latitude, region.longitude, region.radiusKm, 90);
			region.handleOverlay.setPosition(ol.proj.fromLonLat([handlePoint.lng, handlePoint.lat]));
			const removePoint = destinationPoint(region.latitude, region.longitude, region.radiusKm, 315);
			region.removeOverlay.setPosition(ol.proj.fromLonLat([removePoint.lng, removePoint.lat]));
		}

		function makeDraggable(el, onMove) {
			let dragging = false;

			function toLonLat(clientX, clientY) {
				const rect = mapEl.getBoundingClientRect();
				const pixel = [clientX - rect.left, clientY - rect.top];
				const coordinate = map.getCoordinateFromPixel(pixel);
				if (!coordinate) return null;
				const lonLat = ol.proj.toLonLat(coordinate);
				return { lat: lonLat[1], lng: lonLat[0] };
			}

			function onPointerDown(e) {
				e.preventDefault();
				e.stopPropagation();
				dragging = true;
				window.addEventListener("pointermove", onPointerMove);
				window.addEventListener("pointerup", onPointerUp);
			}

			function onPointerMove(e) {
				if (!dragging) return;
				const ll = toLonLat(e.clientX, e.clientY);
				if (ll) onMove(ll.lat, ll.lng, false);
			}

			function onPointerUp(e) {
				if (!dragging) return;
				dragging = false;
				const ll = toLonLat(e.clientX, e.clientY);
				if (ll) onMove(ll.lat, ll.lng, true);
				window.removeEventListener("pointermove", onPointerMove);
				window.removeEventListener("pointerup", onPointerUp);
			}

			el.addEventListener("pointerdown", onPointerDown);
		}

		function removeRegion(region) {
			if (region.feature) vectorSource.removeFeature(region.feature);
			map.removeOverlay(region.centerOverlay);
			map.removeOverlay(region.handleOverlay);
			map.removeOverlay(region.removeOverlay);
			regions = regions.filter((r) => r.id !== region.id);
			emitChange();
		}

		function addRegion(latitude, longitude, radiusKm) {
			const region = {
				id: nextId++,
				latitude,
				longitude,
				radiusKm: radiusKm || 5,
				feature: null,
			};

			const centerEl = document.createElement("div");
			centerEl.style.cssText =
				"position:absolute;width:18px;height:18px;margin-left:-9px;margin-top:-9px;background:#28a745;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5);cursor:move;touch-action:none;";
			region.centerOverlay = new ol.Overlay({ element: centerEl, positioning: "center-center", stopEvent: true });
			map.addOverlay(region.centerOverlay);

			const handleEl = document.createElement("div");
			handleEl.style.cssText =
				"position:absolute;width:14px;height:14px;margin-left:-7px;margin-top:-7px;background:#fff;border:3px solid #28a745;border-radius:3px;cursor:ew-resize;box-shadow:0 1px 3px rgba(0,0,0,0.4);touch-action:none;";
			region.handleOverlay = new ol.Overlay({ element: handleEl, positioning: "center-center", stopEvent: true });
			map.addOverlay(region.handleOverlay);

			const removeEl = document.createElement("div");
			removeEl.textContent = "×";
			removeEl.title = "Remove this region";
			removeEl.style.cssText =
				"position:absolute;width:20px;height:20px;margin-left:-10px;margin-top:-10px;background:#dc3545;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.4);touch-action:none;user-select:none;";
			region.removeOverlay = new ol.Overlay({ element: removeEl, positioning: "center-center", stopEvent: true });
			map.addOverlay(region.removeOverlay);

			removeEl.addEventListener("pointerdown", (e) => {
				e.preventDefault();
				e.stopPropagation();
			});
			removeEl.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				removeRegion(region);
			});

			makeDraggable(centerEl, (lat, lng) => {
				if (!isValidLatLng(lat, lng)) return;
				region.latitude = lat;
				region.longitude = lng;
				updateCircleFeature(region);
				positionOverlays(region);
				emitChange();
			});

			makeDraggable(handleEl, (lat, lng) => {
				if (!isValidLatLng(lat, lng)) return;
				const km = haversineKm(region.latitude, region.longitude, lat, lng);
				region.radiusKm = Math.max(0.2, Math.round(km * 10) / 10);
				updateCircleFeature(region);
				positionOverlays(region);
				emitChange();
			});

			regions.push(region);
			updateCircleFeature(region);
			positionOverlays(region);
			emitChange();
			return region;
		}

		if (Array.isArray(initialRegions)) {
			initialRegions.forEach((r) => {
				if (
					typeof r.latitude === "number" &&
					typeof r.longitude === "number"
				) {
					addRegion(r.latitude, r.longitude, r.radiusKm || 5);
				}
			});
		}

		map.on("click", (evt) => {
			// Ignore clicks that landed on an overlay element (handled via stopEvent).
			const lonLat = ol.proj.toLonLat(evt.coordinate);
			const lng = lonLat[0];
			const lat = lonLat[1];
			if (!isValidLatLng(lat, lng)) {
				console.warn("[multi-pin-picker] ignored click with invalid coordinate", { lat, lng });
				return;
			}
			addRegion(lat, lng, 5);
		});

		// Same defensive re-render/re-position logic as the single-pin picker:
		// recompute the map's true size, re-center on the first region (if any),
		// and re-position every existing region's center/handle/remove overlays
		// so previously-saved pins never appear to disappear after the modal
		// finishes its layout/animation.
		//
		// IMPORTANT: also auto-fits the view to the saved region(s)' extent the
		// first time the map gets a real (non-zero) size. Without this, a
		// small saved radiusKm (e.g. 0.4 km) renders as a circle only a few
		// pixels wide at the fixed default zoom — small enough to be
		// completely hidden underneath the opaque 18px center pin marker,
		// making the green coverage circle look like it "isn't showing" even
		// though it was fetched from the DB correctly and is being drawn.
		let hasFitToRegions = false;
		function reposition() {
			map.updateSize();
			const size = map.getSize();
			const hasRealSize = size && size[0] > 0 && size[1] > 0;
			if (!hasFitToRegions && hasRealSize && regions.length) {
				const extent = vectorSource.getExtent();
				const isFiniteExtent =
					Array.isArray(extent) &&
					extent.every((n) => Number.isFinite(n)) &&
					extent[2] > extent[0] &&
					extent[3] > extent[1];
				if (isFiniteExtent) {
					map.getView().fit(extent, {
						size,
						padding: [60, 60, 60, 60],
						maxZoom: 17,
					});
					hasFitToRegions = true;
				} else if (regions.length) {
					// Degenerate extent (e.g. a single point with 0 radius) — just
					// center on the first region at a reasonably close zoom.
					map.getView().setCenter(
						ol.proj.fromLonLat([regions[0].longitude, regions[0].latitude])
					);
					map.getView().setZoom(15);
					hasFitToRegions = true;
				}
			} else if (regions.length) {
				map.getView().setCenter(
					ol.proj.fromLonLat([regions[0].longitude, regions[0].latitude])
				);
			}
			regions.forEach((r) => positionOverlays(r));
		}

		let resizeObserver = null;
		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(() => {
				reposition();
			});
			resizeObserver.observe(mapEl);
		}
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				reposition();
			});
		});

		return {
			getRegions: () =>
				regions
					.filter((r) => isValidLatLng(r.latitude, r.longitude) && Number.isFinite(r.radiusKm) && r.radiusKm > 0)
					.map((r) => ({ latitude: r.latitude, longitude: r.longitude, radiusKm: r.radiusKm })),
			clearAll: () => {
				[...regions].forEach((r) => removeRegion(r));
			},
			invalidateSize: () => reposition(),
			destroy: () => {
				if (resizeObserver) resizeObserver.disconnect();
				map.setTarget(null);
			},
		};
	}

	global.createSinglePinPicker = createSinglePinPicker;
	global.createMultiPinPicker = createMultiPinPicker;
})(window);
