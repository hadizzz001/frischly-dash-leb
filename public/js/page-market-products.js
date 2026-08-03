
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
					// Send the user to a page their role can actually open. Market
					// roles must NOT be sent to /dashboard (which rejects them and
					// forwards to sign-in, which forwards back here — an infinite
					// redirect loop).
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
						document.getElementById('title').textContent = `📦 ${market.name} — Products`;
						document.title = `${market.name} — Products`;
					}
				}
			} catch {}
		}

		async function loadProducts() {
			const search = document.getElementById('searchInput').value.trim();
			const qs = new URLSearchParams({ market: marketId, page: currentPage, limit: 20 });
			if (search) qs.set('search', search);
			try {
				const r = await authenticatedFetch(API(`/products?${qs.toString()}`));
				const j = await r.json();
				if (!j.success) throw new Error(j.message || 'Failed to load products');
				renderProducts((j.data && j.data.products) || []);
				renderPagination((j.data && j.data.pagination) || {});
			} catch (e) { toast(e.message, true); }
		}

		function renderProducts(list) {
			const tbody = document.getElementById('tbody');
			if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">No products for this market.</td></tr>'; return; }
			tbody.innerHTML = list.map(p => {
				const img = p.image || (Array.isArray(p.images) && p.images[0]) || '';
				const cat = p.category?.name || p.category?.nameEn || (typeof p.category === 'string' ? p.category : '') || '—';
				const price = p.price ?? p.unitPrice ?? 0;
				const stock = p.stock ?? p.quantity ?? 0;
				const isActive = p.isActive !== false;
				return `
					<tr>
						<td>${img ? `<img class="thumb" src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" />` : '<span class="thumb placeholder">📦</span>'}</td>
						<td><strong>${escapeHtml(p.name || '')}</strong></td>
						<td>${escapeHtml(cat)}</td>
						<td>${fmt(price)}</td>
						<td>${escapeHtml(stock)}</td>
						<td><span class="badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span></td>
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

		function gotoPage(p) { currentPage = p; loadProducts(); }

		document.getElementById('searchInput').addEventListener('input', () => {
			clearTimeout(window.__sd); window.__sd = setTimeout(() => { currentPage = 1; loadProducts(); }, 300);
		});

		(async function init() {
			if (!marketId) { toast('Missing market id', true); setTimeout(() => location.href = '/markets', 1200); return; }
			document.getElementById('backLink').href = `/market-manage?id=${encodeURIComponent(marketId)}`;
			if (await requireAdminAccess()) { loadMarketHeader(); loadProducts(); }
		})();
	