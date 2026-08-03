
		const API = (path) => `/api${path}`;
		const fmt = (n) => `$${Number(n||0).toFixed(2)}`;
		let currentToken = localStorage.getItem('authToken') || localStorage.getItem('token');
		let currentRefreshToken = localStorage.getItem('refreshToken');
		const params = new URLSearchParams(location.search);
		const marketId = params.get('id');
		let currentPage = 1;

		function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
		function redirectToSignIn() { location.href = '/signin'; }
		function clearTokens() { currentToken = null; currentRefreshToken = null; localStorage.removeItem('authToken'); localStorage.removeItem('refreshToken'); localStorage.removeItem('token'); }
		function logout() { clearTokens(); location.href = '/signin'; }
		function authHeaders() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` }; }
		function toast(msg, isErr) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.toggle('error', !!isErr); t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
		function updateTokens(token, refreshToken) { currentToken = token; currentRefreshToken = refreshToken; localStorage.setItem('authToken', token); if (refreshToken) localStorage.setItem('refreshToken', refreshToken); }

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
				const t = await refreshAuthToken();
				if (t) { options.headers = { ...(options.headers || {}), ...authHeaders() }; response = await fetch(url, options); }
			}
			return response;
		}

		async function requireAdminAccess() {
			if (!currentToken) { const t = await refreshAuthToken(); if (!t) { clearTokens(); redirectToSignIn(); return false; } }
			try {
				const r = await authenticatedFetch(API('/auth/me'));
				if (r.status === 401) { clearTokens(); redirectToSignIn(); return false; }
				const data = await r.json();
				const user = data?.data?.user;
				setSidebarRoleBadge(user?.role);
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

		const ROLE_LABELS = {
			admin: 'Admin', manager: 'Manager', staff: 'Staff', rider: 'Rider',
			customer: 'Customer', market: 'Market Owner',
			market_manager: 'Market Manager', market_staff: 'Market Staff',
			market_driver: 'Market Driver',
		};
		function setSidebarRoleBadge(role) {
			const el = document.getElementById('sidebar-role-badge');
			if (!el || !role) return;
			el.textContent = ROLE_LABELS[role] || String(role).toUpperCase();
			el.className = 'sidebar-role-badge role-' + role;
			el.classList.remove('hidden');
		}

		async function loadMarketHeader() {
			try {
				const r = await authenticatedFetch(API(`/markets/${marketId}`));
				const j = await r.json();
				if (j.success) {
					const market = j.data && j.data.market;
					if (market) {
						document.getElementById('title').textContent = `🛒 ${market.name} — Orders`;
						document.title = `${market.name} — Orders`;
					}
				}
			} catch {}
		}

		async function loadOrders() {
			const status = document.getElementById('statusFilter').value;
			const qs = new URLSearchParams({ market: marketId, page: currentPage, limit: 20 });
			if (status) qs.set('status', status);
			try {
				const r = await authenticatedFetch(API(`/orders?${qs.toString()}`));
				const j = await r.json();
				if (!j.success) throw new Error(j.message || 'Failed to load orders');
				renderOrders((j.data && j.data.orders) || []);
				renderPagination((j.data && j.data.pagination) || {});
			} catch (e) { toast(e.message, true); }
		}

		function renderOrders(list) {
			const tbody = document.getElementById('tbody');
			if (!list.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">No orders for this market.</td></tr>'; return; }
			tbody.innerHTML = list.map(o => {
				const num = o.orderNumber || o._id?.slice(-6) || '—';
				const customer = o.customer?.name || o.user?.name || o.customerName || '—';
				const items = Array.isArray(o.items) ? o.items.length : (o.itemsCount ?? 0);
				const total = o.total ?? o.totalAmount ?? 0;
				const payment = o.paymentMethod || o.payment?.method || '—';
				const status = o.status || 'pending';
				const date = o.createdAt ? new Date(o.createdAt).toLocaleString() : '—';
				return `
					<tr>
						<td><code>#${escapeHtml(num)}</code></td>
						<td>${escapeHtml(customer)}</td>
						<td>${escapeHtml(items)}</td>
						<td>${fmt(total)}</td>
						<td>${escapeHtml(payment)}</td>
						<td><span class="badge ${escapeHtml(status)}">${escapeHtml(String(status).replace(/[-_]/g, ' '))}</span></td>
						<td>${escapeHtml(date)}</td>
					</tr>
				`;
			}).join('');
		}

		function renderPagination(p) {
			const total = p.totalPages || p.pages || 1;
			const cur = p.currentPage || p.page || currentPage;
			if (total <= 1) { document.getElementById('pagination').innerHTML = ''; return; }
			let html = `<button ${cur <= 1 ? 'disabled' : ''} onclick="gotoPage(${cur - 1})">‹ Prev</button>`;
			html += `<button class="active" disabled>Page ${cur} / ${total}</button>`;
			html += `<button ${cur >= total ? 'disabled' : ''} onclick="gotoPage(${cur + 1})">Next ›</button>`;
			document.getElementById('pagination').innerHTML = html;
		}

		function gotoPage(p) { currentPage = p; loadOrders(); }

		document.getElementById('statusFilter').addEventListener('change', () => { currentPage = 1; loadOrders(); });

		(async function init() {
			if (!marketId) { toast('Missing market id', true); setTimeout(() => location.href = '/markets', 1200); return; }
			document.getElementById('backLink').href = `/market-manage?id=${encodeURIComponent(marketId)}`;
			if (await requireAdminAccess()) { loadMarketHeader(); loadOrders(); }
		})();
	