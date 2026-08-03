
		const API = (path) => `/api${path}`;
		const STORAGE_KEY = 'marketToken';
		const STORAGE_MARKET = 'marketData';
		let mToken = localStorage.getItem(STORAGE_KEY);
		let market = JSON.parse(localStorage.getItem(STORAGE_MARKET) || 'null');

		function authHeaders() { return { 'Content-Type':'application/json', Authorization: `Bearer ${mToken}` }; }
		function fmt(n) { return `$${Number(n||0).toFixed(2)}`; }
		function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
		function toast(msg, isErr) {
			const t = document.getElementById('toast');
			t.textContent = msg; t.classList.toggle('error', !!isErr); t.classList.add('show');
			setTimeout(() => t.classList.remove('show'), 2500);
		}

		// --- Auth ---
		async function doLogin() {
			const identifier = document.getElementById('loginUsername').value.trim();
			const password = document.getElementById('loginPassword').value;
			try {
				const r = await fetch(API('/markets/login'), {
					method: 'POST', headers: { 'Content-Type':'application/json' },
					body: JSON.stringify({ username: identifier, password }),
				});
				const j = await r.json();
				if (!j.success) throw new Error(j.message);
				mToken = j.data.token; market = j.data.market;
				localStorage.setItem(STORAGE_KEY, mToken);
				localStorage.setItem(STORAGE_MARKET, JSON.stringify(market));
				location.href = '/market-dashboard';
			} catch (e) { toast(e.message, true); }
		}

		function logout() {
			localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(STORAGE_MARKET);
			mToken = null; market = null;
			location.href = '/';
		}

		function showDashboard() {
			document.getElementById('loginScreen').classList.add('hidden');
			document.getElementById('dashboard').classList.remove('hidden');
			document.getElementById('dashboard').classList.add('visible-block');
			document.getElementById('mName').textContent = market.name;
			document.getElementById('mInfo').textContent = `@${market.username} · ${market.location?.city || ''}`;
			loadStats(); loadProducts();
		}

		// --- Stats ---
		async function loadStats() {
			try {
				const r = await fetch(API(`/markets/${market._id}/stats`), { headers: authHeaders() });
				const j = await r.json();
				if (!j.success) throw new Error(j.message);
				const d = j.data;
				document.getElementById('stats').innerHTML = `
					<div class="stat-card"><div class="label">Total Items</div><div class="value">${d.totalItems}</div></div>
					<div class="stat-card"><div class="label">Active Items</div><div class="value">${d.totalActiveItems}</div></div>
					<div class="stat-card"><div class="label">Total Orders</div><div class="value">${d.totalOrders}</div></div>
					<div class="stat-card"><div class="label">Total Sales</div><div class="value">${fmt(d.totalSales)}</div></div>
					<div class="stat-card"><div class="label">Delivered Sales</div><div class="value">${fmt(d.deliveredSales)}</div></div>
				`;
			} catch (e) { /* ignore */ }
		}

		// --- Tabs ---
		function switchTab(name) {
			document.querySelectorAll('.menu-item[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
			const prodTab = document.getElementById('tab-products');
			const orderTab = document.getElementById('tab-orders');
			prodTab.classList.toggle('hidden', name !== 'products');
			prodTab.classList.toggle('visible-block', name === 'products');
			orderTab.classList.toggle('hidden', name !== 'orders');
			orderTab.classList.toggle('visible-block', name === 'orders');
			document.getElementById('pageTitle').textContent = name === 'products' ? '📦 Products' : '🧾 Orders';
			if (name === 'orders') loadOrders();
		}

		// --- Products ---
		async function loadProducts() {
			const search = document.getElementById('prodSearch').value.trim();
			const url = API(`/products?market=${market._id}&isActive=all&limit=200${search?`&search=${encodeURIComponent(search)}`:''}`);
			try {
				const r = await fetch(url, { headers: authHeaders() });
				const j = await r.json();
				if (!j.success) throw new Error(j.message);
				renderProducts((j.data && j.data.products) || []);
			} catch (e) { toast(e.message, true); }
		}

		function renderProducts(list) {
			const tbody = document.getElementById('pBody');
			if (!list.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">No products yet. Click “Add Product”.</td></tr>'; return; }
			tbody.innerHTML = list.map(p => `
				<tr>
					<td><strong>${escapeHtml(p.name)}</strong></td>
					<td><code>${escapeHtml(p.barcode)}</code></td>
					<td>${escapeHtml(p.shelfNumber)}</td>
					<td>${fmt(p.price)}</td>
					<td>${p.stock}</td>
					<td><span class="badge ${p.isActive ? 'green' : 'red'}">${p.isActive ? 'Active' : 'Inactive'}</span></td>
					<td>
						<button class="btn small" onclick='openProductModal(${JSON.stringify(JSON.stringify(p))})'>Edit</button>
						<button class="btn small danger" onclick="deleteProduct('${p._id}')">Delete</button>
					</td>
				</tr>
			`).join('');
		}

		function openProductModal(jsonStr) {
			document.getElementById('pModalTitle').textContent = jsonStr ? 'Edit Product' : 'Add Product';
			['p_id','p_name','p_barcode','p_shelf','p_subcat','p_price','p_stock','p_tax','p_disc','p_pic','p_desc'].forEach(id => document.getElementById(id).value = '');
			if (jsonStr) {
				const p = JSON.parse(jsonStr);
				document.getElementById('p_id').value = p._id;
				document.getElementById('p_name').value = p.name || '';
				document.getElementById('p_barcode').value = p.barcode || '';
				document.getElementById('p_shelf').value = p.shelfNumber || '';
				document.getElementById('p_subcat').value = (p.subcategory && p.subcategory._id) || p.subcategory || '';
				document.getElementById('p_price').value = p.price ?? '';
				document.getElementById('p_stock').value = p.stock ?? 0;
				document.getElementById('p_tax').value = p.tax ?? 0;
				document.getElementById('p_disc').value = p.discount ?? 0;
				document.getElementById('p_pic').value = p.picture || '';
				document.getElementById('p_desc').value = p.description || '';
			}
			document.getElementById('prodModal').classList.add('show');
		}
		function closeProductModal() { document.getElementById('prodModal').classList.remove('show'); }

		async function submitProduct() {
			const id = document.getElementById('p_id').value;
			const body = {
				name: document.getElementById('p_name').value,
				barcode: document.getElementById('p_barcode').value,
				shelfNumber: document.getElementById('p_shelf').value,
				subcategory: document.getElementById('p_subcat').value,
				price: parseFloat(document.getElementById('p_price').value) || 0,
				stock: parseInt(document.getElementById('p_stock').value) || 0,
				tax: parseFloat(document.getElementById('p_tax').value) || 0,
				discount: parseFloat(document.getElementById('p_disc').value) || 0,
				picture: document.getElementById('p_pic').value || undefined,
				description: document.getElementById('p_desc').value || undefined,
			};
			try {
				const r = await fetch(id ? API(`/products/${id}`) : API('/products'), {
					method: id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(body),
				});
				const j = await r.json();
				if (!j.success) throw new Error(j.message);
				toast(id ? 'Product updated' : 'Product created');
				closeProductModal(); loadProducts(); loadStats();
			} catch (e) { toast(e.message, true); }
		}

		async function deleteProduct(id) {
			if (!confirm('Deactivate this product?')) return;
			try {
				const r = await fetch(API(`/products/${id}`), { method: 'DELETE', headers: authHeaders() });
				const j = await r.json();
				if (!j.success) throw new Error(j.message);
				toast('Product deactivated'); loadProducts(); loadStats();
			} catch (e) { toast(e.message, true); }
		}

		// --- Orders ---
		async function loadOrders() {
			const search = document.getElementById('orderSearch').value.trim();
			const status = document.getElementById('statusFilter').value;
			const params = new URLSearchParams({ limit: '100' });
			if (search) params.set('search', search);
			if (status) params.set('status', status);
			try {
				const r = await fetch(API(`/orders?${params}`), { headers: authHeaders() });
				const j = await r.json();
				if (!j.success) throw new Error(j.message);
				renderOrders((j.data && j.data.orders) || []);
			} catch (e) { toast(e.message, true); }
		}

		function statusBadge(s) {
			const map = { pending:'amber', confirmed:'blue', processing:'blue', 'ready for pickup':'blue', OnTheWay:'amber', delivered:'green', cancelled:'red' };
			return `<span class="badge ${map[s] || 'amber'}">${s}</span>`;
		}

		function renderOrders(list) {
			const tbody = document.getElementById('oBody');
			if (!list.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">No orders.</td></tr>'; return; }
			tbody.innerHTML = list.map(o => `
				<tr>
					<td><strong>${escapeHtml(o.orderNumber)}</strong></td>
					<td>${escapeHtml(o.customer?.name)}<div class="text-muted-small">${escapeHtml(o.customer?.email||'')}</div></td>
					<td>${o.items?.length || 0}</td>
					<td>${fmt(o.total)}</td>
					<td>${statusBadge(o.status)}</td>
					<td class="text-muted-cell">${new Date(o.createdAt).toLocaleString()}</td>
					<td>
						<select onchange="updateOrderStatus('${o._id}', this.value)">
							<option value="">Change…</option>
							<option value="confirmed">Confirmed</option>
							<option value="processing">Processing</option>
							<option value="ready for pickup">Ready for pickup</option>
							<option value="cancelled">Cancelled</option>
						</select>
					</td>
				</tr>
			`).join('');
		}

		async function updateOrderStatus(id, status) {
			if (!status) return;
			try {
				const r = await fetch(API(`/orders/${id}/status`), { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status }) });
				const j = await r.json();
				if (!j.success) throw new Error(j.message);
				toast('Order status updated'); loadOrders();
			} catch (e) { toast(e.message, true); }
		}

		// Search debounce
		document.getElementById('prodSearch').addEventListener('input', () => { clearTimeout(window.__pd); window.__pd = setTimeout(loadProducts, 300); });
		document.getElementById('orderSearch').addEventListener('input', () => { clearTimeout(window.__od); window.__od = setTimeout(loadOrders, 300); });
		document.getElementById('statusFilter').addEventListener('change', loadOrders);

		// Init
		if (mToken && market) location.href = '/market-dashboard';
	