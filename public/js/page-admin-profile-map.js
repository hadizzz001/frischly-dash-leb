
		const API = (path) => `${API_BASE_URL}${path}`;
		const token = localStorage.getItem('authToken');
		let picker = null;

		function closeMe() {
			// Works both as a standalone tab/window and embedded in an iframe:
			// tell the parent (if any) we're done, then try to close/go back.
			try { window.parent && window.parent.postMessage({ type: 'admin-profile-map:close' }, '*'); } catch (_) {}
			if (window.opener) { window.close(); return; }
			if (window.parent && window.parent !== window) return; // parent handles hiding the iframe
			history.back();
		}

		function toast(msg, isError) {
			const t = document.getElementById('toast');
			t.textContent = msg;
			t.className = 'toast show' + (isError ? ' error' : '');
			setTimeout(() => { t.className = 'toast'; }, 3000);
		}

		async function authedFetch(url, options = {}) {
			options.headers = Object.assign({}, options.headers, {
				Authorization: `Bearer ${token}`,
			});
			return fetch(url, options);
		}

		async function loadRegions() {
			const mapEl = document.getElementById('map');
			if (!token) {
				mapEl.innerHTML = '<div class="loading">Not signed in — please close this window and sign in again.</div>';
				return;
			}
			if (typeof createMultiPinPicker !== 'function') {
				mapEl.innerHTML = '<div class="loading">Map library failed to load. Check your internet connection and reload.</div>';
				return;
			}
			let initialRegions = [];
			try {
				const res = await authedFetch(API('/admin/settings'), { cache: 'no-store' });
				const j = await res.json().catch(() => ({}));
				if (res.status === 401) {
					mapEl.innerHTML = '<div class="loading">Session expired — please close this window and sign in again.</div>';
					return;
				}
				if (!res.ok || !j.success) {
					toast(j.message || 'Failed to load delivery coverage regions', true);
				} else {
					// /admin/settings answers { data: { settings: {...} } }, so
					// j.data.deliveryRegions was always undefined and the map opened
					// empty — saved pins looked like they had never been stored.
					const settings = objectFrom(j, 'settings');
					initialRegions = Array.isArray(settings.deliveryRegions) ? settings.deliveryRegions : [];
				}
			} catch (e) {
				console.warn('Failed to load delivery regions', e);
				toast('Failed to load delivery coverage regions', true);
			}
			picker = createMultiPinPicker({ mapContainerId: 'map', initialRegions });
		}

		async function submitRegions() {
			if (!picker) {
				toast('Map is not ready yet — please wait a moment and try again', true);
				return;
			}
			const deliveryRegions = picker.getRegions();
			try {
				const res = await authedFetch(API('/admin/settings'), {
					method: 'PUT',
					cache: 'no-store',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ deliveryRegions }),
				});
				const j = await res.json().catch(() => ({}));
				if (!res.ok || !j.success) {
					throw new Error(j.message || `Failed to save (HTTP ${res.status})`);
				}
				// Same wrapper as above: reading j.data.deliveryRegions reported 0
				// saved pins and wrongly warned that every pin was invalid.
				const savedSettings = objectFrom(j, 'settings');
				const savedRegions = Array.isArray(savedSettings.deliveryRegions) ? savedSettings.deliveryRegions : [];
				try { window.parent && window.parent.postMessage({ type: 'admin-profile-map:saved', deliveryRegions: savedRegions }, '*'); } catch (_) {}
				if (savedRegions.length !== deliveryRegions.length) {
					toast(`Saved ${savedRegions.length} of ${deliveryRegions.length} pin(s) — one or more pins were invalid and were not saved`, true);
				} else {
					toast('Delivery coverage regions updated', false);
				}
			} catch (e) {
				toast(e.message || 'Failed to save coverage regions', true);
			}
		}

		loadRegions();
	