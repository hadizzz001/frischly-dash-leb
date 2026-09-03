
		const API = (path) => `/api${path}`;
		let currentToken = localStorage.getItem('authToken') || localStorage.getItem('token');
		let currentRefreshToken = localStorage.getItem('refreshToken');
		const fmt = (n) => `$${Number(n||0).toFixed(2)}`;
		// Commission is a percent (2 = 2%). Markets saved before the field
		// existed send no value at all, so every read falls back to the same
		// default the server applies rather than showing 0%.
		const DEFAULT_COMMISSION_RATE = 2;
		const rateOf = (m) => (Number.isFinite(Number(m && m.commissionRate)) && m.commissionRate !== null && m.commissionRate !== '' ? Number(m.commissionRate) : DEFAULT_COMMISSION_RATE);
		const fmtRate = (n) => `${Number(n).toFixed(2).replace(/\.?0+$/, '')}%`;

		function redirectToSignIn() { location.href = '/signin'; }

		function updateTokens(token, refreshToken) {
			currentToken = token;
			currentRefreshToken = refreshToken;
			localStorage.setItem('authToken', token);
			if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
		}

		function clearTokens() {
			currentToken = null;
			currentRefreshToken = null;
			localStorage.removeItem('authToken');
			localStorage.removeItem('refreshToken');
			localStorage.removeItem('token');
		}

		function logout() {
			clearTokens();
			location.href = '/signin';
		}

		function authHeaders() {
			return { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` };
		}

		function authorizationHeaders() {
			return { Authorization: `Bearer ${currentToken}` };
		}

		async function refreshAuthToken() {
			if (!currentRefreshToken) return null;

			try {
				const response = await fetch(API('/auth/refresh'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ refreshToken: currentRefreshToken }),
				});

				if (!response.ok) return null;

				const data = await response.json();
				updateTokens(data.data.token, data.data.refreshToken);
				return data.data.token;
			} catch (error) {
				return null;
			}
		}

		async function authenticatedFetch(url, options = {}) {
			const isFormData = options.body instanceof FormData;
			options.headers = {
				...(options.headers || {}),
				...(isFormData ? authorizationHeaders() : authHeaders()),
			};
			let response = await fetch(url, options);

			if (response.status === 401 && currentRefreshToken) {
				const newToken = await refreshAuthToken();
				if (newToken) {
					options.headers = {
						...(options.headers || {}),
						...(isFormData ? authorizationHeaders() : authHeaders()),
					};
					response = await fetch(url, options);
				}
			}

			return response;
		}

		async function requireAdminAccess() {
			if (!currentToken) {
				const newToken = await refreshAuthToken();
				if (!newToken) {
					clearTokens();
					redirectToSignIn();
					return false;
				}
			}

			try {
				const response = await authenticatedFetch(API('/auth/me'));
				if (response.status === 401) {
					clearTokens();
					redirectToSignIn();
					return false;
				}

				const data = await response.json();
				const user = data?.data?.user;
				if (!response.ok || user?.role !== 'admin') {
						// Route to a page this role can open. Market roles must NOT go
						// to /dashboard (it rejects them and forwards to sign-in, which
						// forwards back here — an infinite redirect loop).
						const marketRoles = ['market', 'market_manager', 'market_staff', 'market_driver'];
						const adminRoles = ['manager', 'rider', 'staff'];
						let destination = '/profile';
						if (marketRoles.includes(user?.role)) destination = '/market-dashboard';
						else if (adminRoles.includes(user?.role)) destination = '/dashboard';

						toast('Only main admins can access Market Management.', true);
						setTimeout(() => { location.replace(destination); }, 1500);
				}

				return true;
			} catch (error) {
				toast('Unable to verify admin access.', true);
				return false;
			}
		}

		function toast(msg, isErr) {
			const t = document.getElementById('toast');
			t.textContent = msg; t.classList.toggle('error', !!isErr); t.classList.add('show');
			setTimeout(() => t.classList.remove('show'), 2500);
		}

		function populateCityMultiSelect() {
			if (window.initLebaneseCityMultiSelects) window.initLebaneseCityMultiSelects();
		}

		async function loadMarkets() {
			const search = document.getElementById('searchInput').value.trim();
			const url = API(`/markets?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`);
			try {
				const r = await authenticatedFetch(url);
				const j = await r.json();
				if (!j.success) throw new Error(j.message);
				renderMarkets((j.data && j.data.markets) || []);
			} catch (e) { toast(e.message, true); }
		}

		function renderMarkets(list) {
			const tbody = document.getElementById('tbody');
			if (!list.length) { tbody.innerHTML = '<tr><td colspan="10" class="empty">No markets yet.</td></tr>'; return; }
			window.__marketsById = {};
			tbody.innerHTML = list.map(m => {
				window.__marketsById[m._id] = m;
				const archiveBtn = m.isActive
					? `<button class="btn small danger" onclick="archiveMarket('${m._id}')">Archive</button>`
					: `<button class="btn small" onclick="activateMarket('${m._id}')">Activate</button>`;
				return `
				<tr>
					<td class="col-logo">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="${escapeHtml(m.name)} logo" class="logo-cell" />` : '<span class="logo-placeholder">🏪</span>'}</td>
					<td class="col-name"><span class="market-name">${escapeHtml(m.name)}</span></td>
					<td class="col-username"><span class="market-username">${escapeHtml(m.username)}</span></td>
					<td>${escapeHtml((m.cities && m.cities.length ? m.cities.join(', ') : (m.location?.city || '—')))}</td>
					<td class="col-num">${m.totalItems ?? 0}</td>
					<td class="col-num">${fmt(m.totalSales)}</td>
					<td class="col-num">${m.totalOrders ?? 0}</td>
					<td class="col-num">${fmtRate(rateOf(m))}</td>
					<td><span class="badge ${m.isActive ? 'active' : 'inactive'}">${m.isActive ? 'Active' : 'Inactive'}</span></td>
					<td class="col-actions">
						<div class="action-group">
							<button class="btn small secondary" onclick="viewMarket('${m._id}')">View</button>
							<button class="btn small" onclick="editMarket('${m._id}')">Edit</button>
							${archiveBtn}
						</div>
					</td>
				</tr>
			`;
			}).join('');
		}

		function viewMarket(id) {
			location.href = `/market-manage?id=${encodeURIComponent(id)}`;
		}

		function editMarket(id) {
			const m = window.__marketsById ? window.__marketsById[id] : null;
			if (!m) { toast('Market not found', true); return; }
			openEdit(JSON.stringify(m));
		}

		async function archiveMarket(id) {
			if (!confirm('Archive this market? It will be deactivated along with all of its products. You can reactivate it later — it will not be permanently deleted.')) return;
			try {
				const r = await authenticatedFetch(API(`/markets/${id}`), { method: 'DELETE' });
				const j = await r.json();
				if (!j.success) throw new Error(j.message);
				toast('Market archived'); loadMarkets();
			} catch (e) { toast(e.message, true); }
		}

		function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

		function openCreate() {
			document.getElementById('modalTitle').textContent = 'Add Market';
			document.getElementById('form').reset();
			document.getElementById('m_id').value = '';
			document.getElementById('m_password').required = true;
			document.getElementById('m_commission').value = DEFAULT_COMMISSION_RATE;
			const citiesApi = window.getLebaneseCityMultiSelect && window.getLebaneseCityMultiSelect('m_cities');
			if (citiesApi) citiesApi.setSelected([]);
			setLogoPreview('');
			document.getElementById('modal').classList.add('show');
			initMarketMapPicker([]);
		}

		function openEdit(jsonStr) {
			const m = JSON.parse(jsonStr);
			document.getElementById('modalTitle').textContent = 'Edit Market';
			document.getElementById('m_id').value = m._id;
			document.getElementById('m_name').value = m.name || '';
			document.getElementById('m_username').value = m.username || '';
			document.getElementById('m_password').value = '';
			document.getElementById('m_password').required = false;
			document.getElementById('m_email').value = m.email || '';
			document.getElementById('m_phone').value = m.phoneNumber || '';
			document.getElementById('m_commission').value = rateOf(m);
			const citiesApi = window.getLebaneseCityMultiSelect && window.getLebaneseCityMultiSelect('m_cities');
			if (citiesApi) {
				const initial = (Array.isArray(m.cities) && m.cities.length)
					? m.cities
					: (m.location?.city ? [m.location.city] : []);
				citiesApi.setSelected(initial);
			}
			document.getElementById('m_logo').value = '';
			setLogoPreview(m.logo || '');
			document.getElementById('modal').classList.add('show');
			initMarketMapPicker(Array.isArray(m.deliveryRegions) ? m.deliveryRegions : []);
		}

		function closeModal() {
			document.getElementById('modal').classList.remove('show');
			if (window.__marketMapPicker) {
				window.__marketMapPicker.destroy();
				window.__marketMapPicker = null;
			}
		}

		function initMarketMapPicker(initialRegions) {
			if (window.__marketMapPicker) {
				window.__marketMapPicker.destroy();
				window.__marketMapPicker = null;
			}
			if (typeof createMultiPinPicker !== 'function') return;
			window.__marketMapPicker = createMultiPinPicker({
				mapContainerId: 'm_map',
				initialRegions: initialRegions || [],
			});
			// Extra safety net: force a resize/re-center/re-position shortly after
			// the fullscreen modal finishes laying out (and again a couple more
			// times to survive any CSS transition), so previously-saved pins
			// never appear mis-sized, mispositioned, or missing.
			[100, 300, 600].forEach((delay) => {
				setTimeout(() => {
					if (window.__marketMapPicker) window.__marketMapPicker.invalidateSize();
				}, delay);
			});
		}

		function setLogoPreview(src) {
			const preview = document.getElementById('m_logo_preview');
			if (!src) {
				preview.style.display = 'none';
				preview.removeAttribute('src');
				return;
			}
			preview.src = src;
			preview.style.display = 'block';
		}

		async function submitForm() {
			const id = document.getElementById('m_id').value;
			const name = document.getElementById('m_name').value.trim();
			const username = document.getElementById('m_username').value.trim();
			const pwd = document.getElementById('m_password').value.trim();
			const citiesApi = window.getLebaneseCityMultiSelect && window.getLebaneseCityMultiSelect('m_cities');
			const cities = citiesApi ? citiesApi.getSelected() : [];
			const city = cities[0] || '';
			const missingFields = [];
			if (!name) missingFields.push('market name');
			if (!username) missingFields.push('username');
			if (!cities.length) missingFields.push('city');
			if (!id && !pwd) missingFields.push('password');
			if (missingFields.length) {
				toast(`Missing required field${missingFields.length > 1 ? 's' : ''}: ${missingFields.join(', ')}`, true);
				return;
			}
			if (!id && pwd.length < 6) {
				toast('Password must be at least 6 characters', true);
				return;
			}
			// Blank means "leave it alone" (the server keeps the stored value, or
			// applies the default on create); anything else must be a real 0-100.
			const commissionRaw = document.getElementById('m_commission').value.trim();
			if (commissionRaw !== '') {
				const rate = Number(commissionRaw);
				if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
					toast('Commission rate must be a number between 0 and 100', true);
					return;
				}
			}

			const body = new FormData();
			body.append('name', name);
			body.append('username', username);
			body.append('location', JSON.stringify({
				city,
			}));
			body.append('cities', JSON.stringify(cities));
			const deliveryRegions = window.__marketMapPicker ? window.__marketMapPicker.getRegions() : [];
			body.append('deliveryRegions', JSON.stringify(deliveryRegions));
			const email = document.getElementById('m_email').value;
			const phone = document.getElementById('m_phone').value;
			const logoFile = document.getElementById('m_logo').files[0];
			if (commissionRaw !== '') body.append('commissionRate', commissionRaw);
			if (email) body.append('email', email);
			if (phone) body.append('phoneNumber', phone);
			if (logoFile) body.append('logo', logoFile);
			if (pwd) body.append('password', pwd);
			try {
				const url = id ? API(`/markets/${id}`) : API('/markets');
				const method = id ? 'PUT' : 'POST';
				const r = await authenticatedFetch(url, { method, body });
				const j = await r.json();
				if (!j.success) {
					console.error('Market save failed:', j);
					throw new Error(j.message || j.error || 'Market save failed');
				}
				toast(id ? 'Market updated' : 'Market created');
				closeModal();
				loadMarkets();
			} catch (e) { toast(e.message, true); }
		}

		async function activateMarket(id) {
			if (!confirm('Reactivate this market?')) return;
			try {
				const body = new FormData();
				body.append('isActive', 'true');
				const r = await authenticatedFetch(API(`/markets/${id}`), {
					method: 'PUT',
					body,
				});
				const j = await r.json();
				if (!j.success) throw new Error(j.message);
				toast('Market activated'); loadMarkets();
			} catch (e) { toast(e.message, true); }
		}

		document.getElementById('searchInput').addEventListener('input', () => {
			clearTimeout(window.__sd); window.__sd = setTimeout(loadMarkets, 300);
		});

		document.getElementById('m_logo').addEventListener('change', (event) => {
			const file = event.target.files[0];
			if (!file) {
				setLogoPreview('');
				return;
			}
			const reader = new FileReader();
			reader.onload = () => setLogoPreview(reader.result);
			reader.onerror = () => {
				setLogoPreview('');
				toast('Could not preview selected logo.', true);
			};
			reader.readAsDataURL(file);
		});


		async function initMarketsPage() {
			populateCityMultiSelect();
			if (await requireAdminAccess()) loadMarkets();
		}

		initMarketsPage();
	