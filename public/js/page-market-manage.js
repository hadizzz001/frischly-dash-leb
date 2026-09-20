
		const API = (path) => `/api${path}`;
		const fmt = (n) => `$${Number(n||0).toFixed(2)}`;
		let currentToken = localStorage.getItem('authToken') || localStorage.getItem('token');
		let currentRefreshToken = localStorage.getItem('refreshToken');

		const params = new URLSearchParams(location.search);
		const marketId = params.get('id');

		function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
		function redirectToSignIn() { location.href = '/signin'; }
		function clearTokens() { currentToken = null; currentRefreshToken = null; localStorage.removeItem('authToken'); localStorage.removeItem('refreshToken'); localStorage.removeItem('token'); }
		function logout() { clearTokens(); location.href = '/signin'; }
		function authHeaders() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` }; }
		function toast(msg, isErr) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.toggle('error', !!isErr); t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }

		function updateTokens(token, refreshToken) {
			currentToken = token; currentRefreshToken = refreshToken;
			localStorage.setItem('authToken', token);
			if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
		}

		async function refreshAuthToken() {
			if (!currentRefreshToken) return null;
			try {
				const r = await fetch(API('/auth/refresh'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: currentRefreshToken }) });
				if (!r.ok) return null;
				const data = await r.json();
				updateTokens(data.data.token, data.data.refreshToken);
				return data.data.token;
			} catch { return null; }
		}

		async function authenticatedFetch(url, options = {}) {
			options.headers = { ...(options.headers || {}), ...authHeaders() };
			let response = await fetch(url, options);
			if (response.status === 401 && currentRefreshToken) {
				const newToken = await refreshAuthToken();
				if (newToken) {
					options.headers = { ...(options.headers || {}), ...authHeaders() };
					response = await fetch(url, options);
				}
			}
			return response;
		}

		async function requireAdminAccess() {
			if (!currentToken) {
				const t = await refreshAuthToken();
				if (!t) { clearTokens(); redirectToSignIn(); return false; }
			}
			try {
				const r = await authenticatedFetch(API('/auth/me'));
				if (r.status === 401) { clearTokens(); redirectToSignIn(); return false; }
				const data = await r.json();
				const user = data?.data?.user;
				if (!r.ok || user?.role !== 'admin') {
					// Route to a page this role can open. Market roles must NOT go to
					// /dashboard (it rejects them and forwards to sign-in, which
					// forwards back here — an infinite redirect loop).
					const marketRoles = ['market', 'market_manager', 'market_staff', 'market_driver'];
					const adminRoles = ['manager', 'rider', 'staff'];
					let destination = '/profile';
					if (marketRoles.includes(user?.role)) destination = '/market-dashboard';
					else if (adminRoles.includes(user?.role)) destination = '/dashboard';

					toast('Only main admins can access this page.', true);
					setTimeout(() => { location.replace(destination); }, 1500);
					return false;
				}
				return true;
			} catch { toast('Unable to verify admin access.', true); return false; }
		}

		async function loadMarket() {
			if (!marketId) { toast('Missing market id', true); setTimeout(() => location.href = '/markets', 1200); return; }
			try {
				const [mRes, sRes] = await Promise.all([
					authenticatedFetch(API(`/markets/${marketId}`)),
					authenticatedFetch(API(`/markets/${marketId}/stats`)),
				]);
				const mJson = await mRes.json();
				if (!mJson.success) throw new Error(mJson.message || 'Failed to load market');
				// GET /markets/:id answers { data: { market } } — the record is nested
				// under a named key. Passing mJson.data straight through hands the
				// renderer the WRAPPER, so every field reads undefined and the page
				// renders blank. /markets/:id/stats, by contrast, returns a bare object.
				const market = (mJson.data && mJson.data.market) || mJson.data;
				if (!market || !market._id) throw new Error('Market not found');
				renderMarket(market);

				const sJson = await sRes.json();
				if (sJson.success) renderStats(sJson.data || {});
			} catch (e) { toast(e.message, true); }
		}

		function renderMarket(m) {
			document.title = `${m.name} — Manage Market`;
			document.getElementById('headerName').textContent = m.name || '';

			const logoBox = document.getElementById('logoBox');
			if (m.logo) {
				logoBox.outerHTML = `<img id="logoBox" class="detail-logo" src="${escapeHtml(m.logo)}" alt="${escapeHtml(m.name)} logo" />`;
			}

			const fields = [
				['Name', m.name],
				['Username', m.username],
				['Email', m.email || '—'],
				['Phone', m.phoneNumber || '—'],
				['City', m.location?.city || '—'],
				['Status', `<span class="badge ${m.isActive ? 'active' : 'inactive'}">${m.isActive ? 'Active' : 'Inactive'}</span>`],
				['Created', m.createdAt ? new Date(m.createdAt).toLocaleString() : '—'],
				['Last login', m.lastLogin ? new Date(m.lastLogin).toLocaleString() : '—'],
				['Created by', m.createdBy?.name || '—'],
			];
			document.getElementById('detailGrid').innerHTML = fields.map(([l, v]) => `
				<div class="field"><span class="label">${escapeHtml(l)}</span><span class="value">${l === 'Status' ? v : escapeHtml(v)}</span></div>
			`).join('');

			document.getElementById('productsTab').href = `/market-products?id=${encodeURIComponent(marketId)}`;
			document.getElementById('ordersTab').href = `/market-orders?id=${encodeURIComponent(marketId)}`;
		}

		function renderStats(s) {
			document.getElementById('statsRow').innerHTML = [
				['Total items', s.totalItems ?? 0],
				['Active items', s.totalActiveItems ?? 0],
				['Total orders', s.totalOrders ?? 0],
				['Total sales', fmt(s.totalSales)],
			].map(([l, v]) => `<div class="stat"><div class="v">${escapeHtml(v)}</div><div class="l">${escapeHtml(l)}</div></div>`).join('');
		}

		// --- Drivers ---------------------------------------------------------------
		// GET /api/riders?market=<id> returns only this market's riders (the main
		// Riders Management page asks for ?scope=global and so never shows them).
		async function loadDrivers() {
			const body = document.getElementById('driversBody');
			const count = document.getElementById('driversCount');
			if (!body || !marketId) return;
			try {
				const r = await authenticatedFetch(API(`/riders?market=${encodeURIComponent(marketId)}&limit=200`));
				const json = await r.json();
				if (!r.ok || !json.success) throw new Error(json.message || 'Failed to load drivers');
				const riders = (json.data && json.data.riders) || [];
				count.textContent = `${riders.length} driver${riders.length === 1 ? '' : 's'}`;
				if (!riders.length) {
					body.innerHTML = '<tr class="empty-row"><td colspan="6">This market has no drivers yet.</td></tr>';
					return;
				}
				body.innerHTML = riders.map(renderDriverRow).join('');
			} catch (e) {
				count.textContent = '';
				body.innerHTML = `<tr class="empty-row"><td colspan="6">${escapeHtml(e.message)}</td></tr>`;
			}
		}

		function renderDriverRow(r) {
			const user = r.userInfo || r.user || {};
			const name = user.name || 'Unnamed driver';
			const email = user.email || '';
			const phone = user.phoneNumber || user.phone || '—';
			const zones = Array.isArray(r.zones) && r.zones.length ? r.zones.join(', ') : (r.zone || '—');
			const status = r.status || (r.isActive === false ? 'offline' : 'available');
			const vehicle = [r.vehicleType, r.vehicleNumber || r.vehiclePlate].filter(Boolean).join(' · ') || '—';
			const delivered = Number(r.ordersDeliveredCount || 0);
			const rating = typeof r.rating === 'number' ? r.rating : (r.rating && r.rating.average) || 0;
			return `
				<tr>
					<td>
						<div class="row" style="gap:10px;flex-wrap:nowrap">
							<span class="avatar">${escapeHtml(name.charAt(0).toUpperCase())}</span>
							<div>
								<div style="font-weight:600">${escapeHtml(name)}</div>
								${email ? `<div class="small">${escapeHtml(email)}</div>` : ''}
							</div>
						</div>
					</td>
					<td>${phone !== '—' ? `<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>` : '—'}</td>
					<td>${escapeHtml(vehicle)}</td>
					<td>${escapeHtml(zones)}</td>
					<td><span class="status-badge ${escapeHtml(String(status).toLowerCase())}">${escapeHtml(status)}</span></td>
					<td>${delivered}${rating ? ` <span class="small">· ${Number(rating).toFixed(1)} <i data-lucide=star class="star"></i></span>` : ''}</td>
				</tr>`;
		}

		(async function init() {
			if (await requireAdminAccess()) {
				loadMarket();
				loadDrivers();
			}
		})();
	