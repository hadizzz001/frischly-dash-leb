
		(function () {
			const M = "/api/market-admin";

			// Split an absolute or relative URL into [origin, pathAndQuery].
			// Also normalises so the path always starts with "/api/...".
			function splitUrl(u) {
				if (typeof u !== "string") return ["", u];
				try {
					if (/^https?:\/\//i.test(u)) {
						const parsed = new URL(u);
						return [parsed.origin, parsed.pathname + parsed.search + parsed.hash];
					}
				} catch (_) {}
				return ["", u];
			}

			function rewriteUrl(u) {
				if (typeof u !== "string") return u;
				const [origin, pathFull] = splitUrl(u);
				const rewritten = rewritePath(pathFull);
				if (rewritten === pathFull) return u; // unchanged
				return origin + rewritten;
			}

			function rewritePath(u) {
				const orig = u;
				// Admin-only system endpoints → noop
				if (/^\/api\/admin\/(backup|maintenance|system-info)/.test(u)) {
					return M + "/__noop_admin" + u.replace(/^\/api\/admin/, "");
				}
				if (/^\/api\/admin\/settings\b/.test(u)) {
					return M + "/settings" + u.slice("/api/admin/settings".length);
				}
				// Auth endpoints
				if (/^\/api\/auth\/me\b/.test(u)) {
					return M + "/me" + u.slice("/api/auth/me".length);
				}
				if (/^\/api\/auth\/profile\b/.test(u)) {
					return M + "/profile" + u.slice("/api/auth/profile".length);
				}
				if (/^\/api\/auth\/change-password\b/.test(u)) {
					return M + "/profile/password" + u.slice("/api/auth/change-password".length);
				}
				if (/^\/api\/auth\/refresh\b/.test(u)) {
					return M + "/__noop_refresh";
				}
				if (/^\/api\/auth\/customers\b/.test(u)) {
					return M + "/__noop_customers" + u.slice("/api/auth/customers".length);
				}
				if (/^\/api\/auth\/users\b/.test(u) && /[?&]includeRoles=rider\b/.test(u)) {
					return M + "/rider-users";
				}
				if (/^\/api\/auth\/users\b/.test(u)) {
					return M + "/staff" + u.slice("/api/auth/users".length);
				}
				// Domain endpoints
				if (/^\/api\/products\/count\b/.test(u)) return M + "/__noop_count_products";
				if (/^\/api\/products\b/.test(u))
					return M + "/products" + u.slice("/api/products".length);
				if (/^\/api\/categories\b/.test(u))
					return M + "/categories" + u.slice("/api/categories".length);
				if (/^\/api\/subcategories\b/.test(u)) {
					// The global subcategories endpoint accepts ?parent=<categoryId>,
					// but the tenant-scoped market-admin endpoint expects ?category=<id>.
					// Translate so subcategory dropdowns filter by selected category.
					let tail = u.slice("/api/subcategories".length);
					tail = tail.replace(/([?&])parent=/g, "$1category=");
					return M + "/subcategories" + tail;
				}
				if (/^\/api\/orders\/count\b/.test(u))
					return M + "/orders/count" + u.slice("/api/orders/count".length);
				if (/^\/api\/orders\/stats\b/.test(u)) return M + "/__noop_order_stats";
				if (/^\/api\/orders\b/.test(u))
					return M + "/orders" + u.slice("/api/orders".length);
				if (/^\/api\/riders\/stats\b/.test(u)) return M + "/__noop_rider_stats";
				if (/^\/api\/riders\b/.test(u))
					return M + "/riders" + u.slice("/api/riders".length);
				// Zones are global — pass through unchanged so the market dashboard can
				// list and create its own zones via the standard /api/zones endpoints
				// (controller is now tenant-scoped by the requester's market).
				if (/^\/api\/zones\b/.test(u)) return orig;
				if (/^\/api\/shelves\b/.test(u)) return M + "/shelves" + u.slice("/api/shelves".length);
				if (/^\/api\/waste\/stats\b/.test(u)) return M + "/waste/summary";
				if (/^\/api\/waste\/product\b/.test(u))
					return M + "/waste/product" + u.slice("/api/waste/product".length);
				if (/^\/api\/waste\b/.test(u))
					return M + "/waste" + u.slice("/api/waste".length);
				if (/^\/api\/promocodes\b/.test(u))
					return M + "/promocodes" + u.slice("/api/promocodes".length);
				if (/^\/api\/announcements\b/.test(u))
					return M + "/announcements" + u.slice("/api/announcements".length);
				if (/^\/api\/notifications\/send\/all\b/.test(u))
					return M + "/__noop_notify_all";
				if (/^\/api\/notifications\b/.test(u))
					return M + "/__noop_notifications" + u.slice("/api/notifications".length);
				return orig;
			}

			function emptyJson(extra) {
				const body = Object.assign(
					{ success: true, message: "Not available for market admin", data: [], count: 0, total: 0 },
					extra || {}
				);
				return new Response(JSON.stringify(body), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			function isNoopUrl(u) {
				return /\/__noop_/.test(u);
			}

			// Adapt outgoing request bodies where the admin UI shape differs from the
			// market-admin endpoint. Currently only the profile update: the admin UI
			// sends { address: { street, city } } but the Market document stores the
			// address under `location`, so translate it so the city/street persist.
			function adaptRequestInit(rewrittenUrl, init) {
				if (!init || init.body == null || typeof init.body !== "string") return init;
				if (!/\/api\/market-admin\/profile(\?|$)/.test(rewrittenUrl)) return init;
				let parsed;
				try {
					parsed = JSON.parse(init.body);
				} catch (_) {
					return init;
				}
				if (parsed && parsed.address && parsed.location === undefined) {
					parsed.location = {
						street: parsed.address.street || "",
						city: parsed.address.city || "",
					};
					delete parsed.address;
					return Object.assign({}, init, { body: JSON.stringify(parsed) });
				}
				return init;
			}

			// Adapt response bodies so the admin-shaped UI keeps working
			async function adaptResponse(rewrittenUrl, response) {
				if (!response || !response.ok) return response;
				const ct = response.headers.get("content-type") || "";
				if (!ct.includes("application/json")) return response;
				let body;
				try {
					body = await response.clone().json();
				} catch (_) {
					return response;
				}
				let out = body;

				const wrap = (obj) =>
					new Response(JSON.stringify(obj), {
						status: response.status,
						headers: { "Content-Type": "application/json" },
					});

				// ── IMPORTANT ──────────────────────────────────────────────────
				// Every market-admin list endpoint (products, orders, categories,
				// subcategories, riders, waste, promocodes, announcements, sales
				// stats, unsold products) actually returns its rows nested as
				// `data.items` (plus `data.meta` / `data.pagination`), NOT as a
				// plain array at `data`. All the blocks below used to gate on
				// `Array.isArray(body.data)`, which is never true for these
				// endpoints — so none of these adapters ever ran, and the
				// dashboard's list sections (and their derived stat cards) always
				// rendered empty even when the market had real data in MongoDB.
				// Fix: read from `body.data.items` instead.
				// NOTE: the API is not uniform. Endpoints built by the `crud()`
				// factory return `data: { items, meta }`, but hand-written ones
				// (e.g. /staff, /rider-users) return `data: [...]` directly, and a
				// few return `data: { <namedKey>: [...] }`. `itemsOf` therefore
				// accepts all three shapes so no adapter is silently skipped.
				const itemsOf = (b) => {
					if (!b || !b.data) return null;
					if (Array.isArray(b.data)) return b.data;
					if (Array.isArray(b.data.items)) return b.data.items;
					for (const k of ["users", "staff", "riders", "products", "orders", "categories", "subcategories", "shelves", "promoCodes", "promocodes", "announcements", "waste", "results", "docs", "data"]) {
						if (Array.isArray(b.data[k])) return b.data[k];
					}
					return null;
				};
				const metaOf = (b) => (b && b.data && (b.data.meta || b.data.pagination)) || b?.meta || {};

				// Staff list (was /api/auth/users) → admin expects data.data.users
				{
					const items = itemsOf(body);
					if (items && /\/api\/market-admin\/staff(\?|$|\/?$)/.test(rewrittenUrl)) {
						const meta = metaOf(body);
						const total = meta.total ?? items.length;
						const page = meta.page ?? 1;
						const limit = meta.limit || total || 20;
						out = {
							success: true,
							data: {
								users: items,
								total,
								page,
								limit,
								totalPages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
							},
						};
						return wrap(out);
					}
				}

				// Rider-user dropdown → same users envelope expected by rider modal
				if (/\/api\/market-admin\/rider-users(\?|$|\/?$)/.test(rewrittenUrl) && Array.isArray(body.data)) {
					out = { success: true, data: { users: body.data, total: body.data.length } };
					return wrap(out);
				}

				// Product sales stats → loadProductSalesStats reads
				// result.data.productSales (array) + result.data.pagination.
				{
					const items = itemsOf(body);
					if (items && /\/api\/market-admin\/orders\/sales-stats(\?|$)/.test(rewrittenUrl)) {
						out = {
							success: true,
							data: {
								productSales: items,
								summary: body.data.summary,
								pagination: body.data.pagination,
								filters: body.data.filters,
							},
						};
						return wrap(out);
					}
				}

				// Unsold products → loadUnsoldProducts reads
				// result.data.productsWithCategory (array) + result.data.pagination.
				{
					const items = itemsOf(body);
					if (items && /\/api\/market-admin\/orders\/unsold-products(\?|$)/.test(rewrittenUrl)) {
						out = {
							success: true,
							data: {
								productsWithCategory: items,
								pagination: body.data.pagination,
								filters: body.data.filters,
							},
						};
						return wrap(out);
					}
				}

				// Products list → this market dashboard reads data.data.products
				// (array) plus data.data.pagination (with a `totalProducts` field).
				{
					const items = itemsOf(body);
					if (items && /\/api\/market-admin\/products(\?|$|\/?$)/.test(rewrittenUrl)) {
						const meta = metaOf(body);
						const total = meta.total ?? items.length;
						const page = meta.page ?? 1;
						const limit = meta.limit || total || 25;
						out = {
							success: true,
							data: {
								products: items,
								pagination: {
									totalProducts: total,
									total,
									page,
									currentPage: page,
									limit,
									totalPages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
								},
							},
							meta,
						};
						return wrap(out);
					}
				}

				// Orders list → market dashboard reads `data.orders` (array) plus
				// `data.pagination` (same shape as the real /api/orders endpoint).
				{
					const items = itemsOf(body);
					if (items && /\/api\/market-admin\/orders(\?|$|\/?$)/.test(rewrittenUrl)) {
						const meta = metaOf(body);
						const total = meta.total ?? items.length;
						const page = meta.page ?? 1;
						const limit = meta.limit || total || 10;
						const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
						out = {
							success: true,
							data: {
								orders: items,
								pagination: {
									currentPage: page,
									totalPages,
									totalOrders: total,
									total,
									page,
									limit,
									hasNextPage: page < totalPages,
									hasPrevPage: page > 1,
								},
							},
							meta,
						};
						return wrap(out);
					}
				}

				// Riders list (market's own Rider docs) → dashboard reads
				// data.data.riders (array).
				{
					const items = itemsOf(body);
					if (items && /\/api\/market-admin\/riders(\?|$|\/?$)/.test(rewrittenUrl)) {
						const meta = metaOf(body);
						out = {
							success: true,
							data: { riders: items, total: meta.total ?? items.length },
						};
						return wrap(out);
					}
				}

				// Categories list → loadCategories reads data.data.categories (array).
				{
					const items = itemsOf(body);
					if (items && /\/api\/market-admin\/categories(\?|$|\/?$)/.test(rewrittenUrl)) {
						out = { success: true, data: { categories: items }, meta: metaOf(body) };
						return wrap(out);
					}
				}

				// Subcategories list → consumers read data.data.subcategories (array).
				{
					const items = itemsOf(body);
					if (items && /\/api\/market-admin\/subcategories(\?|$|\/?$)/.test(rewrittenUrl)) {
						out = { success: true, data: { subcategories: items }, meta: metaOf(body) };
						return wrap(out);
					}
				}

				// Promo codes list → the market dashboard reads `data` as a plain
				// array (loadPromoCodes calls result.data.filter), so do NOT nest it
				// under data.promoCodes or .filter throws "is not a function".
				{
					const items = itemsOf(body);
					if (items && /\/api\/market-admin\/promocodes(\?|$|\/?$)/.test(rewrittenUrl)) {
						out = { success: true, data: items, meta: metaOf(body) };
						return wrap(out);
					}
				}
				// Announcements list → same: loadAnnouncements reads result.data as
				// a plain array (result.data.forEach), so keep it as an array.
				{
					const items = itemsOf(body);
					if (items && /\/api\/market-admin\/announcements(\?|$|\/?$)/.test(rewrittenUrl)) {
						out = { success: true, data: items, meta: metaOf(body) };
						return wrap(out);
					}
				}

				// Waste list → updateWasteTable reads `data.data` as a plain array
				// plus a TOP-LEVEL `pagination` object (sibling of `data`, not
				// nested inside it). Do NOT nest under data.waste, or
				// data.data.forEach throws "is not a function".
				{
					const items = itemsOf(body);
					if (items && /\/api\/market-admin\/waste(\?|$|\/?$)/.test(rewrittenUrl)) {
						const meta = metaOf(body);
						const total = meta.total ?? items.length;
						const page = meta.page ?? 1;
						const limit = meta.limit || total || 20;
						const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
						out = {
							success: true,
							data: items,
							pagination: {
								page,
								currentPage: page,
								totalPages,
								total,
								limit,
							},
							meta,
						};
						return wrap(out);
					}
				}


				// /me → expose the user object expected by /auth/me consumers
				if (/\/api\/market-admin\/me(\?|$)/.test(rewrittenUrl) && body.data) {
					const m = body.data.market || {};
					const u = body.data.user || {};
					out = {
						success: true,
						data: {
							user: {
								_id: u.id || m._id,
								id: u.id || m._id,
								name: u.name || m.name,
								email: u.email || m.email,
								role: body.data.role || "market",
								market: m,
								phoneNumber: m.phoneNumber || "",
								address: {
									street: (m.location && m.location.street) || "",
									city: (m.location && m.location.city) || "",
								},
								cities: m.cities || [],
								isActive: true,
								createdAt: m.createdAt,
								lastLogin: m.lastLogin,
							},
						},
					};
					return wrap(out);
				}

				// Profile (Market doc) → match auth/profile shape used by admin.
				// The admin UI reads user.address.{street,city}, but markets store the
				// address under location, so expose an `address` derived from `location`
				// (same as the /me adapter). Without this the frontend throws a
				// TypeError reading currentUser.address.street after a profile update.
				if (/\/api\/market-admin\/profile(\?|$)/.test(rewrittenUrl) && body.data) {
					const m = body.data;
					const user = Object.assign({}, m, {
						role: "market",
						market: m,
						phoneNumber: m.phoneNumber || "",
						address: {
							street: (m.location && m.location.street) || "",
							city: (m.location && m.location.city) || "",
						},
					});
					out = { success: true, data: { user, market: m } };
					return wrap(out);
				}

				return response;
			}

			const origFetch = window.fetch.bind(window);
			window.fetch = async function (input, init) {
				let url = typeof input === "string" ? input : (input && input.url) || "";
				const newUrl = rewriteUrl(url);
				if (isNoopUrl(newUrl)) {
					// Return a benign empty success — matches every shape the admin code falls back to.
					return emptyJson({
						data: { users: [], products: [], orders: [], riders: [], zones: [], shelves: [], categories: [], subcategories: [], stats: {}, settings: {}, total: 0 },
					});
				}
				let response;
				if (typeof input === "string") {
					response = await origFetch(newUrl, adaptRequestInit(newUrl, init));
				} else if (newUrl !== url) {
					response = await origFetch(new Request(newUrl, input), init);
				} else {
					response = await origFetch(input, init);
				}
				// Auto-redirect on auth failure
				if (response && response.status === 401) {
					try {
						// Clear EVERY credential. Leaving `authToken` behind made the
						// sign-in page think the user was still logged in, so it
						// redirected straight back here — an infinite loop.
						localStorage.removeItem("marketToken");
						localStorage.removeItem("marketData");
						localStorage.removeItem("authToken");
						localStorage.removeItem("refreshToken");
						localStorage.removeItem("token");
					} catch (_) {}
					if (!/^\/signin/.test(window.location.pathname)) {
						window.location.replace("/signin");
					}
				}
				return adaptResponse(newUrl, response);
			};

			// Boot-time auth gate — must happen before the rest of the script runs.
			// Accept `authToken` as well as `marketToken`: since sign-in was unified
			// into a single page, every role gets an `authToken`, while `marketToken`
			// is only set for some market roles. Requiring `marketToken` alone sent
			// valid market users back to sign-in, which saw their `authToken` and
			// redirected them here again — an infinite loop.
			try {
				const t =
					localStorage.getItem("marketToken") || localStorage.getItem("authToken");
				if (!t) {
					window.location.replace("/signin");
				}
			} catch (_) {}
		})();
		

// ---- next inline script block ----


			// Fall back to `authToken` (set by the unified sign-in page for every
			// role) when the market-specific token is absent.
			let currentToken =
				localStorage.getItem("marketToken") || localStorage.getItem("authToken");
			let currentRefreshToken = null /* market: no refresh */;

			// Token management functions
			function updateTokens(token, refreshToken) {
				currentToken = token;
				currentRefreshToken = refreshToken;
				localStorage.setItem("marketToken", token);
				localStorage.setItem("marketRefreshToken_unused", refreshToken);
			}

			function clearTokens() {
				currentToken = null;
				currentRefreshToken = null;
				// Clear every credential — see the 401 handler above for why leaving
				// `authToken` behind causes a sign-in redirect loop.
				localStorage.removeItem("marketToken");
				localStorage.removeItem("marketData");
				localStorage.removeItem("authToken");
				localStorage.removeItem("refreshToken");
				localStorage.removeItem("token");
			}

			// Fetch wrapper that aborts (and rejects) if the request takes too long.
			// This avoids requests hanging indefinitely (e.g. while a free-tier
			// server instance is waking up from idle) and lets us show a clearer
			// message than a generic "network error".
			async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
				try {
					return await fetch(url, { ...options, signal: controller.signal });
				} finally {
					clearTimeout(timeoutId);
				}
			}

			// Returns a user-friendly message for a failed fetch, distinguishing
			// between a timeout, being offline, and a generic connectivity issue.
			function getFriendlyNetworkErrorMessage(error) {
				if (error && error.name === "AbortError") {
					return "The request timed out. The server may be waking up from idle — please try again in a few seconds.";
				}
				if (typeof navigator !== "undefined" && navigator.onLine === false) {
					return "You appear to be offline. Please check your internet connection and try again.";
				}
				return "Network error. Please check your connection and try again.";
			}

			// Auto refresh token function
			async function refreshAuthToken() {
				if (!currentRefreshToken) {
					console.log("No refresh token available");
					clearTokens();
					window.location.replace("/signin");
					return null;
				}

				try {
					const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ refreshToken: currentRefreshToken }),
					});

					if (response.ok) {
						const data = await response.json();
						updateTokens(data.data.token, data.data.refreshToken);
						console.log("Token refreshed successfully");
						return data.data.token;
					} else {
						console.log("Refresh token expired or invalid");
						clearTokens();
						window.location.replace("/signin");
						return null;
					}
				} catch (error) {
					console.error("Error refreshing token:", error);
					clearTokens();
					window.location.replace("/signin");
					return null;
				}
			}

			// Language switching functionality
			let currentLanguage = localStorage.getItem("selectedLanguage") || "en";

			const translations = {
				en: {
					// Navigation
					Dashboard: "Dashboard",
					"Staff Management": "Staff Management",
					Categories: "Categories",
					Products: "Products",
					Orders: "Orders",
					"Riders Management": "Riders Management",
					"Waste Management": "Waste Management",
					Settings: "Settings",
					Profile: "Profile",
					"Sign Out": "Sign Out",

					// Dashboard
					"Dashboard Overview": "Dashboard Overview",
					"Welcome back": "Welcome back",
					"Total Customers": "Total Customers",
					"Active Products": "Active Products",
					Orders: "Orders",
					"Active Riders": "Active Riders",

					// Settings
					"System Settings": "System Settings",
					"Configure system-wide settings and preferences":
						"Configure system-wide settings and preferences",
					"Product Management": "Product Management",
					"Product Status Control": "Product Status Control",
					"Activate All Products": "Activate All Products",
					"Deactivate All Products": "Deactivate All Products",
					"Bulk update the active status of all products in the system.":
						"Bulk update the active status of all products in the system.",
					"Database Management": "Database Management",
					"Database Operations": "Database Operations",
					"Create Database Backup": "Create Database Backup",
					"Manage database backups and system resets.":
						"Manage database backups.",
					"System Information": "System Information",
					"System Stats": "System Stats",
					"View System Information": "View System Information",
					"View detailed system statistics and information.":
						"View detailed system statistics and information.",
					Maintenance: "Maintenance",
					"System Maintenance": "System Maintenance",
					"Run Maintenance Tasks": "Run Maintenance Tasks",
					"Perform routine system maintenance and cleanup.":
						"Perform routine system maintenance and cleanup.",
					"Language Settings": "Language Settings",
					"Application Language": "Application Language",
					"Change the language of the application interface.":
						"Change the language of the application interface.",

					// Profile section
					"profile-settings": "Profile Settings",
					"manage-personal-info":
						"Manage your personal information and preferences",
					"member-since": "Member Since",
					"last-login": "Last Login",
					"account-status": "Account Status",
					"your-profile": "Your Profile",
					"account-role": "Account Role",
					"address-information": "Address Information",
					"city": "City",
					"edit-profile": "Edit Profile",
					"change-password": "Change Password",

					// Common fields
					"full-name": "Full Name",
					"email-address": "Email Address",
					"phone-number": "Phone Number",

					// Change password functionality
					"current-password": "Current Password",
					"new-password": "New Password",
					"confirm-new-password": "Confirm New Password",
					"update-password": "Update Password",
					"password-changed-success": "Password changed successfully",
					"password-mismatch": "Passwords do not match",
					"password-too-short": "Password must be at least 6 characters long",
					"current-password-incorrect": "Current password is incorrect",
					"password-change-error": "Error changing password",

					// Edit profile functionality
					"update-profile": "Update Profile",
					"profile-updated-success": "Profile updated successfully",
					"profile-update-error": "Error updating profile",
					"invalid-email": "Please enter a valid email address",
					"invalid-phone": "Please enter a valid phone number",

					// Common UI elements
					cancel: "Cancel",
					error: "Error",

					// Common
					"Loading...": "Loading...",
					Error: "Error",
					Success: "Success",
					Warning: "Warning",
					Info: "Info",

					// Product status update messages
					"confirm-activate-all-products":
						"Are you sure you want to activate ALL products? This will affect product visibility in the app.",
					"confirm-deactivate-all-products":
						"Are you sure you want to deactivate ALL products? This will affect product visibility in the app.",
					"setting-products-status": "Setting all products to {status}...",
					"products-status-success": "Successfully {action}d {count} products!",
					"products-status-error": "Error: {error}",
					"products-status-failed": "Failed to update products",
					"products-status-update-error":
						"Error updating products status. Please try again.",

					// Database backup messages
					"backup-creating": "Creating database backup...",
					"backup-success": "Database backup created successfully: {path}",
					"backup-error": "Error: {error}",
					"backup-failed": "Failed to create backup",
					"backup-create-error":
						"Error creating database backup. Please try again.",

					// System maintenance messages
					"maintenance-running": "Running system maintenance...",
					"maintenance-success":
						"Maintenance completed successfully. {message}",
					"maintenance-error": "Error: {error}",
					"maintenance-failed": "Maintenance failed",
					"maintenance-run-error":
						"Error running system maintenance. Please try again.",

					// Language change messages
					"language-changing": "Changing language to {language}...",

					// Language change success/error messages
					"language-changed-success":
						"Language changed to {language} successfully!",
					"language-change-error": "Error changing language. Please try again.",
				},
			};

			// Debounce utility function for search inputs
			function debounce(func, wait) {
				let timeout;
				return function executedFunction(...args) {
					const later = () => {
						clearTimeout(timeout);
						func(...args);
					};
					clearTimeout(timeout);
					timeout = setTimeout(later, wait);
				};
			}

			// Debounced search functions
			const debounceCategorySearch = debounce(filterCategories, 300);
			const debounceSubcategorySearch = debounce(filterSubcategories, 300);
			const debounceProductSearch = debounce(searchProducts, 300);

			function updatePageLanguage() {
				try {
					// Update elements with data-translation attributes
					const elements = document.querySelectorAll("[data-translation]");
					elements.forEach((element) => {
						const key = element.getAttribute("data-translation");
						if (
							translations[currentLanguage] &&
							translations[currentLanguage][key]
						) {
							if (
								element.tagName === "INPUT" &&
								element.type === "placeholder"
							) {
								element.placeholder = translations[currentLanguage][key];
							} else {
								element.textContent = translations[currentLanguage][key];
							}
						}
					});
				} catch (error) {
					console.error("Language update error:", error);
				}
			}

			// Debug function to check API configuration
			function checkApiConfig() {
				console.log("🔍 API Configuration Check:");
				console.log("Current hostname:", window.location.hostname);
				console.log("API_BASE_URL:", API_BASE_URL);
				console.log("Current token exists:", !!currentToken);
				console.log(
					"Current token length:",
					currentToken ? currentToken.length : 0
				);
			}

			// Enhanced fetch function with automatic token refresh
			async function authenticatedFetch(url, options = {}) {
				// Ensure we have authorization header
				if (!options.headers) {
					options.headers = {};
				}

				if (currentToken) {
					options.headers.Authorization = `Bearer ${currentToken}`;
				}

				try {
					let response = await fetchWithTimeout(url, options);

					// If we get 401, try to refresh token
					if (response.status === 401 && currentRefreshToken) {
						console.log("Token expired, attempting refresh...");
						const newToken = await refreshAuthToken();

						if (newToken) {
							// Retry the original request with new token
							options.headers.Authorization = `Bearer ${newToken}`;
							response = await fetchWithTimeout(url, options);
						}
					}

					return response;
				} catch (error) {
					console.error("Authenticated fetch error:", error);
					throw error;
				}
			}

			// Pagination variables
			let currentProductsPage = 1;
			let totalProductsPages = 1;
			let productsPageSize = 25;
			let totalProducts = 0;

			// Check if user is logged in
			if (!currentToken) {
				// If no access token but we have refresh token, try to refresh
				if (currentRefreshToken) {
					refreshAuthToken().then((newToken) => {
						if (!newToken) {
							window.location.replace("/signin");
						}
					});
				} else {
					window.location.replace("/signin");
				}
			}

			function showMessage(message, type) {
				const messageDiv = document.getElementById("message");

				// Clear any existing timeout
				if (window.messageTimeout) {
					clearTimeout(window.messageTimeout);
				}

				messageDiv.innerHTML = `
					<div class="message ${type}">
						<div class="message-content">${message}</div>
						<button class="close-btn" onclick="closeMessage(this)">×</button>
					</div>`;

				// Auto-hide after 7 seconds
				window.messageTimeout = setTimeout(() => {
					closeMessage(messageDiv.querySelector(".close-btn"));
				}, 7000);
			}

			function closeMessage(button) {
				const messageElement = button.closest(".message");
				messageElement.classList.add("fade-out");

				setTimeout(() => {
					if (messageElement.parentElement) {
						messageElement.parentElement.innerHTML = "";
					}
				}, 300);

				if (window.messageTimeout) {
					clearTimeout(window.messageTimeout);
				}
			}

			function showLoading(show, message = "Loading your profile...") {
				const loadingElement = document.getElementById("loading");
				const loadingText = loadingElement.querySelector("p");

				if (loadingText) {
					loadingText.textContent = message;
				}

				loadingElement.style.display = show ? "block" : "none";
				document.getElementById("dashboard-content").style.display = show
					? "none"
					: "block";
			}

			function showSectionLoading(
				sectionId,
				show,
				message = "Loading data..."
			) {
				const section = document.getElementById(sectionId + "-section");
				if (!section) return;

				let loadingDiv = section.querySelector(".section-loading");

				if (show && !loadingDiv) {
					// Create loading element if it doesn't exist
					loadingDiv = document.createElement("div");
					loadingDiv.className = "section-loading";
					loadingDiv.innerHTML = `
						<div class="spinner"></div>
						<p>${message}</p>
					`;
					loadingDiv.style.cssText = `
						display: flex;
						flex-direction: column;
						align-items: center;
						justify-content: center;
						padding: 40px;
						text-align: center;
						color: #666;
					`;

					// Insert after section header
					const sectionHeader = section.querySelector(".section-header");
					if (sectionHeader) {
						sectionHeader.parentNode.insertBefore(
							loadingDiv,
							sectionHeader.nextSibling
						);
					} else {
						section.insertBefore(loadingDiv, section.firstChild);
					}
				}

				if (loadingDiv) {
					loadingDiv.style.display = show ? "flex" : "none";
					if (show) {
						const loadingText = loadingDiv.querySelector("p");
						if (loadingText) loadingText.textContent = message;
					}
				}

				// Hide/show other section content
				const otherElements = section.querySelectorAll(
					".section-actions, .data-table, .user-card"
				);
				otherElements.forEach((el) => {
					el.style.display = show ? "none" : "";
				});
			}

			function formatDate(dateString) {
				const date = new Date(dateString);
				return date.toLocaleDateString("en-US", {
					year: "numeric",
					month: "long",
					day: "numeric",
				});
			}

			function formatDateTime(dateString) {
				const date = new Date(dateString);
				return date.toLocaleString("en-US", {
					year: "numeric",
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
			}

			async function loadUserProfile() {
				showLoading(true, "Loading your profile...");

				try {
					const response = await fetch(`${API_BASE_URL}/auth/me`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const data = await response.json();
						const user = data.data.user;

						// Check if user has required role for dashboard access.
						// Freshly admin-side roles belong on the main dashboard, so send
						// them there rather than to /market (a login page) — bouncing a
						// signed-in user back to a login page caused an infinite
						// redirect loop.
						const allowedRoles = ["market", "market_manager", "market_staff", "market_driver"];
						if (!allowedRoles.includes(user.role)) {
							const adminRoles = ["manager", "admin", "rider", "staff"];
							const destination = adminRoles.includes(user.role)
								? "/dashboard"
								: "/profile";

							showMessage(
								`Access denied. This dashboard is for market accounts. Redirecting you to ${destination}…`,
								"error"
							);
							setTimeout(() => {
								window.location.replace(destination);
							}, 2000);
							return;
						}

						// Update dashboard welcome message
						document.getElementById("welcome-user-name").textContent =
							user.name;

						// Update profile information
						document.getElementById("user-name").textContent = user.name;
						document.getElementById("user-email").textContent = user.email;
						document.getElementById("user-phone").textContent =
							user.phoneNumber;
						document.getElementById("user-role").textContent =
							user.role.toUpperCase();

						// Update stats
						document.getElementById("member-since").textContent = formatDate(
							user.createdAt
						);
						document.getElementById("last-login").textContent = user.lastLogin
							? formatDateTime(user.lastLogin)
							: "First time";
						document.getElementById("account-status").textContent =
							user.isActive ? "Active" : "Inactive";

						// Store current user and check admin access
						currentUser = user;
						setProfileCities(user.cities || []);
						updateSidebarRoleBadge(user.role);
						checkAdminAccess(user);

						// Show dashboard content
						const dashboardContent =
							document.getElementById("dashboard-content");
						if (dashboardContent) {
							dashboardContent.style.display = "block";
						}

						// Land on Products by default (the standalone Dashboard page was removed),
						// but never override a section the user already opened while this
						// request was still in flight — that made sections appear to "not open".
						try {
							if (!userHasChosenSection) showSection("products", true, true);
						} catch (e) {
							console.warn("initial showSection failed", e);
						}

						showLoading(false);
					} else {
						throw new Error("Failed to load profile");
					}
				} catch (error) {
					console.error("Profile loading error:", error);
					showMessage("Failed to load profile. Please try again.", "error");
					showLoading(false);

					// If token is invalid, redirect to login
					setTimeout(() => {
						logout();
					}, 2000);
				}
			}

			// Render the user's cities into the profile "City" display.
			// Safe to call before the components init.
			function setProfileCities(citiesList) {
				const list = Array.isArray(citiesList) ? citiesList : [];
				const display = document.getElementById("user-cities");
				if (display)
					display.textContent = list.length ? list.join(", ") : "—";
			}

			// Read the selection from the Edit Profile multi-select (falls back to
			// the current user's saved cities if the component isn't mounted).
			function getEditCitiesSelection() {
				const api =
					window.getLebaneseCityMultiSelect &&
					window.getLebaneseCityMultiSelect("edit-cities");
				return api
					? api.getSelected()
					: (currentUser && currentUser.cities) || [];
			}

			function editProfile() {
				// Populate the form with current user data
				if (currentUser) {
					document.getElementById("edit-full-name").value =
						currentUser.name || "";
					document.getElementById("edit-email").value = currentUser.email || "";
					document.getElementById("edit-phone").value =
						currentUser.phoneNumber || "";

					// Populate the city multi-select
					const citiesApi =
						window.getLebaneseCityMultiSelect &&
						window.getLebaneseCityMultiSelect("edit-cities");
					if (citiesApi)
						citiesApi.setSelected(currentUser.cities || []);
				}

				// Show the modal
				document.getElementById("edit-profile-modal").style.display = "block";
			}

			function closeEditProfileModal() {
				document.getElementById("edit-profile-modal").style.display = "none";
				document.getElementById("edit-profile-form").reset();
			}

			async function updateProfile() {
				// Get form values
				const fullName = document.getElementById("edit-full-name").value.trim();
				const email = document.getElementById("edit-email").value.trim();
				const phoneNumber = document.getElementById("edit-phone").value.trim();
				const cities = getEditCitiesSelection();
				// The address keeps a single representative city; the full list is
				// saved separately in `cities`.
				const city = cities[0] || "";

				// Basic validation (at least one city must be selected).
				if (!fullName || !email || !phoneNumber || !cities.length) {
					showMessage(
						translations[currentLanguage]["error"] || "Error",
						"error"
					);
					return;
				}

				// Email validation
				const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
				if (!emailRegex.test(email)) {
					showMessage(
						translations[currentLanguage]["invalid-email"] ||
							"Please enter a valid email address",
						"error"
					);
					return;
				}

				// Phone validation — kept in sync with the server's rule so the UI
				// never rejects a number the backend would accept.
				const phoneRegex = /^[+]?[0-9][0-9\s().-]{5,20}$/;
				if (!phoneRegex.test(phoneNumber)) {
					showMessage(
						translations[currentLanguage]["invalid-phone"] ||
							"Please enter a valid phone number",
						"error"
					);
					return;
				}

				// Prepare update data
				const updateData = {
					name: fullName,
					email: email,
					phoneNumber: phoneNumber,
					address: {
						city: city,
					},
					cities: cities,
				};

				try {
					showLoading(true, "Updating your profile...");

					const response = await authenticatedFetch(
						`${API_BASE_URL}/auth/profile`,
						{
							method: "PUT",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify(updateData),
						}
					);

					if (response.ok) {
						const data = await response.json();

						// The market endpoint may return the updated record under
						// data.user, data.market, or directly as data — support all.
						const updated =
							(data.data && (data.data.user || data.data.market)) ||
							data.data ||
							{};
						currentUser = Object.assign({}, currentUser, updated);

						// Markets store the address under `location`; make sure
						// currentUser.address always exists so the UI never throws.
						if (!currentUser.address) {
							currentUser.address = {
								city:
									(currentUser.location &&
										currentUser.location.city) ||
									city,
							};
						}

						updateSidebarRoleBadge(currentUser.role);

						// Update the UI with new data
						document.getElementById("user-name").textContent =
							currentUser.name || fullName;
						document.getElementById("user-email").textContent =
							currentUser.email || email;
						document.getElementById("user-phone").textContent =
							currentUser.phoneNumber || phoneNumber;

						setProfileCities(currentUser.cities || []);

						// Update welcome message
						document.getElementById("welcome-user-name").textContent =
							currentUser.name || fullName;

						// Close modal and show success message
						closeEditProfileModal();
						showMessage(
							translations[currentLanguage]["profile-updated-success"] ||
								"Profile updated successfully",
							"success"
						);
					} else {
						let serverMessage = "Failed to update profile";
						try {
							const errorData = await response.json();
							serverMessage =
								formatApiError(errorData) ||
								(Array.isArray(errorData.errors)
									? errorData.errors.join(", ")
									: serverMessage);
						} catch (_) {}
						throw new Error(serverMessage);
					}
				} catch (error) {
					console.error("Profile update error:", error);
					showMessage(
						error.message ||
							translations[currentLanguage]["profile-update-error"] ||
							"Error updating profile",
						"error"
					);
				} finally {
					showLoading(false);
				}
			}

			function changePassword() {
				document.getElementById("change-password-modal").style.display =
					"block";
				document.getElementById("change-password-form").reset();
			}

			function closeChangePasswordModal() {
				document.getElementById("change-password-modal").style.display = "none";
			}

			async function updatePassword() {
				const currentPassword =
					document.getElementById("current-password").value;
				const newPassword = document.getElementById("new-password").value;
				const confirmPassword =
					document.getElementById("confirm-password").value;

				// Validation
				if (!currentPassword || !newPassword || !confirmPassword) {
					showMessage(
						translations[currentLanguage]["error"] || "Error",
						"error"
					);
					return;
				}

				if (newPassword.length < 6) {
					showMessage(
						translations[currentLanguage]["password-too-short"] ||
							"Password must be at least 6 characters long",
						"error"
					);
					return;
				}

				if (newPassword !== confirmPassword) {
					showMessage(
						translations[currentLanguage]["password-mismatch"] ||
							"Passwords do not match",
						"error"
					);
					return;
				}

				try {
					console.log("🔍 Change Password Debug:");
					console.log("API_BASE_URL:", API_BASE_URL);
					console.log("Full URL:", `${API_BASE_URL}/auth/change-password`);
					console.log("Current token exists:", !!currentToken);

					const response = await authenticatedFetch(
						`${API_BASE_URL}/auth/change-password`,
						{
							method: "PUT",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								currentPassword: currentPassword,
								newPassword: newPassword,
							}),
						}
					);

					const data = await response.json();

					if (response.ok) {
						showMessage(
							translations[currentLanguage]["password-changed-success"] ||
								"Password changed successfully",
							"success"
						);
						closeChangePasswordModal();
					} else {
						if (data.message && data.message.includes("current password")) {
							showMessage(
								translations[currentLanguage]["current-password-incorrect"] ||
									"Current password is incorrect",
								"error"
							);
						} else {
							showMessage(
								data.message ||
									translations[currentLanguage]["password-change-error"] ||
									"Error changing password",
								"error"
							);
						}
					}
				} catch (error) {
					console.error("Error changing password:", error);
					showMessage(
						translations[currentLanguage]["password-change-error"] ||
							"Error changing password",
						"error"
					);
				}
			}

			function logout() {
				clearTokens();
				showMessage("Signed out successfully. Redirecting...", "success");
				setTimeout(() => {
					window.location.href = "/signin";
				}, 1500);
			}

			// Download a full database backup as a ZIP file (non-driver roles only).
			async function downloadBackup(ev) {
				if (ev && ev.preventDefault) ev.preventDefault();
				try {
					if (currentUser && (currentUser.role === "rider" || currentUser.role === "market_driver")) {
						showMessage("Drivers are not allowed to download backups", "error");
						return;
					}
					showMessage("Preparing backup... this may take a moment.", "info");
					const response = await authenticatedFetch(`${API_BASE_URL}/backup`, {
						method: "GET",
					});
					if (!response.ok) {
						let msg = "Failed to download backup";
						try {
							const data = await response.json();
							if (data && data.message) msg = data.message;
						} catch (_) {}
						showMessage(msg, "error");
						return;
					}
					const blob = await response.blob();
					const disposition = response.headers.get("Content-Disposition") || "";
					let fileName = "frischly-backup.zip";
					const m = /filename=\"?([^\";]+)\"?/i.exec(disposition);
					if (m && m[1]) fileName = m[1];
					const url = window.URL.createObjectURL(blob);
					const a = document.createElement("a");
					a.href = url;
					a.download = fileName;
					document.body.appendChild(a);
					a.click();
					a.remove();
					setTimeout(() => window.URL.revokeObjectURL(url), 1000);
					showMessage("Backup downloaded successfully", "success");
				} catch (err) {
					console.error("Backup download error:", err);
					showMessage("Error downloading backup: " + (err.message || err), "error");
				}
			}

			// User Management Functions
			let currentUser = null;
			let allUsers = [];
			let allProducts = [];
			let allCategories = [];
			let allSubcategories = [];

			// Pretty role labels for the sidebar badge.
			const ROLE_LABELS = {
				admin: "Admin",
				manager: "Manager",
				staff: "Staff",
				rider: "Rider",
				customer: "Customer",
				market: "Market Owner",
				market_manager: "Market Manager",
				market_staff: "Market Staff",
				market_driver: "Market Driver",
			};
			function updateSidebarRoleBadge(role) {
				const el = document.getElementById("sidebar-role-badge");
				if (el && role) {
					el.textContent = ROLE_LABELS[role] || String(role).toUpperCase();
					el.className = "sidebar-role-badge role-" + role;
					el.style.display = "";
				}
				// Show the logged-in account's name under the role badge
				const nameEl = document.getElementById("sidebar-user-name");
				if (nameEl) {
					const name = currentUser && currentUser.name ? currentUser.name : "";
					nameEl.textContent = name;
					nameEl.style.display = name ? "" : "none";
				}
				// Show the market's own name under the "Freshly Admin" heading,
				// but only for the market-owner role (not staff/manager/admin).
				const marketNameEl = document.getElementById("sidebar-market-name");
				if (marketNameEl) {
					const marketName =
						role === "market" && currentUser && currentUser.market && currentUser.market.name
							? currentUser.market.name
							: "";
					marketNameEl.textContent = marketName;
					marketNameEl.style.display = marketName ? "block" : "none";
				}
			}

			// Check if user has management access and show/hide user management section
			function checkAdminAccess(user) {
				const marketsMenuItem = document.getElementById("markets-menu-item");
				if (marketsMenuItem) {
					marketsMenuItem.style.display = user.role === "admin" ? "" : "none";
				}

				// Allow both admin and manager roles to access user management
				if (user.role === "admin" || user.role === "manager") {
					const userMgmtSection = document.getElementById(
						"user-management-section"
					);
					if (userMgmtSection) {
						userMgmtSection.style.display = "block";
					}
					//loadAllUsers();
				}
			}

			// Load all users (excluding customers)
			async function loadAllUsers() {
				showSectionLoading("users", true, "Loading users...");
				console.log("Loading all users (excluding customers)...");

				try {
					// Check if we have a valid token
					if (!currentToken) {
						console.error("No auth token available");
						showMessage(
							"Authentication required. Please sign in again.",
							"error"
						);
						showSectionLoading("users", false);
						return;
					}

					// Use the excludeRole parameter to exclude customers
					const response = await authenticatedFetch(
						`${API_BASE_URL}/auth/users?excludeRole=customer`,
						{
							method: "GET",
							headers: {
								"Content-Type": "application/json",
							},
						}
					);

					if (response.ok) {
						const data = await response.json();
						console.log("Non-customer users data received:", data);
						allUsers = data.data && data.data.users ? data.data.users : [];
						displayUsers(allUsers);
						updateUsersCount(allUsers.length);
					} else if (response.status === 401) {
						showMessage("Session expired. Please sign in again.", "error");
						setTimeout(() => logout(), 2000);
					} else {
						const errorData = await response.json().catch(() => ({}));
						showMessage(
							formatApiError(errorData) || "Failed to load users list",
							"error"
						);
					}
				} catch (error) {
					console.error("Error loading users:", error);
					showMessage(
						`Failed to load users: ${getFriendlyNetworkErrorMessage(error)}`,
						"error"
					);
				} finally {
					showSectionLoading("users", false);
				}
			}

			// Display users in table
			function displayUsers(users) {
				const tbody = document.getElementById("users-table-body");
				if (!tbody) {
					console.error("Users table body element not found");
					return;
				}

				tbody.innerHTML = "";

				if (!users || users.length === 0) {
					tbody.innerHTML = `
						<tr>
							<td colspan="6" class="mdx-3">
								No users found.
							</td>
						</tr>
					`;
					return;
				}

				// Sort users to show customers after all other roles
				const sortedUsers = [...users].sort((a, b) => {
					const roleOrder = {
						admin: 1,
						manager: 2,
						staff: 3,
						rider: 4,
						customer: 5, // Customers come last
					};

					const roleA = roleOrder[a.role] || 3; // Default to staff level if role not found
					const roleB = roleOrder[b.role] || 3;

					if (roleA !== roleB) {
						return roleA - roleB;
					}

					// If same role, sort by name
					return (a.name || "").localeCompare(b.name || "");
				});

				sortedUsers.forEach((user) => {
					try {
						const row = document.createElement("tr");
						const userName = user.name || "N/A";
						const userEmail = user.email || "N/A";
						const userRole = user.role || "staff";
						const userStatus = user.isActive ? "Active" : "Inactive";
						const createdDate = user.createdAt
							? formatDate(user.createdAt)
							: "N/A";

						row.innerHTML = `
							<td>${userName}</td>
							<td>${userEmail}</td>
							<td><span class="role-badge ${userRole}">${userRole.toUpperCase()}</span></td>
							<td><span class="status-badge ${
								user.isActive ? "active" : "inactive"
							}">${userStatus}</span></td>
							<td>${createdDate}</td>
							<td>
								<div class="action-buttons">
									<button class="action-btn edit" onclick="editUser('${user._id}')">Edit</button>
									<button class="action-btn delete" onclick="deleteUser('${
										user._id
									}', '${userName.replace(/'/g, "\\'")}')">Delete</button>
								</div>
							</td>
						`;
						tbody.appendChild(row);
					} catch (error) {
						console.error("Error displaying user:", user, error);
					}
				});
			}

			// Update users count
			function updateUsersCount(count) {
				const totalUsersElement = document.getElementById("total-users-count");
				const dashboardUsersElement =
					document.getElementById("total-users-stat");

				if (totalUsersElement) {
					totalUsersElement.textContent = `${count} staff member${
						count !== 1 ? "s" : ""
					}`;
				}

				if (dashboardUsersElement) {
					dashboardUsersElement.textContent = count;
				}
			}

			// Show add user modal
			// === Lock user-address city to the market's city ===
			function getMarketCity() {
				if (!currentUser) return "";
				return (
					(currentUser.location && currentUser.location.city) ||
					(currentUser.address && currentUser.address.city) ||
					currentUser.city ||
					""
				);
			}

			function lockUserCityToMarket() {
				const cityField = document.getElementById("user-edit-city");
				if (!cityField) return;
				const marketCity = getMarketCity();
				if (!marketCity) return;

				if (cityField.tagName === "SELECT") {
					// Replace options with just the market city so it is the only choice.
					cityField.innerHTML =
						'<option value="' +
						marketCity.replace(/"/g, "&quot;") +
						'" selected>' +
						marketCity +
						"</option>";
				}
				cityField.value = marketCity;
				// Visually + functionally lock without using disabled (so FormData still includes it).
				cityField.style.pointerEvents = "none";
				cityField.style.background = "#f3f4f6";
				cityField.style.cursor = "not-allowed";
				cityField.setAttribute("tabindex", "-1");
				cityField.title = "City is fixed to your market's city: " + marketCity;
			}

			function showAddUserModal() {
				try {
					const modalTitle = document.getElementById("user-edit-modal-title");
					const userForm = document.getElementById("user-edit-form");
					const userId = document.getElementById("user-edit-id");
					const passwordGroup = document.getElementById(
						"user-edit-password-group"
					);
					const userPassword = document.getElementById("user-edit-password");
					const userModal = document.getElementById("user-edit-modal");

					if (
						!modalTitle ||
						!userForm ||
						!userId ||
						!passwordGroup ||
						!userPassword ||
						!userModal
					) {
						console.error("Modal elements not found");
						showMessage(
							"Modal not available. Please refresh the page.",
							"error"
						);
						return;
					}

					modalTitle.textContent = "Add New User";
					userForm.reset();
					userId.value = "";

					// Show password field for new users
					passwordGroup.style.display = "block";
					userPassword.setAttribute("required", "required");

					userModal.style.display = "block";
					lockUserCityToMarket();
				} catch (error) {
					console.error("Error showing add user modal:", error);
					showMessage("Error opening modal. Please try again.", "error");
				}
			}

			// Edit user
			async function editUser(userId) {
				try {
					// Show loading message
					showMessage("Loading user data...", "info");

					// Get user details directly from API
					const response = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						const statusText = response.statusText || response.status;
						const errorMessage =
							formatApiError(errorData) || `Failed to get user details: ${statusText}`;
						console.error(`API Error (${response.status}):`, errorMessage);
						throw new Error(errorMessage);
					}

					const result = await response.json();
					console.log("User details received:", result);
					const user = result.data;

					if (!user) {
						console.error("User data missing in API response:", result);
						showMessage("User not found or data missing", "error");
						return;
					}

					// Access form elements
					const modalTitle = document.getElementById("user-edit-modal-title");
					const form = document.getElementById("user-edit-form");

					if (!modalTitle || !form) {
						showMessage(
							"Modal form not available. Please refresh the page.",
							"error"
						);
						return;
					}

					// Set title
					modalTitle.textContent = "Edit User";

					// DO NOT reset the form as it clears all values
					// form.reset();  // Removing this line

					// Debug the user object
					console.log("User data for form:", {
						id: user._id,
						name: user.name,
						email: user.email,
						phone: user.phoneNumber,
						role: user.role,
						isActive: user.isActive,
					});

					// Set form values directly with null checks
					const idField = document.getElementById("user-edit-id");
					const nameField = document.getElementById("user-edit-name");
					const emailField = document.getElementById("user-edit-email");
					const phoneField = document.getElementById("user-edit-phone");
					const roleField = document.getElementById("user-edit-role");
					const statusField = document.getElementById("user-edit-status");

					// Check if all fields are found
					if (
						!idField ||
						!nameField ||
						!emailField ||
						!phoneField ||
						!roleField ||
						!statusField
					) {
						console.error("Some form fields were not found in the DOM");
						showMessage("Error: Some form fields could not be found", "error");
					}

					// Set values with validity checks

					// Use setTimeout to ensure values are set even if there's a timing issue
					setTimeout(() => {
						console.log("Verifying values after timeout:");
						if (emailField)
							console.log("Email field valuesssssssss:", user._id);
						if (phoneField) console.log("Phone field value:", phoneField.value);
					}, 100);

					// Set address values
					const address = user.address || {};
					console.log("Address data:", address);

					const streetField = document.getElementById("user-edit-street");
					const cityField = document.getElementById("user-edit-city");

					if (streetField) streetField.value = address.street || "";
					if (cityField) cityField.value = address.city || "";
					lockUserCityToMarket();
					if (idField) idField.value = user._id || "";
					if (nameField) nameField.value = user.name || "";
					if (emailField) emailField.value = user.email || "";
					if (phoneField) phoneField.value = user.phoneNumber || "";
					if (roleField) roleField.value = user.role || "staff";
					if (statusField) statusField.value = user.isActive ? "true" : "false";

					// Verify address values were set
					console.log("Address form values after setting:", {
						street: streetField ? streetField.value : "field not found",
						city: cityField ? cityField.value : "field not found",
					});

					// Hide password field when editing
					const passwordGroup = document.getElementById(
						"user-edit-password-group"
					);
					const userPassword = document.getElementById("user-edit-password");
					const userModal = document.getElementById("user-edit-modal");

					if (passwordGroup) {
						passwordGroup.style.display = "none";
						console.log("Password group hidden");
					} else {
						console.log("Password group element not found");
					}

					if (userPassword) {
						userPassword.removeAttribute("required");
						console.log("Password required attribute removed");
					} else {
						console.log("User password element not found");
					}

					// Display the modal
					if (userModal) {
						userModal.style.display = "block";
						console.log("User modal displayed");
					} else {
						console.log("User modal element not found");
						showMessage("Error: Could not find user modal element", "error");
					} // Log confirmation
					console.log("User form populated with:", {
						id: user._id,
						name: user.name,
						email: user.email,
						phone: user.phoneNumber,
						role: user.role,
						status: user.isActive,
					});
				} catch (error) {
					console.error("Error editing user:", error);
					const errorMsg =
						error.message || "Error opening user edit form. Please try again.";
					console.log("Error details:", errorMsg);

					// Display a clear error message to the user
					showMessage(
						`Failed to load user data: ${errorMsg}. Please try again.`,
						"error"
					);
				}
			}

			async function deleteUser(userId, userName) {
				if (
					!confirm(
						`Are you sure you want to delete user "${userName}"? This action cannot be undone.`
					)
				) {
					return;
				}

				try {
					const response = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
						method: "DELETE",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					const result = await response.json();

					if (response.ok) {
						showMessage(`User "${userName}" deleted successfully`, "success");
						loadAllUsers(); // Refresh the users list
						loadCustomers(); // Also refresh customers list in case a customer was deleted
					} else {
						showMessage(formatApiError(result, "Failed to delete user"), "error");
					}
				} catch (error) {
					console.error("Error deleting user:", error);
					showMessage(
						`Failed to delete user: ${error.message || "Unknown error"}`,
						"error"
					);
				}
			}

			// Save user (create or update)
			async function saveUser() {
				try {
					const form = document.getElementById("user-edit-form");
					const userIdElement = document.getElementById("user-edit-id");

					if (!form || !userIdElement) {
						showMessage(
							"Form not available. Please refresh the page.",
							"error"
						);
						return;
					}

					const formData = new FormData(form);
					const userId = userIdElement.value;

					// Validate required fields
					const requiredFields = [
						"name",
						"phone",
						"email",
						"role",
						"status",
						"street",
						"city",
					];
					for (const field of requiredFields) {
						if (!formData.get(field)) {
							console.log(`Missing required field: ${field}`);
							showMessage(`Please fill in the ${field} field.`, "error");
							return;
						}
					}

					// Debug form data
					console.log("Form data collected:");
					for (const [key, value] of formData.entries()) {
						console.log(`- ${key}: ${value}`);
					}

					// Validate password for new users
					if (!userId && !formData.get("password")) {
						showMessage("Password is required for new users.", "error");
						return;
					}

					const userData = {
						name: formData.get("name"),
						phoneNumber: formData.get("phone"),
						email: formData.get("email"),
						role: formData.get("role"),
						isActive: formData.get("status") === "true",
						address: {
							street: formData.get("street"),
							city: getMarketCity() || formData.get("city"),
						},
					};

					// Add password and email confirmation for new users
					if (!userId) {
						userData.password = formData.get("password");
						userData.emailConfirmed = true;
					}

					const url = userId
						? `${API_BASE_URL}/auth/users/${userId}`
						: `${API_BASE_URL}/auth/users`;
					const method = userId ? "PUT" : "POST";

					const response = await fetch(url, {
						method: method,
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(userData),
					});

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						throw new Error(
							formatApiError(errorData) ||
								`HTTP ${response.status}: ${response.statusText}`
						);
					}

					const result = await response.json();
					showMessage(
						result.message ||
							`User ${userId ? "updated" : "created"} successfully`,
						"success"
					);
					closeModal();
					await loadAllUsers(); // Refresh the list with updated data
				} catch (error) {
					console.error("Error saving user:", error);
					const errorMsg = error.message || "Unknown error occurred";
					console.log("Error details:", errorMsg);
					showMessage(`Failed to save user: ${errorMsg}`, "error");
				}
			}

			// Close modal
			function closeModal() {
				const modal = document.getElementById("user-edit-modal");
				if (modal) {
					modal.style.display = "none";
				}
			}

			// Refresh users list
			function refreshUsersList() {
				loadAllUsers();
				showMessage("Users list refreshed", "success");
			}

			// Sidebar Navigation Functions
			function toggleSidebar() {
				const sidebar = document.getElementById("sidebar");
				const mainContent = document.getElementById("mainContent");

				if (window.innerWidth <= 768) {
					sidebar.classList.toggle("show");
				} else {
					sidebar.classList.toggle("collapsed");
					mainContent.classList.toggle("expanded");
				}
			}

			// True once the user has opened a section themselves. loadUserProfile()
			// finishes asynchronously and then opens the default section; without this
			// flag that late call yanked the user back to Products if they had already
			// clicked something while the profile request was still in flight.
			let userHasChosenSection = false;

			function showSection(sectionName, fromMenu = true, isInitial = false) {
				if (!isInitial) userHasChosenSection = true;
				// Dashboard overview was removed – always fall back to Products.
				if (sectionName === "dashboard") sectionName = "products";
				// Stop live updates for orders if switching away from orders section
				const currentActiveSection = document.querySelector(
					".content-section.active"
				);
				if (
					currentActiveSection &&
					currentActiveSection.id === "orders-section" &&
					sectionName !== "orders"
				) {
					stopOrdersLiveUpdates();
				}

				// Hide all sections
				const sections = document.querySelectorAll(".content-section");
				sections.forEach((section) => {
					section.classList.remove("active");
				});

				// Remove active class from all menu items
				const menuItems = document.querySelectorAll(".menu-item");
				menuItems.forEach((item) => {
					item.classList.remove("active");
				});

				// Show selected section
				const targetSection = document.getElementById(sectionName + "-section");
				if (targetSection) {
					targetSection.classList.add("active");
				}

				// Add active class to selected menu item
				const activeMenuItem = document.getElementById("menu-" + sectionName);
				if (activeMenuItem) {
					activeMenuItem.parentElement.classList.add("active");
				}

				// Load section-specific data
				loadSectionData(sectionName, fromMenu);

				// Close sidebar on mobile after selection
				if (window.innerWidth <= 768) {
					document.getElementById("sidebar").classList.remove("show");
				}
			}

			function loadSectionData(sectionName, fromMenu = true) {
				switch (sectionName) {
					case "dashboard":
						loadDashboardStats();
						loadSubcategoriesForProductFilter();
						break;
					case "users":
						if (
							currentUser &&
							(currentUser.role === "admin" ||
								currentUser.role === "manager" ||
								currentUser.role === "market")
						) {
							// Default to staff tab, load staff data
							showStaffTab("staff");
						}
						break;
					case "categories":
						// If categories are already loaded, display them; otherwise load them
						if (allCategories && allCategories.length > 0) {
							displayCategories(allCategories);
							updateCategoriesCount(allCategories.length);
							updateCategorySummary();
						} else {
							loadCategories();
							refreshSubcategories();
						}
						break;
					case "products":
						// Always refresh products data when section is opened
						if (fromMenu) {
							// Load products with default filters (no filters applied)
							const defaultFilters = {
								searchTerm: "",
								categoryId: "all",
								status: "all",
								priceRange: "all",
								stockLevel: "all",
								sortOption: "createdAt-desc",
							};
							loadProducts(1, productsPageSize, defaultFilters);
							loadSubcategoriesForProductFilter();
						} else {
							// If not from menu (e.g., switching tabs), just refresh the display
						}
						// Load categories for the filter dropdown
						//loadSubcategoriesForProductFilter();
						// Attach search event listeners
						setTimeout(attachProductSearchListeners, 100);
						break;
					case "orders":
						startOrdersLiveUpdates();
						break;
					case "statistics":
						// Load product sales statistics
						loadProductSalesStats(1);
						break;
					case "riders":
						// Default to riders tab, load riders data
						showRidersTab("riders");
						break;
					case "profile":
						loadProfileSection();
						break;
					case "waste":
						// Previously loaded by a click handler bound to #menu-waste, which
						// meant the section stayed empty whenever it was opened without a
						// click — e.g. via /market-dashboard?section=waste.
						loadWasteRecords(1);
						break;
					case "settings":
						// Load saved language preference
						loadSavedLanguage();
						loadSettings();
						break;
					case "promocodes":
						loadPromoCodes(true); // Load promo tab (own company)
						loadPromoCodes(false); // Load onetime tab (other company)
						break;
					case "announcements":
						loadAnnouncements();
						break;
					case "kitchens":
						loadKitchens();
						break;
					case "kitchencategories":
						loadKitchenCategories();
						break;
				}
			}

			// Dashboard Statistics
			async function loadDashboardStats() {
				showSectionLoading(
					"dashboard",
					true,
					"Loading dashboard statistics..."
				);

				// Load customer count for dashboard.
				// NOTE: `/api/auth/customers/count` and `/api/products/count` have
				// no market-scoped equivalent and are silently no-op'd (always
				// return 0) by the fetch-rewriting shim at the top of this file —
				// using them here made the "Total Customers" and "Total Products"
				// dashboard cards permanently show 0 even when the market has real
				// data. Use the tenant-scoped `/api/market-admin/dashboard` summary
				// endpoint instead, which correctly counts this market's own
				// customers/products/orders/sales in a single request.
				try {
					const response = await fetch(`${API_BASE_URL}/market-admin/dashboard`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});
					if (response.ok) {
						const data = await response.json();
						const stats = (data.success && data.data) || {};
						const customerCount = stats.totalCustomers || 0;
						const productsCount = stats.totalProducts || 0;

						document.getElementById("total-users-stat").textContent =
							customerCount;
						console.log(`Dashboard: Loaded customer count: ${customerCount}`);

						document.getElementById("total-products-stat").textContent =
							productsCount;
						const productsCountDisplayEl = document.getElementById(
							"products-count-display"
						);
						if (productsCountDisplayEl)
							productsCountDisplayEl.textContent = `${productsCount} products`;
					} else {
						const errorData = await response.json().catch(() => ({}));
						console.error("Error loading market dashboard summary:", errorData);
						document.getElementById("total-users-stat").textContent = "0";
					}
				} catch (error) {
					console.error("Error loading market dashboard summary:", error);
					document.getElementById("total-users-stat").textContent = "0";
				}

				// Load all users for other sections that may need it
				// try {
				// 	const response = await fetch(`${API_BASE_URL}/auth/users`, {
				// 		headers: {
				// 			Authorization: `Bearer ${currentToken}`,
				// 			"Content-Type": "application/json",
				// 		},
				// 	});
				// 	if (response.ok) {
				// 		const data = await response.json();
				// 		// Update allUsers for use in other sections
				// 		allUsers = data.data && data.data.users ? data.data.users : [];
				// 	}
				// } catch (error) {
				// 	console.error("Error loading all users:", error);
				// }

				// Load categories data and count for dashboard
				// try {
				// 	const response = await fetch(
				// 		`${API_BASE_URL}/categories?isActive=all&sortBy=isActive&sortOrder=desc`,
				// 		{
				// 			headers: {
				// 				Authorization: `Bearer ${currentToken}`,
				// 				"Content-Type": "application/json",
				// 			},
				// 		}
				// 	);
				// 	if (response.ok) {
				// 		const data = await response.json();
				// 		// Store categories data for use in categories section
				// 		allCategories = data.data || [];

				// 		const categoriesCount = allCategories.length;
				// 		refreshSubcategories();
				// 	}
				// } catch (error) {
				// 	console.error("Error loading categories count:", error);
				// }

				// NOTE: Product count/list for the dashboard stat card is now
				// populated above from `/api/market-admin/dashboard` (see the
				// customer-count block). The old `/api/products/count` call was
				// removed here because it is silently no-op'd by the fetch shim
				// (no market-scoped equivalent exists), which made this stat
				// permanently read 0. The full product list for the Products tab
				// itself is loaded separately via `loadProducts()`.

				// Load orders count for dashboard
				try {
					const response = await fetch(`${API_BASE_URL}/orders/count`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});
					if (response.ok) {
						const data = await response.json();
						const ordersCount = data.count || 0;

						const totalOrdersStatEl =
							document.getElementById("total-orders-stat");
						if (totalOrdersStatEl) totalOrdersStatEl.textContent = ordersCount;
						const ordersCountDisplayEl = document.getElementById(
							"orders-count-display"
						);
						if (ordersCountDisplayEl)
							ordersCountDisplayEl.textContent = `${ordersCount} orders`;
					}
				} catch (error) {
					console.error("Error loading orders count:", error);
					const totalOrdersStatElErr =
						document.getElementById("total-orders-stat");
					if (totalOrdersStatElErr) totalOrdersStatElErr.textContent = "0";
					const ordersCountDisplayElErr = document.getElementById(
						"orders-count-display"
					);
					if (ordersCountDisplayElErr)
						ordersCountDisplayElErr.textContent = "0 orders";
				}

				// Load rider stats for dashboard
				try {
					await loadRiderStats();
				} catch (error) {
					console.error("Error loading rider stats:", error);
					document.getElementById("total-riders-stat").textContent = "0";
				}

				showSectionLoading("dashboard", false);
			} // Categories Management Functions
			async function loadCategories() {
				showSectionLoading("categories", true, "Loading categories...");

				try {
					// Load all categories (both active and inactive) for management
					const response = await fetch(
						`${API_BASE_URL}/categories?isActive=all&sortBy=isActive&sortOrder=desc`,
						{
							method: "GET",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
						}
					);

					if (response.ok) {
						const data = await response.json();
						allCategories = (data.data && data.data.categories) || [];
						displayCategories(allCategories);
						updateCategoriesCount(allCategories.length);
						updateCategorySummary();

						// Synchronize filters across sections
						synchronizeFilters();
					} else if (response.status === 401) {
						showMessage("Session expired. Please sign in again.", "error");
						setTimeout(() => logout(), 2000);
					} else {
						const errorData = await response.json().catch(() => ({}));
						showMessage(
							formatApiError(errorData) || "Failed to load categories",
							"error"
						);
					}
				} catch (error) {
					console.error("Error loading categories:", error);
					showMessage(getFriendlyNetworkErrorMessage(error), "error");
				} finally {
					showSectionLoading("categories", false);
				}
			}

			function displayCategories(categories) {
				const tbody = document.getElementById("categories-table-body");
				if (!tbody) {
					console.error("Categories table body element not found");
					return;
				}

				tbody.innerHTML = "";

				if (!categories || categories.length === 0) {
					tbody.innerHTML = `
						<tr>
							<td colspan="8" class="mdx-3">
								No categories found. Click "Add Category" to create one.
							</td>
						</tr>
					`;
					return;
				}

				categories.forEach((category, index) => {
					try {
						const row = document.createElement("tr");
						const categoryName = category.name || "N/A";
						const description = category.description || "No description";
						const productCount = category.productCount || "?";
						const status = category.isActive ? "Active" : "Inactive";
						const createdDate = category.createdAt
							? formatDate(category.createdAt)
							: "N/A";

						// Add styling for inactive categories
						if (!category.isActive) {
							row.style.opacity = "0.6";
							row.style.backgroundColor = "#f8f9fa";
						}

						row.innerHTML = `
							<td class="mdx-128">${index + 1}</td>
							<td class="mdx-129">
								${
									category.image
										? `<img src="${category.image.replace(
												"https://res.cloudinary.com/dbgnsnrto/image/upload/",
												"https://res.cloudinary.com/dbgnsnrto/image/upload/"
										  )}" alt="${categoryName}"
									
										onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" class="mdx-130">`
										: ""
								}
								<div class="mdx-131" style="display: ${category.image ? "none" : "flex"}">
									📁
								</div>
							</td>
							<td class="mdx-132">
								<a href="#" onclick="navigateToCategorySubcategories('${
									category._id
								}', '${categoryName.replace(/'/g, "\\'")}')"
								  
								   onmouseover="this.style.textDecoration='underline'"
								   onmouseout="this.style.textDecoration='none'" class="mdx-133">
									${categoryName}
								</a>
							</td>
							<td class="mdx-134">${description}</td>
							<td>
								<span id="product-count-${
									category._id
								}" class="mdx-135">
									${productCount === "?" ? "Loading..." : productCount}
								</span>
							</td>
							<td class="mdx-136">
								${category.sortOrder || 0}
							</td>
							<td><span class="status-badge ${
								category.isActive ? "active" : "inactive"
							}">${status}</span></td>
							<td>${createdDate}</td>
							<td>
								<div class="action-buttons">
									<button class="action-btn edit" onclick="editCategory('${
										category._id
									}')">Edit</button>
									${
										category.isActive
											? `<button class="action-btn mdx-137" onclick="deactivateCategory('${category._id}', '${categoryName.replace(
													/'/g,
													"\\'"
											  )}')">Deactivate</button>`
											: `<button class="action-btn mdx-138" onclick="activateCategory('${category._id}', '${categoryName.replace(
													/'/g,
													"\\'"
											  )}')">Activate</button>`
									}
									<button class="action-btn delete" onclick="deleteCategory('${
										category._id
									}', '${categoryName.replace(/'/g, "\\'")}')">Delete</button>
								</div>
							</td>
						`;
						tbody.appendChild(row);
					} catch (error) {
						console.error("Error displaying category:", category, error);
					}
				});

				// Automatically fetch product counts for all displayed categories
				setTimeout(() => fetchAllCategoryProductCounts(categories), 100);
			}

			function updateCategoriesCount(count) {
				const categoriesCountDisplayElement = document.getElementById(
					"categories-count-display"
				);

				if (categoriesCountDisplayElement) {
					categoriesCountDisplayElement.textContent = `${count} categor${
						count !== 1 ? "ies" : "y"
					}`;
				}
			}

			function updateCategorySummary() {
				const summaryElement = document.getElementById("category-summary");
				if (!summaryElement || !allCategories) return;

				const activeCount = allCategories.filter(
					(category) => category.isActive
				).length;
				const inactiveCount = allCategories.filter(
					(category) => !category.isActive
				).length;
				const totalCount = allCategories.length;

				summaryElement.innerHTML = `
					<strong>Total:</strong> ${totalCount} categories |
					<span class="mdx-139"><strong>Active:</strong> ${activeCount}</span> |
					<span class="mdx-140"><strong>Inactive:</strong> ${inactiveCount}</span>
				`;
			}

			function showAddCategoryModal() {
				try {
					const modalTitle = document.getElementById("category-modal-title");
					const categoryForm = document.getElementById("category-form");
					const categoryId = document.getElementById("category-id");
					const categoryModal = document.getElementById("category-modal");

					if (!modalTitle || !categoryForm || !categoryId || !categoryModal) {
						console.error("Category modal elements not found");
						showMessage(
							"Modal not available. Please refresh the page.",
							"error"
						);
						return;
					}

					modalTitle.textContent = "Add New Category";
					categoryForm.reset();
					categoryId.value = "";

					// Clear image-related fields
					const currentImageField = document.getElementById(
						"category-current-image"
					);
					const imagePreview = document.getElementById(
						"category-image-preview"
					);
					if (currentImageField) currentImageField.value = "";
					if (imagePreview) imagePreview.style.display = "none";

					categoryModal.style.display = "block";
				} catch (error) {
					console.error("Error showing add category modal:", error);
					showMessage("Error opening modal. Please try again.", "error");
				}
			}

			function editCategory(categoryId) {
				try {
					showMessage("Updating category...", "info");

					const category = allCategories.find((c) => c._id === categoryId);
					if (!category) {
						showMessage("Category not found", "error");
						return;
					}

					const elements = {
						modalTitle: document.getElementById("category-modal-title"),
						categoryId: document.getElementById("category-id"),
						categoryName: document.getElementById("category-name"),
						categoryDescription: document.getElementById(
							"category-description"
						),
						categoryImage: document.getElementById("category-image"),
						// Clear file input
						categoryIcon: document.getElementById("category-icon"),
						categorySortOrder: document.getElementById("category-sort-order"),
						categoryStatus: document.getElementById("category-status"),
						categoryModal: document.getElementById("category-modal"),
					};

					for (const [key, element] of Object.entries(elements)) {
						if (!element) {
							console.error(`Element ${key} not found`);
							showMessage(
								"Modal form not available. Please refresh the page.",
								"error"
							);
							return;
						}
					}

					elements.modalTitle.textContent = "Edit Category";
					elements.categoryId.value = category._id;
					elements.categoryName.value = category.name || "";
					elements.categoryDescription.value = category.description || "";

					// Handle existing image display
					const imagePreview = document.getElementById(
						"category-image-preview"
					);
					const previewImg = document.getElementById("category-preview-img");
					const currentImageField = document.getElementById(
						"category-current-image"
					);
					//currentImageField.value = category.image || "";
					if (category.image) {
						previewImg.src = category.image.replace(
							"https://res.cloudinary.com/dbgnsnrto/image/upload/",
							"https://res.cloudinary.com/dbgnsnrto/image/upload/"
						);
						imagePreview.style.display = "block";
						if (currentImageField) currentImageField.value = category.image;
					} else {
						imagePreview.style.display = "none";

						if (currentImageField) currentImageField.value = "";
					}

					elements.categoryIcon.value = category.icon || "";
					elements.categorySortOrder.value = category.sortOrder || 0;
					elements.categoryStatus.value = category.isActive ? "true" : "false";

					elements.categoryModal.style.display = "block";
				} catch (error) {
					console.error("Error editing category:", error);
					showMessage(
						"Error opening category edit form. Please try again.",
						"error"
					);
				}
			}

			async function deleteCategory(categoryId, categoryName) {
				if (
					!confirm(
						`Are you sure you want to delete category "${categoryName}"? This action cannot be undone.`
					)
				) {
					return;
				}

				try {
					const response = await fetch(
						`${API_BASE_URL}/categories/${categoryId}`,
						{
							method: "DELETE",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
						}
					);

					const result = await response.json();

					if (response.ok) {
						showMessage(
							`Category "${categoryName}" deleted successfully`,
							"success"
						);
						loadCategories();
					} else {
						showMessage(formatApiError(result, "Failed to delete category"), "error");
					}
				} catch (error) {
					showMessage("Error deleting category: " + error.message, "error");
				}
			}

			async function deactivateCategory(categoryId, categoryName) {
				if (
					!confirm(
						`Are you sure you want to deactivate category "${categoryName}"? This will also deactivate all its subcategories.`
					)
				) {
					return;
				}

				try {
					const response = await fetch(
						`${API_BASE_URL}/categories/${categoryId}`,
						{
							method: "PUT",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								isActive: false,
							}),
						}
					);

					const result = await response.json();

					if (response.ok) {
						showMessage(
							`Category "${categoryName}" deactivated successfully`,
							"success"
						);
						loadCategories();
					} else {
						showMessage(formatApiError(result, "Failed to deactivate category"), "error");
					}
				} catch (error) {
					showMessage("Error deactivating category: " + error.message, "error");
				}
			}

			async function activateCategory(categoryId, categoryName) {
				try {
					const response = await fetch(
						`${API_BASE_URL}/categories/${categoryId}`,
						{
							method: "PUT",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								isActive: true,
							}),
						}
					);

					const result = await response.json();

					if (response.ok) {
						showMessage(
							`Category "${categoryName}" activated successfully`,
							"success"
						);
						loadCategories();
					} else {
						showMessage(formatApiError(result, "Failed to activate category"), "error");
					}
				} catch (error) {
					showMessage("Error activating category: " + error.message, "error");
				}
			}

			async function saveCategory() {
				try {
					showMessage("Saving category...", "info");
					const form = document.getElementById("category-form");
					const categoryIdElement = document.getElementById("category-id");

					if (!form || !categoryIdElement) {
						showMessage(
							"Form not available. Please refresh the page.",
							"error"
						);
						return;
					}

					const formData = new FormData(form);
					const categoryId = categoryIdElement.value;

					if (!formData.get("name")) {
						showMessage("Please provide a category name.", "error");
						return;
					}

					let imageUrl = "";

					// Handle image upload if a file is selected
					const fileInput = document.getElementById("category-image");
					if (fileInput && fileInput.files && fileInput.files[0]) {
						const imageFormData = new FormData();
						imageFormData.append("image", fileInput.files[0]);

						const uploadResponse = await fetch(
							`${API_BASE_URL}/categories/upload-image`,
							{
								method: "POST",
								headers: {
									Authorization: `Bearer ${currentToken}`,
								},
								body: imageFormData,
							}
						);

						if (!uploadResponse.ok) {
							const uploadError = await uploadResponse.json().catch(() => ({}));
							throw new Error(formatApiError(uploadError, "Error uploading image"));
						}

						const uploadResult = await uploadResponse.json();
						imageUrl = uploadResult.data.url;
					} else if (categoryId) {
						// If editing and no new file, preserve existing image
						const currentImageField = document.getElementById(
							"category-current-image"
						);
						imageUrl = currentImageField ? currentImageField.value : "";
					}

					const categoryData = {
						name: formData.get("name"),
						description: formData.get("description") || "",
						image: imageUrl,
						icon: formData.get("icon") || "",
						sortOrder: parseInt(formData.get("sortOrder")) || 0,
						isActive: formData.get("status") === "true",
					};

					const url = categoryId
						? `${API_BASE_URL}/categories/${categoryId}`
						: `${API_BASE_URL}/categories`;
					const method = categoryId ? "PUT" : "POST";

					const response = await fetch(url, {
						method: method,
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(categoryData),
					});

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						throw new Error(
							formatApiError(errorData) ||
								`HTTP ${response.status}: ${response.statusText}`
						);
					}

					const result = await response.json();
					showMessage(
						result.message ||
							`Category ${categoryId ? "updated" : "created"} successfully`,
						"success"
					);
					closeCategoryModal();
					await loadCategories();
				} catch (error) {
					console.error("Error saving category:", error);
					showMessage("Error saving category: " + error.message, "error");
				}
			}

			function closeCategoryModal() {
				const modal = document.getElementById("category-modal");
				if (modal) {
					modal.style.display = "none";
				}
			}

			// Function to navigate to subcategory tab and filter by category
			function navigateToCategorySubcategories(categoryId, categoryName) {
				try {
					// Switch to subcategory tab

					showCategoryTab("subcategories", true);

					// Set the parent category filter to the clicked category
					const parentFilter = document.getElementById(
						"subcategory-parent-filter"
					);
					if (parentFilter) {
						parentFilter.value = categoryId;
					}

					// Clear other filters
					const searchInput = document.getElementById("subcategory-search");
					const statusFilter = document.getElementById("subcategory-filter");

					if (searchInput) searchInput.value = "";
					if (statusFilter) statusFilter.value = "all";

					// Apply the filter
					filterSubcategories();

					// Show success message
					showMessage(`Showing subcategories for "${categoryName}"`, "info");
				} catch (error) {
					console.error("Error navigating to category subcategories:", error);
					showMessage("Error navigating to subcategories", "error");
				}
			}

			function closeSubcategoryModal() {
				const modal = document.getElementById("subcategory-modal");
				if (modal) {
					modal.style.display = "none";
				}
			}

			function refreshCategories() {
				loadCategories();
				showMessage("Categories refreshed", "success");
			}

			function filterCategories() {
				const filterSelect = document.getElementById("category-filter");
				const searchInput = document.getElementById("category-search");
				const sortSelect = document.getElementById("category-sort");
				const filterValue = filterSelect.value;
				const searchValue = searchInput
					? searchInput.value.toLowerCase().trim()
					: "";
				const sortValue = sortSelect ? sortSelect.value : "name-asc";
				const tableTitle = document.getElementById("categories-table-title");

				let filteredCategories = [];
				let titleText = "";

				// First apply status filter
				switch (filterValue) {
					case "active":
						filteredCategories = allCategories.filter(
							(category) => category.isActive
						);
						titleText = "Active Categories";
						break;
					case "inactive":
						filteredCategories = allCategories.filter(
							(category) => !category.isActive
						);
						titleText = "Inactive Categories";
						break;
					case "all":
					default:
						filteredCategories = allCategories;
						titleText = "All Categories";
						break;
				}

				// Then apply search filter if there's a search term
				if (searchValue) {
					filteredCategories = filteredCategories.filter((category) => {
						const name = (category.name || "").toLowerCase();
						const description = (category.description || "").toLowerCase();
						return (
							name.includes(searchValue) || description.includes(searchValue)
						);
					});

					// Update title to reflect search
					if (searchValue) {
						titleText += ` (Searching: "${searchInput.value}")`;
					}
				}

				// Apply sorting
				filteredCategories = sortCategories(filteredCategories, sortValue);

				// Update title to reflect sort
				const sortLabel = getSortLabel(sortValue);
				if (sortValue !== "name-asc") {
					titleText += ` (${sortLabel})`;
				}

				// Add count to title
				titleText += ` (${filteredCategories.length})`;

				if (tableTitle) tableTitle.textContent = titleText;
				displayCategories(filteredCategories);
			}

			// Helper function to sort categories
			function sortCategories(categories, sortValue) {
				const [field, order] = sortValue.split("-");
				return categories.sort((a, b) => {
					let aValue, bValue;

					switch (field) {
						case "name":
							aValue = (a.name || "").toLowerCase();
							bValue = (b.name || "").toLowerCase();
							break;
						case "createdAt":
							aValue = new Date(a.createdAt || 0);
							bValue = new Date(b.createdAt || 0);
							break;
						case "updatedAt":
							aValue = new Date(a.updatedAt || 0);
							bValue = new Date(b.updatedAt || 0);
							break;
						default:
							return 0;
					}

					if (order === "desc") {
						return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
					} else {
						return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
					}
				});
			}

			// Helper function to get sort label
			function getSortLabel(sortValue) {
				const labels = {
					"name-asc": "Name A-Z",
					"name-desc": "Name Z-A",
					"createdAt-desc": "Newest First",
					"createdAt-asc": "Oldest First",
					"updatedAt-desc": "Recently Updated",
				};
				return labels[sortValue] || "Name A-Z";
			}

			// Function to clear all category filters
			function clearCategoryFilters() {
				const searchInput = document.getElementById("category-search");
				const filterSelect = document.getElementById("category-filter");
				const sortSelect = document.getElementById("category-sort");

				if (searchInput) searchInput.value = "";
				if (filterSelect) filterSelect.value = "all";
				if (sortSelect) sortSelect.value = "name-asc";

				filterCategories();
				showMessage("Category filters cleared", "info");
			}

			// Function to update product category filter options
			function updateProductCategoryFilter() {
				const productCategoryFilter = document.getElementById(
					"product-category-filter"
				);
				if (!productCategoryFilter || !allSubcategories) return;

				// Clear existing options except "All Subcategories"
				const currentValue = productCategoryFilter.value;
				productCategoryFilter.innerHTML =
					'<option value="all">All Subcategories</option>';

				// Add subcategories as options
				allSubcategories.forEach((subcategory) => {
					const option = document.createElement("option");
					option.value = subcategory._id;
					// Show both subcategory name and parent category for clarity
					const displayText = subcategory.parentCategory
						? `${subcategory.name} (${subcategory.parentCategory.name})`
						: subcategory.name;
					option.textContent = displayText;
					if (currentValue === subcategory._id) {
						option.selected = true;
					}
					productCategoryFilter.appendChild(option);
				});
			}

			// Function to update subcategory parent filter options
			function updateSubcategoryParentFilter() {
				const parentFilter = document.getElementById(
					"subcategory-parent-filter"
				);
				if (!parentFilter || !allCategories) return;

				console.log(allCategories);

				// Clear existing options except "All Parent Categories"
				const currentValue = parentFilter.value;
				parentFilter.innerHTML =
					'<option value="all">All Parent Categories</option>';

				// Add categories as options
				allCategories.forEach((category) => {
					const option = document.createElement("option");
					option.value = category._id;
					option.textContent = category.name;
						if (currentValue === category._id) {
							option.selected = true;
						}
						parentFilter.appendChild(option);
					});
			}

			// Function to synchronize filters across sections
			function synchronizeFilters() {
				updateProductCategoryFilter();
				updateSubcategoryParentFilter();
			}

			// Function to fetch product count for a specific category (kept for backward compatibility)
			async function fetchCategoryProductCount(categoryId) {
				try {
					// Show loading indicator
					const countElement = document.getElementById(
						`product-count-${categoryId}`
					);
					if (countElement) {
						countElement.textContent = "Loading...";
					}

					// Fetch product count from API
					const response = await fetch(
						`${API_BASE_URL}/categories/${categoryId}/product-count`,
						{
							method: "GET",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
						}
					);

					if (response.ok) {
						const data = await response.json();
						if (data.success && countElement) {
							countElement.textContent = data.data.productCount;
							// Flash animation to show updated value
							countElement.style.backgroundColor = "#e6f7ff";
							setTimeout(() => {
								countElement.style.backgroundColor = "transparent";
							}, 1500);
						}
					} else {
						const errorData = await response.json();
						console.error("Error fetching product count:", errorData);
						if (countElement) {
							countElement.textContent = "0";
						}
					}
				} catch (error) {
					console.error("Error fetching product count:", error);
					const countElement = document.getElementById(
						`product-count-${categoryId}`
					);
					if (countElement) {
						countElement.textContent = "0";
					}
				}
			}

			// Function to fetch product counts for all displayed categories using the new bulk API
			async function fetchAllCategoryProductCounts(categories) {
				if (!categories || categories.length === 0) return;

				console.log(
					`Fetching product counts for ${categories.length} categories using bulk API...`
				);

				// Show loading indicators for all categories
				categories.forEach((category) => {
					const countElement = document.getElementById(
						`product-count-${category._id}`
					);
					if (countElement) {
						countElement.textContent = "Loading...";
					}
				});

				try {
					// Use the new bulk API endpoint to get all product counts at once
					const response = await fetch(
						`${API_BASE_URL}/categories/all/product-count`,
						{
							method: "GET",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
						}
					);

					if (response.ok) {
						const data = await response.json();
						if (data.success && data.data) {
							// Create a map of categoryId to productCount for quick lookup
							const productCountMap = {};
							data.data.forEach((item) => {
								productCountMap[item.categoryId] = item.productCount;
							});

							// Update all category product count displays
							categories.forEach((category) => {
								const countElement = document.getElementById(
									`product-count-${category._id}`
								);
								if (countElement) {
									const productCount = productCountMap[category._id] || 0;
									countElement.textContent = productCount;

									// Flash animation to show updated value
									countElement.style.backgroundColor = "#e6f7ff";
									setTimeout(() => {
										countElement.style.backgroundColor = "transparent";
									}, 1500);
								}
							});

							console.log(
								`Successfully updated product counts for ${data.data.length} categories`
							);
						}
					} else {
						const errorData = await response.json().catch(() => ({}));
						console.error("Error fetching bulk product counts:", errorData);

						// Fall back to zero counts when the optional count endpoint fails
						categories.forEach((category) => {
							const countElement = document.getElementById(
								`product-count-${category._id}`
							);
							if (countElement) {
								countElement.textContent = "0";
							}
						});
					}
				} catch (error) {
					console.error("Error fetching bulk product counts:", error);

					// Fall back to zero counts when the optional count endpoint fails
					categories.forEach((category) => {
						const countElement = document.getElementById(
							`product-count-${category._id}`
						);
						if (countElement) {
							countElement.textContent = "0";
						}
					});
				}
			}

			// Clear all category filters
			function clearCategoryFilters() {
				const searchInput = document.getElementById("category-search");
				const filterSelect = document.getElementById("category-filter");

				if (searchInput) searchInput.value = "";
				if (filterSelect) filterSelect.value = "all";

				filterCategories();
			}

			// Subcategories Management Functions
			let subcategoriesData = [];
			let filteredSubcategoriesData = [];

			async function refreshSubcategories() {
				try {
					showMessage("Loading subcategories...", "info", 1000);

					const response = await authenticatedFetch(
						`${API_BASE_URL}/subcategories?active=all`
					);
					if (!response.ok) {
						throw new Error("Failed to fetch subcategories");
					}

					const result = await response.json();
					subcategoriesData = (result.data && result.data.subcategories) || [];
					filteredSubcategoriesData = [...subcategoriesData];

					updateSubcategoriesTable();
					updateSubcategoriesCount();
				} catch (error) {
					console.error("Error fetching subcategories:", error);
					showMessage("Failed to load subcategories", "error");
				}
				showMessage("Subcategories loaded successfully", "success", 1000);
			}

			function updateSubcategoriesTable() {
				const tbody = document.getElementById("subcategories-table-body");
				if (!tbody) {
					console.error("Subcategories table body element not found");
					return;
				}

				if (filteredSubcategoriesData.length === 0) {
					tbody.innerHTML = `
						<tr>
							<td colspan="7" class="mdx-3">
								No subcategories found. Click "Add Subcategory" to create one.
							</td>
						</tr>
					`;
					return;
				}

				tbody.innerHTML = filteredSubcategoriesData
					.map((subcategory, index) => {
						const createdDate = new Date(
							subcategory.createdAt
						).toLocaleDateString();
						const statusBadge = subcategory.isActive
							? '<span class="status-badge active">Active</span>'
							: '<span class="status-badge inactive">Inactive</span>';

						return `
							<tr>
								<td>${index + 1}</td>
								<td>
									<div class="item-info">
										<strong
											onclick="viewProductsBySubcategory('${subcategory._id}', '${subcategory.name}')"
											onmouseover="this.style.color='#0056b3'"
											onmouseout="this.style.color='#007bff'"
											title="Click to view products in this subcategory" class="mdx-141">${subcategory.name}</strong>
									</div>
								</td>
								<td>
									<div class="mdx-142">
										${
											subcategory.parentCategory?.image
												? `<img src="${subcategory.parentCategory.image.replace(
														"https://res.cloudinary.com/dbgnsnrto/image/upload/",
														"https://res.cloudinary.com/dbgnsnrto/image/upload/"
												  )}" alt="${subcategory.parentCategory.name}"
											
												onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" class="mdx-143">`
												: ""
										}
										${
											subcategory.parentCategory?.image
												? ""
												: `<div class="mdx-144">📁</div>`
										}
										<span class="category-badge">${
											subcategory.parentCategory?.name || "Unknown"
										}</span>
									</div>
								</td>
								<td>${subcategory.sortorder}</td>
								<td>${statusBadge}</td>
								<td>${createdDate}</td>
								<td>
									<div class="actions">
										<button
											class="btn-action edit"
											onclick="editSubcategory('${subcategory._id}')"
											title="Edit Subcategory"
										>
											✏️
										</button>
										<button
											class="btn-action ${subcategory.isActive ? "deactivate" : "activate"}"
											onclick="toggleSubcategoryStatus('${
												subcategory._id
											}', ${!subcategory.isActive})"
											title="${subcategory.isActive ? "Deactivate" : "Activate"} Subcategory"
										>
											${subcategory.isActive ? "🔒" : "🔓"}
										</button>
									</div>
								</td>
							</tr>
						`;
					})
					.join("");
			}

			function updateSubcategoriesCount() {
				const countDisplay = document.getElementById(
					"subcategories-count-display"
				);
				if (countDisplay) {
					const activeCount = filteredSubcategoriesData.filter(
						(s) => s.isActive
					).length;
					const totalCount = filteredSubcategoriesData.length;
					countDisplay.textContent = `${totalCount} subcategories (${activeCount} active)`;
				}
			}

			function filterSubcategories() {
				const searchTerm =
					document.getElementById("subcategory-search")?.value.toLowerCase() ||
					"";
				const parentFilter =
					document.getElementById("subcategory-parent-filter")?.value || "all";
				const statusFilter =
					document.getElementById("subcategory-filter")?.value || "all";

				filteredSubcategoriesData = subcategoriesData.filter((subcategory) => {
					const matchesSearch = subcategory.name
						.toLowerCase()
						.includes(searchTerm);
					const matchesParent =
						parentFilter === "all" ||
						subcategory.parentCategory?._id === parentFilter;
					const matchesStatus =
						statusFilter === "all" ||
						(statusFilter === "active" && subcategory.isActive) ||
						(statusFilter === "inactive" && !subcategory.isActive);

					return matchesSearch && matchesParent && matchesStatus;
				});

				updateSubcategoriesTable();
				updateSubcategoriesCount();

				const tableTitle = document.getElementById("subcategories-table-title");
				if (tableTitle) {
					const filterText =
						statusFilter === "all"
							? "All"
							: statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1);
					tableTitle.textContent = `${filterText} Subcategories`;
				}
			}

			function clearSubcategoryFilters() {
				const searchInput = document.getElementById("subcategory-search");
				const parentFilterSelect = document.getElementById(
					"subcategory-parent-filter"
				);
				const filterSelect = document.getElementById("subcategory-filter");

				if (searchInput) searchInput.value = "";
				if (parentFilterSelect) parentFilterSelect.value = "all";
				if (filterSelect) filterSelect.value = "all";

				filterSubcategories();
			}

			function loadCategoriesForSubcategoryFilter() {
				const parentFilter = document.getElementById(
					"subcategory-parent-filter"
				);
				if (!parentFilter || !allCategories) return;

				// Clear existing options except "All Parent Categories"
				parentFilter.innerHTML =
					'<option value="all">All Parent Categories</option>';

				// Add categories as options
				allCategories.forEach((category) => {
					const option = document.createElement("option");
					option.value = category._id;
					option.textContent = category.name;
					parentFilter.appendChild(option);
					});
			}

			function showAddSubcategoryModal() {
				// Reset form
				document.getElementById("subcategory-modal-title").textContent =
					"Add New Subcategory";
				document.getElementById("subcategory-save-btn-text").textContent =
					"Create Subcategory";
				document.getElementById("subcategory-id").value = "";
				document.getElementById("subcategory-name").value = "";
				document.getElementById("subcategory-parent").value = "";
				document.getElementById("subcategory-is-active").value = "true";
				document.getElementById("subcategory-sortorder").value = "";

				// Load categories for parent dropdown
				loadCategoriesForSubcategoryParentSelect();

				document.getElementById("subcategory-modal").style.display = "block";
			}

			function loadCategoriesForSubcategoryParentSelect() {
				const parentSelect = document.getElementById("subcategory-parent");
				if (!parentSelect || !allCategories) return;

				// Clear existing options
				parentSelect.innerHTML =
					'<option value="">Select Parent Category</option>';

				// Add categories as options
				allCategories
					.filter((category) => category.isActive)
					.forEach((category) => {
						const option = document.createElement("option");
						option.value = category._id;
						option.textContent = category.name;
						parentSelect.appendChild(option);
					});
			}

			async function saveSubcategory() {
				const id = document.getElementById("subcategory-id").value;
				const name = document.getElementById("subcategory-name").value;
				const parentCategory =
					document.getElementById("subcategory-parent").value;
				const isActive =
					document.getElementById("subcategory-is-active").value === "true";
				const sortorder = parseInt(
					document.getElementById("subcategory-sortorder").value || "0"
				);

				if (!name.trim()) {
					showMessage("Please enter a subcategory name", "error");
					return;
				}

				if (!parentCategory) {
					showMessage("Please select a parent category", "error");
					return;
				}

				try {
					const isEdit = !!id;
					const url = isEdit
						? `${API_BASE_URL}/subcategories/${id}`
						: `${API_BASE_URL}/subcategories`;
					const method = isEdit ? "PUT" : "POST";

					const response = await authenticatedFetch(url, {
						method,
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							name: name.trim(),
							parentCategory,
							isActive,
							sortorder,
						}),
					});

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.error || "Failed to save subcategory");
					}

					document.getElementById("subcategory-modal").style.display = "none";
					await refreshSubcategories();
					showMessage(
						`Subcategory ${isEdit ? "updated" : "created"} successfully`,
						"success"
					);
				} catch (error) {
					console.error("Error saving subcategory:", error);
					showMessage(error.message || "Failed to save subcategory", "error");
				}
			}

			function editSubcategory(subcategoryId) {
				const subcategory = subcategoriesData.find(
					(s) => s._id === subcategoryId
				);
				if (!subcategory) {
					showMessage("Subcategory not found", "error");
					return;
				}

				document.getElementById("subcategory-modal-title").textContent =
					"Edit Subcategory";
				document.getElementById("subcategory-save-btn-text").textContent =
					"Update Subcategory";
				document.getElementById("subcategory-id").value = subcategory._id;
				document.getElementById("subcategory-name").value = subcategory.name;
				document.getElementById("subcategory-is-active").value =
					subcategory.isActive.toString();
				document.getElementById("subcategory-sortorder").value =
					subcategory.sortorder || "";

				// Load categories for parent dropdown
				loadCategoriesForSubcategoryParentSelect();

				// Set parent after loading categories
				document.getElementById("subcategory-parent").value =
					subcategory.parentCategory?._id || "";

				document.getElementById("subcategory-modal").style.display = "block";
			}

			async function toggleSubcategoryStatus(subcategoryId, newStatus) {
				try {
					const response = await authenticatedFetch(
						`${API_BASE_URL}/subcategories/${subcategoryId}`,
						{
							method: "PUT",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								isActive: newStatus,
							}),
						}
					);

					if (!response.ok) {
						const error = await response.json();
						throw new Error(
							error.error || "Failed to update subcategory status"
						);
					}

					await refreshSubcategories();
					showMessage(
						`Subcategory ${
							newStatus ? "activated" : "deactivated"
						} successfully`,
						"success"
					);
				} catch (error) {
					console.error("Error updating subcategory status:", error);
					showMessage(
						error.message || "Failed to update subcategory status",
						"error"
					);
				}
			}

			// Function to view products by subcategory
			function viewProductsBySubcategory(subcategoryId, subcategoryName) {
				// Switch to products section
				showSection("products", false);

				// Set the subcategory filter to the selected subcategory
				const subcategoryFilter = document.getElementById(
					"product-category-filter"
				);
				const productSortFilter = document.getElementById(
					"product-sort-filter"
				);
				if (subcategoryFilter) {
					subcategoryFilter.value = subcategoryId;
					productSortFilter.value = "sortOrder-asc";
					// Trigger the search function to apply the filter
					searchProducts();

					// Show a message indicating the filter has been applied
					showMessage(
						`Showing products in "${subcategoryName}" subcategory`,
						"info"
					);
				} else {
					console.warn("Product category filter not found");
					showMessage("Switched to products section", "info");
				}
			}

			// Products Management Functions
			async function loadProducts(
				page = currentProductsPage,
				pageSize = productsPageSize,
				filters = null
			) {
				showSectionLoading("products", true, "Loading products...");

				try {
					// Use provided filters or get current ones
					const currentFilters = filters || getCurrentProductFilters();
					const url = buildProductsUrl(page, pageSize, currentFilters);

					const response = await fetch(url, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const data = await response.json();
						allProducts = (data.data && data.data.products) || [];
						const dataPagination = data.data && data.data.pagination;

						// Update pagination info FIRST before displaying products
						if (dataPagination) {
							totalProducts = Math.max(0, dataPagination.totalProducts || 0);
							productsPageSize = Math.max(1, pageSize);
							totalProductsPages =
								totalProducts > 0
									? Math.ceil(totalProducts / productsPageSize)
									: 1;

							// Ensure current page is within valid bounds
							currentProductsPage = Math.max(
								1,
								Math.min(page, totalProductsPages)
							);

							// If we're on a page that doesn't exist anymore (due to filtering), go to last valid page
							if (page > totalProductsPages && totalProductsPages > 0) {
								goToProductsPage(totalProductsPages);
								return;
							}

							// Now display products with correct pagination variables
							displayProducts(allProducts);

							updateProductsCount(totalProducts);
							updateProductsPagination();
						} else {
							// Fallback for non-paginated responses
							totalProducts = allProducts.length;
							currentProductsPage = 1;
							totalProductsPages = 1;

							// Display products with updated pagination variables
							displayProducts(allProducts);

							updateProductsCount(totalProducts);

							const paginationContainer = document.getElementById(
								"products-pagination"
							);
							if (paginationContainer) {
								paginationContainer.style.display = "none";
							}
						}
					} else if (response.status === 401) {
						showMessage("Session expired. Please sign in again.", "error");
						setTimeout(() => logout(), 2000);
					} else {
						const errorData = await response.json().catch(() => ({}));
						showMessage(
							formatApiError(errorData) || "Failed to load products",
							"error"
						);
					}
				} catch (error) {
					console.error("Error loading products:", error);
					showMessage(getFriendlyNetworkErrorMessage(error), "error");
				} finally {
					showSectionLoading("products", false);
				}
			}

			function displayProducts(products) {
				const tbody = document.getElementById("products-table-body");
				if (!tbody) {
					console.error("Products table body element not found");
					return;
				}

				tbody.innerHTML = "";

				if (!products || products.length === 0) {
					tbody.innerHTML = `
						<tr>
							<td colspan="11" class="mdx-3">
								No products found. Click "Add Product" to create one.
							</td>
						</tr>
					`;
					return;
				}

				products.forEach((product, index) => {
					try {
						const row = document.createElement("tr");
						const productName = product.name || "N/A";
						const subcategoryName = product.subcategory
							? product.subcategory.name || "N/A"
							: "Uncategorized";
						const parentCategoryName = product.subcategory?.parentCategory
							? product.subcategory.parentCategory.name || "N/A"
							: "N/A";
						// Calculate pricing information
						const basePrice = product.price || 0;
						const tax = product.tax || 0;
						const discount = product.discount || 0;
						const bottlerefund = product.bottlerefund || 0;

						// Calculate discounted price
						const discountAmount = (basePrice * discount) / 100;
						const discountedPrice = basePrice - discountAmount;

						// Calculate final price with tax and bottle refund
						const taxAmount = (discountedPrice * tax) / 100;
						const bottlerefundAmount = bottlerefund;
						const finalPrice = discountedPrice + taxAmount + bottlerefundAmount;

						const priceDisplay = basePrice ? `$${basePrice.toFixed(2)}` : "N/A";
						const finalPriceDisplay = basePrice
							? `$${finalPrice.toFixed(2)}`
							: "N/A";

						// Create price info with details
						const priceInfo = basePrice
							? `Base: $${basePrice.toFixed(2)}${
									discount > 0
										? `\nDiscount: ${discount}% (-$${discountAmount.toFixed(
												2
										  )})`
										: ""
							  }${
									tax > 0 ? `\nTax: ${tax}% (+$${taxAmount.toFixed(2)})` : ""
							  }${
									bottlerefund > 0
										? `\nBottle Refund: +$${bottlerefundAmount.toFixed(2)}`
										: ""
							  }\nFinal: $${finalPrice.toFixed(2)}`
							: "No price set";
						const stock = product.stock !== undefined ? product.stock : "N/A";
						// Stock status: red when out of stock, amber when running low,
						// green when comfortably in stock.
						const stockNum = Number(product.stock);
						const hasStock = Number.isFinite(stockNum);
						const stockClass = !hasStock
							? "unknown"
							: stockNum <= 0
							? "out"
							: stockNum <= 10
							? "low"
							: "in";
						const stockLabel = hasStock ? stockNum : "N/A";
						const stockTitle = !hasStock
							? "Stock unknown"
							: stockNum <= 0
							? "Out of stock"
							: stockNum <= 10
							? "Low stock"
							: "In stock";
						const status = product.isActive ? "Active" : "Inactive";
						const barcode = product.barcode || "N/A";
						const shelfNumber = product.shelfNumber || "N/A";

						row.innerHTML = `
							<td class="mdx-128">${
								(currentProductsPage - 1) * productsPageSize + index + 1
							}</td>
							<td>
								<div class="mdx-145">
									${
										product.picture
											? `<img src="${product.picture.replace(
													"https://res.cloudinary.com/dbgnsnrto/image/upload/",
													"https://res.cloudinary.com/dbgnsnrto/image/upload/"
											  )}" alt="${productName}"
										
											onerror="this.style.display='none';"
											onclick="openImageUpdateModal('${product._id}', '${productName}', '${
													product.picture || ""
											  }')"
											onmouseover="this.style.opacity='0.8'"
											onmouseout="this.style.opacity='1'" class="mdx-146">`
											: `<div
											onclick="openImageUpdateModal('${product._id}', '${productName}', '')"
											onmouseover="this.style.backgroundColor='#e9ecef'"
											onmouseout="this.style.backgroundColor='#f8f9fa'"
											title="Click to add image" class="mdx-147">No Image</div>`
									}
									<div>
										<strong>${productName}</strong>
										<br>
										<small class="mdx-148">Barcode: ${barcode}</small>
										<div class="product-barcode-display mdx-149">
											<svg class="barcode-svg mdx-150" data-barcode="${barcode}" data-product-name="${productName}" onclick="showBarcodeModal('${barcode}', '${productName}')"></svg>
										</div>
										<br>
										<small class="mdx-148">Shelf: ${shelfNumber}</small>
									</div>
								</div>
							</td>
							<td>${parentCategoryName}</td>
							<td>${subcategoryName}</td>
							<td>
								<div class="price-cell">
									<div class="price-final">${finalPriceDisplay}</div>
									${
										basePrice
											? `<div class="price-meta">
													${
														finalPrice !== basePrice
															? `<span class="price-base">Base ${priceDisplay}</span>`
															: `<span class="price-base is-muted">Base price</span>`
													}
													${discount > 0 ? `<span class="price-tag discount">-${discount}%</span>` : ""}
													${tax > 0 ? `<span class="price-tag tax">+${tax}% tax</span>` : ""}
													${
														bottlerefund > 0
															? `<span class="price-tag refund">+$${bottlerefundAmount.toFixed(2)} refund</span>`
															: ""
													}
												</div>`
											: ""
									}
								</div>
							</td>
							<td>
								<span class="stock-badge ${stockClass}" title="${stockTitle}">${stockLabel}</span>
							</td>
							<td>${product.sortOrder || 0}</td>
							<td><span class="status-badge ${
								product.isActive ? "active" : "inactive"
							}">${status}</span></td>
							<td><span class="status-badge ${product.inAds ? "active" : "inactive"}">${
							product.inAds ? "Yes" : "No"
						}</span></td>
							<td><span class="status-badge ${product.is18Plus ? "active" : "inactive"}">${
							product.is18Plus ? "Yes" : "No"
						}</span></td>
							<td>
								<div class="action-buttons">
									<button class="action-btn edit" onclick="editProduct('${
										product._id
									}')">Edit</button>
									<button class="action-btn mdx-159" onclick="updateStock('${
										product._id
									}')">Stock</button>
									${
										product.isActive
											? `<button class="action-btn delete" onclick="deleteProduct('${
													product._id
											  }', '${productName.replace(
													/'/g,
													"\\'"
											  )}')">Delete</button>`
											: `<button class="action-btn mdx-160" onclick="permanentDeleteProduct('${
													product._id
											  }', '${productName.replace(
													/'/g,
													"\\'"
											  )}')">Permanent Delete</button>`
									}
								</div>
							</td>
						`;
						tbody.appendChild(row);
						generateProductBarcodes();
					} catch (error) {
						console.error("Error displaying product:", product, error);
					}
				});
			}

			function updateProductsCount(count) {
				const productsCountDisplayElement = document.getElementById(
					"products-count-display"
				);

				if (productsCountDisplayElement) {
					productsCountDisplayElement.textContent = `${count} product${
						count !== 1 ? "s" : ""
					}`;
				}
			}

			// Pagination functions
			function updateProductsPagination() {
				const paginationContainer = document.getElementById(
					"products-pagination"
				);
				const paginationInfo = document.getElementById(
					"products-pagination-info"
				);
				const paginationNumbers = document.getElementById(
					"products-pagination-numbers"
				);
				const firstBtn = document.getElementById("products-first-btn");
				const prevBtn = document.getElementById("products-prev-btn");
				const nextBtn = document.getElementById("products-next-btn");
				const lastBtn = document.getElementById("products-last-btn");

				if (!paginationContainer || !paginationInfo) return;

				// Ensure pagination variables are valid
				totalProductsPages = Math.max(
					1,
					Math.ceil(totalProducts / productsPageSize)
				);
				currentProductsPage = Math.max(
					1,
					Math.min(currentProductsPage, totalProductsPages)
				);

				// Show/hide pagination based on total products and pages
				if (totalProducts > 0 && totalProductsPages > 1) {
					paginationContainer.style.display = "flex";

					// Update info text with proper calculation
					const startItem = Math.min(
						(currentProductsPage - 1) * productsPageSize + 1,
						totalProducts
					);
					const endItem = Math.min(
						currentProductsPage * productsPageSize,
						totalProducts
					);

					if (totalProducts === 0) {
						paginationInfo.textContent = "No products found";
					} else if (startItem === endItem) {
						paginationInfo.textContent = `Showing ${startItem} of ${totalProducts} products`;
					} else {
						paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${totalProducts} products`;
					}

					// Update button states with proper validation
					if (firstBtn) firstBtn.disabled = currentProductsPage <= 1;
					if (prevBtn) prevBtn.disabled = currentProductsPage <= 1;
					if (nextBtn)
						nextBtn.disabled = currentProductsPage >= totalProductsPages;
					if (lastBtn)
						lastBtn.disabled = currentProductsPage >= totalProductsPages;

					// Generate page numbers
					generateProductsPageNumbers();
				} else {
					paginationContainer.style.display = "none";

					// Update info for single page or no products
					if (totalProducts === 0) {
						paginationInfo.textContent = "No products found";
					} else {
						paginationInfo.textContent = `Showing all ${totalProducts} products`;
					}
				}
			}

			function generateProductsPageNumbers() {
				const paginationNumbers = document.getElementById(
					"products-pagination-numbers"
				);
				if (!paginationNumbers || totalProductsPages <= 1) return;

				paginationNumbers.innerHTML = "";

				const maxVisiblePages = 5;

				// Handle edge cases
				if (totalProductsPages <= maxVisiblePages) {
					// Show all pages if total pages is small
					for (let i = 1; i <= totalProductsPages; i++) {
						const pageBtn = createPageButton(i, i.toString());
						paginationNumbers.appendChild(pageBtn);
					}
					return;
				}

				// Calculate start and end pages for complex pagination
				let startPage = Math.max(
					1,
					currentProductsPage - Math.floor(maxVisiblePages / 2)
				);
				let endPage = Math.min(
					totalProductsPages,
					startPage + maxVisiblePages - 1
				);

				// Adjust start page if we're near the end
				if (endPage - startPage < maxVisiblePages - 1) {
					startPage = Math.max(1, endPage - maxVisiblePages + 1);
				}

				// Show first page and ellipsis if needed
				if (startPage > 1) {
					const firstPageBtn = createPageButton(1, "1");
					paginationNumbers.appendChild(firstPageBtn);

					if (startPage > 2) {
						const ellipsis = document.createElement("span");
						ellipsis.textContent = "...";
						ellipsis.className = "pagination-ellipsis";
						ellipsis.style.cssText =
							"padding: 8px 4px; color: #666; user-select: none;";
						paginationNumbers.appendChild(ellipsis);
					}
				}

				// Add visible page number buttons
				for (let i = startPage; i <= endPage; i++) {
					const pageBtn = createPageButton(i, i.toString());
					paginationNumbers.appendChild(pageBtn);
				}

				// Show ellipsis and last page if needed
				if (endPage < totalProductsPages) {
					if (endPage < totalProductsPages - 1) {
						const ellipsis = document.createElement("span");
						ellipsis.textContent = "...";
						ellipsis.className = "pagination-ellipsis";
						ellipsis.style.cssText =
							"padding: 8px 4px; color: #666; user-select: none;";
						paginationNumbers.appendChild(ellipsis);
					}

					const lastPageBtn = createPageButton(
						totalProductsPages,
						totalProductsPages.toString()
					);
					paginationNumbers.appendChild(lastPageBtn);
				}
			}

			function createPageButton(pageNum, text) {
				const button = document.createElement("button");
				button.className = "btn btn-pagination";
				button.textContent = text;
				button.onclick = () => goToProductsPage(pageNum);

				if (pageNum === currentProductsPage) {
					button.classList.add("active");
				}

				return button;
			}

			function validateProductsPaginationState() {
				// Ensure all pagination variables are valid
				totalProducts = Math.max(0, totalProducts || 0);
				productsPageSize = Math.max(1, productsPageSize || 25);
				totalProductsPages =
					totalProducts > 0 ? Math.ceil(totalProducts / productsPageSize) : 1;
				currentProductsPage = Math.max(
					1,
					Math.min(currentProductsPage || 1, totalProductsPages)
				);

				return {
					totalProducts,
					currentProductsPage,
					totalProductsPages,
					productsPageSize,
				};
			}

			function goToProductsPage(page) {
				// Validate page number
				const targetPage = parseInt(page);
				if (isNaN(targetPage)) {
					console.error("Invalid page number:", page);
					return;
				}

				// Ensure we have valid pagination bounds
				const maxPage = Math.max(1, totalProductsPages);
				const validPage = Math.max(1, Math.min(targetPage, maxPage));

				if (validPage !== currentProductsPage) {
					// Preserve current filters when navigating pages
					const currentFilters = getCurrentProductFilters();
					loadProducts(validPage, productsPageSize, currentFilters);
				}
			}

			function changeProductsPageSize(newPageSize) {
				const newSize = parseInt(newPageSize);

				// Validate page size
				if (isNaN(newSize) || newSize <= 0) {
					console.error("Invalid page size:", newPageSize);
					return;
				}

				// Calculate what page the current first visible item should be on with new page size
				const currentFirstItem =
					(currentProductsPage - 1) * productsPageSize + 1;
				const newPage = Math.max(1, Math.ceil(currentFirstItem / newSize));

				productsPageSize = newSize;

				// Preserve current filters when changing page size
				const currentFilters = getCurrentProductFilters();
				loadProducts(newPage, productsPageSize, currentFilters);
			}

			async function showAddProductModal() {
				// Load categories and subcategories for the dropdowns
				await loadCategoriesForProductForm();
				//await loadSubcategoriesForDropdown();

				try {
					const modalTitle = document.getElementById("product-modal-title");
					const productForm = document.getElementById("product-form");
					const productId = document.getElementById("product-id");
					const productModal = document.getElementById("product-modal");

					if (!modalTitle || !productForm || !productId || !productModal) {
						console.error("Product modal elements not found");
						showMessage(
							"Modal not available. Please refresh the page.",
							"error"
						);
						return;
					}

					modalTitle.textContent = "Add New Product";
					productForm.reset();
					productId.value = "";

					// Make sure the image uploader doesn't show the previously
					// selected/edited product's picture.
					const fileInput = document.getElementById("product-picture");
					if (fileInput) fileInput.value = "";
					const previewImg = document.getElementById("preview-img");
					if (previewImg) {
						previewImg.removeAttribute("src");
						previewImg.src = "";
					}
					const imagePreview = document.getElementById("image-preview");
					if (imagePreview) imagePreview.style.display = "none";

					// Reset price calculation display
					document.getElementById("calc-base-price").textContent =
						"Base Price: $0.00";
					document.getElementById("calc-discount").style.display = "none";
					document.getElementById("calc-subtotal").textContent =
						"After Discount: $0.00";
					document.getElementById("calc-tax").style.display = "none";
					document.getElementById("calc-final-price").textContent =
						"Final Price: $0.00";

					productModal.style.display = "block";

					// Always start at the top of the modal so the user sees the first
					// fields (Name, Barcode, ...) instead of where it was last scrolled.
					productModal.scrollTop = 0;
					const modalContent = productModal.querySelector(".modal-content");
					if (modalContent) modalContent.scrollTop = 0;
				} catch (error) {
					console.error("Error showing add product modal:", error);
					showMessage("Error opening modal. Please try again.", "error");
				}
			}

			async function loadSubcategoriesForDropdown() {
				try {
					const response = await fetch(`${API_BASE_URL}/subcategories?active=all`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const data = await response.json();
						const subcategories = (data.data && data.data.subcategories) || [];
						const select = document.getElementById("product-subcategory");

						if (select) {
							select.innerHTML = '<option value="">Select Subcategory</option>';
							subcategories.forEach((subcategory) => {
								const option = document.createElement("option");
								option.value = subcategory._id;
								// Show both subcategory name and parent category for clarity
								const displayText = subcategory.parentCategory
									? `${subcategory.name} (${subcategory.parentCategory.name})`
									: subcategory.name;
								option.textContent = displayText;
								select.appendChild(option);
							});
						}
					}
				} catch (error) {
					console.error("Error loading subcategories for dropdown:", error);
				}
			}

			async function loadCategoriesForProductForm() {
				try {
					const response = await fetch(`${API_BASE_URL}/categories?isActive=all`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const data = await response.json();
						const categories = (data.data && data.data.categories) || [];
						const select = document.getElementById("product-category");

						if (select) {
							select.innerHTML =
								'<option value="">Select Category (Optional)</option>';
							categories
								.forEach((category) => {
									const option = document.createElement("option");
									option.value = category._id;
									option.textContent = category.name;
									select.appendChild(option);
								});
						}
					} else {
						throw new Error("Failed to fetch categories");
					}
				} catch (error) {
					console.error("Error loading categories for product form:", error);
				}
			}

			async function loadSubcategoriesByCategory() {
				const categorySelect = document.getElementById("product-category");
				const subcategorySelect = document.getElementById(
					"product-subcategory"
				);

				if (!categorySelect || !subcategorySelect) return;

				const selectedCategoryId = categorySelect.value;

				try {
					// Clear subcategory dropdown
					subcategorySelect.innerHTML =
						'<option value="">Select Subcategory</option>';

					if (!selectedCategoryId) {
						// If no category selected, load all subcategories
						await loadSubcategoriesForDropdown();
						return;
					}

					// Load subcategories filtered by category
					const response = await fetch(
						`${API_BASE_URL}/subcategories?active=all&parent=${selectedCategoryId}`,
						{
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
						}
					);

					if (response.ok) {
						const data = await response.json();
						const subcategories = (data.data && data.data.subcategories) || [];

						subcategories.forEach((subcategory) => {
							const option = document.createElement("option");
							option.value = subcategory._id;
							option.textContent = subcategory.name;
							subcategorySelect.appendChild(option);
						});
					} else {
						throw new Error("Failed to fetch subcategories for category");
					}
				} catch (error) {
					console.error("Error loading subcategories by category:", error);
					// Fallback to loading all subcategories
					await loadSubcategoriesForDropdown();
				}
			}

			async function editProduct(productId) {
				// Load categories and subcategories first
				await loadCategoriesForProductForm();
				await loadSubcategoriesForDropdown();

				try {
					const product = allProducts.find((p) => p._id === productId);
					if (!product) {
						showMessage("Product not found", "error");
						return;
					}

					const elements = {
						modalTitle: document.getElementById("product-modal-title"),
						productId: document.getElementById("product-id"),
						productName: document.getElementById("product-name"),
						productBarcode: document.getElementById("product-barcode"),
						productShelfNumber: document.getElementById("product-shelf-number"),
						productCategory: document.getElementById("product-category"),
						productSubcategory: document.getElementById("product-subcategory"),
						productDescription: document.getElementById("product-description"),
						productPicture: document.getElementById("product-picture"),
						productPrice: document.getElementById("product-price"),
						productTax: document.getElementById("product-tax"),
						productBottlerefund: document.getElementById(
							"product-bottlerefund"
						),
						productDiscount: document.getElementById("product-discount"),
						productStock: document.getElementById("product-stock"),
						productStatus: document.getElementById("product-status"),
						productInAds: document.getElementById("product-in-ads"),
						productIs18Plus: document.getElementById("product-is18plus"),
						productSortOrder: document.getElementById("product-sort-order"),
						productWeight: document.getElementById("product-weight"),
						productModal: document.getElementById("product-modal"),
					};

					for (const [key, element] of Object.entries(elements)) {
						if (!element) {
							console.error(`Element ${key} not found`);
							showMessage(
								"Modal form not available. Please refresh the page.",
								"error"
							);
							return;
						}
					}

					elements.modalTitle.textContent = "Edit Product";
					elements.productId.value = product._id;
					elements.productName.value = product.name || "";
					elements.productBarcode.value = product.barcode || "";
					elements.productShelfNumber.value = product.shelfNumber || "";
					elements.productCategory.value = product.category
						? product.category._id
						: "";
					elements.productSubcategory.value = product.subcategory
						? product.subcategory._id
						: "";
					elements.productDescription.value = product.description || "";

					// Handle existing image display
					const imagePreview = document.getElementById("image-preview");
					const previewImg = document.getElementById("preview-img");
					if (product.picture) {
						previewImg.src = product.picture.replace(
							"https://res.cloudinary.com/dbgnsnrto/image/upload/",
							"https://res.cloudinary.com/dbgnsnrto/image/upload/"
						);
						imagePreview.style.display = "block";
					} else {
						imagePreview.style.display = "none";
					}

					elements.productPrice.value = product.price || "";
					elements.productTax.value = product.tax || 0;
					elements.productBottlerefund.value = product.bottlerefund || 0;
					elements.productDiscount.value = product.discount || 0;
					elements.productStock.value = product.stock || 0;
					elements.productStatus.value = product.isActive ? "true" : "false";
					elements.productInAds.checked = product.inAds || false;
					elements.productIs18Plus.checked = product.is18Plus || false;
					elements.productSortOrder.value = product.sortOrder || 0;
					elements.productWeight.value = product.weight || "";

					// Update price calculation display for editing
					setTimeout(() => {
						const basePrice = parseFloat(product.price) || 0;
						const tax = parseFloat(product.tax) || 0;
						const discount = parseFloat(product.discount) || 0;
						const bottlerefund = parseFloat(product.bottlerefund) || 0;

						const discountAmount = (basePrice * discount) / 100;
						const discountedPrice = basePrice - discountAmount;
						const taxAmount = (discountedPrice * tax) / 100;
						const bottlerefundAmount = bottlerefund;
						const finalPrice = discountedPrice + taxAmount + bottlerefundAmount;

						document.getElementById(
							"calc-base-price"
						).textContent = `Base Price: $${basePrice.toFixed(2)}`;

						const discountElement = document.getElementById("calc-discount");
						if (discount > 0) {
							discountElement.textContent = `Discount: ${discount}% (-$${discountAmount.toFixed(
								2
							)})`;
							discountElement.style.display = "block";
						} else {
							discountElement.style.display = "none";
						}
						document.getElementById(
							"calc-subtotal"
						).textContent = `After Discount: $${discountedPrice.toFixed(2)}`;

						const taxElement = document.getElementById("calc-tax");
						if (tax > 0) {
							taxElement.textContent = `Tax: ${tax}% (+$${taxAmount.toFixed(
								2
							)})`;
							taxElement.style.display = "block";
						} else {
							taxElement.style.display = "none";
						}
						const bottlerefundElement =
							document.getElementById("calc-bottlerefund");
						if (bottlerefund > 0) {
							bottlerefundElement.textContent = `Bottle Refund: +$${bottlerefundAmount.toFixed(
								2
							)}`;
							bottlerefundElement.style.display = "block";
						} else {
							bottlerefundElement.style.display = "none";
						}

						document.getElementById(
							"calc-final-price"
						).textContent = `Final Price: $${finalPrice.toFixed(2)}`;
					}, 100);

					elements.productModal.style.display = "block";
				} catch (error) {
					console.error("Error editing product:", error);
					showMessage(
						"Error opening product edit form. Please try again.",
						"error"
					);
				}
			}

			async function updateStock(productId) {
				const product = allProducts.find((p) => p._id === productId);
				if (!product) {
					showMessage("Product not found", "error");
					return;
				}

				showStockModal(product);
			}

			async function permanentDeleteProduct(productId, productName) {
				if (
					!confirm(
						`Are you sure you want to PERMANENTLY delete product "${productName}"? This will completely remove the product and its image from the system. This action cannot be undone.`
					)
				) {
					return;
				}

				try {
					const response = await fetch(
						`${API_BASE_URL}/products/${productId}/permanent`,
						{
							method: "DELETE",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
						}
					);

					const result = await response.json();

					if (response.ok) {
						showMessage(
							`Product "${productName}" permanently deleted successfully`,
							"success"
						);
						// Preserve current filters when reloading after deletion
						const currentFilters = getCurrentProductFilters();
						loadProducts(currentProductsPage, productsPageSize, currentFilters);
					} else {
						showMessage(
							formatApiError(result, "Failed to permanently delete product"),
							"error"
						);
					}
				} catch (error) {
					showMessage(
						"Error permanently deleting product: " + error.message,
						"error"
					);
				}
			}

			async function deleteProduct(productId, productName) {
				if (
					!confirm(
						`Are you sure you want to delete product "${productName}"? This will deactivate the product but keep it in the database.`
					)
				) {
					return;
				}

				try {
					const response = await fetch(
						`${API_BASE_URL}/products/${productId}`,
						{
							method: "DELETE",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
						}
					);

					const result = await response.json();

					if (response.ok) {
						showMessage(
							`Product "${productName}" deleted successfully`,
							"success"
						);
						// Preserve current filters when reloading after deletion
						const currentFilters = getCurrentProductFilters();
						loadProducts(currentProductsPage, productsPageSize, currentFilters);
					} else {
						showMessage(formatApiError(result, "Failed to delete product"), "error");
					}
				} catch (error) {
					showMessage("Error deleting product: " + error.message, "error");
				}
			}

			async function saveProduct() {
				try {
					const form = document.getElementById("product-form");
					const productIdElement = document.getElementById("product-id");

					if (!form || !productIdElement) {
						showMessage(
							"Form not available. Please refresh the page.",
							"error"
						);
						return;
					}

					const formData = new FormData(form);
					const productId = productIdElement.value;

					// Validate required fields
					const requiredFields = [
						"name",
						"barcode",
						"shelfNumber",
						"subcategory",
					];
					for (const field of requiredFields) {
						if (!formData.get(field) && field !== "picture") {
							showMessage(
								`Please fill in the ${field
									.replace(/([A-Z])/g, " $1")
									.toLowerCase()} field.`,
								"error"
							);
							return;
						}
					}

					let pictureUrl = "";

					// Handle image upload if a file is selected
					const fileInput = document.getElementById("product-picture");
					if (fileInput && fileInput.files && fileInput.files[0]) {
						const imageFormData = new FormData();

						imageFormData.append("image", fileInput.files[0]);
						const uploadResponse = await fetch(
							`${API_BASE_URL}/products/upload-image`,
							{
								method: "POST",
								headers: {
									Authorization: `Bearer ${currentToken}`,
								},
								body: imageFormData,
							}
						);

						if (!uploadResponse.ok) {
							const uploadError = await uploadResponse.json().catch(() => ({}));
							throw new Error(formatApiError(uploadError, "Error uploading image"));
						}

						const uploadResult = await uploadResponse.json();
						pictureUrl = uploadResult.data.url;
					}

					const productData = {
						name: formData.get("name"),
						barcode: formData.get("barcode"),
						shelfNumber: formData.get("shelfNumber"),
						subcategory: formData.get("subcategory"),
						...(formData.get("category") && {
							category: formData.get("category"),
						}),
						description: formData.get("description") || "",
						price: formData.get("price")
							? parseFloat(formData.get("price"))
							: undefined,
						tax: formData.get("tax") ? parseFloat(formData.get("tax")) : 0,
						bottlerefund: formData.get("bottlerefund")
							? parseFloat(formData.get("bottlerefund"))
							: 0,
						discount: formData.get("discount")
							? parseFloat(formData.get("discount"))
							: 0,
						stock: parseInt(formData.get("stock")) || 0,
						sortOrder: parseInt(formData.get("sortOrder")) || 0,
						isActive: formData.get("status") === "true",
						inAds: formData.get("inAds") === "on",
						is18Plus: formData.get("is18Plus") === "on",
						weight: formData.get("weight") ? formData.get("weight").trim() : "",
						productId: productId || undefined,
					};
					// Only include picture field if a new image was uploaded
					if (pictureUrl) {
						productData.picture = pictureUrl;
					}
					const url = productId
						? `${API_BASE_URL}/products/${productId}`
						: `${API_BASE_URL}/products`;
					const method = productId ? "PUT" : "POST";

					const response = await fetch(url, {
						method: method,
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(productData),
					});

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						throw new Error(
							formatApiError(errorData) ||
								`HTTP ${response.status}: ${response.statusText}`
						);
					}

					const result = await response.json();
					showMessage(
						result.message ||
							`Product ${productId ? "updated" : "created"} successfully`,
						"success"
					);
					if (fileInput) fileInput.value = "";
					closeProductModal();
					await searchProducts();
				} catch (error) {
					console.error("Error saving product:", error);
					showMessage("Error saving product: " + error.message, "error");
				}
			}

			function closeProductModal() {
				const modal = document.getElementById("product-modal");
				if (modal) {
					modal.style.display = "none";
				}
				// Fully reset the form so reopening for a new product starts fresh
				resetProductForm();
			}

			// Clears product form fields, the file input and the image preview
			// so the picture uploader doesn't show the previously selected image.
			function resetProductForm() {
				try {
					const form = document.getElementById("product-form");
					if (form) form.reset();

					const fileInput = document.getElementById("product-picture");
					if (fileInput) fileInput.value = "";

					const previewImg = document.getElementById("preview-img");
					if (previewImg) {
						previewImg.removeAttribute("src");
						previewImg.src = "";
					}
					const imagePreview = document.getElementById("image-preview");
					if (imagePreview) imagePreview.style.display = "none";

					const productId = document.getElementById("product-id");
					if (productId) productId.value = "";
				} catch (e) {
					console.error("resetProductForm error:", e);
				}
			}

			// Stock Management Modal Functions
			function showStockModal(product) {
				const modal = document.getElementById("stock-modal");
				const productIdInput = document.getElementById("stock-product-id");
				const productNameInput = document.getElementById("stock-product-name");
				const currentStockInput = document.getElementById("current-stock");
				const quantityInput = document.getElementById("stock-quantity");
				const operationSelect = document.getElementById("stock-operation");

				// Populate modal with product data
				productIdInput.value = product._id;
				productNameInput.value = product.name;
				currentStockInput.value = product.stock || 0;

				// Reset form
				quantityInput.value = "";
				operationSelect.value = "set";

				// Update preview
				updateStockPreview();

				modal.style.display = "block";
			}

			function closeStockModal() {
				const modal = document.getElementById("stock-modal");
				if (modal) {
					modal.style.display = "none";
				}

				// Reset form
				document.getElementById("stock-form").reset();
			}

			function updateStockPreview() {
				const currentStock =
					parseInt(document.getElementById("current-stock").value) || 0;
				const quantity =
					parseInt(document.getElementById("stock-quantity").value) || 0;
				const operation = document.getElementById("stock-operation").value;

				const previewCurrent = document.getElementById("preview-current");
				const previewOperation = document.getElementById("preview-operation");
				const previewNew = document.getElementById("preview-new");

				previewCurrent.textContent = `Current Stock: ${currentStock}`;

				let newStock = currentStock;
				let operationText = "";

				switch (operation) {
					case "set":
						newStock = quantity;
						operationText = `Set stock to: ${quantity}`;
						break;
					case "add":
						newStock = currentStock + quantity;
						operationText = `Add ${quantity} units`;
						break;
					case "subtract":
						newStock = Math.max(0, currentStock - quantity);
						operationText = `Remove ${quantity} units`;
						break;
				}

				previewOperation.textContent = `Operation: ${operationText}`;
				previewNew.textContent = `New Stock: ${newStock}`;

				// Color coding for stock levels
				if (newStock === 0) {
					previewNew.style.color = "#dc3545"; // Red for out of stock
				} else if (newStock <= 10) {
					previewNew.style.color = "#fd7e14"; // Orange for low stock
				} else {
					previewNew.style.color = "#28a745"; // Green for good stock
				}
			}

			async function saveStockUpdate() {
				const productId = document.getElementById("stock-product-id").value;
				const quantityValue = document.getElementById("stock-quantity").value;
				const quantity = parseInt(quantityValue);
				const operation = document.getElementById("stock-operation").value;
				const productName = document.getElementById("stock-product-name").value;

				if (quantityValue === "" || isNaN(quantity) || quantity < 0) {
					showMessage("Please enter a valid quantity (0 or greater)", "error");
					return;
				}

				try {
					const response = await fetch(
						`${API_BASE_URL}/products/${productId}/stock`,
						{
							method: "PATCH",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								quantity: quantity,
								operation: operation,
							}),
						}
					);

					const result = await response.json();

					if (response.ok) {
						const operationText =
							operation === "set"
								? "set to"
								: operation === "add"
								? "increased by"
								: "decreased by";
						showMessage(
							`Stock ${operationText} ${quantity} for "${productName}"`,
							"success"
						);
						closeStockModal();
						// Preserve current filters when reloading after stock update
						const currentFilters = getCurrentProductFilters();
						loadProducts(currentProductsPage, productsPageSize, currentFilters);
					} else {
						showMessage(formatApiError(result, "Failed to update stock"), "error");
					}
				} catch (error) {
					showMessage("Error updating stock: " + error.message, "error");
				}
			}

			function refreshProducts() {
				// Preserve current filters when refreshing
				const currentFilters = getCurrentProductFilters();
				loadProducts(currentProductsPage, productsPageSize, currentFilters);
				showMessage("Products refreshed", "success");
			}

			function importProducts() {
				showMessage("Product import feature coming soon!", "success");
			}

			// Image Update Functions
			function openImageUpdateModal(productId, productName, currentImageUrl) {
				const modal = document.getElementById("image-update-modal");
				const modalTitle = document.getElementById("image-update-modal-title");
				const productIdInput = document.getElementById(
					"image-update-product-id"
				);
				const currentImage = document.getElementById("current-image");
				const noCurrentImage = document.getElementById("no-current-image");
				const newImageInput = document.getElementById("new-product-image");
				const newImagePreview = document.getElementById("new-image-preview");

				// Set modal title and product ID
				modalTitle.textContent = `Update Image for "${productName}"`;
				productIdInput.value = productId;

				// Show current image or no image placeholder
				if (currentImageUrl && currentImageUrl.trim() !== "") {
					currentImage.src = currentImageUrl;
					currentImage.style.display = "block";
					noCurrentImage.style.display = "none";
				} else {
					currentImage.style.display = "none";
					noCurrentImage.style.display = "block";
				}

				// Reset form
				newImageInput.value = "";
				newImagePreview.style.display = "none";

				// Show modal
				modal.style.display = "block";
			}

			function closeImageUpdateModal() {
				const modal = document.getElementById("image-update-modal");
				modal.style.display = "none";
			}

			async function updateProductImage() {
				const productId = document.getElementById(
					"image-update-product-id"
				).value;
				const imageInput = document.getElementById("new-product-image");
				const updateBtn = document.getElementById("update-image-btn");

				if (!imageInput.files || !imageInput.files[0]) {
					showMessage("Please select an image file", "error");
					return;
				}

				const file = imageInput.files[0];

				// Validate file type
				if (!file.type.startsWith("image/")) {
					showMessage("Please select a valid image file", "error");
					return;
				}

				// Validate file size (5MB)
				if (file.size > 5 * 1024 * 1024) {
					showMessage("Image file size must be less than 5MB", "error");
					return;
				}

				try {
					updateBtn.disabled = true;
					updateBtn.textContent = "Updating...";

					// Create FormData with only the image
					const formData = new FormData();
					formData.append("image", file);

					const response = await fetch(
						`${API_BASE_URL}/products/${productId}`,
						{
							method: "PUT",
							headers: {
								Authorization: `Bearer ${currentToken}`,
							},
							body: formData,
						}
					);

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						throw new Error(
							formatApiError(errorData) || "Failed to update product image"
						);
					}

					const result = await response.json();

					showMessage("Product image updated successfully!", "success");
					closeImageUpdateModal();

					// Refresh the products list to show the updated image
					searchProducts();
					//loadProducts(currentProductsPage, productsPageSize);
				} catch (error) {
					console.error("Error updating product image:", error);
					showMessage(
						error.message || "Failed to update product image",
						"error"
					);
				} finally {
					updateBtn.disabled = false;
					updateBtn.textContent = "Update Image";
				}
			}

			// Product Search and Filter Functions
			function getCurrentProductFilters() {
				const searchInput = document.getElementById("product-search");
				const categoryFilter = document.getElementById(
					"product-category-filter"
				);
				const statusFilter = document.getElementById("product-status-filter");
				const priceFilter = document.getElementById("product-price-filter");
				const stockFilter = document.getElementById("product-stock-filter");
				const adsFilter = document.getElementById("product-ads-filter");
				const sortFilter = document.getElementById("product-sort-filter");

				return {
					searchTerm: searchInput ? searchInput.value.trim() : "",
					categoryId: categoryFilter ? categoryFilter.value : "all",
					status: statusFilter ? statusFilter.value : "all",
					inAds: adsFilter ? adsFilter.value : "all",
					priceRange: priceFilter ? priceFilter.value : "all",
					stockLevel: stockFilter ? stockFilter.value : "all",
					sortOption: sortFilter ? sortFilter.value : "createdAt-desc",
				};
			}

			function buildProductsUrl(page, pageSize, filters) {
				let url = `${API_BASE_URL}/products?page=${page}&limit=${pageSize}`;

				// Add search parameters
				if (filters.searchTerm) {
					url += `&search=${encodeURIComponent(filters.searchTerm)}`;
				}

				if (filters.categoryId && filters.categoryId !== "all") {
					url += `&subcategory=${filters.categoryId}`;
				}

				if (filters.status && filters.status !== "all") {
					url += `&isActive=${filters.status === "active"}`;
				} else {
					url += `&isActive=all`;
				}

				if (filters.inAds && filters.inAds !== "all") {
					url += `&inAds=${filters.inAds === "in-ads"}`;
				} else {
					url += `&inAds=all`;
				}

				if (filters.priceRange && filters.priceRange !== "all") {
					url += `&priceRange=${filters.priceRange}`;
				}

				if (filters.stockLevel && filters.stockLevel !== "all") {
					url += `&stockLevel=${filters.stockLevel}`;
				}

				// Parse sort option
				const [sortBy, sortOrder] = filters.sortOption.split("-");
				url += `&sortBy=${sortBy}&sortOrder=${sortOrder}`;

				return url;
			}

			async function searchProducts() {
				const filters = getCurrentProductFilters();

				showSectionLoading("products", true, "Searching products...");

				try {
					const url = buildProductsUrl(1, productsPageSize, filters);

					const response = await fetch(url, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const data = await response.json();
						allProducts = (data.data && data.data.products) || [];
						displayProducts(allProducts);

						// Update pagination info
						const dataPagination = data.data && data.data.pagination;
						if (dataPagination) {
							totalProducts = dataPagination.totalProducts || 0;
							currentProductsPage = 1; // Reset to first page after search
							totalProductsPages =
								Math.ceil(totalProducts / productsPageSize) || 1;

							updateProductsCount(totalProducts);
							updateProductsPagination();
						} else {
							totalProducts = allProducts.length;
							updateProductsCount(totalProducts);
							document.getElementById("products-pagination").style.display =
								"none";
						}

						// Update table title to reflect search
						const tableTitle = document.querySelector(
							"#products-section .table-header h3"
						);
						if (tableTitle) {
							if (filters.searchTerm) {
								tableTitle.textContent = `Search Results: "${filters.searchTerm}"`;
							} else if (
								filters.categoryId !== "all" ||
								filters.status !== "all"
							) {
								tableTitle.textContent = "Filtered Products";
							} else {
								tableTitle.textContent = "All Products";
							}
						}

						if (allProducts.length === 0) {
							showMessage(
								"No products found matching your search criteria.",
								"info"
							);
						} else {
							showMessage(
								`Found ${totalProducts} product(s) matching your search.`,
								"success"
							);
						}
					} else {
						const errorData = await response.json().catch(() => ({}));
						showMessage(
							formatApiError(errorData) || "Failed to search products",
							"error"
						);
					}
				} catch (error) {
					console.error("Error searching products:", error);
					showMessage("Error searching products. Please try again.", "error");
				} finally {
					showSectionLoading("products", false);
				}
			}

			function clearProductFilters() {
				const searchInput = document.getElementById("product-search");
				const categoryFilter = document.getElementById(
					"product-category-filter"
				);
				const statusFilter = document.getElementById("product-status-filter");
				const priceFilter = document.getElementById("product-price-filter");
				const stockFilter = document.getElementById("product-stock-filter");
				const adsFilter = document.getElementById("product-ads-filter");
				const sortFilter = document.getElementById("product-sort-filter");

				if (searchInput) searchInput.value = "";
				if (categoryFilter) categoryFilter.value = "all";
				if (statusFilter) statusFilter.value = "all";
				if (priceFilter) priceFilter.value = "all";
				if (stockFilter) stockFilter.value = "all";
				if (adsFilter) adsFilter.value = "all";
				if (sortFilter) sortFilter.value = "createdAt-desc";

				// Reset table title
				const tableTitle = document.querySelector(
					"#products-section .table-header h3"
				);
				if (tableTitle) {
					tableTitle.textContent = "All Products";
				}

				// Reload all products with cleared filters
				const clearedFilters = {
					searchTerm: "",
					categoryId: "all",
					status: "all",
					inAds: "all",
					priceRange: "all",
					stockLevel: "all",
					sortOption: "createdAt-desc",
				};
				loadProducts(1, productsPageSize, clearedFilters);
				showMessage("Search filters cleared", "success");
			}

			// Load categories for the product filter dropdown
			async function loadSubcategoriesForProductFilter() {
				try {
					const response = await fetch(
						`${API_BASE_URL}/subcategories?active=all`,
						{
							method: "GET",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
						}
					);

					if (response.ok) {
						const data = await response.json();
						const subcategories = (data.data && data.data.subcategories) || [];
						console.log(subcategories);
						const categoryFilter = document.getElementById(
							"product-category-filter"
						);

						if (categoryFilter) {
							// Clear existing options except "All Subcategories"
							categoryFilter.innerHTML =
								'<option value="all">All Subcategories</option>';

							// Add subcategory options
							subcategories.forEach((subcategory) => {
								const option = document.createElement("option");
								option.value = subcategory._id;
								// Show both subcategory name and parent category for clarity
								const displayText = subcategory.parentCategory
									? `${subcategory.name} (${subcategory.parentCategory.name})`
									: subcategory.name;
								option.textContent = displayText;
								categoryFilter.appendChild(option);
							});
						}

						// Store subcategories globally for filter synchronization
						allSubcategories = subcategories;

						// Synchronize filters across sections
						synchronizeFilters();
					}
				} catch (error) {
					console.error("Error loading subcategories for filter:", error);
				}
			}

			// Add Enter key support for search input (will be attached when products section loads)
			function attachProductSearchListeners() {
				const searchInput = document.getElementById("product-search");
				if (searchInput) {
					searchInput.addEventListener("keypress", function (event) {
						if (event.key === "Enter") {
							searchProducts();
						}
					});
				}
			}

			function onCategoryFilterChange() {
				// When category filter changes, automatically set sort to A-Z
				const sortFilter = document.getElementById("product-sort-filter");
				if (sortFilter) {
					sortFilter.value = "name-asc";
				}
				// Trigger search with new filters
				searchProducts();
			}

			// Orders functions implemented further down (full implementation exists later)

			function refreshOrders() {
				loadOrders();
				showMessage("Orders refreshed", "success");
			}

			function exportOrders() {
				showMessage("Order export feature coming soon!", "success");
			}

			function showOrderFilters() {
				showMessage("Order filters coming soon!", "success");
			}

			// Riders Management Functions
			async function loadRiders() {
				try {
					const token = currentToken;
					if (!token) {
						showMessage("Please loggggg in first", "error");
						return;
					}

					const response = await fetch(`${API_BASE_URL}/riders`, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
					});
					if (response.ok) {
						const data = await response.json();
						console.log("Riders API Response:", data); // Debug log
						const riders = data?.data?.riders || [];
						displayRiders(riders);
						const total =
							data?.data?.pagination?.totalRiders ??
							data?.data?.total ??
							riders.length;
						document.getElementById(
							"riders-count-display"
						).textContent = `${total} riders`;
					} else if (response.status === 401) {
						showMessage("Please log in first", "error");
						setTimeout(() => {
							window.location.replace("/signin");
						}, 2000);
					} else {
						const errorData = await response.json();
						showMessage(formatApiError(errorData) || "Failed to load riders", "error");
					}
				} catch (error) {
					console.error("Error loading riders:", error);
					showMessage("Error loading riders", "error");
				}
			}

			function displayRiders(riders) {
				console.log("displayRiders called with:", riders); // Debug log
				const tableBody = document.getElementById("riders-table-body");
				const countDisplay = document.getElementById("riders-count-display");

				countDisplay.textContent = `${riders.length} rider${
					riders.length !== 1 ? "s" : ""
				}`;

				if (!riders || riders.length === 0) {
					tableBody.innerHTML = `
						<tr>
							<td colspan="8" class="mdx-3">
								No riders found. Click "Add Rider" to register one.
							</td>
						</tr>
					`;
					return;
				}

				tableBody.innerHTML = riders
					.map((rider) => {
						// Market context returns MarketRider docs which store the
						// driver's identity directly on the doc (name/phoneNumber/email)
						// instead of via a populated `user` ref like global Rider docs.
						// Detect that shape and adapt the renderer.
						const isMarketRider =
							rider &&
							!rider.userInfo &&
							!rider.user &&
							(rider.name !== undefined || rider.phoneNumber !== undefined);

						// Handle user information - API returns userInfo from aggregation
						const userName = rider.userInfo
							? rider.userInfo.name
							: rider.user?.name || rider.name || "N/A";
						const userEmail = rider.userInfo
							? rider.userInfo.email
							: rider.user?.email || rider.email || "N/A";
						const userPhone = rider.userInfo
							? rider.userInfo.phoneNumber
							: rider.user?.phoneNumber || rider.phoneNumber || "N/A";

						// Handle completion rate
						const completionRate = rider.completionRate
							? rider.completionRate.toFixed(1)
							: "0.0";

						// Handle rating - it can be a number (from aggregation) or object (from direct query)
						let rating = "N/A";
						if (rider.rating) {
							if (typeof rider.rating === "number") {
								rating = rider.rating.toFixed(1);
							} else if (rider.rating.average !== undefined) {
								rating =
									rider.rating.average > 0
										? rider.rating.average.toFixed(1)
										: "0.0";
							}
						}

						// Handle zones - can be array, string, or object
						let zoneDisplay = "No Zones";
						let zoneTooltip = "";
						if (Array.isArray(rider.zones) && rider.zones.length > 0) {
							// New multi-zone format
							if (rider.zones.length === 1) {
								zoneDisplay = rider.zones[0];
							} else {
								zoneDisplay = `${rider.zones[0]} +${rider.zones.length - 1}`;
								zoneTooltip = `All zones: ${rider.zones.join(", ")}`;
							}
						} else if (rider.zone) {
							// Legacy single zone format / MarketRider single-string zone
							zoneDisplay =
								typeof rider.zone === "string"
									? rider.zone
									: rider.zone?.zoneName || "No Zone";
						}

						// MarketRider exposes isActive/isAvailable instead of a status
						// string. Map them so the same status badge component works.
						let effectiveStatus = rider.status;
						if (!effectiveStatus && isMarketRider) {
							effectiveStatus = !rider.isActive
								? "offline"
								: rider.isAvailable
								? "available"
								: "busy";
						}
						const statusBadge = getStatusBadge(effectiveStatus);

						// MarketRider stores the plate as `vehiclePlate`, admin Rider as
						// `vehicleNumber`. Show whichever is present.
						const vehiclePlate =
							rider.vehicleNumber || rider.vehiclePlate || "N/A";

						return `
							<tr>
								<td>
									<div class="mdx-142">
										<div class="mdx-161">
											${userName.charAt(0).toUpperCase()}
										</div>
										<div>
											<div class="mdx-162">${userName}</div>
											<div class="mdx-163">ID: ${rider._id.slice(-6)}</div>
										</div>
									</div>
								</td>
								<td>
									<div class="mdx-164">${userEmail}</div>
									<div class="mdx-163">
										${userPhone}
									</div>
								</td>
								<td>
									<span class="zone-display mdx-165">
										${zoneDisplay}
										${zoneTooltip ? `<div class="zone-tooltip">${zoneTooltip}</div>` : ""}
									</span>
								</td>
								<td>
									<span class="mdx-166">
										${rider.vehicleType || "N/A"}
									</span>
								</td>
								<td>
									<code class="mdx-167">
										${vehiclePlate}
									</code>
								</td>
								<td>${statusBadge}</td>
								<td>
									<div class="mdx-142">
										<span class="mdx-168">⭐</span>
										<span>${rating}</span>
										<span class="mdx-169">(${completionRate}%)</span>
									</div>
								</td>
								<td>
									<div class="table-actions">
										<button class="btn-icon" onclick="viewRiderDetails('${
											rider._id
										}')" title="View Details">
											👁️
										</button>
										<button class="btn-icon" onclick="editRider('${rider._id}')" title="Edit Rider">
											✏️
										</button>
										<button class="btn-icon ${
											rider.status === "available" ? "btn-danger" : ""
										}" onclick="toggleRiderStatus('${rider._id}', '${
							rider.status
						}')" title="${
							rider.status === "available" ? "Deactivate" : "Activate"
						}">
											${rider.status === "available" ? "⏸️" : "▶️"}
										</button>
										<button class="btn-icon btn-danger" onclick="deleteRider('${
											rider._id
										}')" title="Delete Rider">
											🗑️
										</button>
									</div>
								</td>
							</tr>
						`;
					})
					.join("");
			}

			function getStatusBadge(status) {
				const statusConfig = {
					available: { color: "#FFFFFF", bg: "#e8f5e8", text: "Available" },
					busy: { color: "#ff9800", bg: "#fff3e0", text: "Busy" },
					offline: { color: "#9e9e9e", bg: "#f5f5f5", text: "Offline" },
					"on-break": { color: "#2196f3", bg: "#e3f2fd", text: "On Break" },
				};

				const config = statusConfig[status] || statusConfig.offline;
				return `<span class="mdx-170">${config.text}</span>`;
			}

			function showAddRiderModal() {
				document.getElementById("rider-modal").style.display = "block";
				document.getElementById("rider-modal-title").textContent =
					"Add New Rider";
				document.getElementById("rider-form").reset();
				document.getElementById("rider-id").value = "";
				loadUsersForRiderModal();
				loadZonesForRiderModal();
			}

			function refreshRiders() {
				loadAllRiders();
				showMessage("Riders refreshed", "success");
			}

			// Tab switching functions
			function showRidersTab(tabName) {
				// Remove active class from all tabs and content
				document
					.querySelectorAll(".riders-tab-btn")
					.forEach((btn) => btn.classList.remove("active"));
				document
					.querySelectorAll(".riders-tab-content")
					.forEach((content) => content.classList.remove("active"));

				// Add active class to clicked tab and corresponding content
				// Resolve the tab button from tabName rather than the implicit
				// global `event`: this function is also called programmatically
				// (loadSectionData), where no event is being dispatched and
				// `event.target` threw, aborting the data load below.
				const _activeTabBtn =
					document.querySelector(
						`.riders-tab-btn[onclick*="'${tabName}'"]`
					) || (typeof event !== "undefined" && event ? event.target : null);
				if (_activeTabBtn) _activeTabBtn.classList.add("active");
				document
					.getElementById(`${tabName}-tab-content`)
					.classList.add("active");

				// Load data based on active tab
				if (tabName === "riders") {
					loadAllRiders();
				} else if (tabName === "zones") {
					loadZones();
				}
			}

			// Zone Management Functions
			let zonesData = [];
			let filteredZonesData = [];

			async function loadZones() {
				try {
					const response = await fetch(`${API_BASE_URL}/zones`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
						},
					});

					if (!response.ok) {
						throw new Error("Failed to fetch zones");
					}

					const result = await response.json();
					// GET /zones answers { data: { zones, pagination } }. Reading
					// result.data yields that WRAPPER object, and spreading a non-array
					// throws "not iterable" — which the catch below reported as the
					// misleading "Failed to load zones".
					zonesData = listFrom(result, "zones");
					filteredZonesData = [...zonesData];
					displayZones(filteredZonesData);
					updateZoneSummary();
				} catch (error) {
					console.error("Error loading zones:", error);
					showMessage("Failed to load zones", "error");
				}
			}

			function displayZones(zones) {
				const tbody = document.getElementById("zones-table-body");
				const countDisplay = document.getElementById("zones-count-display");

				countDisplay.textContent = `${zones.length} zone${
					zones.length !== 1 ? "s" : ""
				}`;

				if (zones.length === 0) {
					tbody.innerHTML = `
						<tr>
							<td colspan="9" class="mdx-3">
								No zones found. ${
									filteredZonesData.length !== zonesData.length
										? "Try adjusting your filters or "
										: ""
								}Click "Add Zone" to create one.
							</td>
						</tr>
					`;
					return;
				}

				tbody.innerHTML = zones
					.map(
						(zone, index) => `
					<tr>
						<td>${index + 1}</td>
						<td>
							<strong>${zone.zoneName}</strong>
							${
								zone.description
									? '<br><small class="mdx-148">' +
									  zone.description.substring(0, 50) +
									  (zone.description.length > 50 ? "..." : "") +
									  "</small>"
									: ""
							}
						</td>
						<td>${zone.distance} km</td>
						<td>$${zone.deliveryFee ? zone.deliveryFee.toFixed(2) : "0.00"}</td>
						<td>${zone.estimatedDeliveryTime || "N/A"}</td>
						<td>
							<span class="status-badge ${zone.isActive ? "active" : "inactive"}">
								${zone.isActive ? "Active" : "Inactive"}
							</span>
						</td>
						<td>${new Date(zone.createdAt).toLocaleDateString()}</td>
						<td>
							<div class="table-actions">
								<button class="btn-icon" onclick="editZone('${zone._id}')" title="Edit">
									✏️
								</button>
								<button class="btn-icon" onclick="toggleZoneStatus('${zone._id}', ${
							zone.isActive
						})" title="${zone.isActive ? "Deactivate" : "Activate"}">
									${zone.isActive ? "⏸️" : "▶️"}
								</button>
								<button class="btn-icon btn-danger" onclick="deleteZone('${zone._id}', '${
							zone.zoneName
						}')" title="Delete">
									🗑️
								</button>
							</div>
						</td>
					</tr>
				`
					)
					.join("");
			}

			function updateZoneSummary() {
				const summary = document.getElementById("zone-summary");
				const activeZones = zonesData.filter((z) => z.isActive).length;
				const inactiveZones = zonesData.filter((z) => !z.isActive).length;
				const avgDistance =
					zonesData.length > 0
						? (
								zonesData.reduce((sum, z) => sum + z.distance, 0) /
								zonesData.length
						  ).toFixed(1)
						: 0;
				const avgFee =
					zonesData.length > 0
						? (
								zonesData.reduce((sum, z) => sum + (z.deliveryFee || 0), 0) /
								zonesData.length
						  ).toFixed(2)
						: 0;

				if (zonesData.length > 0) {
					summary.innerHTML = `
						<div class="summary-stats">
							<div class="stat-item">
								<span class="stat-number">${zonesData.length}</span>
								<span class="stat-label">Total Zones</span>
							</div>
							<div class="stat-item">
								<span class="stat-number">${activeZones}</span>
								<span class="stat-label">Active</span>
							</div>
							<div class="stat-item">
								<span class="stat-number">${inactiveZones}</span>
								<span class="stat-label">Inactive</span>
							</div>
							<div class="stat-item">
								<span class="stat-number">${avgDistance} km</span>
								<span class="stat-label">Avg Distance</span>
							</div>
							<div class="stat-item">
								<span class="stat-number">$${avgFee}</span>
								<span class="stat-label">Avg Fee</span>
							</div>
						</div>
					`;
					summary.classList.add("show");
				} else {
					summary.classList.remove("show");
				}
			}

			function filterZones() {
				const statusFilter = document.getElementById("zone-filter").value;
				const searchQuery = document
					.getElementById("zone-search")
					.value.toLowerCase();

				filteredZonesData = zonesData.filter((zone) => {
					const matchesStatus =
						statusFilter === "all" ||
						(statusFilter === "active" && zone.isActive) ||
						(statusFilter === "inactive" && !zone.isActive);

					const matchesSearch =
						searchQuery === "" ||
						zone.zoneName.toLowerCase().includes(searchQuery);

					return matchesStatus && matchesSearch;
				});

				displayZones(filteredZonesData);

				// Update table title
				const title = document.getElementById("zones-table-title");
				if (statusFilter !== "all" || searchQuery !== "") {
					title.textContent = "Filtered Zones";
				} else {
					title.textContent = "All Zones";
				}
			}

			function clearZoneFilters() {
				document.getElementById("zone-filter").value = "all";
				document.getElementById("zone-search").value = "";
				filterZones();
			}

			function refreshZones() {
				loadZones();
				showMessage("Zones refreshed", "success");
			}

			function showAddZoneModal() {
				document.getElementById("zone-modal-title").textContent =
					"Add New Zone";
				document.getElementById("zone-save-btn-text").textContent = "Save Zone";
				document.getElementById("zone-form").reset();
				document.getElementById("zone-id").value = "";
				document.getElementById("zone-is-active").checked = true;
				clearZoneFormValidation();
				document.getElementById("zone-modal").style.display = "block";
				initZoneMapPicker(null);
			}

			// Lazily (re)creates the zone map picker inside the zone modal. Leaflet
			// maps must be initialized while their container is visible/sized, so
			// this always runs right after the modal is shown. Keeps hidden
			// #zone-latitude/#zone-longitude in sync with the dropped pin, and
			// keeps the drawn circle's radius in sync with the Distance (km) field.
			function initZoneMapPicker(initialPin) {
				if (window.__zoneMapPicker) {
					window.__zoneMapPicker.destroy();
					window.__zoneMapPicker = null;
				}
				if (typeof createSinglePinPicker !== "function") return;
				window.__zoneMapPicker = createSinglePinPicker({
					mapContainerId: "zone-map",
					initialPin,
					onChange: (pin) => {
						document.getElementById("zone-latitude").value = pin.latitude;
						document.getElementById("zone-longitude").value = pin.longitude;
						document.getElementById("zone-distance").value = pin.radiusKm;
						const display = document.getElementById("zone-radius-display");
						if (display) display.textContent = pin.radiusKm.toFixed(1);
					},
				});
				if (initialPin && initialPin.radiusKm) {
					const display = document.getElementById("zone-radius-display");
					if (display) display.textContent = initialPin.radiusKm.toFixed(1);
				}
				// Extra safety net: force a resize/re-center/re-position shortly after
				// the fullscreen modal finishes laying out (and again a couple more
				// times to survive any CSS transition), so a previously-saved pin
				// never appears mis-sized, mispositioned, or missing.
				[100, 300, 600].forEach((delay) => {
					setTimeout(() => {
						if (window.__zoneMapPicker) window.__zoneMapPicker.invalidateSize();
					}, delay);
				});
			}

			function closeZoneModal() {
				document.getElementById("zone-modal").style.display = "none";
				document.getElementById("zone-form").reset();
				clearZoneFormValidation();
				if (window.__zoneMapPicker) {
					window.__zoneMapPicker.destroy();
					window.__zoneMapPicker = null;
				}
			}

			function clearZoneFormValidation() {
				// Clear custom validation messages
				const inputs = [
					"zone-name",
					"zone-distance",
					"zone-delivery-fee",
				];
				inputs.forEach((inputId) => {
					const input = document.getElementById(inputId);
					if (input) {
						input.setCustomValidity("");
					}
				});
			}

			async function saveZone() {
				try {
					const formData = new FormData(document.getElementById("zone-form"));

					// Validate required fields
					const zoneName = formData.get("zoneName")?.trim();
					const pin = window.__zoneMapPicker
						? window.__zoneMapPicker.getPin()
						: null;
					const distance = pin ? pin.radiusKm : formData.get("distance");

					if (!zoneName) {
						throw new Error("Zone name is required");
					}
					if (!pin) {
						throw new Error(
							"Please click on the map to set this zone's location and coverage radius"
						);
					}
					if (
						!distance ||
						isNaN(parseFloat(distance)) ||
						parseFloat(distance) < 0
					) {
						throw new Error("Valid distance is required");
					}

					// Validate delivery fee if provided
					const deliveryFee = formData.get("deliveryFee");
					if (
						deliveryFee &&
						(isNaN(parseFloat(deliveryFee)) || parseFloat(deliveryFee) < 0)
					) {
						throw new Error("Delivery fee must be a valid positive number");
					}

					const zoneData = {
						zoneName: zoneName,
						distance: parseFloat(distance),
						deliveryFee: deliveryFee ? parseFloat(deliveryFee) : 0,
						estimatedDeliveryTime: formData.get("estimatedDeliveryTime")
							? parseInt(
									formData.get("estimatedDeliveryTime").replace(/\D/g, "")
							  ) || 30
							: 30,
						description: formData.get("description")?.trim() || undefined,
						isActive: formData.get("isActive") === "on",
					};

					if (pin) {
						zoneData.coordinates = {
							latitude: pin.latitude,
							longitude: pin.longitude,
						};
					}

					const zoneId = formData.get("id");
					const isEdit = zoneId && zoneId.trim() !== "";

					// Check for duplicate zone names in frontend data (quick check)
					if (zonesData && zonesData.length > 0) {
						const duplicateZone = zonesData.find(
							(zone) =>
								zone.zoneName.toLowerCase() === zoneName.toLowerCase() &&
								(!isEdit || zone._id !== zoneId)
						);
						if (duplicateZone) {
							throw new Error("A zone with this name already exists");
						}
					}

					const url = isEdit
						? `${API_BASE_URL}/zones/${zoneId}`
						: `${API_BASE_URL}/zones`;

					const method = isEdit ? "PUT" : "POST";

					const response = await fetch(url, {
						method,
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${currentToken}`,
						},
						body: JSON.stringify(zoneData),
					});

					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.message || "Failed to save zone");
					}

					closeZoneModal();
					loadZones();
					showMessage(
						`Zone ${isEdit ? "updated" : "created"} successfully`,
						"success"
					);
				} catch (error) {
					console.error("Error saving zone:", error);
					showMessage(error.message || "Failed to save zone", "error");
				}
			}

			function editZone(zoneId) {
				const zone = zonesData.find((z) => z._id === zoneId);
				if (!zone) {
					showMessage("Zone not found", "error");
					return;
				}

				document.getElementById("zone-modal-title").textContent = "Edit Zone";
				document.getElementById("zone-save-btn-text").textContent =
					"Update Zone";
				document.getElementById("zone-id").value = zone._id;
				document.getElementById("zone-name").value = zone.zoneName;
				document.getElementById("zone-distance").value = zone.distance;
				const radiusDisplay = document.getElementById("zone-radius-display");
				if (radiusDisplay) radiusDisplay.textContent = (zone.distance || 0).toFixed(1);
				document.getElementById("zone-delivery-fee").value =
					zone.deliveryFee || "";
				document.getElementById("zone-delivery-time").value =
					zone.estimatedDeliveryTime || "";
				document.getElementById("zone-boundaries").value =
					zone.description || "";
				document.getElementById("zone-is-active").checked = zone.isActive;
				clearZoneFormValidation();
				document.getElementById("zone-modal").style.display = "block";

				const hasCoords =
					zone.coordinates &&
					typeof zone.coordinates.latitude === "number" &&
					typeof zone.coordinates.longitude === "number";
				initZoneMapPicker(
					hasCoords
						? {
								latitude: zone.coordinates.latitude,
								longitude: zone.coordinates.longitude,
								radiusKm: zone.distance,
						  }
						: null
				);
				if (hasCoords) {
					document.getElementById("zone-latitude").value = zone.coordinates.latitude;
					document.getElementById("zone-longitude").value = zone.coordinates.longitude;
				}
			}

			async function showZoneStats() {
				try {
					const response = await fetch(`${API_BASE_URL}/zones/admin/stats`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
						},
					});

					if (!response.ok) {
						throw new Error("Failed to fetch zone statistics");
					}

					// The payload is the standard envelope { success, message, data }.
					// The figures live under .data — reading them off the envelope
					// yields undefined, so every stat silently fell back to the
					// client-side count and the modal never showed real numbers.
					const payload = await response.json();
					const stats = (payload && payload.data) || {};

					// Update stats in modal
					document.getElementById("total-zones-stat").textContent =
						stats.totalZones || zonesData.length;
					document.getElementById("active-zones-stat").textContent =
						stats.activeZones || zonesData.filter((z) => z.isActive).length;
					document.getElementById("inactive-zones-stat").textContent =
						stats.inactiveZones || zonesData.filter((z) => !z.isActive).length;
					document.getElementById("avg-distance-stat").textContent = (
						stats.averageDistance || 0
					).toFixed(1);
					document.getElementById("avg-fee-stat").textContent = `$${(
						stats.averageDeliveryFee || 0
					).toFixed(2)}`;
					document.getElementById("delivery-coverage-stat").textContent = `${(
						stats.coverageEfficiency || 0
					).toFixed(1)}%`;
					document.getElementById("zone-stats-modal").style.display = "block";
				} catch (error) {
					console.error("Error loading zone statistics:", error);

					// Fallback to client-side calculations
					const totalZones = zonesData.length;
					const activeZones = zonesData.filter((z) => z.isActive).length;
					const inactiveZones = totalZones - activeZones;
					const avgDistance =
						totalZones > 0
							? (
									zonesData.reduce((sum, z) => sum + z.distance, 0) / totalZones
							  ).toFixed(1)
							: 0;
					const avgFee =
						totalZones > 0
							? (
									zonesData.reduce((sum, z) => sum + (z.deliveryFee || 0), 0) /
									totalZones
							  ).toFixed(2)
							: 0;

					document.getElementById("total-zones-stat").textContent = totalZones;
					document.getElementById("active-zones-stat").textContent =
						activeZones;
					document.getElementById("inactive-zones-stat").textContent =
						inactiveZones;
					document.getElementById("avg-distance-stat").textContent =
						avgDistance;
					document.getElementById("avg-fee-stat").textContent = `$${avgFee}`;
					document.getElementById("delivery-coverage-stat").textContent = `${
						activeZones > 0 ? ((activeZones / totalZones) * 100).toFixed(1) : 0
					}%`;
					document.getElementById("zone-stats-modal").style.display = "block";
				}
			}

			function closeZoneStatsModal() {
				document.getElementById("zone-stats-modal").style.display = "none";
			}

		// Staff & Customer Tab switching functions
		function showStaffTab(tabName) {
			// Remove active class from all tabs and content
			document
				.querySelectorAll(".staff-tab-btn")
				.forEach((btn) => btn.classList.remove("active"));
			document
				.querySelectorAll(".staff-tab-content")
				.forEach((content) => content.classList.remove("active"));

			// Add active class to clicked tab and corresponding content
			// Resolve the tab button from tabName rather than the implicit
			// global `event`: this function is also called programmatically
			// (loadSectionData), where no event is being dispatched and
			// `event.target` threw, aborting the data load below.
			const _activeTabBtn =
				document.querySelector(
					`#users-section .staff-tab-btn[onclick*="'${tabName}'"]`
				) || (typeof event !== "undefined" && event ? event.target : null);
			if (_activeTabBtn) _activeTabBtn.classList.add("active");
			document
				.getElementById(`${tabName}-tab-content`)
				.classList.add("active");

			// Load data based on active tab
			if (tabName === "staff") {
				loadAllUsers();
			} else if (tabName === "customers") {
				loadCustomers();
			} else if (tabName === "shelfs") {
				loadShelfs();
			}
		}

		function showPromoTab(tabName) {
			// Remove active class from all promo tabs and content
			document
				.querySelectorAll("#promocodes-section .staff-tab-btn")
				.forEach((btn) => btn.classList.remove("active"));
			document
				.querySelectorAll("#promocodes-section .staff-tab-content")
				.forEach((content) => content.classList.remove("active"));

			// Add active class to clicked tab and corresponding content
			// Resolve the tab button from tabName rather than the implicit
			// global `event`: this function is also called programmatically
			// (loadSectionData), where no event is being dispatched and
			// `event.target` threw, aborting the data load below.
			const _activeTabBtn =
				document.querySelector(
					`#promocodes-section .staff-tab-btn[onclick*="'${tabName}'"]`
				) || (typeof event !== "undefined" && event ? event.target : null);
			if (_activeTabBtn) _activeTabBtn.classList.add("active");
			document
				.getElementById(`${tabName}-tab-content`)
				.classList.add("active");

			// Load data based on active tab
			loadPromoCodes(tabName === "promo" ? true : false);
		}			// Category Tabs Management
			function showCategoryTab(tabName, filter) {
				// Remove active class from all tabs and content
				document
					.querySelectorAll(".category-tab-btn")
					.forEach((btn) => btn.classList.remove("active"));
				document
					.querySelectorAll(".category-tab-content")
					.forEach((content) => content.classList.remove("active"));

				// Add active class to clicked tab and corresponding content
				//event.target.classList.add("active");
				document
					.getElementById(`${tabName}-tab-content`)
					.classList.add("active");

				// Load data based on active tab
				if (tabName === "categories") {
					refreshCategories();

					loadCategoriesForSubcategoryFilter();
				} else if (tabName === "subcategories") {
					if (!filter) {
						refreshSubcategories();
					}
					loadCategoriesForSubcategoryFilter();
				}
			}

			// Customer Management Functions
			let customersData = [];
			let filteredCustomersData = [];
			let customerOrderCounts = {};

			async function loadCustomers() {
				try {
					const response = await authenticatedFetch(
						`${API_BASE_URL}/auth/users?role=customer`
					);

					if (!response.ok) {
						throw new Error("Failed to fetch customers");
					}

					const result = await response.json();
					customersData = listFrom(result, "users");
					filteredCustomersData = [...customersData];

					// Fetch order counts for customers
					try {
						const orderCountsResponse = await authenticatedFetch(
							`${API_BASE_URL}/orders/customer-order-counts`
						);
						if (orderCountsResponse.ok) {
							const orderCountsResult = await orderCountsResponse.json();
							customerOrderCounts = {};
							orderCountsResult.data.forEach(count => {
								customerOrderCounts[count.email] = count.orderCount;
							});
						}
					} catch (error) {
						console.error("Error fetching customer order counts:", error);
						customerOrderCounts = {};
					}

					displayCustomers(filteredCustomersData);
					// Apply default sorting
					sortCustomers();
					updateCustomerSummary();
				} catch (error) {
					console.error("Error loading customers:", error);
					showMessage("Failed to load customers", "error");
				}
			}

			function getOrderBadgeClass(orderCount) {
				if (orderCount === 0) return 'zero';
				if (orderCount === 1) return 'low';
				if (orderCount ===2) return 'medium';
				if (orderCount <= 3) return 'high';
				return 'loyal';
			}

			function sortCustomers() {
				const sortValue = document.getElementById("customer-sort").value;
				const [field, direction] = sortValue.split("-");

				filteredCustomersData.sort((a, b) => {
					let aValue, bValue;

					switch (field) {
						case "name":
							aValue = a.name.toLowerCase();
							bValue = b.name.toLowerCase();
							break;
						case "email":
							aValue = a.email.toLowerCase();
							bValue = b.email.toLowerCase();
							break;
						case "orders":
							aValue = customerOrderCounts[a.email] || 0;
							bValue = customerOrderCounts[b.email] || 0;
							break;
						case "joined":
							aValue = new Date(a.createdAt);
							bValue = new Date(b.createdAt);
							break;
						case "lastLogin":
							aValue = a.lastLogin ? new Date(a.lastLogin) : new Date(0);
							bValue = b.lastLogin ? new Date(b.lastLogin) : new Date(0);
							break;
						default:
							return 0;
					}

					if (direction === "asc") {
						return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
					} else {
						return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
					}
				});

				displayCustomers(filteredCustomersData);
			}

			function displayCustomers(customers) {
				const tbody = document.getElementById("customers-table-body");
				const countDisplay = document.getElementById("customers-count-display");

				countDisplay.textContent = `${customers.length} customer${
					customers.length !== 1 ? "s" : ""
				}`;

				if (customers.length === 0) {
					tbody.innerHTML = `
						<tr>
							<td colspan="10" class="mdx-3">
								No customers found. ${
									filteredCustomersData.length !== customersData.length
										? "Try adjusting your filters."
										: "No customers have registered yet."
								}
							</td>
						</tr>
					`;
					return;
				}

				tbody.innerHTML = customers
					.map(
						(customer, index) => `
					<tr>
						<td>${index + 1}</td>
						<td>
							<div class="mdx-142">
								<div class="mdx-171">
									${customer.name.charAt(0).toUpperCase()}
								</div>
								<div>
									<div class="mdx-162">${customer.name}</div>
									<div class="mdx-163">ID: ${customer._id.slice(-6)}</div>
								</div>
							</div>
						</td>
						<td>
							<div>
								<div class="mdx-164">${customer.email}</div>
								<div class="mdx-163">${
									customer.phoneNumber || "N/A"
								}</div>
							</div>
						</td>
						<td>
							<div class="mdx-172">
								${customer.address && customer.address.city ? customer.address.city : "No city"}
							</div>
						</td>
						<td>
							<span class="order-badge ${getOrderBadgeClass(customerOrderCounts[customer.email] || 0)}">${customerOrderCounts[customer.email] || 0}</span>
						</td>
						<td>
							<span class="status-badge ${customer.isActive ? "active" : "inactive"}">
								${customer.isActive ? "Active" : "Inactive"}
							</span>
						</td>
						<td>
							<span class="status-badge ${customer.emailConfirmed ? "active" : "inactive"}">
								${customer.emailConfirmed ? "Confirmed" : "Unconfirmed"}
							</span>
						</td>
						<td>${new Date(customer.createdAt).toLocaleDateString()}</td>
						<td>${
							customer.lastLogin
								? new Date(customer.lastLogin).toLocaleDateString()
								: "Never"
						}</td>
						<td>
							<div class="table-actions">
								<button class="btn-icon" onclick="viewCustomer('${customer._id}')" title="View Details">
									👁️
								</button>
								<button class="btn-icon" onclick="resetCustomerPassword('${customer._id}', '${customer.name}')" title="Reset Password">
									🔑
								</button>
							</div>
						</td>
					</tr>
				`
					)
					.join("");
			}

			function updateCustomerSummary() {
				const summary = document.getElementById("customer-summary");
				const activeCustomers = customersData.filter((c) => c.isActive).length;
				const inactiveCustomers = customersData.filter(
					(c) => !c.isActive
				).length;
				const recentCustomers = customersData.filter((c) => {
					const lastWeek = new Date();
					lastWeek.setDate(lastWeek.getDate() - 7);
					return new Date(c.createdAt) > lastWeek;
				}).length;

				if (customersData.length > 0) {
					summary.innerHTML = `
						<div class="summary-stats">
							<div class="stat-item">
								<span class="stat-number">${customersData.length}</span>
								<span class="stat-label">Total Customers</span>
							</div>
							<div class="stat-item">
								<span class="stat-number">${activeCustomers}</span>
								<span class="stat-label">Active</span>
							</div>
							<div class="stat-item">
								<span class="stat-number">${inactiveCustomers}</span>
								<span class="stat-label">Inactive</span>
							</div>
							<div class="stat-item">
								<span class="stat-number">${recentCustomers}</span>
								<span class="stat-label">New This Week</span>
							</div>
						</div>
					`;
					summary.classList.add("show");
				} else {
					summary.classList.remove("show");
				}
			}

			function filterCustomers() {
				const statusFilter = document.getElementById("customer-filter").value;
				const searchQuery = document
					.getElementById("customer-search")
					.value.toLowerCase();

				filteredCustomersData = customersData.filter((customer) => {
					const matchesStatus =
						statusFilter === "all" ||
						(statusFilter === "active" && customer.isActive) ||
						(statusFilter === "inactive" && !customer.isActive);

					const matchesSearch =
						searchQuery === "" ||
						customer.name.toLowerCase().includes(searchQuery) ||
						customer.email.toLowerCase().includes(searchQuery) ||
						(customer.phoneNumber &&
							customer.phoneNumber.toLowerCase().includes(searchQuery));

					return matchesStatus && matchesSearch;
				});

				// Apply sorting after filtering
				sortCustomers();

				// Update table title
				const title = document.getElementById("customers-table-title");
				if (statusFilter !== "all" || searchQuery !== "") {
					title.textContent = "Filtered Customers";
				} else {
					title.textContent = "All Customers";
				}
			}

			function clearCustomerFilters() {
				document.getElementById("customer-filter").value = "all";
				document.getElementById("customer-search").value = "";
				document.getElementById("customer-sort").value = "name-asc";
				filterCustomers();
			}

			function refreshCustomers() {
				loadCustomers();
				showMessage("Customers refreshed", "success");
			}

			function exportCustomers() {
				if (!customersData || customersData.length === 0) {
					showMessage("No customers to export", "error");
					return;
				}

				// Prepare data for export
				const exportData = customersData.map((customer) => ({
					Name: customer.name,
					Email: customer.email,
					Phone: customer.phoneNumber || "N/A",
					City:
						customer.address && customer.address.city
							? customer.address.city
							: "No city",
					Status: customer.isActive ? "Active" : "Inactive",
					Confirmed: customer.emailConfirmed ? "Yes" : "No",
					"Joined Date": new Date(customer.createdAt).toLocaleDateString(),
					"Last Login": customer.lastLogin
						? new Date(customer.lastLogin).toLocaleDateString()
						: "Never",
				}));

				// Create worksheet
				const ws = XLSX.utils.json_to_sheet(exportData);
				const wb = XLSX.utils.book_new();
				XLSX.utils.book_append_sheet(wb, ws, "Customers");

				// Download file
				XLSX.writeFile(wb, "customers.xlsx");
				showMessage("Customers exported to Excel successfully", "success");
			}

			function showCustomerStats() {
				showMessage(
					"Customer statistics modal would be displayed here",
					"info"
				);
				// TODO: Implement customer statistics modal
			}

			function viewCustomer(customerId) {
				// Find customer from loaded data
				const customer = customersData.find((c) => c._id === customerId);
				if (!customer) {
					showMessage("Customer not found", "error");
					return;
				}

				// Populate customer details
				document.getElementById("customer-avatar-letter").textContent =
					customer.name.charAt(0).toUpperCase();
				document.getElementById("customer-name").textContent = customer.name;
				document.getElementById("customer-email").textContent = customer.email;
				document.getElementById("customer-status").className = `status-badge ${
					customer.isActive ? "active" : "inactive"
				}`;
				document.getElementById("customer-status").textContent =
					customer.isActive ? "Active" : "Inactive";

				// Personal Information
				document.getElementById("customer-full-name").textContent =
					customer.name;
				document.getElementById("customer-detail-email").textContent =
					customer.email;
				document.getElementById("customer-phone").textContent =
					customer.phoneNumber || "Not provided";
				document.getElementById("customer-role").textContent =
					customer.role.charAt(0).toUpperCase() + customer.role.slice(1);
				document.getElementById("customer-detail-status").textContent =
					customer.isActive ? "Active" : "Inactive";

				// Address Information
				const address = customer.address || {};
				document.getElementById("customer-street").textContent =
					address.street || "Not provided";
				document.getElementById("customer-city").textContent =
					address.city || "Not provided";

				// Account Information
				document.getElementById("customer-id").textContent = customer._id;
				document.getElementById("customer-joined").textContent = new Date(
					customer.createdAt
				).toLocaleDateString();
				document.getElementById("customer-last-login").textContent =
					customer.lastLogin
						? new Date(customer.lastLogin).toLocaleDateString()
						: "Never";

				// Calculate account age
				const joinDate = new Date(customer.createdAt);
				const now = new Date();
				const accountAge = Math.floor((now - joinDate) / (1000 * 60 * 60 * 24));
				document.getElementById(
					"customer-account-age"
				).textContent = `${accountAge} days`;

				// Load order statistics
				loadCustomerOrderStats(customerId);

				// Show modal
				document.getElementById("customer-details-modal").style.display =
					"block";
			}

			function closeCustomerDetailsModal() {
				document.getElementById("customer-details-modal").style.display =
					"none";
			}

			async function loadCustomerOrderStats(customerId) {
				try {
					// Find customer from loaded data
					const customer = customersData.find((c) => c._id === customerId);
					if (!customer) {
						document.getElementById("customer-total-orders").textContent =
							"N/A";
						document.getElementById("customer-completed-orders").textContent =
							"N/A";
						document.getElementById("customer-pending-orders").textContent =
							"N/A";
						document.getElementById("customer-total-spent").textContent = "N/A";
						return;
					}

					// Get orders for this customer by searching with customer email
					const response = await authenticatedFetch(
						`${API_BASE_URL}/orders?search=${encodeURIComponent(
							customer.email
						)}&limit=1000`
					);

					if (response.ok) {
						const data = await response.json();
						const orders = listFrom(data, "orders");

						const totalOrders = orders.length;
						const completedOrders = orders.filter(
							(order) =>
								order.status === "delivered" || order.status === "completed"
						).length;
						const pendingOrders = orders.filter((order) =>
							[
								"pending",
								"confirmed",
								"processing",
								"ready for pickup",
								"OnTheWay",
							].includes(order.status)
						).length;
						const totalSpent = orders
							.filter(
								(order) =>
									order.status === "delivered" || order.status === "completed"
							)
							.reduce((sum, order) => sum + (order.total || 0), 0);

						document.getElementById("customer-total-orders").textContent =
							totalOrders;
						document.getElementById("customer-completed-orders").textContent =
							completedOrders;
						document.getElementById("customer-pending-orders").textContent =
							pendingOrders;
						document.getElementById(
							"customer-total-spent"
						).textContent = `$${totalSpent.toFixed(2)}`;
					} else {
						// If search fails, show N/A
						document.getElementById("customer-total-orders").textContent =
							"N/A";
						document.getElementById("customer-completed-orders").textContent =
							"N/A";
						document.getElementById("customer-pending-orders").textContent =
							"N/A";
						document.getElementById("customer-total-spent").textContent = "N/A";
					}
				} catch (error) {
					console.error("Error loading customer order stats:", error);
					document.getElementById("customer-total-orders").textContent =
						"Error";
					document.getElementById("customer-completed-orders").textContent =
						"Error";
					document.getElementById("customer-pending-orders").textContent =
						"Error";
					document.getElementById("customer-total-spent").textContent = "Error";
				}
			}

			function viewCustomerOrders() {
				// Get current customer from modal
				const customerEmail = document.getElementById(
					"customer-detail-email"
				).textContent;
				if (!customerEmail || customerEmail === "N/A") {
					showMessage("Customer email not available", "error");
					return;
				}

				// Close customer details modal
				closeCustomerDetailsModal();

				// Switch to orders section
				showSection("orders");

				// Set search filter to customer email
				document.getElementById("order-search").value = customerEmail;

				// Trigger search
				setTimeout(() => {
					searchOrders();
				}, 100);
			}

			function editCustomer() {
				// Get current customer ID from modal
				const customerId = document.getElementById("customer-id").textContent;
				if (!customerId) {
					showMessage("Customer ID not available", "error");
					return;
				}

				// Close customer details modal
				closeCustomerDetailsModal();

				// Find customer data
				const customer = customersData.find((c) => c._id === customerId);
				if (!customer) {
					showMessage("Customer not found", "error");
					return;
				}

				// Populate user edit modal with customer data
				document.getElementById("user-edit-id").value = customer._id;
				document.getElementById("user-edit-name").value = customer.name;
				document.getElementById("user-edit-email").value = customer.email;
				document.getElementById("user-edit-phone").value =
					customer.phoneNumber || "";
				document.getElementById("user-edit-role").value = customer.role;
				document.getElementById("user-edit-status").value = customer.isActive
					? "true"
					: "false";

				// Address fields
				const address = customer.address || {};
				document.getElementById("user-edit-street").value =
					address.street || "";
				document.getElementById("user-edit-city").value = address.city || "";
				lockUserCityToMarket();

				// Hide password field for editing existing user
				document.getElementById("user-edit-password-group").style.display =
					"none";

				// Update modal title
				document.getElementById("user-edit-modal-title").textContent =
					"Edit Customer";

				// Show modal
				document.getElementById("user-edit-modal").style.display = "block";
			}

			function deleteCustomer() {
				// Get current customer from modal
				const customerId = document.getElementById("customer-id").textContent;
				const customerName =
					document.getElementById("customer-full-name").textContent;

				if (!customerId) {
					showMessage("Customer ID not available", "error");
					return;
				}

				deleteUser(customerId, customerName);
				closeCustomerDetailsModal();
			}

			async function resetCustomerPassword(customerId, customerName) {
				if (!confirm(`Are you sure you want to reset the password for "${customerName}" to "123456789"?`)) {
					return;
				}

				try {
					const response = await authenticatedFetch(
						`${API_BASE_URL}/auth/reset-password/${customerId}`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
						}
					);

					if (response.ok) {
						showMessage(`Password for "${customerName}" has been reset to "123456789"`, "success");
					} else {
						const errorData = await response.json();
						showMessage(formatApiError(errorData) || "Failed to reset password", "error");
					}
				} catch (error) {
					console.error("Error resetting customer password:", error);
					showMessage("Error resetting password", "error");
				}
			}

			function viewCustomerOrders(customerId) {
				showMessage("Customer orders modal would be displayed here", "info");
				// TODO: Implement customer orders modal
			}

			// Load zones for rider modal dropdown
			async function loadZonesForRiderModal() {
				try {
					const response = await fetch(`${API_BASE_URL}/zones?isActive=true`, {
						headers: {
							Authorization: `Bearer ${localStorage.getItem("marketToken")}`,
						},
					});

					if (!response.ok) {
						throw new Error("Failed to fetch zones for rider modal");
					}

					const result = await response.json();
					// { data: { zones, pagination } } — unwrap, otherwise forEach below
					// throws and the rider modal renders no zone checkboxes at all.
					const zones = listFrom(result, "zones");

					const zoneContainer = document.getElementById("rider-zones");

					// Clear existing checkboxes
					zoneContainer.innerHTML = "";

					// Add zone checkboxes
					zones.forEach((zone) => {
						const checkboxItem = document.createElement("div");
						checkboxItem.className = "zone-checkbox-item";

						const checkbox = document.createElement("input");
						checkbox.type = "checkbox";
						checkbox.id = `zone-${zone._id}`;
						checkbox.name = "zones";
						checkbox.value = zone.zoneName;
						checkbox.addEventListener("change", function () {
							if (this.checked) {
								checkboxItem.classList.add("selected");
							} else {
								checkboxItem.classList.remove("selected");
							}
						});

						const label = document.createElement("label");
						label.htmlFor = `zone-${zone._id}`;
						label.textContent = zone.zoneName;
						label.style.cursor = "pointer";

						checkboxItem.appendChild(checkbox);
						checkboxItem.appendChild(label);
						zoneContainer.appendChild(checkboxItem);

						// Make the entire item clickable
						checkboxItem.addEventListener("click", function (e) {
							if (e.target !== checkbox) {
								checkbox.click();
							}
						});
					});

					if (zones.length === 0) {
						zoneContainer.innerHTML =
							'<p class="mdx-173">No active zones available</p>';
					}
				} catch (error) {
					console.error("Error loading zones for rider modal:", error);
					showMessage("Failed to load zones for dropdown", "error");
				}
			}

			async function toggleZoneStatus(zoneId, isActive) {
				try {
					const response = await fetch(
						`${API_BASE_URL}/zones/${zoneId}/status`,
						{
							method: "PATCH",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${currentToken}`,
							},
							body: JSON.stringify({ isActive: !isActive }),
						}
					);

					if (!response.ok) {
						throw new Error("Failed to update zone status");
					}

					loadZones();
					showMessage(
						`Zone ${isActive ? "deactivated" : "activated"} successfully`,
						"success"
					);
				} catch (error) {
					console.error("Error toggling zone status:", error);
					showMessage("Failed to update zone status", "error");
				}
			}

			async function deleteZone(zoneId, zoneName) {
				if (
					!confirm(
						`Are you sure you want to permanently delete zone "${zoneName}"? This action cannot be undone and will completely remove the zone from the database.`
					)
				) {
					return;
				}

				try {
					const response = await fetch(
						`${API_BASE_URL}/zones/${zoneId}/permanent`,
						{
							method: "DELETE",
							headers: {
								Authorization: `Bearer ${currentToken}`,
							},
						}
					);

					if (!response.ok) {
						throw new Error("Failed to permanently delete zone");
					}

					loadZones();
					showMessage("Zone permanently deleted successfully", "success");
				} catch (error) {
					console.error("Error permanently deleting zone:", error);
					showMessage("Failed to permanently delete zone", "error");
				}
			}

			function closeRiderModal() {
				document.getElementById("rider-modal").style.display = "none";
			}

			async function saveRider(event) {
				event.preventDefault();

				const form = event.target;
				const formData = new FormData(form);
				const riderId = document.getElementById("rider-id").value;

				// Collect selected zones
				const selectedZones = [];
				const zoneCheckboxes = document.querySelectorAll(
					'input[name="zones"]:checked'
				);
				zoneCheckboxes.forEach((checkbox) => {
					selectedZones.push(checkbox.value);
				});

				if (selectedZones.length === 0) {
					showMessage("Please select at least one zone", "error");
					return;
				}

				const riderData = {
					userId: formData.get("userId"),
					zones: selectedZones,
					vehicleType: formData.get("vehicleType"),
					licenseNumber: formData.get("licenseNumber"),
					status: formData.get("status"),
					maxConcurrentOrders:
						parseInt(formData.get("maxConcurrentOrders")) || 3,
					emergencyContactName: formData.get("emergencyContactName"),
					emergencyContactPhone: formData.get("emergencyContactPhone"),
					notes: formData.get("notes"),
				};

				try {
					const token = currentToken;
					const url = riderId
						? `${API_BASE_URL}/riders/${riderId}`
						: `${API_BASE_URL}/riders`;
					const method = riderId ? "PUT" : "POST";

					const response = await fetch(url, {
						method: method,
						headers: {
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(riderData),
					});

					if (response.ok) {
						const data = await response.json();
						showMessage(
							riderId
								? "Rider updated successfully!"
								: "Rider created successfully!",
							"success"
						);
						closeRiderModal();
						loadAllRiders();
						loadDashboardStats(); // Refresh dashboard stats
					} else {
						const errorData = await response.json();
						showMessage(formatApiError(errorData) || "Failed to save rider", "error");
					}
				} catch (error) {
					console.error("Error saving rider:", error);
					showMessage("Error saving rider", "error");
				}
			}

			function showRiderMap() {
				showMessage("Rider map feature coming soon!", "success");
			}

			async function viewRiderLocation(riderId) {
				try {
					const response = await fetch(
						`${API_BASE_URL}/riders/${riderId}`,
						{ headers: { Authorization: `Bearer ${currentToken}` } }
					);
					if (!response.ok) {
						showMessage("Failed to load rider data", "error");
						return;
					}
					const data = await response.json();
					const rider =
						data.data && data.data.rider ? data.data.rider : data.data;
					const coords = await __resolveRiderCoords(rider);
					if (!coords) {
						showMessage(
							"No location available — rider has not shared GPS and no address is set.",
							"error"
						);
						return;
					}
					const url = `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=15/${coords.lat}/${coords.lng}`;
					window.open(url, "_blank", "noopener");
				} catch (e) {
					console.error(e);
					showMessage("Error opening rider location", "error");
				}
			}

			async function updateRiderMapLocation() {
				if (!window.currentRiderMapId) return;

				try {
					const response = await fetch(
						`${API_BASE_URL}/riders/${window.currentRiderMapId}`,
						{ headers: { Authorization: `Bearer ${currentToken}` } }
					);
					if (!response.ok) {
						console.error("Failed to fetch rider location data");
						return;
					}
					const data = await response.json();
					const rider =
						data.data && data.data.rider ? data.data.rider : data.data;
					await renderRiderLeafletMap(rider);
				} catch (error) {
					console.error("Error updating rider location:", error);
				}
			}

			// ---- Leaflet rendering with free OSM tiles + Nominatim geocoding fallback ----
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
			async function __geocode(q) {
				if (!q) return null;
				const key = q.toLowerCase().trim();
				const cache = __getGeoCache();
				if (cache[key]) return cache[key];
				try {
					const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
						q
					)}`;
					const r = await fetch(url, {
						headers: { Accept: "application/json" },
					});
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

			async function __resolveRiderCoords(rider) {
				if (
					rider &&
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
				const u = (rider && rider.user) || {};
				const addr = u.address || rider.address || {};
				const full = [addr.street, addr.city, addr.region, addr.country || "Lebanon"]
					.filter(Boolean)
					.join(", ");
				if (full) {
					const hit = await __geocode(full);
					if (hit) return { ...hit, source: "address" };
				}
				if (addr.city) {
					const hit = await __geocode(addr.city + ", Lebanon");
					if (hit) return { ...hit, source: "city" };
				}
				if (Array.isArray(rider.zones) && rider.zones.length) {
					const hit = await __geocode(rider.zones[0] + ", Lebanon");
					if (hit) return { ...hit, source: "zone" };
				}
				return null;
			}

			window.__riderLeafletMap = null;
			window.__riderLeafletMarker = null;
			async function renderRiderLeafletMap(rider) {
				const container = document.getElementById("rider-map-leaflet");
				const note = document.getElementById("rider-map-note");
				if (!container || typeof L === "undefined") return;
				const coords = await __resolveRiderCoords(rider);
				const center = coords || { lat: 33.8938, lng: 35.5018 };
				if (!window.__riderLeafletMap) {
					window.__riderLeafletMap = L.map(container).setView(
						[center.lat, center.lng],
						coords ? 14 : 8
					);
					L.tileLayer(
						"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
						{
							maxZoom: 19,
							attribution: "\u00a9 OpenStreetMap contributors",
						}
					).addTo(window.__riderLeafletMap);
					setTimeout(
						() => window.__riderLeafletMap.invalidateSize(),
						200
					);
				} else {
					window.__riderLeafletMap.setView(
						[center.lat, center.lng],
						coords ? 14 : 8
					);
					setTimeout(
						() => window.__riderLeafletMap.invalidateSize(),
						200
					);
				}
				if (window.__riderLeafletMarker) {
					window.__riderLeafletMap.removeLayer(window.__riderLeafletMarker);
					window.__riderLeafletMarker = null;
				}
				if (coords) {
					const label =
						coords.source === "live"
							? "\uD83D\uDFE2 Live location"
							: coords.source === "address"
							? "\uD83D\uDCCD Last known address"
							: coords.source === "city"
							? "\uD83C\uDFD9\uFE0F City location"
							: "\uD83D\uDCCD Service zone";
					window.__riderLeafletMarker = L.marker([coords.lat, coords.lng])
						.addTo(window.__riderLeafletMap)
						.bindPopup(label)
						.openPopup();
					if (note)
						note.textContent =
							coords.source === "live"
								? `Live GPS \u2014 ${coords.lat.toFixed(
										5
								  )}, ${coords.lng.toFixed(5)}`
								: `Showing approximate ${coords.source} location (rider has not pushed GPS yet).`;
				} else if (note) {
					note.textContent =
						"No GPS data and no address available for this rider. Map centered on Lebanon.";
				}
			}

			async function viewRiderDetails(riderId) {
				try {
					const token = currentToken;
					const response = await fetch(`${API_BASE_URL}/riders/${riderId}`, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const data = await response.json();
						// /riders/:id returns { data: { rider } } — unwrap it, otherwise
						// every field below reads off the wrapper and comes out undefined.
						const rider = objectFrom(data, "rider") || {};

						// Adapt MarketRider shape (no `user` ref, direct fields) to the
						// admin-Rider shape this details view was built for.
						const u = rider.user || {
							name: rider.name,
							email: rider.email,
							phoneNumber: rider.phoneNumber,
						};
						const displayStatus =
							rider.status ||
							(!rider.isActive
								? "inactive"
								: rider.isAvailable
								? "available"
								: "offline");
						const displayLicense =
							rider.licenseNumber || rider.vehiclePlate || rider.vehicleNumber || "Not provided";

						// Build styled details view
						let detailsHtml = `
							<div class="mdx-174">
								<div class="mdx-175">
									<div class="mdx-176">🏍️</div>
									<div>
										<h2 class="mdx-177">${
											u.name || "Unknown"
										}</h2>
										<div class="mdx-178">Rider ID: <span class="mdx-164">${
											rider._id
										}</span></div>
									</div>
								</div>
								<div class="mdx-179">
									<div><strong>📧 Email:</strong><br><span class="mdx-180">${
										u.email || "Not provided"
									}</span></div>
									<div><strong>📞 Phone:</strong><br><span class="mdx-180">${
										u.phoneNumber || "Not provided"
									}</span></div>
									<div><strong>🏢 Zones:</strong><br><span class="mdx-180">${
										Array.isArray(rider.zones)
											? rider.zones.join(", ")
											: rider.zone || "No zones assigned"
									}</span></div>
									<div><strong>🚗 Vehicle:</strong><br><span class="mdx-180">${
										rider.vehicleType || "—"
									}</span></div>
									<div><strong>📄 License:</strong><br><span class="mdx-180">${displayLicense}</span></div>
									<div><strong>📊 Status:</strong><br>${getStatusBadge(displayStatus)}</div>
								</div>
								<div class="mdx-181">
									<div class="mdx-182">
										<div class="mdx-183">${
											rider.ordersPickedCount || 0
										}</div>
										<div class="mdx-184">Orders Picked</div>
									</div>
									<div class="mdx-182">
										<div class="mdx-185">${
											rider.ordersDeliveredCount || 0
										}</div>
										<div class="mdx-184">Orders Delivered</div>
									</div>
									<div class="mdx-182">
										<div class="mdx-186">⭐ ${
											typeof rider.rating === "number" && !isNaN(rider.rating)
												? rider.rating.toFixed(1)
												: "N/A"
										}</div>
										<div class="mdx-184">Rating</div>
									</div>
								</div>
								${
									rider.emergencyContactName
										? `<div class="mdx-187"><strong>🚨 Emergency Contact:</strong><br>${
												rider.emergencyContactName
										  } - ${rider.emergencyContactPhone || "No phone"}</div>`
										: ""
								}
								${
									rider.notes
										? `<div class="mdx-188"><strong>📝 Notes:</strong><br>${rider.notes}</div>`
										: ""
								}
								<div class="mdx-189">
									<button onclick="editRider('${riderId}')" class="btn btn-primary mdx-190">✏️ Edit Rider</button>
									<button onclick="document.getElementById('rider-details-overlay').style.display='none'" class="btn btn-secondary mdx-191">Close</button>
								</div>
							</div>
						`;

						// Create overlay if it doesn't exist
						let overlay = document.getElementById("rider-details-overlay");
						if (!overlay) {
							overlay = document.createElement("div");
							overlay.id = "rider-details-overlay";
							overlay.style.cssText = `
								position: fixed; top: 0; left: 0; width: 100%; height: 100%;
								background: rgba(0,0,0,0.5); z-index: 10000; display: flex;
								align-items: center; justify-content: center; overflow-y: auto;
							`;
							document.body.appendChild(overlay);
						}

						overlay.innerHTML = detailsHtml;
						overlay.style.display = "flex";

						// Close on outside click
						overlay.onclick = function (e) {
							if (e.target === overlay) {
								overlay.style.display = "none";
							}
						};
					} else {
						showMessage("Failed to load rider details", "error");
					}
				} catch (error) {
					console.error("Error loading rider details:", error);
					showMessage("Error loading rider details", "error");
				}
			}

			async function editRider(riderId) {
				try {
					const token = currentToken;
					const response = await fetch(`${API_BASE_URL}/riders/${riderId}`, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const data = await response.json();
						// /riders/:id returns { data: { rider } } — unwrap it, otherwise
						// every field below reads off the wrapper and comes out undefined.
						const rider = objectFrom(data, "rider") || {};

						// Close details overlay if open
						const overlay = document.getElementById("rider-details-overlay");
						if (overlay) overlay.style.display = "none";

						// Populate the form
						document.getElementById("rider-id").value = rider._id;
						document.getElementById("rider-vehicle-type").value =
							rider.vehicleType;
						document.getElementById("rider-license-number").value =
							rider.licenseNumber || "";
						document.getElementById("rider-status").value = rider.status;
						document.getElementById("rider-max-orders").value =
							rider.maxConcurrentOrders || 3;
						document.getElementById("rider-emergency-contact").value =
							rider.emergencyContactName || "";
						document.getElementById("rider-emergency-phone").value =
							rider.emergencyContactPhone || "";
						document.getElementById("rider-notes").value = rider.notes || "";

						// Load users but disable the select since we're editing
						await loadUsersForRiderModal();
						const userSelect = document.getElementById("rider-user");
						userSelect.value = rider.user._id;
						userSelect.disabled = true; // Can't change user after creation

						// Load zones and set the selected zones
						await loadZonesForRiderModal();

						// Select the rider's zones
						const riderZones = Array.isArray(rider.zones)
							? rider.zones
							: rider.zone
							? [rider.zone]
							: [];
						riderZones.forEach((zoneName) => {
							const checkbox = document.querySelector(
								`input[name="zones"][value="${zoneName}"]`
							);
							if (checkbox) {
								checkbox.checked = true;
								checkbox.dispatchEvent(new Event("change"));
							}
						});

						// Update modal title and show
						document.getElementById(
							"rider-modal-title"
						).textContent = `Edit Rider - ${rider.user.name}`;
						document.getElementById("rider-modal").style.display = "block";
					} else {
						showMessage("Failed to load rider data", "error");
					}
				} catch (error) {
					console.error("Error loading rider for edit:", error);
					showMessage("Error loading rider data", "error");
				}
			}

			async function toggleRiderStatus(riderId, currentStatus) {
				const newStatus =
					currentStatus === "available" ? "offline" : "available";
				const action = newStatus === "available" ? "activate" : "deactivate";

				if (!confirm(`Are you sure you want to ${action} this rider?`)) {
					return;
				}

				try {
					const token = currentToken;
					const response = await fetch(
						`${API_BASE_URL}/riders/${riderId}/status`,
						{
							method: "PATCH",
							headers: {
								Authorization: `Bearer ${token}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ status: newStatus }),
						}
					);
					if (response.ok) {
						showMessage(`Rider ${action}d successfully!`, "success");
						loadAllRiders();
						loadDashboardStats(); // Refresh dashboard stats
					} else {
						const errorData = await response.json();
						showMessage(
							formatApiError(errorData) || `Failed to ${action} rider`,
							"error"
						);
					}
				} catch (error) {
					console.error(`Error ${action}ing rider:`, error);
					showMessage(`Error ${action}ing rider`, "error");
				}
			}

			async function deleteRider(riderId) {
				if (
					!confirm(
						"Are you sure you want to permanently delete this rider? This action cannot be undone and all rider data will be permanently removed from the system."
					)
				) {
					return;
				}

				try {
					const token = currentToken;
					const response = await fetch(`${API_BASE_URL}/riders/${riderId}`, {
						method: "DELETE",
						headers: {
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
					});
					if (response.ok) {
						showMessage("Rider permanently deleted!", "success");
						loadAllRiders();
						loadDashboardStats(); // Refresh dashboard stats
					} else {
						const errorData = await response.json();
						showMessage(formatApiError(errorData) || "Failed to delete rider", "error");
					}
				} catch (error) {
					console.error("Error deleting rider:", error);
					showMessage("Error deleting rider", "error");
				}
			}

			async function loadRiderStats() {
				try {
					const token = currentToken;
					const response = await fetch(`${API_BASE_URL}/riders/stats`, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
					});
					if (response.ok) {
						const data = await response.json();
						const stats = data.data.overall; // API returns stats in data.overall

						// Update any rider stats displays if they exist
						const statsElements = {
							"riders-total": stats.totalRiders,
							"riders-active": stats.availableRiders, // API uses availableRiders instead of activeRiders
							"riders-busy": stats.busyRiders,
							"riders-offline": stats.offlineRiders,
							"total-riders-stat": stats.availableRiders, // For dashboard - show available riders
						};
						Object.entries(statsElements).forEach(([id, value]) => {
							const element = document.getElementById(id);
							if (element) {
								element.textContent = value || 0;
							}
						});

						return stats;
					}
				} catch (error) {
					console.error("Error loading rider stats:", error);
				}
				return null;
			}

			// Profile Section Functions
			function loadProfileSection() {
				if (currentUser) {
					// Use correct element IDs that match the HTML
					const userNameEl = document.getElementById("user-name");
					const userEmailEl = document.getElementById("user-email");
					const userPhoneEl = document.getElementById("user-phone");
					const userRoleEl = document.getElementById("user-role");

					if (userNameEl) userNameEl.textContent = currentUser.name;
					if (userEmailEl) userEmailEl.textContent = currentUser.email;
					if (userPhoneEl) userPhoneEl.textContent = currentUser.phoneNumber;
					if (userRoleEl)
						userRoleEl.textContent = currentUser.role.toUpperCase();

					setProfileCities(currentUser.cities || []);
					setMarketLogoPreview(
						(currentUser.market && currentUser.market.logo) || ""
					);
				}
			}

			// ===== Market Logo upload =====
			function setMarketLogoPreview(src) {
				const preview = document.getElementById("market-logo-preview");
				if (!preview) return;
				if (!src) {
					preview.style.display = "none";
					preview.removeAttribute("src");
					return;
				}
				preview.src = src;
				preview.style.display = "block";
			}

			async function onMarketLogoSelected(event) {
				const file = event.target.files && event.target.files[0];
				const statusEl = document.getElementById("market-logo-status");
				if (!file) return;

				// Instant local preview while the upload is in flight.
				const reader = new FileReader();
				reader.onload = () => setMarketLogoPreview(reader.result);
				reader.readAsDataURL(file);

				try {
					if (statusEl) statusEl.textContent = "Uploading…";
					const body = new FormData();
					body.append("logo", file);

					const response = await authenticatedFetch(
						`${API_BASE_URL}/market-admin/profile/logo`,
						{ method: "POST", body }
					);
					const result = await response.json();
					if (!response.ok || !result.success) {
						throw new Error(formatApiError(result, "Failed to upload logo"));
					}

					const updatedMarket = result.data || {};
					setMarketLogoPreview(updatedMarket.logo || "");
					if (currentUser) {
						currentUser.market = Object.assign(
							{},
							currentUser.market,
							updatedMarket
						);
					}
					if (statusEl) statusEl.textContent = "Logo updated ✓";
					showMessage("Market logo updated", "success");
				} catch (error) {
					console.error("Logo upload error:", error);
					if (statusEl) statusEl.textContent = "";
					showMessage(error.message || "Failed to upload logo", "error");
					// Revert preview to the last saved logo on failure.
					setMarketLogoPreview(
						(currentUser && currentUser.market && currentUser.market.logo) || ""
					);
				} finally {
					event.target.value = "";
				}
			}

			// ===== Delivery Coverage Regions — embeds the standalone
			// /market-profile-map page (literally the same createMultiPinPicker
			// component + load/save code as the main admin's Markets page) via
			// iframe, instead of re-implementing the map inline here. This
			// guarantees the market owner always gets the exact same,
			// proven-working behavior with zero risk of the two surfaces
			// drifting out of sync. =====
			function openMarketRegionsModal() {
				const frame = document.getElementById("mkt-regions-iframe");
				// Reset the src on every open so the iframe does a full fresh
				// load (and therefore a fresh GET of the current saved pins)
				// instead of reusing a possibly-stale previous instance.
				frame.src = "about:blank";
				frame.src = "/market-profile-map";
				document.getElementById("mkt-regions-overlay").classList.add("show");
			}

			function closeMarketRegionsModal() {
				document.getElementById("mkt-regions-overlay").classList.remove("show");
				document.getElementById("mkt-regions-iframe").src = "about:blank";
			}

			// Let the embedded page tell us when the user saved or wants to close,
			// so we don't need to duplicate any of its map/save logic here.
			window.addEventListener("message", function (event) {
				if (!event.data || typeof event.data !== "object") return;
				if (event.data.type === "market-profile-map:saved") {
					showMessage("Delivery coverage regions updated", "success");
				} else if (event.data.type === "market-profile-map:close") {
					closeMarketRegionsModal();
				}
			});

			// Export Users Function
			function exportUsers() {
				showMessage("User export feature coming soon!", "success");
			}

			// Load profile when page loads
			document.addEventListener("DOMContentLoaded", function () {
				loadUserProfile();
				// The default section is already marked active in the markup, and
				// loadUserProfile() opens the role-appropriate one when it resolves.
				// Forcing it here as well caused a visible flash and a duplicate load.
				// Language is initialized by loadSavedLanguage() (separate
				// DOMContentLoaded handler below).
			});

			// Handle window resize for responsive sidebar
			window.addEventListener("resize", function () {
				const sidebar = document.getElementById("sidebar");
				const mainContent = document.getElementById("mainContent");

				if (window.innerWidth > 768) {
					sidebar.classList.remove("show");
					if (!sidebar.classList.contains("collapsed")) {
						mainContent.classList.remove("expanded");
					}
				}
			});

			// Close modal when clicking outside
			window.onclick = function (event) {
				const userModal = document.getElementById("user-edit-modal");
				const categoryModal = document.getElementById("category-modal");
				const productModal = document.getElementById("product-modal");
				const riderModal = document.getElementById("rider-modal");
				const riderMapModal = document.getElementById("rider-map-modal");
				const orderDetailsModal = document.getElementById(
					"order-details-modal"
				);
				const zoneModal = document.getElementById("zone-modal");
				const zoneStatsModal = document.getElementById("zone-stats-modal");
				const marketRegionsModal = document.getElementById("mkt-regions-overlay");

				if (event.target === userModal) {
					closeModal();
				} else if (event.target === categoryModal) {
					closeCategoryModal();
				} else if (event.target === productModal) {
					closeProductModal();
				} else if (event.target === riderModal) {
					closeRiderModal();
				} else if (event.target === riderMapModal) {
					closeRiderMapModal();
				} else if (event.target === orderDetailsModal) {
					closeOrderDetails();
				} else if (event.target === zoneModal) {
					closeZoneModal();
				} else if (event.target === marketRegionsModal) {
					closeMarketRegionsModal();
				} else if (event.target === zoneStatsModal) {
					closeZoneStatsModal();
				}
			};
		

// ---- next inline script block ----


			// Image upload handling
			document.addEventListener("DOMContentLoaded", function () {
				// Product image handling
				const fileInput = document.getElementById("product-picture");
				const imagePreview = document.getElementById("image-preview");
				const previewImg = document.getElementById("preview-img");
				const removeButton = document.getElementById("remove-image");

				if (fileInput) {
					fileInput.addEventListener("change", function (e) {
						const file = e.target.files[0];
						if (file) {
							// Validate file type
							if (!file.type.startsWith("image/")) {
								showMessage("Please select an image file", "error");
								fileInput.value = "";
								return;
							}

							// Validate file size (5MB)
							if (file.size > 5 * 1024 * 1024) {
								showMessage("Image file size must be less than 5MB", "error");
								fileInput.value = "";
								return;
							}

							// Show preview
							const reader = new FileReader();
							reader.onload = function (e) {
								previewImg.src = e.target.result;
								imagePreview.style.display = "block";
							};
							reader.readAsDataURL(file);
						} else {
							imagePreview.style.display = "none";
						}
					});
				}

				if (removeButton) {
					removeButton.addEventListener("click", function () {
						fileInput.value = "";
						imagePreview.style.display = "none";
						previewImg.src = "";
					});
				}

				// Image update modal image handling
				const newImageInput = document.getElementById("new-product-image");
				const newImagePreview = document.getElementById("new-image-preview");
				const newPreviewImg = document.getElementById("new-preview-img");

				if (newImageInput) {
					newImageInput.addEventListener("change", function (e) {
						const file = e.target.files[0];
						if (file) {
							// Validate file type
							if (!file.type.startsWith("image/")) {
								showMessage("Please select an image file", "error");
								newImageInput.value = "";
								return;
							}

							// Validate file size (5MB)
							if (file.size > 5 * 1024 * 1024) {
								showMessage("Image file size must be less than 5MB", "error");
								newImageInput.value = "";
								return;
							}

							// Show preview
							const reader = new FileReader();
							reader.onload = function (e) {
								newPreviewImg.src = e.target.result;
								newImagePreview.style.display = "block";
							};
							reader.readAsDataURL(file);
						} else {
							newImagePreview.style.display = "none";
						}
					});
				}

				// Category image handling
				const categoryFileInput = document.getElementById("category-image");
				const categoryImagePreview = document.getElementById(
					"category-image-preview"
				);
				const categoryPreviewImg = document.getElementById(
					"category-preview-img"
				);
				const categoryRemoveButton = document.getElementById(
					"remove-category-image"
				);

				if (categoryFileInput) {
					categoryFileInput.addEventListener("change", function (e) {
						const file = e.target.files[0];
						if (file) {
							// Validate file type
							if (!file.type.startsWith("image/")) {
								showMessage("Please select an image file", "error");
								categoryFileInput.value = "";
								return;
							}

							// Validate file size (5MB)
							if (file.size > 5 * 1024 * 1024) {
								showMessage("Image file size must be less than 5MB", "error");
								categoryFileInput.value = "";
								return;
							}

							// Show preview
							const reader = new FileReader();
							reader.onload = function (e) {
								categoryPreviewImg.src = e.target.result;
								categoryImagePreview.style.display = "block";
							};
							reader.readAsDataURL(file);
						} else {
							categoryImagePreview.style.display = "none";
						}
					});
				}

				if (categoryRemoveButton) {
					categoryRemoveButton.addEventListener("click", function () {
						const currentImageField = document.getElementById(
							"category-current-image"
						);
						categoryFileInput.value = "";
						categoryImagePreview.style.display = "none";
						categoryPreviewImg.src = "";
						if (currentImageField) currentImageField.value = "";
					});
				}

				// Price calculation handling
				const priceInput = document.getElementById("product-price");
				const taxInput = document.getElementById("product-tax");
				const discountInput = document.getElementById("product-discount");

				function updatePriceCalculation() {
					const basePrice = parseFloat(priceInput.value) || 0;
					const tax = parseFloat(taxInput.value) || 0;
					const discount = parseFloat(discountInput.value) || 0;

					// Calculate discounted price
					const discountAmount = (basePrice * discount) / 100;
					const discountedPrice = basePrice - discountAmount;

					// Calculate final price with tax
					const taxAmount = (discountedPrice * tax) / 100;
					const finalPrice = discountedPrice + taxAmount;

					// Update display elements
					document.getElementById(
						"calc-base-price"
					).textContent = `Base Price: $${basePrice.toFixed(2)}`;

					const discountElement = document.getElementById("calc-discount");
					if (discount > 0) {
						discountElement.textContent = `Discount: ${discount}% (-$${discountAmount.toFixed(
							2
						)})`;
						discountElement.style.display = "block";
					} else {
						discountElement.style.display = "none";
					}

					document.getElementById(
						"calc-subtotal"
					).textContent = `After Discount: $${discountedPrice.toFixed(2)}`;

					const taxElement = document.getElementById("calc-tax");
					if (tax > 0) {
						taxElement.textContent = `Tax: ${tax}% (+$${taxAmount.toFixed(2)})`;
						taxElement.style.display = "block";
					} else {
						taxElement.style.display = "none";
					}

					document.getElementById(
						"calc-final-price"
					).textContent = `Final Price: $${finalPrice.toFixed(2)}`;
				}

				// Add event listeners for real-time calculation
				if (priceInput) {
					priceInput.addEventListener("input", updatePriceCalculation);
				}
				if (taxInput) {
					taxInput.addEventListener("input", updatePriceCalculation);
				}
				if (discountInput) {
					discountInput.addEventListener("input", updatePriceCalculation);
				}

				// Initial calculation
				updatePriceCalculation();
			});

			// ============================================
			// Orders Management Functions
			// ============================================

			let currentOrdersPage = 1;
			let totalOrdersPages = 1;
			let ordersPageSize = 10;
			let currentOrderId = null;
			let currentOrderFilters = {}; // Store current filter values for pagination

			// Live updates variables
			let ordersPollingInterval = null;
			let lastOrderCount = 0;
			const ORDERS_POLLING_INTERVAL = 60000; // 60 seconds

			// Load orders with optional filters
			async function loadOrdersWithFilters(
				page = currentOrdersPage,
				pageSize = ordersPageSize,
				filters = {}
			) {
				// Store current filters for pagination
				currentOrderFilters = { ...filters };

				showSectionLoading("orders", true, "Loading orders...");

				try {
					let url = `${API_BASE_URL}/orders?page=${page}&limit=${pageSize}`;

					// Apply filters
					if (filters.search) {
						url += `&search=${encodeURIComponent(filters.search)}`;
					}
					if (filters.status && filters.status !== "all") {
						url += `&status=${filters.status}`;
					}
					if (filters.paymentStatus && filters.paymentStatus !== "all") {
						url += `&paymentStatus=${filters.paymentStatus}`;
					}
					if (filters.dateFrom) {
						url += `&dateFrom=${encodeURIComponent(filters.dateFrom)}`;
					}
					if (filters.dateTo) {
						url += `&dateTo=${encodeURIComponent(filters.dateTo)}`;
					}

					url += `&isActive=true`;

					const response = await fetch(url, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					const result = await response.json();

					if (response.ok) {
						const resultPagination = result.data && result.data.pagination;
						// Update the effective page size globally so numbering and pagination behave consistently
						ordersPageSize = parseInt(pageSize) || ordersPageSize;
						// Update current page before rendering so numbering (#) is correct
						currentOrdersPage = resultPagination?.currentPage || page;
						displayOrders((result.data && result.data.orders) || []);
						updateOrdersPagination(resultPagination);
						// store total orders count for polling comparison
						lastOrderCount = resultPagination?.totalOrders ?? lastOrderCount;
						// Update last update timestamp (guard in case element not present)
						const ordersLastUpdateEl =
							document.getElementById("orders-last-update");
						if (ordersLastUpdateEl) {
							ordersLastUpdateEl.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
						}
					} else {
						showMessage(formatApiError(result, "Failed to load orders"), "error");
					}
				} catch (error) {
					showMessage("Error loading orders: " + error.message, "error");
				} finally {
					showSectionLoading("orders", false);
				}
			}

			// Load orders with pagination
			async function loadOrders(
				page = currentOrdersPage,
				pageSize = ordersPageSize
			) {
				await loadOrdersWithFilters(page, pageSize, {});
			}

			// Start live updates for orders section
			function startOrdersLiveUpdates() {
				if (ordersPollingInterval) {
					clearInterval(ordersPollingInterval);
				}

				// Initial load to get current state
				loadOrders();

				// Start polling for new orders
				ordersPollingInterval = setInterval(
					checkForNewOrders,
					ORDERS_POLLING_INTERVAL
				);
				const ordersLiveIndicatorEl = document.getElementById(
					"orders-live-indicator"
				);
				if (ordersLiveIndicatorEl)
					ordersLiveIndicatorEl.style.display = "inline";
				console.log("Started live updates for orders section");
			}

			// Stop live updates for orders section
			function stopOrdersLiveUpdates() {
				if (ordersPollingInterval) {
					clearInterval(ordersPollingInterval);
					ordersPollingInterval = null;
					const ordersLiveIndicatorEl2 = document.getElementById(
						"orders-live-indicator"
					);
					if (ordersLiveIndicatorEl2)
						ordersLiveIndicatorEl2.style.display = "none";
					console.log("Stopped live updates for orders section");
				}
			}

			// Check for new orders
			async function checkForNewOrders() {
				try {
					// Get the latest order count
					const response = await fetch(`${API_BASE_URL}/orders/count`, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const result = await response.json();
						const currentOrderCount = (result.data && result.data.count) || 0;

						// Only reload if the total order count changed
						if (currentOrderCount !== lastOrderCount) {
							lastOrderCount = currentOrderCount;
							// Reload the currently viewed page with current filters to avoid jumping the user to page 1
							loadOrdersWithFilters(currentOrdersPage, ordersPageSize, currentOrderFilters);
						}
					}
				} catch (error) {
					console.error("Error checking for new orders:", error);
					// Don't show error message for polling failures to avoid spam
				}
			}

			// Display orders in table
			function displayOrders(orders) {
				const tbody = document.getElementById("orders-table-body");
				if (!tbody) return; // nothing to render into
				tbody.innerHTML = "";

				if (orders.length === 0) {
					tbody.innerHTML = `
						<tr>
							<td colspan="10" class="mdx-3">
								<div class="mdx-224">📦</div>
								<div class="mdx-225">No orders found</div>
								<div class="mdx-226">Create your first order to get started</div>
							</td>
						</tr>
					`;
					return;
				}

				orders.forEach((order, index) => {
					const startIndex = (currentOrdersPage - 1) * ordersPageSize;
					const orderIndex = startIndex + index + 1;

					// Status/payment colours come from CSS classes (see global.css).
					// The inline-style extraction previously dropped these colours
					// entirely, leaving the badges with no background while
					// `.status-badge` set white text — i.e. white-on-white, so the
					// Status and Payment cells looked completely blank.
					const slug = (v) => String(v || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
					const statusSlug = slug(order.status);
					const paymentSlug = slug(order.paymentStatus);
					const orderDate = new Date(order.createdAt).toLocaleDateString();
					const customerName = order.customer?.name || "N/A";
					const itemCount = order.items?.length || 0;

					const row = `
						<tr>
							<td>${orderIndex}</td>
							<td><strong>${order.orderNumber}</strong></td>
							<td>
								<div>${customerName}</div>
								${
									order.customer?.email
										? `<small class="mdx-148">${order.customer.email}</small>`
										: ""
								}
							</td>
							<td>${itemCount} item${itemCount !== 1 ? "s" : ""}</td>
							<td><strong>$${order.total?.toFixed(2) || "0.00"}</strong></td>
							<td>
								<span class="status-badge status-${statusSlug}">
									${order.status}
								</span>
							</td>
							<td>
								<span class="status-badge pay-${paymentSlug}">
									${order.paymentStatus}
								</span>
							</td>
							<td>${orderDate}</td>
							<td>${order.deliveryTime ? new Date(order.deliveryTime).toLocaleString() : "ASAP"}</td>
							<td class="actions">
								<button class="action-btn view" onclick="viewOrder('${order._id}')">View</button>
								${order.paymentStatus === 'ondelivery' ? `<button class="action-btn edit" onclick="markOrderAsPaid('${order._id}', '${order.orderNumber}')">Payed</button>` : ''}
								<button class="action-btn cancel" onclick="cancelOrder('${order._id}', '${order.orderNumber}')">Cancel</button>
								<button class="action-btn delete" onclick="deleteOrder('${order._id}', '${order.orderNumber}')">Delete</button>
							</td>
						</tr>
					`;
					tbody.innerHTML += row;
				});
			}

			// Get status colors
			function getStatusColor(status) {
				const colors = {
					pending: "#ffc107",
					confirmed: "#17a2b8",
					processing: "#fd7e14",
					OnTheWay: "#6f42c1",
					delivered: "#28a745",
					cancelled: "#dc3545",
				};
				return colors[status] || "#6c757d";
			}

			function getPaymentStatusColor(status) {
				const colors = {
					pending: "#ffc107",
					paid: "#28a745",
					failed: "#dc3545",
					refunded: "#fd7e14",
					ondelivery: "#17a2b8",
					paidondelivery: "#20c997",
					cancelled: "#6c757d",
				};
				return colors[status] || "#6c757d";
			}

			// ===== Assign Driver → mark order On The Way =====
			let assignOrderId = null;
			let assignOrderNumber = null;

			function ensureAssignDriverModal() {
				if (document.getElementById("assign-driver-modal")) return;
				const overlay = document.createElement("div");
				overlay.id = "assign-driver-modal";
				overlay.style.cssText =
					"position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;z-index:3000;align-items:center;justify-content:center;padding:20px;";
				overlay.innerHTML = `
					<div class="mdx-229">
						<div class="mdx-230">
							<h3 class="mdx-82">🚚 Assign Driver</h3>
							<span onclick="closeAssignDriverModal()" class="mdx-231">&times;</span>
						</div>
						<p class="mdx-67">Select a driver to deliver this order. It will be marked <strong>On The Way</strong>.</p>
						<label class="mdx-232">Driver</label>
						<select id="assign-driver-select" class="mdx-233"></select>
						<div class="mdx-234">
							<button class="btn btn-secondary" onclick="closeAssignDriverModal()">Cancel</button>
							<button class="btn btn-primary" onclick="confirmAssignDriver()">Assign &amp; Send</button>
						</div>
					</div>`;
				document.body.appendChild(overlay);
			}

			async function openAssignDriverModal(orderId, orderNumber, orderCity, orderLocation) {
				assignOrderId = orderId;
				assignOrderNumber = orderNumber;
				ensureAssignDriverModal();
				const modal = document.getElementById("assign-driver-modal");
				const select = document.getElementById("assign-driver-select");
				select.innerHTML = '<option value="">Loading drivers…</option>';
				modal.style.display = "flex";
				try {
					// Market drivers are login-capable Rider docs scoped to this market.
					// Prefer the customer's EXACT map pin (captured on their profile) for
					// the geofence filter — falls back to the delivery city's approximate
					// center only if no exact pin was saved.
					const hasPin =
						orderLocation &&
						typeof orderLocation.latitude === "number" &&
						typeof orderLocation.longitude === "number";
					const locationQS = hasPin
						? `?lat=${orderLocation.latitude}&lng=${orderLocation.longitude}`
						: orderCity
						? `?city=${encodeURIComponent(orderCity)}`
						: "";
					const url = `${API_BASE_URL}/market-admin/drivers${locationQS}`;
					const res = await fetch(url, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});
					const data = await res.json();
					// /riders answers { data: { riders } }, so data.data is the
					// WRAPPER object and Array.isArray() is always false — the list
					// silently became [] and the table rendered its empty state.
					const riders = listFrom(data, "riders");
					if (!riders.length) {
						select.innerHTML = orderCity
							? `<option value="">No drivers cover "${orderCity}". Add/adjust a driver's delivery regions first.</option>`
							: '<option value="">No drivers yet. Add a driver in the Staff/Drivers section first.</option>';
						return;
					}
					select.innerHTML = riders
						.map((r) => {
							const name = (r.user && r.user.name) || r.name || "Driver";
							const zones = Array.isArray(r.zones) ? r.zones.join(", ") : r.zone || "";
							const distance =
								typeof r.distanceKm === "number" && isFinite(r.distanceKm)
									? ` · ${r.distanceKm.toFixed(1)} km away`
									: "";
							return `<option value="${r._id}">${name}${zones ? " — " + zones : ""} (${r.status || "available"})${distance}</option>`;
						})
						.join("");
				} catch (e) {
					select.innerHTML = '<option value="">Failed to load drivers</option>';
				}
			}

			function closeAssignDriverModal() {
				const modal = document.getElementById("assign-driver-modal");
				if (modal) modal.style.display = "none";
				assignOrderId = null;
				assignOrderNumber = null;
			}

			async function confirmAssignDriver() {
				const select = document.getElementById("assign-driver-select");
				const riderId = select ? select.value : "";
				if (!riderId) {
					showMessage("Please select a driver", "error");
					return;
				}
				try {
					const res = await fetch(`${API_BASE_URL}/orders/${assignOrderId}`, {
						method: "PUT",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							status: "OnTheWay",
							assignedRider: riderId,
							riderAssignedAt: new Date().toISOString(),
						}),
					});
					const result = await res.json();
					if (res.ok) {
						showMessage(
							`Order "${assignOrderNumber}" assigned and marked On The Way`,
							"success"
						);
						closeAssignDriverModal();
						loadOrdersWithFilters(
							currentOrdersPage,
							ordersPageSize,
							currentOrderFilters
						);
					} else {
						showMessage(formatApiError(result, "Failed to assign driver"), "error");
					}
				} catch (e) {
					showMessage("Error assigning driver: " + e.message, "error");
				}
			}

			// Update pagination
			function updateOrdersPagination(pagination) {
				if (!pagination) return;

				// Keep total pages for other helpers
				if (typeof pagination.totalPages === "number") {
					totalOrdersPages = pagination.totalPages;
				}

				const paginationContainer = document.querySelector(
					"#orders-section .pagination-container"
				);
				const prevBtn = document.getElementById("orders-prev-btn");
				const nextBtn = document.getElementById("orders-next-btn");
				const pageInfo = document.getElementById("orders-page-info");
				const paginationInfo = document.getElementById(
					"orders-pagination-info"
				);

				// Hide pagination if there's only one page
				if (pagination.totalPages <= 1) {
					if (paginationContainer) paginationContainer.style.display = "none";
					return;
				}

				// Show pagination for multiple pages
				if (paginationContainer) paginationContainer.style.display = "flex";

				if (prevBtn) prevBtn.disabled = !pagination.hasPrevPage;
				if (nextBtn) nextBtn.disabled = !pagination.hasNextPage;

				if (pageInfo)
					pageInfo.textContent = `Page ${pagination.currentPage} of ${pagination.totalPages}`;
				if (paginationInfo)
					paginationInfo.textContent = `Showing ${
						(pagination.currentPage - 1) * ordersPageSize + 1
					}-${Math.min(
						pagination.currentPage * ordersPageSize,
						pagination.totalOrders
					)} of ${pagination.totalOrders} orders`;

				// Update the orders count display and dashboard stat
				const ordersCountEl = document.getElementById("orders-count-display");
				if (ordersCountEl)
					ordersCountEl.textContent = `${pagination.totalOrders} orders`;
				const totalOrdersStatEl = document.getElementById("total-orders-stat");
				if (totalOrdersStatEl)
					totalOrdersStatEl.textContent = pagination.totalOrders;
			}

			// Change orders page size from selector
			function changeOrdersPageSize(size) {
				const newSize = parseInt(size) || 20;
				// reload starting at first page with current filters
				loadOrdersWithFilters(1, newSize, currentOrderFilters);
			}

			// Navigate to page from pagination buttons
			function goToOrdersPage(page) {
				const maxPage =
					typeof totalOrdersPages === "number" && totalOrdersPages > 0
						? totalOrdersPages
						: 999999;
				const validPage = Math.max(1, Math.min(page || 1, maxPage));
				loadOrdersWithFilters(validPage, ordersPageSize, currentOrderFilters);
			}

			// Show add order modal
			function showAddOrderModal() {
				currentOrderId = null;
				document.getElementById("order-modal-title").textContent =
					"Create New Order";
				document.getElementById("order-form").reset();

				// Load products for selection
				loadProductsForOrder();

				// Show modal
				document.getElementById("order-modal").style.display = "block";
			}

			// Close order modal
			function closeOrderModal() {
				document.getElementById("order-modal").style.display = "none";
				document.getElementById("order-form").reset();
				currentOrderId = null;
			}

			// Load products for order selection
			async function loadProductsForOrder() {
				try {
					const response = await fetch(
						`${API_BASE_URL}/products?limit=1000&isActive=true`,
						{
							headers: {
								Authorization: `Bearer ${currentToken}`,
							},
						}
					);

					const result = await response.json();
					if (response.ok) {
						const products = listFrom(result, "products");
						const productSelects = document.querySelectorAll(".product-select");

						productSelects.forEach((select) => {
							select.innerHTML = '<option value="">Select a product</option>';
							products.forEach((product) => {
								select.innerHTML += `<option value="${product._id}" data-price="${product.price}" data-stock="${product.stock}">${product.name} - $${product.price} (Stock: ${product.stock})</option>`;
							});
						});
					}
				} catch (error) {
					console.error("Error loading products:", error);
				}
			} // Add order item
			function addOrderItem() {
				const container = document.getElementById("order-items-container");
				const newItem = document.createElement("div");
				newItem.className = "order-item";
				newItem.innerHTML = `
					<div class="form-group">
						<label>Product *</label>
						<select class="product-select" required>
							<option value="">Select a product</option>
						</select>
					</div>
					<div class="form-group">
						<label>Quantity *</label>
						<input
							type="number"
							class="quantity-input"
							min="1"
							value="1"
							required
						/>
					</div>
					<div class="form-group">
						<label>Price *</label>
						<input
							type="number"
							class="price-input"
							step="0.01"
							min="0"
							required
						/>
					</div>
					<div class="form-group">
						<label>Total</label>
						<input
							type="number"
							class="total-input"
							readonly
						/>
					</div>
					<button type="button" class="btn btn-danger remove-item" onclick="removeOrderItem(this)">
						Remove
					</button>
				`;
				container.appendChild(newItem);

				// Add event listeners to new item
				setupOrderItemListeners(newItem);

				// Load products for the new select
				loadProductsForNewItem(newItem.querySelector(".product-select"));
			}

			// Remove order item
			function removeOrderItem(button) {
				const item = button.closest(".order-item");
				const container = document.getElementById("order-items-container");
				if (container.children.length > 1) {
					item.remove();
					calculateOrderTotal();
				} else {
					showMessage("Order must have at least one item", "error");
				}
			}

			// Setup event listeners for order items
			function setupOrderItemListeners(item) {
				const productSelect = item.querySelector(".product-select");
				const quantityInput = item.querySelector(".quantity-input");
				const priceInput = item.querySelector(".price-input");
				const totalInput = item.querySelector(".total-input");

				// Product selection change
				productSelect.addEventListener("change", function () {
					const selectedOption = this.options[this.selectedIndex];
					if (selectedOption.value) {
						const price = parseFloat(selectedOption.dataset.price) || 0;
						priceInput.value = price.toFixed(2);
						calculateItemTotal(item);
					}
				});

				// Quantity or price change
				[quantityInput, priceInput].forEach((input) => {
					input.addEventListener("input", function () {
						calculateItemTotal(item);
					});
				});
			}

			// Calculate item total
			function calculateItemTotal(item) {
				const quantity =
					parseFloat(item.querySelector(".quantity-input").value) || 0;
				const price = parseFloat(item.querySelector(".price-input").value) || 0;
				const total = quantity * price;

				item.querySelector(".total-input").value = total.toFixed(2);
				calculateOrderTotal();
			}

			// Calculate order total
			function calculateOrderTotal() {
				const items = document.querySelectorAll(".order-item");
				let subtotal = 0;

				items.forEach((item) => {
					const itemTotal =
						parseFloat(item.querySelector(".total-input").value) || 0;
					subtotal += itemTotal;
				});

				const tax = parseFloat(document.getElementById("order-tax").value) || 0;
				const discount =
					parseFloat(document.getElementById("order-discount").value) || 0;
				const total = subtotal + tax - discount;

				document.getElementById("order-subtotal").value = subtotal.toFixed(2);
				document.getElementById("order-total").value = Math.max(
					0,
					total
				).toFixed(2);
			}

			// Load products for new item
			async function loadProductsForNewItem(select) {
				try {
					const response = await fetch(
						`${API_BASE_URL}/products?limit=1000&isActive=true`,
						{
							headers: {
								Authorization: `Bearer ${currentToken}`,
							},
						}
					);

					const result = await response.json();
					if (response.ok) {
						const products = listFrom(result, "products");
						select.innerHTML = '<option value="">Select a product</option>';
						products.forEach((product) => {
							select.innerHTML += `<option value="${product._id}" data-price="${product.price}" data-stock="${product.stock}">${product.name} - $${product.price} (Stock: ${product.stock})</option>`;
						});
					}
				} catch (error) {
					console.error("Error loading products:", error);
				}
			}
			// Save order
			async function saveOrder(event) {
				event.preventDefault();

				try {
					// Get form data
					const formData = new FormData(event.target);
					const customerName = document.getElementById("order-customer-name").value;
					const customerEmail = document.getElementById("order-customer-email").value;
					const customerPhone = document.getElementById("order-customer-phone").value;
					const paymentMethod = document.getElementById("payment-method").value;
					const notes = document.getElementById("order-notes").value;
					const tax =
						parseFloat(document.getElementById("order-tax").value) || 0;
					const discount =
						parseFloat(document.getElementById("order-discount").value) || 0;

					// Get order items
					const items = [];
					const orderItems = document.querySelectorAll(".order-item");

					for (const item of orderItems) {
						const productId = item.querySelector(".product-select").value;
						const quantity = parseInt(
							item.querySelector(".quantity-input").value
						);
						const unitPrice = parseFloat(
							item.querySelector(".price-input").value
						);

						if (!productId || !quantity || isNaN(unitPrice)) {
							showMessage("Please fill in all item details", "error");
							return;
						}

						items.push({
							product: productId,
							quantity: quantity,
							unitPrice: unitPrice,
						});
					}

					if (items.length === 0) {
						showMessage("Order must have at least one item", "error");
						return;
					}

					const orderData = {
						customer: {
							name: customerName,
							email: customerEmail,
							phone: customerPhone,
						},
						items: items,
						tax: tax,
						discount: discount,
						paymentMethod: paymentMethod,
						notes: notes,
					};

					const response = await fetch(`${API_BASE_URL}/orders`, {
						method: "POST",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(orderData),
					});

					const result = await response.json();

					if (response.ok) {
						showMessage("Order created successfully", "success");
						closeOrderModal();
						loadOrders();
					} else {
						showMessage(formatApiError(result, "Failed to create order"), "error");
					}
				} catch (error) {
					showMessage("Error creating order: " + error.message, "error");
				}
			}

			// Search orders
			async function searchOrders() {
				const status = document.getElementById("order-status-filter").value;
				const paymentStatus = document.getElementById(
					"order-payment-filter"
				).value;
				const search = document.getElementById("order-search").value;
				const dateFrom = document.getElementById("order-date-from").value;
				const dateTo = document.getElementById("order-date-to").value;

				const filters = {
					search: search,
					status: status,
					paymentStatus: paymentStatus,
					dateFrom: dateFrom,
					dateTo: dateTo,
				};

				await loadOrdersWithFilters(1, ordersPageSize, filters);
			}

			// Clear order filters
			function clearOrderFilters() {
				document.getElementById("order-search").value = "";
				document.getElementById("order-status-filter").value = "all";
				document.getElementById("order-payment-filter").value = "all";
				document.getElementById("order-date-from").value = "";
				document.getElementById("order-date-to").value = "";
				currentOrderFilters = {}; // Reset stored filters
				loadOrders(); // Reload all orders
			}

			// View order details
			async function viewOrder(orderId) {
				try {
					const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
						},
					});

					const result = await response.json();
					if (response.ok) {
						// GET /orders/:id returns { data: { order } }. Passing
						// result.data straight through handed the WRAPPER to the
						// renderer, so order.customer was undefined.
						const order = objectFrom(result, "order");
						if (!order) {
							showMessage("Order details are unavailable.", "error");
							return;
						}
						showOrderDetails(order);
					} else {
						showMessage(
							formatApiError(result, "Failed to load order details"),
							"error"
						);
					}
				} catch (error) {
					showMessage("Error loading order: " + error.message, "error");
				}
			}

			// Show order details in modal
			function showOrderDetails(order) {
				if (!order) {
					showMessage("Order details are unavailable.", "error");
					return;
				}

				// Orders can legitimately be sparse: the customer or the staff
				// member who created it may have been deleted, and guest checkouts
				// carry no user record. Every field below is therefore guarded —
				// previously a single missing value threw and the modal never
				// opened at all.
				const num = (v) => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);
				const money = (v) => `$${num(v).toFixed(2)}`;
				const setText = (id, value) => {
					const el = document.getElementById(id);
					if (el) el.textContent = value;
				};
				const setHtml = (id, value) => {
					const el = document.getElementById(id);
					if (el) el.innerHTML = value;
				};
				const badge = (value, fallback) => {
					const text = value ? String(value) : fallback;
					const cls = String(text).toLowerCase().replace(/\s+/g, "-");
					return `<span class="status-badge status-${cls}">${text}</span>`;
				};

				const customer = order.customer || {};

				setText("modal-order-number", order.orderNumber || "N/A");

				// Set customer information
				let customerInfo = `<strong>${customer.name || "Unknown customer"}</strong>`;
				if (customer.email) {
					customerInfo += `<br>📧 ${customer.email}`;
				}
				const custAddr = customer.address;
				if (custAddr && custAddr.city) {
					customerInfo += `<br>📍 ${custAddr.street ? custAddr.street + ", " : ""}${custAddr.city}`;
				}
				const custLoc = custAddr && custAddr.location;
				if (custLoc && isFinite(custLoc.latitude) && isFinite(custLoc.longitude)) {
					const mapUrl = `https://www.openstreetmap.org/?mlat=${custLoc.latitude}&mlon=${custLoc.longitude}#map=16/${custLoc.latitude}/${custLoc.longitude}`;
					customerInfo += `<br><a href="${mapUrl}" target="_blank" rel="noopener" class="mdx-235">🗺️ View Map Pin</a>`;
				}
				setHtml("modal-customer-info", customerInfo);

				// Set customer phone
				setText("modal-customer-phone", customer.phoneNumber || "-");

				// Status / payment badges
				setHtml("modal-order-status", badge(order.status, "unknown"));
				setHtml("modal-payment-status", badge(order.paymentStatus, "unknown"));

				// Set order date
				setText(
					"modal-order-date",
					order.createdAt ? new Date(order.createdAt).toLocaleString() : "N/A"
				);

				// Set created by
				setText("modal-created-by", (order.createdBy && order.createdBy.name) || "N/A");

				// Populate order items
				const itemsContainer = document.getElementById("modal-order-items");
				if (itemsContainer) {
					itemsContainer.innerHTML = "";
					const items = Array.isArray(order.items) ? order.items : [];

					items.forEach((item) => {
						const product = item.product || {};
						// NOTE: item.totalPrice is computed in the Order model as
						// quantity * unitPrice - discount, so it ALREADY includes the
						// quantity. Multiplying by quantity again (as this did) showed
						// customers an inflated line total.
						const row = document.createElement("tr");
						row.innerHTML = `
						<td>
							<div class="product-info">
								<div class="product-name">${product.name || "Unknown"}</div>
								<div class="product-barcode">${product.barcode || "N/A"}</div>
							</div>
					</td>
					<td>
						<div class="quantity-badge">${num(item.quantity)}</div>
					</td>
					<td>${money(item.unitPrice)}</td>
					<td>
						<div class="price-info">
							<div class="total-price">${money(item.totalPrice)}</div>
						</div>
					</td>
				`;
						itemsContainer.appendChild(row);
					});
				}

				// Set summary values
				setText("modal-subtotal", money(order.subtotal));
				setText("modal-delivery", money(order.delivery));
				setText("modal-total", money(order.total));

				// Show "Send Rider" only when the order is ready for pickup
				const sendRiderBtn = document.getElementById("modal-send-rider-btn");
				if (sendRiderBtn) {
					if (order.status === "ready for pickup") {
						sendRiderBtn.style.display = "inline-flex";
						sendRiderBtn.onclick = function () {
							closeOrderDetails();
							openAssignDriverModal(
								order._id,
								order.orderNumber,
								order.customer && order.customer.address && order.customer.address.city,
								order.customer && order.customer.address && order.customer.address.location
							);
						};
					} else {
						sendRiderBtn.style.display = "none";
						sendRiderBtn.onclick = null;
					}
				}

				// Show the modal
				document.getElementById("order-details-modal").style.display = "block";
			} // Close order details modal
			function closeOrderDetails() {
				document.getElementById("order-details-modal").style.display = "none";
			}

			// Print order invoice
			function printOrderInvoice() {
				// Create a new window for printing
				const printWindow = window.open('', '_blank');
				
				// Get order details from the modal
				const orderNumber = document.getElementById('modal-order-number').textContent;
				const customerInfo = document.getElementById('modal-customer-info').innerHTML;
				const customerPhone = document.getElementById('modal-customer-phone').textContent;
				const orderStatus = document.getElementById('modal-order-status').innerHTML;
				const paymentStatus = document.getElementById('modal-payment-status').innerHTML;
				const orderDate = document.getElementById('modal-order-date').textContent;
				const createdBy = document.getElementById('modal-created-by').textContent;
				const orderItems = document.getElementById('modal-order-items').innerHTML;
				const subtotal = document.getElementById('modal-subtotal').textContent;
				const delivery = document.getElementById('modal-delivery').textContent;
				const total = document.getElementById('modal-total').textContent;

				// Create the invoice HTML
				const invoiceHTML = `
					<!DOCTYPE html>
					<html>
					<head>
						<title>Order Invoice - ${orderNumber}</title>
						</head>
					<body>
						<div class="header">
							<h1>Freshly</h1>
							<h2>Order Invoice</h2>
							<div class="mdx-236">
								<p><strong>Freshly GmbH</strong></p>
								<p>Boschstr.13a, Syke 28857</p>
								<p><strong>Tax number:</strong> 46/220/04290</p>
							</div>
							<p><strong>Order Number:</strong> ${orderNumber}</p>
						</div>
						
						<div class="order-info">
							<div class="info-section">
								<h3>Customer Information</h3>
								<p>${customerInfo}</p>
								<p><strong>Phone:</strong> ${customerPhone}</p>
							</div>
							<div class="info-section">
								<h3>Order Details</h3>
								<p><strong>Status:</strong> ${orderStatus}</p>
								<p><strong>Payment:</strong> ${paymentStatus}</p>
								<p><strong>Date:</strong> ${orderDate}</p>
								<p><strong>Created By:</strong> ${createdBy}</p>
							</div>
						</div>
						
						<h3>Order Items</h3>
						<table class="items-table">
							<thead>
								<tr>
									<th>Product</th>
									<th>Quantity</th>
									<th>Price</th>
									<th>Total Price + Tax</th>
								</tr>
							</thead>
							<tbody>
								${orderItems}
							</tbody>
						</table>
						
						<div class="summary">
							<div class="summary-row">
								<span>Subtotal:</span>
								<span>${subtotal}</span>
							</div>
							<div class="summary-row">
								<span>Delivery Fee:</span>
								<span>${delivery}</span>
							</div>
							<div class="summary-row total-row">
								<span>Total:</span>
								<span>${total}</span>
							</div>
						</div>
						
						<div class="footer">
							<p>Thank you for choosing Freshly!</p>
							<p>Generated on ${new Date().toLocaleString()}</p>
						</div>
					</body>
					</html>
				`;

				// Write the HTML to the new window
				printWindow.document.write(invoiceHTML);
				printWindow.document.close();
				
				// Wait for content to load then print
				printWindow.onload = function() {
					printWindow.print();
					printWindow.close();
				};
			}

			// RIDER MANAGEMENT FUNCTIONS

			async function loadAllRiders() {
				try {
					showSectionLoading("riders", true, "Loading riders data...");

					const response = await fetch(`${API_BASE_URL}/riders`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
						},
					});

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						throw new Error(
							formatApiError(errorData) ||
								`HTTP ${response.status}: ${response.statusText}`
						);
					}

					const data = await response.json();
					console.log("Riders API response:", data); // Debug log

					// Extract riders array correctly from the response
					const riders = data.data && data.data.riders ? data.data.riders : [];

					// Update the riders count display
					document.getElementById("riders-count-display").textContent = `${
						riders.length
					} rider${riders.length !== 1 ? "s" : ""}`;

					// Display the riders in the table
					displayRiders(riders);

					showSectionLoading("riders", false);
				} catch (error) {
					console.error("Error loading riders:", error);
					showMessage(`Failed to load riders: ${error.message}`, "error");
					showSectionLoading("riders", false);
				}
			}

			function displayRiders(riders) {
				const tableBody = document.getElementById("riders-table-body");

				console.log("Displaying riders:", riders); // Debug log

				if (!tableBody) {
					console.error("Riders table body not found");
					return;
				}

				if (!riders || !Array.isArray(riders) || riders.length === 0) {
					tableBody.innerHTML = `
						<tr>
							<td colspan="8" class="mdx-3">
								No riders found. Click "Add Rider" to register one.
							</td>
						</tr>
					`;
					return;
				}

				tableBody.innerHTML = riders
					.map((rider) => {
						// MarketRider docs store the driver's identity directly on the
						// document (name/phoneNumber/email/vehiclePlate) instead of via
						// a populated `user` ref like global admin Rider docs.
						const isMarketRider =
							rider &&
							!rider.userInfo &&
							!rider.user &&
							(rider.name !== undefined || rider.phoneNumber !== undefined);

						// Handle user information - API returns userInfo from aggregation
						const userName = rider.userInfo
							? rider.userInfo.name
							: rider.user?.name || rider.name || "N/A";
						const userEmail = rider.userInfo
							? rider.userInfo.email
							: rider.user?.email || rider.email || "N/A";
						const userPhone = rider.userInfo
							? rider.userInfo.phoneNumber
							: rider.user?.phoneNumber || rider.phoneNumber || "N/A";

						// Handle rating - it can be a number (from aggregation) or object (from direct query)
						let rating = 0;
						if (rider.rating) {
							if (typeof rider.rating === "number") {
								rating = rider.rating;
							} else if (rider.rating.average !== undefined) {
								rating = rider.rating.average;
							}
						}

						// Handle zones - can be array, string, or object
						let zoneDisplay = "No Zones";
						let zoneTooltip = "";
						if (Array.isArray(rider.zones) && rider.zones.length > 0) {
							// New multi-zone format
							if (rider.zones.length === 1) {
								zoneDisplay = rider.zones[0];
							} else {
								zoneDisplay = `${rider.zones[0]} +${rider.zones.length - 1}`;
								zoneTooltip = `All zones: ${rider.zones.join(", ")}`;
							}
						} else if (rider.zone) {
							// Legacy single zone format / MarketRider single-string zone
							zoneDisplay =
								typeof rider.zone === "string"
									? rider.zone
									: rider.zone?.zoneName || "No Zone";
						}

						// MarketRider exposes isActive/isAvailable instead of a status
						// string. Map them so the same status badge component works.
						let effectiveStatus = rider.status;
						if (!effectiveStatus && isMarketRider) {
							effectiveStatus = !rider.isActive
								? "offline"
								: rider.isAvailable
								? "available"
								: "busy";
						}

						// MarketRider stores plate as `vehiclePlate`, admin Rider as `vehicleNumber`.
						const vehiclePlate =
							rider.vehicleNumber || rider.vehiclePlate || "N/A";

						return `
					<tr>
						<td>
							<div class="mdx-142">
								<div class="mdx-161">
									${userName.charAt(0).toUpperCase()}
								</div>
								<div>
									<div class="mdx-162">${escapeHtml(userName)}</div>
									<div class="mdx-163">ID: ${rider._id.slice(-6)}</div>
								</div>
							</div>
						</td>
						<td>
							<div class="mdx-164">${escapeHtml(userEmail)}</div>
							<div class="mdx-163">
								${escapeHtml(userPhone)}
							</div>
						</td>
						<td>
							<span class="zone-display mdx-165">
								${escapeHtml(zoneDisplay)}
								${
									zoneTooltip
										? `<div class="zone-tooltip">${escapeHtml(
												zoneTooltip
										  )}</div>`
										: ""
								}
							</span>
						</td>
						<td>
							<span class="mdx-166">
								${escapeHtml(formatVehicleType(rider.vehicleType) || "N/A")}
							</span>
						</td>
						<td>
							<code class="mdx-167">
								${escapeHtml(vehiclePlate)}
							</code>
						</td>
						<td>
							<span class="status-badge ${getStatusClass(effectiveStatus)}">
								${formatStatus(effectiveStatus)}
							</span>
						</td>
						<td>
							<div class="mdx-142">
								<span class="mdx-168">⭐</span>
								<span>${rating.toFixed(1)}</span>
								<span class="mdx-169">(${
									rider.completionRate ? rider.completionRate.toFixed(1) : "0.0"
								}%)</span>
							</div>
						</td>
						<td>
							<div class="table-actions">
								<button class="btn-icon" onclick="viewRiderDetails('${
									rider._id
								}')" title="View Details">
									👁️
								</button>
								<button class="btn-icon" onclick="editRider('${rider._id}')" title="Edit Rider">
									✏️
								</button>
								${
									rider.currentLocation
										? `<button class="btn-icon" onclick="viewRiderLocation('${rider._id}')" title="View Location">
										📍
									</button>`
										: `<button class="btn-icon" disabled title="No Location Data">
										📍
									</button>`
								}
								<button class="btn-icon ${
									effectiveStatus === "available" ? "btn-danger" : ""
								}" onclick="toggleRiderStatus('${rider._id}', '${
							effectiveStatus
						}')" title="${
							effectiveStatus === "available" ? "Deactivate" : "Activate"
						}">
									${effectiveStatus === "available" ? "⏸️" : "▶️"}
								</button>
								<button class="btn-icon btn-danger" onclick="deleteRider('${
									rider._id
								}')" title="Delete Rider">
									🗑️
								</button>
							</div>
						</td>
					</tr>
				`;
					})
					.join("");
			}

			// Utility function to escape HTML special characters to prevent XSS
			function escapeHtml(text) {
				if (text === undefined || text === null) return "";
				return String(text)
					.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;")
					.replace(/"/g, "&quot;")
					.replace(/'/g, "&#039;");
			}

			function formatVehicleType(vehicleType) {
				if (!vehicleType) return "-";

				const types = {
					bike: "Bike",
					motorbike: "Motorbike",
					bicycle: "Bicycle",
					car: "Car",
				};

				return types[vehicleType.toLowerCase()] || vehicleType;
			}

			function getStatusClass(status) {
				if (!status) return "status-inactive";

				switch (status.toLowerCase()) {
					case "available":
						return "status-active";
					case "offline":
						return "status-inactive";
					case "busy":
						return "status-busy";
					case "on-break":
						return "status-pending";
					default:
						return "status-inactive";
				}
			}

			function formatStatus(status) {
				if (!status) return "Offline";

				switch (status.toLowerCase()) {
					case "available":
						return "Available";
					case "offline":
						return "Offline";
					case "busy":
						return "Busy";
					case "on-break":
						return "On Break";
					default:
						return status;
				}
			}

			function formatRating(rating) {
				const fullStars = Math.floor(rating);
				const halfStar = rating % 1 >= 0.5;
				const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

				let html = "";

				// Full stars
				for (let i = 0; i < fullStars; i++) {
					html += '<span class="star full">★</span>';
				}

				// Half star
				if (halfStar) {
					html += '<span class="star half">★</span>';
				}

				// Empty stars
				for (let i = 0; i < emptyStars; i++) {
					html += '<span class="star empty">☆</span>';
				}

				return html;
			}

			function showAddRiderModal() {
				try {
					const modalTitle = document.getElementById("rider-modal-title");
					const riderForm = document.getElementById("rider-form");
					const riderId = document.getElementById("rider-id");
					const riderModal = document.getElementById("rider-modal");

					if (!modalTitle || !riderForm || !riderId || !riderModal) {
						console.error("Modal elements not found");
						showMessage(
							"Modal not available. Please refresh the page.",
							"error"
						);
						return;
					}

					modalTitle.textContent = "Add New Rider";
					riderForm.reset();
					riderId.value = "";

					// Load users and zones for the dropdowns
					loadUsersForRiderModal();
					loadZonesForRiderModal(); // Function not implemented yet
					document.getElementById("rider-user").disabled = false; // Enable user selection for new rider

					riderModal.style.display = "block";
				} catch (error) {
					console.error("Error showing add rider modal:", error);
					showMessage(`Failed to open modal: ${error.message}`, "error");
				}
			}

			function closeRiderModal() {
				const modal = document.getElementById("rider-modal");
				if (modal) {
					modal.style.display = "none";
				}
			}

			function closeRiderMapModal() {
				document.getElementById("rider-map-modal").style.display = "none";

				// Clear the auto-refresh interval
				if (window.riderMapInterval) {
					clearInterval(window.riderMapInterval);
					window.riderMapInterval = null;
				}

				// Clear the current rider ID
				window.currentRiderMapId = null;
			}

			function refreshRiders() {
				loadAllRiders();
				showMessage("Riders list refreshed", "success");
			}

			async function loadUsersForRiderModal() {
				try {
					const userDropdown = document.getElementById("rider-user");

					if (!userDropdown) {
						console.error("User dropdown not found");
						return;
					}

					// Clear current options except the first one
					while (userDropdown.options.length > 1) {
						userDropdown.remove(1);
					}

					// In market context this URL is rewritten by the fetch override
					// (see rewritePath) to /api/market-admin/rider-users which is
					// tenant-scoped server-side: it returns ONLY this market's own
					// drivers (User docs with role 'market_driver' belonging to
					// req.marketId), so each market only sees its own drivers.
					const response = await fetch(
						`${API_BASE_URL}/auth/users?includeRoles=rider`,
						{
							headers: {
								Authorization: `Bearer ${currentToken}`,
							},
						}
					);

					if (!response.ok) {
						throw new Error(`HTTP ${response.status}: ${response.statusText}`);
					}

					const data = await response.json();
					console.log("Users API response:", data); // Debug log
					// The market-admin/rider-users endpoint returns { success, data: [users] }
					// while the global /auth/users endpoint returns { data: { users: [...] } }.
					// Support both shapes.
					const allUsers = Array.isArray(data.data)
						? data.data
						: data.data && data.data.users
						? data.data.users
						: [];

					// Accept both 'rider' (admin context) and 'market_driver'
					// (market context) — the backend is tenant-scoped so cross-market
					// users will never reach this point.
					const availableUsers = allUsers.filter(
						(user) => user.role === "rider" || user.role === "market_driver"
					);

					console.log(
						`Available users for rider modal: ${availableUsers.length} from ${allUsers.length} total users`
					);

					// Store user data in a variable for later access
					window.riderUserData = {};

					// Add users to the dropdown
					availableUsers.forEach((user) => {
						const option = document.createElement("option");
						option.value = user._id;
						option.textContent = `${user.name} (${user.email})`;
						userDropdown.appendChild(option);

						// Store user data for auto-fill
						window.riderUserData[user._id] = user;
					});

					// Add change event listener to auto-fill form fields
					userDropdown.addEventListener("change", autoFillRiderForm);
				} catch (error) {
					console.error("Error loading users for rider modal:", error);
					showMessage(`Failed to load users: ${error.message}`, "error");
				}
			}

			// Function to auto-fill rider form based on selected user
			function autoFillRiderForm() {
				const userDropdown = document.getElementById("rider-user");
				const userId = userDropdown.value;

				if (!userId || !window.riderUserData || !window.riderUserData[userId]) {
					return; // No selection or no data
				}

				const userData = window.riderUserData[userId];
				console.log("Auto-filling form with user data:", userData);

				// We don't auto-fill other fields as they're rider-specific and
				// not directly tied to user data in the new model

				// Focus on the zone field as the next field to complete (if it exists)
				const zoneField = document.getElementById("rider-zone");
				if (zoneField) {
					zoneField.focus();
				}
			}

			async function saveRider() {
				try {
					const form = document.getElementById("rider-form");
					const riderIdElement = document.getElementById("rider-id");

					console.log("Form element found:", form);
					console.log("Rider ID element found:", riderIdElement);

					if (!form || !riderIdElement) {
						showMessage(
							"Form not available. Please refresh the page.",
							"error"
						);
						return;
					}

					const formData = new FormData(form);
					const riderId = riderIdElement.value;

					// Debug: Check select element state
					const userSelect = document.getElementById("rider-user");
					console.log("User select element:", userSelect);
					console.log(
						"User select value:",
						userSelect ? userSelect.value : "N/A"
					);
					console.log(
						"User select name:",
						userSelect ? userSelect.name : "N/A"
					);
					console.log(
						"User select form:",
						userSelect ? userSelect.form : "N/A"
					);
					console.log(
						"User select disabled:",
						userSelect ? userSelect.disabled : "N/A"
					);
					console.log(
						"User select options:",
						userSelect ? userSelect.options.length : "N/A"
					);

					// Debug: Log all form data
					console.log("Form data entries:");
					for (let [key, value] of formData.entries()) {
						console.log(`${key}: ${value}`);
					}

					// Debug: Manually check userId
					console.log("Manual userId check:", formData.get("userId"));
					console.log("Manual userId check (all):", formData.getAll("userId"));

					// Collect selected zones
					const selectedZones = [];
					const zoneCheckboxes = document.querySelectorAll(
						'input[name="zones"]:checked'
					);
					zoneCheckboxes.forEach((checkbox) => {
						selectedZones.push(checkbox.value);
					});

					if (selectedZones.length === 0) {
						throw new Error("Please select at least one zone");
					}

					// Build rider data from form
					const userIdFromFormData = formData.get("userId");
					const userIdFromSelect = userSelect ? userSelect.value : null;
					const finalUserId = userIdFromFormData || userIdFromSelect || null;

					console.log("userId from FormData:", userIdFromFormData);
					console.log("userId from select:", userIdFromSelect);
					console.log("Final userId:", finalUserId);

					const riderData = {
						userId: finalUserId,
						zones: selectedZones,
						vehicleType: formData.get("vehicleType"),
						vehicleNumber: formData.get("vehicleNumber"),
						status: formData.get("status"),
						isVerified: formData.get("isVerified") === "true",
						isActive: formData.get("isActive") === "true",
						workingHours: {
							start: formData.get("workingHoursStart"),
							end: formData.get("workingHoursEnd"),
						},
					};

					// Debug: Log rider data
					console.log("Rider data:", riderData);

					// Validate required fields
					if (!riderData.userId) {
						throw new Error("Please select an associated user");
					}

					if (!riderData.vehicleType) {
						throw new Error("Please select a vehicle type");
					}

					if (!riderData.vehicleNumber) {
						throw new Error("Please enter a vehicle number");
					}

					// Remove null values for cleaner API request
					Object.keys(riderData).forEach((key) => {
						if (riderData[key] === null || riderData[key] === "") {
							delete riderData[key];
						}
					});

					if (
						riderData.workingHours &&
						(!riderData.workingHours.start || !riderData.workingHours.end)
					) {
						// If either start or end is missing, use defaults
						riderData.workingHours = {
							start: riderData.workingHours.start || "09:00",
							end: riderData.workingHours.end || "21:00",
						};
					}

					// Debug form data
					console.log("Rider data to save:", riderData);

					const url = riderId
						? `${API_BASE_URL}/riders/${riderId}`
						: `${API_BASE_URL}/riders`;
					const method = riderId ? "PUT" : "POST";

					const response = await fetch(url, {
						method: method,
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(riderData),
					});

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						throw new Error(
							formatApiError(errorData) ||
								`HTTP ${response.status}: ${response.statusText}`
						);
					}

					const result = await response.json();
					showMessage(
						result.message ||
							`Rider ${riderId ? "updated" : "created"} successfully`,
						"success"
					);
					closeRiderModal();
					await loadAllRiders(); // Refresh riders list after successful save
				} catch (error) {
					console.error("Error saving rider:", error);
					showMessage(`Failed to save rider: ${error.message}`, "error");
				}
			}

			async function editRider(riderId) {
				try {
					loadZonesForRiderModal(); // Function not implemented yet

					if (!riderId) {
						showMessage("Rider ID is required", "error");
						return;
					}

					// Show loading
					showMessage("Loading rider data...", "info");

					const response = await fetch(`${API_BASE_URL}/riders/${riderId}`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
						},
					});

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						throw new Error(
							formatApiError(errorData) ||
								`HTTP ${response.status}: ${response.statusText}`
						);
					}

					const result = await response.json();
					console.log("Edit rider API response:", result); // Debug log

					// Handle different API response structures
					const rider =
						result.data && result.data.rider ? result.data.rider : result.data;

					if (!rider) {
						throw new Error("Rider data not found in response");
					}

					// In market context the rider is a MarketRider doc whose driver
					// identity is stored directly on the doc (no `user` ref). Adapt
					// MarketRider fields to the modal's admin-Rider expectations so
					// the same edit form works for both shapes.
					const isMarketRider =
						!rider.user && (rider.name !== undefined || rider.phoneNumber !== undefined);
					if (isMarketRider) {
						rider.vehicleNumber = rider.vehicleNumber || rider.vehiclePlate || "";
						rider.zones = Array.isArray(rider.zones)
							? rider.zones
							: rider.zone
							? [rider.zone]
							: [];
						if (!rider.status) {
							rider.status = !rider.isActive
								? "inactive"
								: rider.isAvailable
								? "available"
								: "offline";
						}
					}

					// Populate the modal with rider data
					const modalTitle = document.getElementById("rider-modal-title");
					const form = document.getElementById("rider-form");
					const riderIdField = document.getElementById("rider-id");
					const userField = document.getElementById("rider-user");
					userField.disabled = true; // Disable user selection when editing
					const vehicleField = document.getElementById("rider-vehicle");
					const vehicleNumberField = document.getElementById(
						"rider-vehicle-number"
					);
					const statusField = document.getElementById("rider-status");
					const zoneField = document.getElementById("rider-zone");
					const isVerifiedField = document.getElementById("rider-is-verified");
					const isActiveField = document.getElementById("rider-is-active");
					const workingHoursStartField = document.getElementById(
						"rider-working-start"
					);
					const workingHoursEndField =
						document.getElementById("rider-working-end");

					// Check if all required elements exist
					if (!modalTitle || !form || !riderIdField || !userField) {
						throw new Error(
							"Rider modal elements not found. Please refresh the page."
						);
					}

					// Clear form first
					form.reset();

					// Set modal title
					modalTitle.textContent = "Edit Rider";

					// Set rider fields (with null checks)
					if (riderIdField) riderIdField.value = rider._id || "";
					if (vehicleField) vehicleField.value = rider.vehicleType || "";
					if (vehicleNumberField)
						vehicleNumberField.value = rider.vehicleNumber || "";
					if (statusField) statusField.value = rider.status || "offline";

					// Set boolean fields
					if (isVerifiedField)
						isVerifiedField.value = rider.isVerified ? "true" : "false";
					if (isActiveField)
						isActiveField.value = rider.isActive ? "true" : "false";

					// Set working hours
					if (rider.workingHours) {
						if (workingHoursStartField)
							workingHoursStartField.value =
								rider.workingHours.start || "09:00";
						if (workingHoursEndField)
							workingHoursEndField.value = rider.workingHours.end || "21:00";
					}

					// Load users dropdown and select the user if available
					await loadUsersForRiderModal();
					if (rider.user && rider.user._id && userField) {
						userField.value = rider.user._id;
						//userField.disabled = false;
					} else if (isMarketRider && userField && rider.email) {
						// MarketRider has no user ref. Try to match by email against the
						// dropdown (which lists this market's market_driver users).
						const data = window.riderUserData || {};
						const match = Object.values(data).find(
							(u) => u && u.email && u.email.toLowerCase() === String(rider.email).toLowerCase(),
						);
						if (match) userField.value = match._id;
					}

					// Load zones checkboxes and select the rider's zones
					// await loadZonesForRiderModal(); // Function not implemented yet

					// Select the rider's zones
					const riderZones = Array.isArray(rider.zones)
						? rider.zones
						: rider.zone
						? [rider.zone]
						: [];
					riderZones.forEach((zoneName) => {
						const checkbox = document.querySelector(
							`input[name="zones"][value="${zoneName}"]`
						);
						if (checkbox) {
							checkbox.checked = true;
							checkbox.dispatchEvent(new Event("change"));
						}
					});

					// Show the modal
					const riderModal = document.getElementById("rider-modal");
					if (riderModal) {
						riderModal.style.display = "block";
					} else {
						throw new Error("Rider modal not found");
					}
				} catch (error) {
					console.error("Error editing rider:", error);
					showMessage(`Failed to load rider data: ${error.message}`, "error");
				}
			}

			async function deleteRider(riderId) {
				try {
					if (!riderId) {
						showMessage("Rider ID is required", "error");
						return;
					}

					if (
						!confirm(
							"Are you sure you want to permanently delete this rider? This action cannot be undone and all rider data will be permanently removed from the system."
						)
					) {
						return;
					}

					showMessage("Permanently deleting rider...", "info");

					const response = await fetch(`${API_BASE_URL}/riders/${riderId}`, {
						method: "DELETE",
						headers: {
							Authorization: `Bearer ${currentToken}`,
						},
					});

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						throw new Error(
							formatApiError(errorData) ||
								`HTTP ${response.status}: ${response.statusText}`
						);
					}

					const result = await response.json();
					showMessage(result.message || "Rider permanently deleted", "success");

					// Refresh riders list
					await loadAllRiders(); // Refresh riders list after successful deletion
				} catch (error) {
					console.error("Error deleting rider:", error);
					showMessage(`Failed to delete rider: ${error.message}`, "error");
				}
			}

			function showRiderMap() {
				// Placeholder for rider map feature
				showMessage("Rider map feature is coming soon!", "info");
			}

			// Cancel order
			async function cancelOrder(orderId, orderNumber) {
				if (
					!confirm(
						`Are you sure you want to cancel order "${orderNumber}"? This will restore product stock.`
					)
				) {
					return;
				}

				try {
					const reason = prompt(
						"Please provide a reason for cancellation (optional):"
					);

					const response = await fetch(
						`${API_BASE_URL}/orders/${orderId}/cancel`,
						{
							method: "PATCH",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ reason }),
						}
					);

					const result = await response.json();

					if (response.ok) {
						showMessage(
							`Order "${orderNumber}" cancelled successfully`,
							"success"
						);
						loadOrdersWithFilters(currentOrdersPage, ordersPageSize, currentOrderFilters);
					} else {
						showMessage(formatApiError(result, "Failed to cancel order"), "error");
					}
				} catch (error) {
					showMessage("Error cancelling order: " + error.message, "error");
				}
			}

			// Mark order as paid (for cash on delivery orders)
			async function markOrderAsPaid(orderId, orderNumber) {
				if (
					!confirm(
						`Are you sure you want to mark order "${orderNumber}" as paid?`
					)
				) {
					return;
				}

				try {
					const response = await fetch(
						`${API_BASE_URL}/orders/${orderId}`,
						{
							method: "PUT",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ paymentStatus: "paidondelivery" }),
						}
					);

					const result = await response.json();

					if (response.ok) {
						showMessage(
							`Order "${orderNumber}" marked as paid successfully`,
							"success"
						);
						loadOrdersWithFilters(currentOrdersPage, ordersPageSize, currentOrderFilters);
					} else {
						showMessage(formatApiError(result, "Failed to update payment status"), "error");
					}
				} catch (error) {
					showMessage("Error updating payment status: " + error.message, "error");
				}
			}

			// Delete order
			async function deleteOrder(orderId, orderNumber) {
				if (
					!confirm(
						`Are you sure you want to delete order "${orderNumber}"? This action cannot be undone.`
					)
				) {
					return;
				}

				try {
					const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
						method: "DELETE",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					const result = await response.json();

					if (response.ok) {
						showMessage(
							`Order "${orderNumber}" deleted successfully`,
							"success"
						);
						loadOrdersWithFilters(currentOrdersPage, ordersPageSize, currentOrderFilters);
					} else {
						showMessage(formatApiError(result, "Failed to delete order"), "error");
					}
				} catch (error) {
					showMessage("Error deleting order: " + error.message, "error");
				}
			}

			// Load order statistics
			async function loadOrderStats() {
				try {
					const response = await fetch(`${API_BASE_URL}/orders/stats`, {
						headers: {
							Authorization: `Bearer ${currentToken}`,
						},
					});

					const result = await response.json();
					if (response.ok) {
						const stats = result.data;
						const message = `Order Statistics:\n\nTotal Revenue: $${stats.totalRevenue.toFixed(
							2
						)}\nToday's Orders: ${stats.todayOrders}\nMonthly Orders: ${
							stats.monthlyOrders
						}\nMonthly Revenue: $${stats.monthlyRevenue.toFixed(2)}`;
						alert(message);
					} else {
						showMessage(formatApiError(result, "Failed to load statistics"), "error");
					}
				} catch (error) {
					showMessage("Error loading statistics: " + error.message, "error");
				}
			}

			// ============================================
			// PRODUCT SALES STATISTICS FUNCTIONS
			// ============================================

			let currentSalesStatsPage = 1;
			let totalSalesStatsPages = 1;
			let salesStatsPageSize = 25;
			let allSalesStatsData = [];

			// Handle time range dropdown change
			function handleTimeRangeChange() {
				const timeRange = document.getElementById('stats-time-range').value;
				const customDateRange = document.getElementById('custom-date-range');
				const customDateToGroup = document.getElementById('custom-date-to-group');
				
				if (timeRange === 'custom') {
					customDateRange.style.display = 'block';
					customDateToGroup.style.display = 'block';
					// Set default dates for custom range
					const today = new Date();
					const monthAgo = new Date();
					monthAgo.setMonth(today.getMonth() - 1);
					document.getElementById('stats-date-from').value = monthAgo.toISOString().split('T')[0];
					document.getElementById('stats-date-to').value = today.toISOString().split('T')[0];
				} else {
					customDateRange.style.display = 'none';
					customDateToGroup.style.display = 'none';
				}
			}

			// Load product sales statistics
			async function loadProductSalesStats(page = 1) {
				try {
					showSectionLoading('statistics', true, 'Loading sales statistics...');
					
					const timeRange = document.getElementById('stats-time-range').value;
					const sortValue = document.getElementById('stats-sort-by').value;
					const [sortBy, sortOrder] = sortValue.split('-');
					const pageSize = document.getElementById('sales-stats-page-size').value;
					
					let url = `${API_BASE_URL}/orders/sales-stats?page=${page}&limit=${pageSize}&sortBy=${sortBy}&sortOrder=${sortOrder}`;
					
					if (timeRange === 'custom') {
						const dateFrom = document.getElementById('stats-date-from').value;
						const dateTo = document.getElementById('stats-date-to').value;
						if (dateFrom) url += `&dateFrom=${dateFrom}`;
						if (dateTo) url += `&dateTo=${dateTo}`;
					} else {
						url += `&timeRange=${timeRange}`;
					}

					const response = await authenticatedFetch(url);
					
					if (!response.ok) {
						const errorData = await response.json();
						throw new Error(formatApiError(errorData) || 'Failed to load sales statistics');
					}

					const result = await response.json();
					
					// Update state
					const salesPagination = result.data.pagination;
					const productSales = result.data.productSales || [];
					currentSalesStatsPage = salesPagination.currentPage;
					totalSalesStatsPages = salesPagination.totalPages;
					salesStatsPageSize = salesPagination.limit;
					allSalesStatsData = productSales;
					
					// Display data
					displayProductSalesStats(productSales, salesPagination);
					updateSalesSummaryStats(result.data.summary);
					updateSalesStatsPagination(salesPagination);
					
					// Also load unsold products for the same period
					loadUnsoldProducts(1);
					
				} catch (error) {
					console.error('Error loading sales statistics:', error);
					showMessage('Error loading sales statistics: ' + error.message, 'error');
					document.getElementById('sales-stats-table-body').innerHTML = `
						<tr>
							<td colspan="9" class="mdx-237">
								<div class="mdx-50">❌</div>
								<p>Failed to load sales statistics</p>
								<p class="mdx-238">${error.message}</p>
							</td>
						</tr>
					`;
				} finally {
					showSectionLoading('statistics', false);
				}
			}

			// Display product sales statistics in the table
			function displayProductSalesStats(data, pagination) {
				const tableBody = document.getElementById('sales-stats-table-body');
				const countDisplay = document.getElementById('sales-stats-count');
				
				if (!data || data.length === 0) {
					tableBody.innerHTML = `
						<tr>
							<td colspan="9" class="mdx-49">
								<div class="mdx-50">📭</div>
								<p>No sales data found for the selected period</p>
								<p class="mdx-238">Try adjusting your time filter</p>
							</td>
						</tr>
					`;
					countDisplay.textContent = '0 products';
					return;
				}

				countDisplay.textContent = `${pagination.totalProducts} products`;
				
				// Calculate starting rank based on page
				const startRank = (pagination.currentPage - 1) * pagination.limit + 1;
				
				let html = '';
				data.forEach((item, index) => {
					const rank = startRank + index;
					const rankBadge = getRankBadge(rank);
					const lastSaleDate = item.lastSaleDate ? new Date(item.lastSaleDate).toLocaleDateString() : 'N/A';
					const statusBadge = item.productIsActive !== false 
						? '<span class="mdx-239">Active</span>'
						: '<span class="mdx-240">Inactive</span>';
					
					html += `
						<tr class="mdx-241">
							<td class="mdx-242">
								${rankBadge} ${rank}
							</td>
							<td class="mdx-243">
								${escapeHtml(item.productName)}
							</td>
							<td class="mdx-244">
								${item.productBarcode || 'N/A'}
							</td>
							<td class="mdx-129">
								<span class="mdx-245">
									${item.totalQuantitySold}
								</span>
							</td>
							<td class="mdx-246">
								$${item.productPrice ? item.productPrice.toFixed(2) : '0.00'}
							</td>
							<td class="mdx-247">
								${item.orderCount}
							</td>
							<td class="mdx-248">
								${item.averageQuantityPerOrder}
							</td>
							<td class="mdx-249">
								${lastSaleDate}
							</td>
							<td class="mdx-129">
								${statusBadge}
							</td>
						</tr>
					`;
				});
				
				tableBody.innerHTML = html;
			}

			// Get rank badge emoji for top 3
			function getRankBadge(rank) {
				switch(rank) {
					case 1: return '🥇';
					case 2: return '🥈';
					case 3: return '🥉';
					default: return '';
				}
			}

			// Update sales summary statistics cards
			function updateSalesSummaryStats(summary) {
				document.getElementById('stats-total-quantity').textContent = summary.totalQuantitySold.toLocaleString();
				document.getElementById('stats-total-orders').textContent = summary.totalOrders.toLocaleString();
				document.getElementById('stats-unique-products').textContent = summary.uniqueProducts.toLocaleString();

				// Total amount breakdown: 2% of gross product sales goes to the main admin.
				const COMMISSION_RATE = 0.02;
				const gross = Number(summary.totalRevenue) || 0;
				const commission = gross * COMMISSION_RATE;
				const net = gross - commission;
				const fmt = (n) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
				const grossEl = document.getElementById('market-gross-sales');
				const commEl = document.getElementById('market-commission-amount');
				const netEl = document.getElementById('market-net-earnings');
				if (grossEl) grossEl.textContent = fmt(gross);
				if (commEl) commEl.textContent = `-${fmt(commission)}`;
				if (netEl) netEl.textContent = fmt(net);
			}

			// Update pagination controls for sales statistics
			function updateSalesStatsPagination(pagination) {
				const container = document.getElementById('sales-stats-pagination-numbers');
				const infoDisplay = document.getElementById('sales-stats-pagination-info');
				
				// Update info text
				const start = (pagination.currentPage - 1) * pagination.limit + 1;
				const end = Math.min(pagination.currentPage * pagination.limit, pagination.totalProducts);
				infoDisplay.textContent = `Showing ${pagination.totalProducts > 0 ? start : 0}-${end} of ${pagination.totalProducts} products`;
				
				// Update button states
				document.getElementById('sales-stats-first-btn').disabled = pagination.currentPage === 1;
				document.getElementById('sales-stats-prev-btn').disabled = !pagination.hasPrevPage;
				document.getElementById('sales-stats-next-btn').disabled = !pagination.hasNextPage;
				document.getElementById('sales-stats-last-btn').disabled = pagination.currentPage === pagination.totalPages;
				
				// Generate page numbers
				let pagesHtml = '';
				const maxVisiblePages = 5;
				let startPage = Math.max(1, pagination.currentPage - Math.floor(maxVisiblePages / 2));
				let endPage = Math.min(pagination.totalPages, startPage + maxVisiblePages - 1);
				
				if (endPage - startPage + 1 < maxVisiblePages) {
					startPage = Math.max(1, endPage - maxVisiblePages + 1);
				}
				
				for (let i = startPage; i <= endPage; i++) {
					const isActive = i === pagination.currentPage;
					pagesHtml += `
						<button 
						 class="btn btn-pagination ${isActive ? 'active' : ''} mdx-250" 
							onclick="goToSalesStatsPage(${i})"
						
						>
							${i}
						</button>
					`;
				}
				
				container.innerHTML = pagesHtml;
			}

			// Navigate to a specific page in sales statistics
			function goToSalesStatsPage(page) {
				if (page < 1 || page > totalSalesStatsPages) return;
				loadProductSalesStats(page);
			}

			// Change page size for sales statistics
			function changeSalesStatsPageSize(size) {
				salesStatsPageSize = parseInt(size);
				loadProductSalesStats(1);
			}

			// ============================================
			// UNSOLD PRODUCTS FUNCTIONS
			// ============================================

			let currentUnsoldProductsPage = 1;
			let totalUnsoldProductsPages = 1;
			let unsoldProductsPageSize = 25;

			// Load unsold products for the selected time period
			async function loadUnsoldProducts(page = 1) {
				try {
					const timeRange = document.getElementById('stats-time-range').value;
					const pageSize = document.getElementById('unsold-products-page-size').value;
					
					let url = `${API_BASE_URL}/orders/unsold-products?page=${page}&limit=${pageSize}`;
					
					if (timeRange === 'custom') {
						const dateFrom = document.getElementById('stats-date-from').value;
						const dateTo = document.getElementById('stats-date-to').value;
						if (dateFrom) url += `&dateFrom=${dateFrom}`;
						if (dateTo) url += `&dateTo=${dateTo}`;
					} else {
						url += `&timeRange=${timeRange}`;
					}

					const response = await authenticatedFetch(url);
					
					if (!response.ok) {
						const errorData = await response.json();
						throw new Error(formatApiError(errorData) || 'Failed to load unsold products');
					}

					const result = await response.json();
					
					// Update state
					const unsoldPagination = result.data.pagination;
					const unsoldProducts = result.data.productsWithCategory || [];
					currentUnsoldProductsPage = unsoldPagination.currentPage;
					totalUnsoldProductsPages = unsoldPagination.totalPages;
					unsoldProductsPageSize = unsoldPagination.limit;
					
					// Display data
					displayUnsoldProducts(unsoldProducts, unsoldPagination);
					updateUnsoldProductsPagination(unsoldPagination);
					
				} catch (error) {
					console.error('Error loading unsold products:', error);
					document.getElementById('unsold-products-table-body').innerHTML = `
						<tr>
							<td colspan="8" class="mdx-237">
								<div class="mdx-50">❌</div>
								<p>Failed to load unsold products</p>
								<p class="mdx-238">${error.message}</p>
							</td>
						</tr>
					`;
				}
			}

			// Display unsold products in the table
			function displayUnsoldProducts(data, pagination) {
				const tableBody = document.getElementById('unsold-products-table-body');
				const countDisplay = document.getElementById('unsold-products-count');
				
				if (!data || data.length === 0) {
					tableBody.innerHTML = `
						<tr>
							<td colspan="8" class="mdx-251">
								<div class="mdx-50">🎉</div>
								<p>Great news! All products have sales in this period</p>
							</td>
						</tr>
					`;
					countDisplay.textContent = '0 products';
					return;
				}

				countDisplay.textContent = `${pagination.totalProducts} products`;
				
				// Calculate starting number based on page
				const startNum = (pagination.currentPage - 1) * pagination.limit + 1;
				
				let html = '';
				data.forEach((item, index) => {
					const num = startNum + index;
					const createdDate = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A';
					const statusBadge = item.isActive !== false 
						? '<span class="mdx-239">Active</span>'
						: '<span class="mdx-240">Inactive</span>';
					
					const stockColor = item.stock <= 0 ? '#dc3545' : item.stock < 10 ? '#ffc107' : '#28a745';
					
					html += `
						<tr class="mdx-252">
							<td class="mdx-253">
								${num}
							</td>
							<td class="mdx-254">
								${escapeHtml(item.name || 'Unknown Product')}
							</td>
							<td class="mdx-255">
								${item.barcode || 'N/A'}
							</td>
							<td class="mdx-256">
								<span class="mdx-257">
									${item.stock !== undefined ? item.stock : 'N/A'}
								</span>
							</td>
							<td class="mdx-258">
								$${item.price ? item.price.toFixed(2) : '0.00'}
							</td>
							<td class="mdx-259">
								${item.categoryName || 'N/A'}
							</td>
							<td class="mdx-260">
								${createdDate}
							</td>
							<td class="mdx-256">
								${statusBadge}
							</td>
						</tr>
					`;
				});
				
				tableBody.innerHTML = html;
			}

			// Update pagination controls for unsold products
			function updateUnsoldProductsPagination(pagination) {
				const container = document.getElementById('unsold-products-pagination-numbers');
				const infoDisplay = document.getElementById('unsold-products-pagination-info');
				
				// Update info text
				const start = (pagination.currentPage - 1) * pagination.limit + 1;
				const end = Math.min(pagination.currentPage * pagination.limit, pagination.totalProducts);
				infoDisplay.textContent = `Showing ${pagination.totalProducts > 0 ? start : 0}-${end} of ${pagination.totalProducts} products`;
				
				// Update button states
				document.getElementById('unsold-products-first-btn').disabled = pagination.currentPage === 1;
				document.getElementById('unsold-products-prev-btn').disabled = !pagination.hasPrevPage;
				document.getElementById('unsold-products-next-btn').disabled = !pagination.hasNextPage;
				document.getElementById('unsold-products-last-btn').disabled = pagination.currentPage === pagination.totalPages;
				
				// Generate page numbers
				let pagesHtml = '';
				const maxVisiblePages = 5;
				let startPage = Math.max(1, pagination.currentPage - Math.floor(maxVisiblePages / 2));
				let endPage = Math.min(pagination.totalPages, startPage + maxVisiblePages - 1);
				
				if (endPage - startPage + 1 < maxVisiblePages) {
					startPage = Math.max(1, endPage - maxVisiblePages + 1);
				}
				
				for (let i = startPage; i <= endPage; i++) {
					const isActive = i === pagination.currentPage;
					pagesHtml += `
						<button 
						 class="btn btn-pagination ${isActive ? 'active' : ''} mdx-261" 
							onclick="goToUnsoldProductsPage(${i})"
						
						>
							${i}
						</button>
					`;
				}
				
				container.innerHTML = pagesHtml;
			}

			// Navigate to a specific page in unsold products
			function goToUnsoldProductsPage(page) {
				if (page < 1 || page > totalUnsoldProductsPages) return;
				loadUnsoldProducts(page);
			}

			// Change page size for unsold products
			function changeUnsoldProductsPageSize(size) {
				unsoldProductsPageSize = parseInt(size);
				loadUnsoldProducts(1);
			}

			// ============================================
			// END UNSOLD PRODUCTS FUNCTIONS
			// ============================================

			// Export sales statistics to Excel
			async function exportSalesStatistics() {
				try {
					showMessage('Preparing export...', 'info');
					
					// Get all data without pagination for export
					const timeRange = document.getElementById('stats-time-range').value;
					const sortValue = document.getElementById('stats-sort-by').value;
					const [sortBy, sortOrder] = sortValue.split('-');
					
					let url = `${API_BASE_URL}/orders/sales-stats?page=1&limit=10000&sortBy=${sortBy}&sortOrder=${sortOrder}`;
					
					if (timeRange === 'custom') {
						const dateFrom = document.getElementById('stats-date-from').value;
						const dateTo = document.getElementById('stats-date-to').value;
						if (dateFrom) url += `&dateFrom=${dateFrom}`;
						if (dateTo) url += `&dateTo=${dateTo}`;
					} else {
						url += `&timeRange=${timeRange}`;
					}

					const response = await authenticatedFetch(url);
					
					if (!response.ok) {
						throw new Error('Failed to fetch data for export');
					}

					const result = await response.json();
					const productSalesExport = (result.data && result.data.productSales) || [];
					
					if (productSalesExport.length === 0) {
						showMessage('No data to export', 'warning');
						return;
					}

					// Prepare data for Excel
					const exportData = productSalesExport.map((item, index) => ({
						'Rank': index + 1,
						'Product Name': item.productName,
						'Barcode': item.productBarcode || 'N/A',
						'Quantity Sold': item.totalQuantitySold,
						'Unit Price ($)': item.productPrice ? item.productPrice.toFixed(2) : '0.00',
						'Total Revenue ($)': item.totalRevenue.toFixed(2),
						'Order Count': item.orderCount,
						'Avg Qty/Order': item.averageQuantityPerOrder,
						'First Sale': item.firstSaleDate ? new Date(item.firstSaleDate).toLocaleDateString() : 'N/A',
						'Last Sale': item.lastSaleDate ? new Date(item.lastSaleDate).toLocaleDateString() : 'N/A',
						'Status': item.productIsActive !== false ? 'Active' : 'Inactive'
					}));

					// Create workbook and worksheet
					const worksheet = XLSX.utils.json_to_sheet(exportData);
					const workbook = XLSX.utils.book_new();
					XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Statistics');
					
					// Add summary sheet
					const exportSummary = result.data.summary;
					const summaryData = [
						{ 'Metric': 'Total Revenue', 'Value': `$${exportSummary.totalRevenue.toFixed(2)}` },
						{ 'Metric': 'Total Items Sold', 'Value': exportSummary.totalQuantitySold },
						{ 'Metric': 'Total Orders', 'Value': exportSummary.totalOrders },
						{ 'Metric': 'Unique Products Sold', 'Value': exportSummary.uniqueProducts },
						{ 'Metric': 'Time Period', 'Value': timeRange === 'custom' ? 
							`${document.getElementById('stats-date-from').value} to ${document.getElementById('stats-date-to').value}` : 
							`Last ${timeRange}` },
						{ 'Metric': 'Export Date', 'Value': new Date().toLocaleString() }
					];
					const summarySheet = XLSX.utils.json_to_sheet(summaryData);
					XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
					
					// Generate filename with date
					const filename = `Sales_Statistics_${new Date().toISOString().split('T')[0]}.xlsx`;
					
					// Download file
					XLSX.writeFile(workbook, filename);
					
					showMessage('Export completed successfully!', 'success');
				} catch (error) {
					console.error('Error exporting sales statistics:', error);
					showMessage('Failed to export: ' + error.message, 'error');
				}
			}

			// ============================================
			// END PRODUCT SALES STATISTICS FUNCTIONS
			// ============================================


			// Initialize order item listeners when page loads
			document.addEventListener("DOMContentLoaded", function () {
				// Setup initial order item listeners
				const initialItem = document.querySelector(".order-item");
				if (initialItem) {
					setupOrderItemListeners(initialItem);
				}

				// Add listeners for tax and discount inputs
				["order-tax", "order-discount"].forEach((id) => {
					const input = document.getElementById(id);
					if (input) {
						input.addEventListener("input", calculateOrderTotal);
					}
				});
			});
		

// ---- next inline script block ----


			// Add real-time validation for zone form
			document.addEventListener("DOMContentLoaded", function () {
				const zoneForm = document.getElementById("zone-form");
				if (zoneForm) {
					// Zone name validation
					const zoneNameInput = document.getElementById("zone-name");
					if (zoneNameInput) {
						zoneNameInput.addEventListener("blur", function () {
							const value = this.value.trim();
							if (!value) {
								this.setCustomValidity("Zone name is required");
							} else if (value.length < 2) {
								this.setCustomValidity(
									"Zone name must be at least 2 characters"
								);
							} else if (value.length > 100) {
								this.setCustomValidity(
									"Zone name cannot exceed 100 characters"
								);
							} else {
								this.setCustomValidity("");
							}
						});
					}

					// Distance validation
					const distanceInput = document.getElementById("zone-distance");
					if (distanceInput) {
						distanceInput.addEventListener("blur", function () {
							const value = parseFloat(this.value);
							if (isNaN(value) || value < 0) {
								this.setCustomValidity("Distance must be a positive number");
							} else if (value > 1000) {
								this.setCustomValidity("Distance cannot exceed 1000 km");
							} else {
								this.setCustomValidity("");
							}
						});
					}

					// Delivery fee validation
					const deliveryFeeInput = document.getElementById("zone-delivery-fee");
					if (deliveryFeeInput) {
						deliveryFeeInput.addEventListener("blur", function () {
							const value = this.value.trim();
							if (
								value &&
								(isNaN(parseFloat(value)) || parseFloat(value) < 0)
							) {
								this.setCustomValidity(
									"Delivery fee must be a positive number"
								);
							} else {
								this.setCustomValidity("");
							}
						});
					}
				}
			});
		

// ---- next inline script block ----


			// Waste Management Variables
			let currentWasteId = null;
			let currentWastePage = 1;
			let wasteRecords = [];
			let wasteByReasonChart = null;
			let wasteTrendChart = null;
			let isWasteSubmitting = false; // Prevent multiple submissions

			// Show the appropriate waste tab
			function showWasteTab(tabName) {
				// Update tab headers
				document.querySelectorAll(".tab-container .tab").forEach((tab) => {
					tab.classList.remove("active");
				});
				document
					.querySelector(
						`.tab-container .tab[onclick="showWasteTab('${tabName}')"]`
					)
					.classList.add("active");

				// Update tab content
				document
					.querySelectorAll(".tab-container .tab-pane")
					.forEach((pane) => {
						pane.classList.remove("active");
					});
				document.getElementById(`waste-${tabName}-tab`).classList.add("active");

				// If showing history tab, load charts
				if (tabName === "history") {
					loadWasteStats();
				}
			}

			// Load all waste records
			async function loadWasteRecords(page = 1, limit = 10) {
				try {
					const reasonFilter = document.getElementById(
						"waste-reason-filter"
					).value;
					const dateFrom = document.getElementById("waste-date-from").value;
					const dateTo = document.getElementById("waste-date-to").value;

					// Market accounts must use the market-admin API: /api/waste is
					// guarded by authorize("admin","staff") and answers 403 for a
					// market token, so this table was always empty. The market
					// endpoint also scopes records to THIS market.
					let url = `/api/waste?page=${page}&limit=${limit}`;

					// Add filters if they exist
					if (reasonFilter) {
						url += `&reason=${encodeURIComponent(reasonFilter)}`;
					}

					if (dateFrom) {
						url += `&startDate=${encodeURIComponent(dateFrom)}`;
					}

					if (dateTo) {
						const endDate = new Date(dateTo);
						endDate.setDate(endDate.getDate() + 1); // Include the end date
						url += `&endDate=${encodeURIComponent(endDate.toISOString())}`;
					}

					// Fetch data
					const response = await authenticatedFetch(url);

					if (!response.ok) {
						throw new Error("Failed to fetch waste records");
					}

					const data = await response.json();
					// Two shapes reach this point: the raw market API answers
					// { data: { items, meta } }, while the response-adapting shim at
					// the top of this file normalises it to { data: [...], pagination }.
					// listFrom() copes with both, and pagination is read from the
					// top-level object first, falling back to the raw `meta`.
					wasteRecords = listFrom(data, "items");
					const meta = (data.data && data.data.meta) || {};
					const pagination = data.pagination || {
						page: meta.page || page,
						totalPages:
							meta.total && meta.limit
								? Math.ceil(meta.total / meta.limit)
								: 1,
					};

					// Update table
					updateWasteTable(wasteRecords, pagination);

					// Update stats
					updateWasteStats();
				} catch (error) {
					console.error("Error loading waste records:", error);
					showMessage(
						"Failed to load waste records: " + error.message,
						"error"
					);
				}
			}

			// Update the waste table with data
			// Takes the already-unwrapped rows plus pagination, so this renderer no
			// longer has to know the response envelope's shape.
			function updateWasteTable(records, pagination) {
				const tableBody = document.getElementById("waste-records-list");
				const paginationContainer = document.getElementById("waste-pagination");

				if (!Array.isArray(records) || records.length === 0) {
					tableBody.innerHTML = `
						<tr class="empty-row">
							<td colspan="8" class="mdx-3">
								No waste records found. Click "Record Waste" to add one.
							</td>
						</tr>
					`;
					paginationContainer.innerHTML = "";
					return;
				}

				// Populate table
				let html = "";

				records.forEach((waste) => {
					const date = new Date(waste.createdAt).toLocaleDateString();
					const recordedBy =
						(waste.recordedBy && waste.recordedBy.name) ||
						waste.recordedByName ||
						"Unknown";

					// Get product details from populated field or fallback
					const productName = waste.productId
						? waste.productId.name
						: waste.productName || "-";
					const productPicture =
						waste.productId && waste.productId.picture
							? waste.productId.picture
							: null;
					const productPrice = 
						waste.productId && waste.productId.price !== undefined
							? `$${waste.productId.price.toFixed(2)}`
							: "-";

					html += `
						<tr>
							<td>${date}</td>
							<td>${waste.barcode || "-"}</td>
							<td>
								<div class="mdx-145">
									${
										productPicture
											? `<img src="${productPicture}" alt="${productName}" class="mdx-265">`
											: `<div class="mdx-266"><i class="fas fa-box"></i></div>`
									}
									<span>${productName}</span>
								</div>
							</td>
							<td>${productPrice}</td>
							<td>${waste.quantity}</td>
							<td>${waste.reason}</td>
							<td>${recordedBy}</td>
							<td class="actions">
								<button 
									class="btn btn-icon" 
									onclick="editWasteRecord('${waste._id}')"
									title="Edit"
								>
									✏️
								</button>
								<button 
									class="btn btn-icon" 
									onclick="deleteWasteRecord('${waste._id}')"
									title="Delete"
								>
									🗑️
								</button>
							</td>
						</tr>
					`;
				});

				tableBody.innerHTML = html;

				// Update pagination
				updateWastePagination(pagination);
			}

			// Update pagination controls
			function updateWastePagination(pagination) {
				const container = document.getElementById("waste-pagination");

				if (!pagination || pagination.totalPages <= 1) {
					container.innerHTML = "";
					return;
				}

				let html = "";

				// Previous button
				html += `
					<button 
						class="btn-page ${pagination.page === 1 ? "disabled" : ""}" 
						${
							pagination.page === 1
								? "disabled"
								: `onclick="loadWasteRecords(${pagination.page - 1})"`
						}
					>
						&laquo;
					</button>
				`;

				// Page numbers
				const startPage = Math.max(1, pagination.page - 2);
				const endPage = Math.min(pagination.totalPages, pagination.page + 2);

				for (let i = startPage; i <= endPage; i++) {
					html += `
						<button 
							class="btn-page ${i === pagination.page ? "active" : ""}" 
							onclick="loadWasteRecords(${i})"
						>
							${i}
						</button>
					`;
				}

				// Next button
				html += `
					<button 
						class="btn-page ${pagination.page === pagination.totalPages ? "disabled" : ""}" 
						${
							pagination.page === pagination.totalPages
								? "disabled"
								: `onclick="loadWasteRecords(${pagination.page + 1})"`
						}
					>
						&raquo;
					</button>
				`;

				container.innerHTML = html;
			}

			// Filter waste records
			function filterWasteRecords() {
				loadWasteRecords(1);
			}

			// Reset waste filters
			function resetWasteFilters() {
				document.getElementById("waste-reason-filter").value = "";
				document.getElementById("waste-date-from").value = "";
				document.getElementById("waste-date-to").value = "";
				loadWasteRecords(1);
			}

			// Export waste records to CSV
			async function exportWasteRecords() {
				try {
					showMessage("Exporting waste records...", "info");

					// Fetch all waste records (set high limit to get all)
					const response = await authenticatedFetch('/api/waste?limit=10000');

					if (!response.ok) {
						throw new Error('Failed to fetch waste records');
					}

					const data = await response.json();
					// { data: { waste, pagination } } — unwrap, or `records` is the
					// wrapper object, `records.length` is undefined and the export
					// silently skips the "nothing to export" guard before throwing.
					const records = listFrom(data, "waste");

					if (records.length === 0) {
						showMessage("No waste records to export", "warning");
						return;
					}

					// Create CSV content
					const headers = ['Date', 'Barcode', 'Product', 'Price', 'Quantity', 'Reason', 'Recorded By'];
					let csvContent = headers.join(',') + '\n';

					records.forEach(record => {
						const price = record.productId && record.productId.price !== undefined 
							? record.productId.price.toFixed(2) 
							: '';

						const row = [
							new Date(record.createdAt).toLocaleDateString(),
							record.barcode || '',
							record.productId?.name || record.productName || '',
							price,
							record.quantity || 0,
							record.reason || '',
							record.recordedBy?.name || record.recordedByName || ''
						];
						// Escape commas and quotes in fields
						const escapedRow = row.map(field => {
							const str = String(field);
							if (str.includes(',') || str.includes('"') || str.includes('\n')) {
								return '"' + str.replace(/"/g, '""') + '"';
							}
							return str;
						});
						csvContent += escapedRow.join(',') + '\n';
					});

					// Create and download the file
					const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
					const link = document.createElement('a');
					const url = URL.createObjectURL(blob);
					link.setAttribute('href', url);
					link.setAttribute('download', `waste_records_${new Date().toISOString().split('T')[0]}.csv`);
					link.style.visibility = 'hidden';
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);

					showMessage("Waste records exported successfully", "success");
				} catch (error) {
					console.error('Error exporting waste records:', error);
					showMessage("Failed to export waste records", "error");
				}
			}

			// Look up product by barcode
			async function lookupProductByBarcode() {
				const barcode = document.getElementById("waste-barcode").value.trim();

				if (!barcode) {
					showMessage("Please enter a barcode", "error");
					return;
				}

				try {
					// Fetch product details
					const response = await authenticatedFetch(
						`/api/waste/product/${barcode}`
					);

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						// The API answers { success:false, message } — reading only
						// `.error` threw away the real reason and always showed the
						// generic fallback instead.
						throw new Error(formatApiError(errorData, "Product not found"));
					}

					const data = await response.json();
					// The admin route answers { data: { product } } and the market-admin
					// one { data: <record> }. objectFrom() unwraps both; reading
					// `data.data` directly left every field undefined, so the details
					// block filled with "undefined"/"N/A" and the hidden productId was
					// never set.
					const product = objectFrom(data, "product");

					if (!product || !product._id) {
						throw new Error("Product not found with this barcode");
					}

					// Update form fields
					document.getElementById("waste-product-id").value = product._id;
					document.getElementById("waste-product-name").value = product.name || "";

					// Update product details display
					document.getElementById("product-detail-name").textContent =
						product.name || "N/A";
					document.getElementById("product-detail-price").textContent =
						typeof product.price === "number"
							? `$${product.price.toFixed(2)}`
							: "N/A";
					// `category` is a populated reference — rendering it raw printed
					// the ObjectId hex string instead of the category name.
					document.getElementById("product-detail-category").textContent =
						(product.category && (product.category.name || product.category)) ||
						"N/A";
					document.getElementById("product-detail-stock").textContent =
						product.stock !== undefined ? product.stock : "N/A";

					// Show product details
					document.getElementById("product-details-container").style.display =
						"block";
				} catch (error) {
					console.error("Error looking up product:", error);
					showMessage(error.message || "Failed to find product", "error");

					// Clear product fields
					document.getElementById("waste-product-id").value = "";
					document.getElementById("waste-product-name").value = "";
					document.getElementById("product-details-container").style.display =
						"none";
				}
			}

			// Show the add waste modal
			function showAddWasteModal() {
				currentWasteId = null;
				document.getElementById("waste-modal-title").textContent =
					"Record Waste";
				document.getElementById("waste-form").reset();
				document.getElementById("product-details-container").style.display =
					"none";
				document.getElementById("waste-modal").style.display = "block";
			}

			// Show the edit waste modal
			function editWasteRecord(id) {
				const waste = wasteRecords.find((w) => w._id === id);

				if (!waste) {
					showMessage("Waste record not found", "error");
					return;
				}

				currentWasteId = id;
				document.getElementById("waste-modal-title").textContent =
					"Edit Waste Record";
				document.getElementById("waste-id").value = id;
				document.getElementById("waste-barcode").value = waste.barcode || "";
				
				// Handle populated product reference (falls back to legacy productId)
				const rawProduct = waste.product || waste.productId;
				const productId = rawProduct && typeof rawProduct === 'object' 
					? rawProduct._id 
					: rawProduct;
				document.getElementById("waste-product-id").value = productId || "";
				
				// Handle product name from populated object or direct field
				const productName = waste.productId && waste.productId.name 
					? waste.productId.name 
					: waste.productName;
				document.getElementById("waste-product-name").value = productName || "";
				
				document.getElementById("waste-quantity").value = waste.quantity;
				document.getElementById("waste-reason").value = waste.reason;
				document.getElementById("waste-notes").value = waste.notes || "";

				document.getElementById("waste-modal").style.display = "block";
			}

			// Close waste modal
			function closeWasteModal() {
				document.getElementById("waste-modal").style.display = "none";
				// Reset the current waste ID when closing modal
				currentWasteId = null;
			}

			// Save waste record
			async function saveWasteRecord(event) {
				event.preventDefault();

				// Prevent multiple submissions
				if (isWasteSubmitting) {
					console.log("Waste submission already in progress, ignoring...");
					return;
				}

				isWasteSubmitting = true;

				console.log("Starting waste record save...");
				console.log("Current waste ID:", currentWasteId);

				try {
					const barcode = document.getElementById("waste-barcode").value.trim();
					const productName =
						document.getElementById("waste-product-name").value;
					const productId = document.getElementById("waste-product-id").value;
					const quantity = document.getElementById("waste-quantity").value;
					const reason = document.getElementById("waste-reason").value;
					const notes = document.getElementById("waste-notes").value;

					if (!barcode) {
						showMessage("Please enter a product barcode", "error");
						return;
					}

					if (!quantity || isNaN(quantity) || parseFloat(quantity) <= 0) {
						showMessage("Please enter a valid quantity", "error");
						return;
					}

					if (!reason) {
						showMessage("Please select a reason for waste", "error");
						return;
					}

					const wasteData = {
						barcode,
						productName,
						productId,
						quantity: parseFloat(quantity),
						reason,
						notes,
					};

					console.log("Waste data to save:", wasteData);

					let response;

					if (currentWasteId) {
						// Update existing record
						response = await authenticatedFetch(
							`/api/waste/${currentWasteId}`,
							{
								method: "PUT",
								headers: {
									"Content-Type": "application/json",
								},
								body: JSON.stringify(wasteData),
							}
						);
					} else {
						// Create new record
						response = await authenticatedFetch("/api/waste", {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify(wasteData),
						});
					}

					if (!response.ok) {
						const errorText = await response.text();
						let errorData;
						try {
							errorData = JSON.parse(errorText);
						} catch (e) {
							console.error("Failed to parse error response as JSON:", e);
							errorData = { error: errorText };
						}
						throw new Error(errorData.error || "Failed to save waste record");
					}

					console.log("Waste record saved successfully");
					const successData = await response.json();
					console.log("Success response data:", successData);

					showMessage("Waste record saved successfully", "success");
					closeWasteModal();
					loadWasteRecords(currentWastePage);
				} catch (error) {
					console.error("Error saving waste record:", error);
					showMessage("Failed to save waste record: " + error.message, "error");
				} finally {
					// Reset submission flag
					isWasteSubmitting = false;
				}
			}

			// Delete waste record
			async function deleteWasteRecord(id) {
				if (!confirm("Are you sure you want to delete this waste record?")) {
					return;
				}

				try {
					const response = await authenticatedFetch(`/api/waste/${id}`, {
						method: "DELETE",
					});

					if (!response.ok) {
						throw new Error("Failed to delete waste record");
					}

					showMessage("Waste record deleted successfully", "success");
					loadWasteRecords(currentWastePage);
				} catch (error) {
					console.error("Error deleting waste record:", error);
					showMessage(
						"Failed to delete waste record: " + error.message,
						"error"
					);
				}
			}

			// Load waste statistics for charts
			async function loadWasteStats() {
				try {
					// Get date range filters
					const dateFrom = document.getElementById("waste-date-from").value;
					const dateTo = document.getElementById("waste-date-to").value;

					let url = "/api/waste/stats";

					// Add date filters if they exist
					if (dateFrom || dateTo) {
						url += "?";

						if (dateFrom) {
							url += `startDate=${encodeURIComponent(dateFrom)}`;
						}

						if (dateTo) {
							if (dateFrom) url += "&";
							const endDate = new Date(dateTo);
							endDate.setDate(endDate.getDate() + 1); // Include the end date
							url += `endDate=${encodeURIComponent(endDate.toISOString())}`;
						}
					}

					// Fetch statistics
					const response = await authenticatedFetch(url);

					if (!response.ok) {
						throw new Error("Failed to fetch waste statistics");
					}

					const data = await response.json();

					// Normalize the payload so missing fields never break the UI
					const safeData = {
						total: {
							totalQuantity: data?.data?.total?.totalQuantity ?? 0,
							count: data?.data?.total?.count ?? 0,
						},
						byReason: Array.isArray(data?.data?.byReason)
							? data.data.byReason
							: [],
						byDate: Array.isArray(data?.data?.byDate)
							? data.data.byDate
							: [],
					};

					// Update charts
					updateWasteCharts(safeData);

					// Update summary stats
					updateWasteSummaryStats(safeData);
				} catch (error) {
					console.error("Error loading waste statistics:", error);
					showMessage(
						"Failed to load waste statistics: " + error.message,
						"error"
					);
				}
			}

			// Update waste charts
			function updateWasteCharts(data) {
				// Load Chart.js if not already loaded
				if (!window.Chart) {
					const script = document.createElement("script");
					script.src = "https://cdn.jsdelivr.net/npm/chart.js";
					script.onload = () => {
						createWasteCharts(data);
					};
					document.head.appendChild(script);
					return;
				}

				createWasteCharts(data);
			}

			// Create waste charts
			function createWasteCharts(data) {
				const byReason = Array.isArray(data?.byReason) ? data.byReason : [];
				const byDate = Array.isArray(data?.byDate) ? data.byDate : [];

				// Prepare data for reason chart
				const reasonLabels = byReason.map((item) => item._id);
				const reasonData = byReason.map((item) => item.totalQuantity ?? 0);
				const reasonColors = generateRandomColors(reasonLabels.length);

				// Create or update reason chart
				const reasonCtx = document
					.getElementById("wasteByReasonChart")
					.getContext("2d");

				if (wasteByReasonChart) {
					wasteByReasonChart.data.labels = reasonLabels;
					wasteByReasonChart.data.datasets[0].data = reasonData;
					wasteByReasonChart.data.datasets[0].backgroundColor = reasonColors;
					wasteByReasonChart.update();
				} else {
					wasteByReasonChart = new Chart(reasonCtx, {
						type: "pie",
						data: {
							labels: reasonLabels,
							datasets: [
								{
									data: reasonData,
									backgroundColor: reasonColors,
								},
							],
						},
						options: {
							responsive: true,
							plugins: {
								legend: {
									position: "right",
								},
								tooltip: {
									callbacks: {
										label: function (context) {
											const label = context.label || "";
											const value = context.raw || 0;
											return `${label}: ${value} units`;
										},
									},
								},
							},
						},
					});
				}

				// Prepare data for trend chart
				const dateLabels = byDate.map((item) => item._id);
				const dateData = byDate.map((item) => item.totalQuantity ?? 0);

				// Create or update trend chart
				const trendCtx = document
					.getElementById("wasteTrendsChart")
					.getContext("2d");

				if (wasteTrendChart) {
					wasteTrendChart.data.labels = dateLabels;
					wasteTrendChart.data.datasets[0].data = dateData;
					wasteTrendChart.update();
				} else {
					wasteTrendChart = new Chart(trendCtx, {
						type: "line",
						data: {
							labels: dateLabels,
							datasets: [
								{
									label: "Waste Quantity",
									data: dateData,
									borderColor: "#4c6ef5",
									backgroundColor: "rgba(76, 110, 245, 0.1)",
									fill: true,
									tension: 0.4,
								},
							],
						},
						options: {
							responsive: true,
							scales: {
								x: {
									title: {
										display: true,
										text: "Date",
									},
								},
								y: {
									beginAtZero: true,
									title: {
										display: true,
										text: "Quantity",
									},
								},
							},
						},
					});
				}
			}

			// Update waste summary statistics
			function updateWasteSummaryStats(data) {
				const summaryContainer = document.getElementById("waste-summary-stats");
				if (!summaryContainer) return;

				const total = data?.total ?? {};
				const totalQuantity = Number(total.totalQuantity) || 0;
				const totalCount = Number(total.count) || 0;
				const byReason = Array.isArray(data?.byReason) ? data.byReason : [];
				const byDate = Array.isArray(data?.byDate) ? data.byDate : [];

				// Create summary cards
				let html = "";

				// Total waste
				html += `
					<div class="stat-card">
						<div class="stat-icon">📊</div>
						<div class="stat-info">
							<div class="stat-value">${totalQuantity.toFixed(2)}</div>
							<div class="stat-label">Total Waste Units</div>
						</div>
					</div>
				`;

				// Total records
				html += `
					<div class="stat-card">
						<div class="stat-icon">🧾</div>
						<div class="stat-info">
							<div class="stat-value">${totalCount}</div>
							<div class="stat-label">Total Records</div>
						</div>
					</div>
				`;

				// Top waste reason
				if (byReason.length > 0) {
					html += `
						<div class="stat-card">
							<div class="stat-icon">🔍</div>
							<div class="stat-info">
								<div class="stat-value">${byReason[0]._id}</div>
								<div class="stat-label">Top Waste Reason</div>
							</div>
						</div>
					`;
				}

				// Average waste per day
				if (byDate.length > 0) {
					const avgWaste = totalQuantity / byDate.length;
					html += `
						<div class="stat-card">
							<div class="stat-icon">📈</div>
							<div class="stat-info">
								<div class="stat-value">${avgWaste.toFixed(2)}</div>
								<div class="stat-label">Avg. Waste Per Day</div>
							</div>
						</div>
					`;
				}

				summaryContainer.innerHTML = html;
			}

			// Update waste dashboard statistics
			async function updateWasteStats() {
				try {
					// Get summary statistics
					const response = await authenticatedFetch("/api/waste/stats");

					if (!response.ok) {
						throw new Error("Failed to fetch waste statistics");
					}

					const data = await response.json();

					const total = data?.data?.total ?? {};
					const byReason = Array.isArray(data?.data?.byReason)
						? data.data.byReason
						: [];
					const byDate = Array.isArray(data?.data?.byDate)
						? data.data.byDate
						: [];

					// Update dashboard stats
					document.getElementById("total-waste-count").textContent =
						total.count || 0;

					// Calculate this week's waste
					const thisWeekWaste = calculateThisWeekWaste(byDate);
					document.getElementById("waste-this-week").textContent =
						thisWeekWaste.toFixed(2);

					// Count by reasons
					const expiredCount = getWasteCountByReason(byReason, "Expired");
					const damagedCount = getWasteCountByReason(byReason, "Damaged");

					document.getElementById("expired-items").textContent =
						expiredCount.toFixed(2);
					document.getElementById("damaged-items").textContent =
						damagedCount.toFixed(2);
				} catch (error) {
					console.error("Error updating waste stats:", error);
				}
			}

			// Helper to calculate this week's waste
			function calculateThisWeekWaste(dateData) {
				const now = new Date();
				const startOfWeek = new Date(now);
				startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
				startOfWeek.setHours(0, 0, 0, 0);

				const weekWaste = (Array.isArray(dateData) ? dateData : [])
					.filter((item) => {
						const itemDate = new Date(item._id);
						return itemDate >= startOfWeek;
					})
					.reduce((sum, item) => sum + (item.totalQuantity || 0), 0);

				return weekWaste;
			}

			// Helper to get waste count by reason
			function getWasteCountByReason(reasonData, reason) {
				const found = (Array.isArray(reasonData) ? reasonData : []).find(
					(item) => item._id === reason
				);
				return found ? found.totalQuantity || 0 : 0;
			}

			// Generate random colors for charts
			function generateRandomColors(count) {
				const predefinedColors = [
					"#4c6ef5",
					"#f03e3e",
					"#f76707",
					"#fab005",
					"#37b24d",
					"#12b886",
					"#15aabf",
					"#228be6",
					"#7048e8",
					"#f783ac",
				];

				if (count <= predefinedColors.length) {
					return predefinedColors.slice(0, count);
				}

				const colors = [...predefinedColors];

				for (let i = predefinedColors.length; i < count; i++) {
					const r = Math.floor(Math.random() * 255);
					const g = Math.floor(Math.random() * 255);
					const b = Math.floor(Math.random() * 255);
					colors.push(`rgb(${r}, ${g}, ${b})`);
				}

				return colors;
			}

			// Settings Functions
			async function setAllProductsStatus(status) {
				const currentLang = localStorage.getItem("app-language") || "en";
				const langTranslations = translations[currentLang] || translations.en;

				const statusText = status === "active" ? "activate" : "deactivate";
				const confirmKey =
					status === "active"
						? "confirm-activate-all-products"
						: "confirm-deactivate-all-products";
				const confirmMessage = langTranslations[confirmKey];

				if (!confirm(confirmMessage)) {
					return;
				}

				try {
					const settingMessage = langTranslations[
						"setting-products-status"
					].replace("{status}", status);
					showMessage(settingMessage, "info");

					const response = await fetch(
						`${API_BASE_URL}/admin/products/bulk-status`,
						{
							method: "PUT",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ status: status }),
						}
					);

					if (response.ok) {
						const result = await response.json();
						const successMessage = langTranslations["products-status-success"]
							.replace("{action}", statusText)
							.replace("{count}", result.modifiedCount);
						showMessage(successMessage, "success");

						// Refresh dashboard stats and products section if it's currently visible
						loadDashboardStats();
						if (
							document
								.getElementById("products-section")
								.classList.contains("active")
						) {
							searchProducts();
						}
					} else {
						const error = await response.json();
						const errorMessage = langTranslations[
							"products-status-error"
						].replace(
							"{error}",
							error.message || langTranslations["products-status-failed"]
						);
						showMessage(errorMessage, "error");
					}
				} catch (error) {
					console.error("Error updating products status:", error);
					showMessage(
						langTranslations["products-status-update-error"],
						"error"
					);
				}
			}

			async function backupDatabase() {
				const currentLang = localStorage.getItem("app-language") || "en";
				const langTranslations = translations[currentLang] || translations.en;

				try {
					showMessage(langTranslations["backup-creating"], "info");

					const response = await fetch(`${API_BASE_URL}/admin/backup`, {
						method: "POST",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const result = await response.json();
						const successMessage = langTranslations["backup-success"].replace(
							"{path}",
							result.backupPath
						);
						showMessage(successMessage, "success");
					} else {
						const error = await response.json();
						const errorMessage = langTranslations["backup-error"].replace(
							"{error}",
							error.message || langTranslations["backup-failed"]
						);
						showMessage(errorMessage, "error");
					}
				} catch (error) {
					console.error("Error creating backup:", error);
					showMessage(langTranslations["backup-create-error"], "error");
				}
			}

			async function showSystemInfo() {
				try {
					showMessage("Loading system information...", "info");

					const response = await fetch(`${API_BASE_URL}/admin/system-info`, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const systemInfo = await response.json();

						// Create a modal to display system info
						const modal = document.createElement("div");
						modal.className = "modal";
						modal.style.display = "block";
						modal.innerHTML = `
							<div class="modal-content mdx-208">
								<div class="modal-header">
									<h3>System Information</h3>
									<span class="close" onclick="this.closest('.modal').remove()">&times;</span>
								</div>
								<div class="modal-body">
									<pre class="mdx-267">${JSON.stringify(
										systemInfo,
										null,
										2
									)}</pre>
								</div>
								<div class="modal-footer">
									<button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
								</div>
							</div>
						`;

						document.body.appendChild(modal);
					} else {
						const error = await response.json();
						showMessage(
							`Error: ${error.message || "Failed to load system info"}`,
							"error"
						);
					}
				} catch (error) {
					console.error("Error loading system info:", error);
					showMessage(
						"Error loading system information. Please try again.",
						"error"
					);
				}
			}

			async function runSystemMaintenance() {
				const currentLang = localStorage.getItem("app-language") || "en";
				const langTranslations = translations[currentLang] || translations.en;

				try {
					showMessage(langTranslations["maintenance-running"], "info");

					const response = await fetch(`${API_BASE_URL}/admin/maintenance`, {
						method: "POST",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					if (response.ok) {
						const result = await response.json();
						const successMessage = langTranslations[
							"maintenance-success"
						].replace("{message}", result.message || "");
						showMessage(successMessage, "success");

						// Refresh dashboard stats
						loadDashboardStats();
					} else {
						const error = await response.json();
						const errorMessage = langTranslations["maintenance-error"].replace(
							"{error}",
							error.message || langTranslations["maintenance-failed"]
						);
						showMessage(errorMessage, "error");
					}
				} catch (error) {
					console.error("Error running maintenance:", error);
					showMessage(langTranslations["maintenance-run-error"], "error");
				}
			}

			// Language change function
			async function changeLanguage(languageCode) {
				try {
					showMessage(
						`Changing language to ${getLanguageName(languageCode)}...`,
						"info"
					);

					// Save language preference to localStorage
					localStorage.setItem("app-language", languageCode);

					// Build the target language via the free translation APIs (cached).
					await ensureTranslations(languageCode);

					// Update user preference on server if logged in
					if (currentToken && currentUser) {
						try {
							const response = await fetch(
								`${API_BASE_URL}/users/${currentUser._id}/preferences`,
								{
									method: "PUT",
									headers: {
										Authorization: `Bearer ${currentToken}`,
										"Content-Type": "application/json",
									},
									body: JSON.stringify({ language: languageCode }),
								}
							);
							if (!response.ok) {
								console.warn("Failed to save language preference to server");
							}
						} catch (e) {
							console.warn("Failed to save language preference to server", e);
						}
					}

					// Apply language change
					await applyLanguage(languageCode);

					showMessage(
						`Language changed to ${getLanguageName(languageCode)} successfully!`,
						"success"
					);
				} catch (error) {
					console.error("Error changing language:", error);
					showMessage("Error changing language. Please try again.", "error");
				}
			}

			async function loadSettings() {
				try {
					const response = await authenticatedFetch(`${API_BASE_URL}/admin/settings`);
					if (!response.ok) throw new Error('Failed to load settings');
					const data = await response.json();
					if (data.success) {
						// The endpoint answers { data: { settings: {...} } }, so reading
						// data.data.<field> returned undefined for every field.
						const settings = objectFrom(data, "settings");
						document.getElementById('maintenance-mode-toggle').checked = !!settings.isMaintenanceMode;
						document.getElementById('disable-orders-toggle').checked = !!settings.areOrdersDisabled;
						document.getElementById('maintenance-message-input').value = settings.maintenanceMessage || '';
					}
				} catch (error) {
					console.error('Error loading settings:', error);
					showMessage('Error loading settings', 'error');
				}

				// Minimum Order Value is a PER-MARKET setting (MarketSetting.minOrderAmount),
				// not the global admin Setting — market_staff/market users aren't even
				// authorized to hit /admin/settings (admin-only route), which is why this
				// value previously never loaded/saved correctly on this dashboard.
				try {
					const marketResponse = await authenticatedFetch(`${API_BASE_URL}/market-admin/settings`);
					if (!marketResponse.ok) throw new Error('Failed to load market settings');
					const marketData = await marketResponse.json();
					if (marketData.success) {
						document.getElementById('minimum-order-value-input').value = marketData.data.minOrderAmount || 0;
					}
				} catch (error) {
					console.error('Error loading market minimum order value:', error);
				}
			}

			async function toggleMaintenanceMode() {
				const isChecked = document.getElementById('maintenance-mode-toggle').checked;
				try {
					const response = await authenticatedFetch(`${API_BASE_URL}/admin/settings`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ isMaintenanceMode: isChecked })
					});
					if (!response.ok) throw new Error('Failed to update maintenance mode');
					showMessage(`Maintenance mode ${isChecked ? 'enabled' : 'disabled'}`, 'success');
				} catch (error) {
					console.error('Error updating maintenance mode:', error);
					showMessage('Error updating maintenance mode', 'error');
					// Revert toggle
					document.getElementById('maintenance-mode-toggle').checked = !isChecked;
				}
			}

			async function toggleOrderCreation() {
				const isChecked = document.getElementById('disable-orders-toggle').checked;
				try {
					const response = await authenticatedFetch(`${API_BASE_URL}/admin/settings`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ areOrdersDisabled: isChecked })
					});
					if (!response.ok) throw new Error('Failed to update order creation status');
					showMessage(`Order creation ${isChecked ? 'disabled' : 'enabled'}`, 'success');
				} catch (error) {
					console.error('Error updating order creation status:', error);
					showMessage('Error updating order creation status', 'error');
					// Revert toggle
					document.getElementById('disable-orders-toggle').checked = !isChecked;
				}
			}

			async function saveMaintenanceMessage() {
				const message = document.getElementById('maintenance-message-input').value;
				try {
					const response = await authenticatedFetch(`${API_BASE_URL}/admin/settings`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ maintenanceMessage: message })
					});
					if (!response.ok) throw new Error('Failed to update message');
					showMessage('Maintenance message updated', 'success');
				} catch (error) {
					console.error('Error updating message:', error);
					showMessage('Error updating message', 'error');
				}
			}

			async function saveMinimumOrderValue() {
				const value = parseFloat(document.getElementById('minimum-order-value-input').value);
				if (isNaN(value) || value < 0) {
					showMessage('Please enter a valid minimum order value', 'error');
					return;
				}
				try {
					// Save to THIS market's own settings (MarketSetting.minOrderAmount)
					// via the market-scoped endpoint, not the global admin one — see
					// loadSettings() above for why /admin/settings never worked here.
					const response = await authenticatedFetch(`${API_BASE_URL}/market-admin/settings`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ minOrderAmount: value })
					});
					if (!response.ok) throw new Error('Failed to update minimum order value');
					showMessage('Minimum order value updated', 'success');
				} catch (error) {
					console.error('Error updating minimum order value:', error);
					showMessage('Error updating minimum order value', 'error');
				}
			}

			async function sendFCMToAllCustomers() {
				const title = document.getElementById('fcm-title').value.trim();
				const message = document.getElementById('fcm-message').value.trim();

				if (!title || !message) {
					showMessage('Please enter both title and message', 'error');
					return;
				}

				if (!confirm('Are you sure you want to send this notification to all customers?')) {
					return;
				}

				try {
					// Market-scoped broadcast (only customers who've ordered from
					// THIS market) — the global /notifications/send/all endpoint is
					// admin-only (403 for a "market" role user), which is why this
					// button previously did nothing on the market dashboard.
					const response = await authenticatedFetch(`${API_BASE_URL}/market-admin/notifications/send/all`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ title, body: message })
					});

					const result = await response.json().catch(() => null);
					if (!response.ok || !result || result.success === false) {
						throw new Error(result?.message || 'Failed to send notifications');
					}

					showMessage(`Notifications sent to ${result.data.totalSent} customers`, 'success');

					// Clear the inputs
					document.getElementById('fcm-title').value = '';
					document.getElementById('fcm-message').value = '';
				} catch (error) {
					console.error('Error sending FCM notifications:', error);
					showMessage(error.message || 'Error sending notifications', 'error');
				}
			}

			// Helper function to get language display name
			function getLanguageName(code) {
				const languages = {
					en: "English",
					ar: "العربية (Arabic)",
				};
				return languages[code] || code;
			}

			// Build the dictionary for a non-English language on demand using the
			// free translation APIs (cached in localStorage). Falls back to English
			// text if translation is unavailable so the UI never breaks.
			async function ensureTranslations(code) {
				if (code === "en" || translations[code]) return;
				if (window.FrischlyI18n && typeof window.FrischlyI18n.translateMap === "function") {
					try {
						translations[code] = await window.FrischlyI18n.translateMap(
							translations.en,
							code,
							"en"
						);
						return;
					} catch (e) {
						console.warn("Translation build failed; using English:", e);
					}
				}
				translations[code] = translations.en;
			}

			// Apply language to the interface
			async function applyLanguage(languageCode) {
				// Make sure the dictionary exists (e.g. when restoring a saved language).
				await ensureTranslations(languageCode);

				// Update document language + direction (Arabic is right-to-left).
				document.documentElement.lang = languageCode;
				document.documentElement.setAttribute(
					"dir",
					languageCode === "ar" ? "rtl" : "ltr"
				);

				// Store current language globally
				window.currentLanguage = languageCode;

				// Translate the entire visible UI through the same-origin proxy.
				// This covers nav, headings, labels, buttons, table headers,
				// placeholders and modals, and keeps translating dynamically
				// loaded content. Switching back to English restores originals.
				if (window.FrischlyI18n && window.FrischlyI18n.applyPageLanguage) {
					try {
						await window.FrischlyI18n.applyPageLanguage(languageCode);
					} catch (e) {
						console.warn("Page translation failed:", e);
					}
				}

				console.log(`Language applied: ${languageCode}`);
			}

			// Translate every element carrying a data-translation key.
			function applyDataTranslations(langTranslations) {
				if (!langTranslations) return;
				const els = document.querySelectorAll("[data-translation]");
				els.forEach((el) => {
					const key = el.getAttribute("data-translation");
					const val = langTranslations[key];
					if (!val) return;
					if (
						(el.tagName === "INPUT" || el.tagName === "TEXTAREA") &&
						el.hasAttribute("placeholder")
					) {
						el.placeholder = val;
					} else {
						el.textContent = val;
					}
				});
			}

			// Update navigation menu translations
			function updateNavigationTranslations(translations) {
				// Update menu item text
				const menuItems = {
					"menu-dashboard": "Dashboard",
					"menu-users": "Staff Management",
					"menu-categories": "Categories",
					"menu-products": "Products",
					"menu-orders": "Orders",
					"menu-riders": "Riders Management",
					"menu-waste": "Waste Management",
					"menu-settings": "Settings",
					"menu-profile": "Profile",
				};

				Object.entries(menuItems).forEach(([menuId, key]) => {
					const menuItem = document.getElementById(menuId);
					if (menuItem) {
						const textSpan = menuItem.querySelector(".menu-text");
						if (textSpan && translations[key]) {
							textSpan.textContent = translations[key];
						}
					}
				});

				// Update sign out link
				const signOutLink = document.querySelector(
					'.sidebar-menu a[onclick="logout()"]'
				);
				if (signOutLink && signOutLink.querySelector(".menu-text")) {
					signOutLink.querySelector(".menu-text").textContent =
						translations["Sign Out"] || "Sign Out";
				}
			}

			// Update dashboard translations
			function updateDashboardTranslations(translations) {
				// Update section header
				const dashboardHeader = document.querySelector(
					"#dashboard-section .section-header h2"
				);
				if (dashboardHeader) {
					dashboardHeader.textContent =
						translations["Dashboard Overview"] || "Dashboard Overview";
				}

				const dashboardDesc = document.querySelector(
					"#dashboard-section .section-header p"
				);
				if (dashboardDesc) {
					const userName =
						document.getElementById("welcome-user-name")?.textContent ||
						"Admin";
					dashboardDesc.innerHTML = `${
						translations["Welcome back"] || "Welcome back"
					}, <span id="welcome-user-name">${userName}</span>! Here's your management dashboard`;
				}

				// Update stat labels
				const statLabels = document.querySelectorAll(
					"#dashboard-section .stat-box p"
				);
				const statTranslations = [
					"Total Customers",
					"Active Products",
					"Orders",
					"Active Riders",
				];

				statLabels.forEach((label, index) => {
					if (
						statTranslations[index] &&
						translations[statTranslations[index]]
					) {
						label.textContent = translations[statTranslations[index]];
					}
				});
			}

			// Update settings translations
			function updateSettingsTranslations(translations) {
				// Update section header
				const settingsHeader = document.querySelector(
					"#settings-section .section-header h2"
				);
				if (settingsHeader) {
					settingsHeader.textContent =
						translations["System Settings"] || "System Settings";
				}

				const settingsDesc = document.querySelector(
					"#settings-section .section-header p"
				);
				if (settingsDesc) {
					settingsDesc.textContent =
						translations["Configure system-wide settings and preferences"] ||
						"Configure system-wide settings and preferences";
				}

				// Update card titles
				const cardTitles = document.querySelectorAll(
					"#settings-section .settings-card h3"
				);
				const titleTranslations = [
					"Product Management",
					"Database Management",
					"System Information",
					"Maintenance",
					"Language Settings",
				];

				let titleIndex = 0;
				cardTitles.forEach((title) => {
					const emoji = title.textContent.split(" ")[0]; // Keep emoji
					const textKey = titleTranslations[titleIndex];
					if (textKey && translations[textKey]) {
						title.textContent = `${emoji} ${translations[textKey]}`;
					}
					titleIndex++;
				});

				// Update labels and descriptions
				const labels = document.querySelectorAll(
					"#settings-section .setting-item label"
				);
				const labelTranslations = [
					"Product Status Control",
					"Database Operations",
					"System Stats",
					"System Maintenance",
					"Application Language",
				];

				let labelIndex = 0;
				labels.forEach((label) => {
					const textKey = labelTranslations[labelIndex];
					if (textKey && translations[textKey]) {
						label.textContent = translations[textKey];
					}
					labelIndex++;
				});

				// Update button texts
				const buttons = document.querySelectorAll(
					"#settings-section .setting-actions .btn"
				);
				const buttonTranslations = [
					"Activate All Products",
					"Deactivate All Products",
					"Create Database Backup",
					"View System Information",
					"Run Maintenance Tasks",
				];

				let buttonIndex = 0;
				buttons.forEach((button) => {
					const textKey = buttonTranslations[buttonIndex];
					if (textKey && translations[textKey]) {
						button.textContent = translations[textKey];
					}
					buttonIndex++;
				});

				// Update descriptions
				const descriptions = document.querySelectorAll(
					"#settings-section .setting-description"
				);
				const descTranslations = [
					"Bulk update the active status of all products in the system.",
					"Manage database backups and system resets.",
					"View detailed system statistics and information.",
					"Perform routine system maintenance and cleanup.",
					"Change the language of the application interface.",
				];

				let descIndex = 0;
				descriptions.forEach((desc) => {
					const textKey = descTranslations[descIndex];
					if (textKey && translations[textKey]) {
						desc.textContent = translations[textKey];
					}
					descIndex++;
				});
			}

			// Load saved language preference on page load
			async function loadSavedLanguage() {
				let savedLanguage = localStorage.getItem("app-language") || "en";
				// Only English and Arabic are supported; reset anything else.
				if (savedLanguage !== "en" && savedLanguage !== "ar") {
					savedLanguage = "en";
					localStorage.setItem("app-language", "en");
				}
				const languageSelect = document.getElementById("language-select");
				if (languageSelect) {
					languageSelect.value = savedLanguage;
				}
				await applyLanguage(savedLanguage);
			}

			// Initialize waste management when showing section
			document.addEventListener("DOMContentLoaded", function () {
				// Set default date filters to past month
				const today = new Date();
				const monthAgo = new Date();
				monthAgo.setMonth(today.getMonth() - 1);

				document.getElementById("waste-date-from").valueAsDate = monthAgo;
				document.getElementById("waste-date-to").valueAsDate = today;

				// The waste section is loaded by loadSectionData("waste"); binding a
				// second click handler here would fire a duplicate request.
			});

			// Initialize language on page load
			document.addEventListener("DOMContentLoaded", function () {
				loadSavedLanguage();
			});

			// Initialize shelf barcode preview behaviour
			document.addEventListener("DOMContentLoaded", function () {
				const shelfNumberInput = document.getElementById("shelf-number");
				if (shelfNumberInput) {
					shelfNumberInput.addEventListener("input", handleShelfNumberInput);
				}

				const barcodePrintable = document.getElementById("shelf-barcode-printable");
				if (barcodePrintable) {
					barcodePrintable.addEventListener("click", printShelfBarcode);
				}
			});

			// Barcode Generator Functions
			function showBarcodeGeneratorModal() {
				const modal = document.getElementById("barcode-generator-modal");
				const input = document.getElementById("barcode-input");
				const preview = document.getElementById("barcode-preview");

				input.value = "";
				preview.innerHTML = '<svg id="barcode-svg"></svg>';
				modal.style.display = "block";
			}

			function closeBarcodeGeneratorModal() {
				const modal = document.getElementById("barcode-generator-modal");
				modal.style.display = "none";
			}

			function generateBarcode() {
				const input = document.getElementById("barcode-input");
				const text = input.value.trim();

				if (!text) {
					showMessage("Please enter barcode text", "error");
					return;
				}

				try {
					JsBarcode("#barcode-svg", text, {
						format: "CODE128",
						width: 2,
						height: 100,
						displayValue: true,
						fontSize: 14,
						margin: 10,
					});
					showMessage("Barcode generated successfully", "success");
				} catch (error) {
					showMessage("Error generating barcode: " + error.message, "error");
				}
			}

			function submitBarcode() {
				const input = document.getElementById("barcode-input");
				const text = input.value.trim();

				if (!text) {
					showMessage("Please generate a barcode first", "error");
					return;
				}

				// Set the barcode value in the product form
				document.getElementById("product-barcode").value = text;
				closeBarcodeGeneratorModal();
				showMessage("Barcode applied to product", "success");
			}

			// Generate a random barcode
			function generateRandomBarcode() {
				// Generate a random 8-12 digit number for barcode
				const length = Math.floor(Math.random() * 5) + 8; // Random length between 8-12
				let randomBarcode = "";

				// First digit should not be 0 for better barcode compatibility
				randomBarcode += Math.floor(Math.random() * 9) + 1;

				// Generate remaining digits
				for (let i = 1; i < length; i++) {
					randomBarcode += Math.floor(Math.random() * 10);
				}

				// Set the random barcode in the input field
				document.getElementById("barcode-input").value = randomBarcode;

				// Automatically generate the barcode preview
				generateBarcode();
			}

			// Generate barcodes for all products in the table
			function generateProductBarcodes() {
				const barcodeElements = document.querySelectorAll(".barcode-svg");
				barcodeElements.forEach((svg) => {
					const barcode = svg.getAttribute("data-barcode");
					if (barcode && barcode !== "N/A") {
						try {
							JsBarcode(svg, barcode, {
								format: "CODE128",
								width: 1,
								height: 30,
								displayValue: false,
								margin: 0,
								fontSize: 10,
							});
						} catch (error) {
							console.error("Error generating barcode for:", barcode, error);
							svg.style.display = "none";
						}
					} else {
						svg.style.display = "none";
					}
				});
			}

			// Barcode Viewer Modal Functions
			function showBarcodeModal(barcode, productName) {
				if (!barcode || barcode === "N/A") {
					showMessage("No barcode available for this product", "error");
					return;
				}

				const modal = document.getElementById("barcode-viewer-modal");
				const title = document.getElementById("barcode-viewer-title");
				const svg = document.getElementById("barcode-viewer-svg");
				const text = document.getElementById("barcode-viewer-text");

				title.textContent = `Barcode - ${productName}`;
				text.textContent = barcode;

				try {
					JsBarcode(svg, barcode, {
						format: "CODE128",
						width: 2,
						height: 100,
						displayValue: true,
						fontSize: 16,
						margin: 20,
						background: "#ffffff",
						lineColor: "#000000",
					});
					modal.style.display = "block";
				} catch (error) {
					showMessage("Error displaying barcode: " + error.message, "error");
				}
			}

			function closeBarcodeViewerModal() {
				const modal = document.getElementById("barcode-viewer-modal");
				modal.style.display = "none";
			}

			function printBarcode() {
				const printContent = document.getElementById(
					"barcode-viewer-content"
				).innerHTML;
				const originalContent = document.body.innerHTML;

				document.body.innerHTML = `
					<div class="mdx-268">
						<h2 class="mdx-211">${
							document.getElementById("barcode-viewer-title").textContent
						}</h2>
						${printContent}
						<div class="mdx-269">
							Printed on ${new Date().toLocaleString()}
						</div>
					</div>
				`;

				window.print();
				document.body.innerHTML = originalContent;

				// Reinitialize any event listeners if needed
				setTimeout(() => {
					loadProducts(
						currentProductsPage,
						productsPageSize,
						getCurrentProductFilters()
					);
				}, 100);
			}

			// Shelf Management Functions
			let allShelfs = [];
			let filteredShelfs = [];

			async function loadShelfs() {
				try {
					showMessage("Loading shelfs...", "info");
					const response = await authenticatedFetch(`${API_BASE_URL}/shelves?isActive=all`);

					if (!response.ok) {
						throw new Error("Failed to fetch shelfs");
					}

					const result = await response.json();
					allShelfs = listFrom(result, "shelves");
					filteredShelfs = [...allShelfs];
					displayShelfs(filteredShelfs);
					updateShelfSummary();
				} catch (error) {
					console.error("Error loading shelfs:", error);
					showMessage("Failed to load shelfs", "error");
				}
			}

			function displayShelfs(shelfs) {
				const tbody = document.getElementById("shelfs-table-body");
				const countDisplay = document.getElementById("shelfs-count-display");

				countDisplay.textContent = `${shelfs.length} shelf${shelfs.length !== 1 ? "s" : ""}`;

				if (shelfs.length === 0) {
					tbody.innerHTML = `
						<tr>
							<td colspan="13" class="mdx-3">
								No shelfs found. ${
									filteredShelfs.length !== allShelfs.length
										? "Try adjusting your filters."
										: "Click 'Add Shelf' to create one."
								}
							</td>
						</tr>
					`;
					return;
				}

				tbody.innerHTML = shelfs
					.map(
						(shelf, index) => `
					<tr class="mdx-270 ${shelf.isActive === false ? "is-inactive" : ""}">
						<td class="mdx-128">${index + 1}</td>
						<td class="mdx-132">${shelf.shelfNumber || "N/A"}</td>
						<td class="mdx-129">
							${shelf.barcode
								? `<svg class="shelf-barcode-svg" data-barcode="${escapeHtml(shelf.barcode)}" aria-label="Shelf barcode for ${escapeHtml(shelf.shelfNumber || "Shelf")}"></svg>`
								: '<span class="mdx-140">No barcode</span>'}
						</td>
						<td class="mdx-134">${shelf.description || "No description"}</td>
						<td>${shelf.location || "Not specified"}</td>
						<td class="mdx-129">${shelf.capacity === 0 ? "Unlimited" : shelf.capacity}</td>
						<td class="mdx-129">${shelf.currentLoad || 0}</td>
						<td class="mdx-129">
							<span class="mdx-util-badge ${
								shelf.utilizationPercentage >= 90 ? "mdx-util-badge-danger" :
								shelf.utilizationPercentage >= 70 ? "mdx-util-badge-warning" : "mdx-util-badge-success"
							}">
								${shelf.utilizationPercentage || 0}%
							</span>
						</td>
						<td class="mdx-129">${shelf.products?.length || 0}</td>
						<td class="mdx-129">${shelf.orders?.length || 0}</td>
						<td><span class="status-badge ${shelf.isActive ? "active" : "inactive"}">${shelf.isActive ? "Active" : "Inactive"}</span></td>
						<td>${shelf.createdAt ? formatDate(shelf.createdAt) : "N/A"}</td>
						<td>
							<div class="action-buttons">
								<button class="action-btn edit" onclick="editShelf('${shelf._id}')">Edit</button>
								<button class="action-btn delete" onclick="deleteShelf('${shelf._id}', '${(shelf.shelfNumber || "").replace(/'/g, "\\'")}')">Delete</button>
							</div>
						</td>
					</tr>
				`
					)
					.join("");

				renderShelfBarcodes();
			}

			function renderShelfBarcodes() {
				const svgElements = document.querySelectorAll(".shelf-barcode-svg");
				if (!svgElements || svgElements.length === 0) {
					return;
				}

				svgElements.forEach((svg) => {
					if (svg.getAttribute("data-rendered") === "true") {
						return;
					}

					const barcodeValue = svg.getAttribute("data-barcode");
					if (!barcodeValue) {
						svg.style.display = "none";
						return;
					}

					try {
						JsBarcode(svg, barcodeValue, {
							format: "CODE128",
							width: 1.5,
							height: 40,
							displayValue: false,
							margin: 0,
						});
						svg.setAttribute("data-rendered", "true");
					} catch (error) {
						console.error("Error generating shelf barcode:", error);
						const fallback = document.createElement("span");
						fallback.style.color = "#dc3545";
						fallback.textContent = "Invalid barcode";
						svg.replaceWith(fallback);
					}
				});
			}

			function updateShelfSummary() {
				const summaryElement = document.getElementById("shelf-summary");
				if (!summaryElement || !allShelfs) return;

				const activeCount = allShelfs.filter((shelf) => shelf.isActive).length;
				const inactiveCount = allShelfs.filter((shelf) => !shelf.isActive).length;
				const totalCount = allShelfs.length;
				const totalProducts = allShelfs.reduce((sum, shelf) => sum + (shelf.products?.length || 0), 0);
				const totalOrders = allShelfs.reduce((sum, shelf) => sum + (shelf.orders?.length || 0), 0);

				summaryElement.innerHTML = `
					<strong>Total:</strong> ${totalCount} shelfs |
					<span class="mdx-139"><strong>Active:</strong> ${activeCount}</span> |
					<span class="mdx-140"><strong>Inactive:</strong> ${inactiveCount}</span> |
					<span class="mdx-271"><strong>Products:</strong> ${totalProducts}</span> |
					<span class="mdx-156"><strong>Orders:</strong> ${totalOrders}</span>
				`;
			}

			function filterShelfs() {
				const filterSelect = document.getElementById("shelf-filter");
				const searchInput = document.getElementById("shelf-search");
				const filterValue = filterSelect ? filterSelect.value : "all";
				const searchValue = searchInput ? searchInput.value.toLowerCase().trim() : "";
				const tableTitle = document.getElementById("shelfs-table-title");

				let filtered = [...allShelfs];

				// Apply status filter
				if (filterValue === "active") {
					filtered = filtered.filter((shelf) => shelf.isActive);
				} else if (filterValue === "inactive") {
					filtered = filtered.filter((shelf) => !shelf.isActive);
				}

				// Apply search filter
				if (searchValue) {
					filtered = filtered.filter((shelf) => {
						const shelfNumber = (shelf.shelfNumber || "").toLowerCase();
						const description = (shelf.description || "").toLowerCase();
						const location = (shelf.location || "").toLowerCase();
						return (
							shelfNumber.includes(searchValue) ||
							description.includes(searchValue) ||
							location.includes(searchValue)
						);
					});
				}

				filteredShelfs = filtered;

				// Update title
				let titleText = filterValue === "all" ? "All Shelfs" :
					filterValue === "active" ? "Active Shelfs" : "Inactive Shelfs";
				if (searchValue) {
					titleText += ` (Searching: "${searchInput.value}")`;
				}
				if (tableTitle) tableTitle.textContent = titleText;

				displayShelfs(filteredShelfs);
			}

			function clearShelfFilters() {
				const searchInput = document.getElementById("shelf-search");
				const filterSelect = document.getElementById("shelf-filter");

				if (searchInput) searchInput.value = "";
				if (filterSelect) filterSelect.value = "all";

				filteredShelfs = [...allShelfs];
				displayShelfs(filteredShelfs);
				const tableTitle = document.getElementById("shelfs-table-title");
				if (tableTitle) tableTitle.textContent = "All Shelfs";
				showMessage("Shelf filters cleared", "info");
			}

			function showAddShelfModal() {
				const modalTitle = document.getElementById("shelf-modal-title");
				const shelfForm = document.getElementById("shelf-form");
				const shelfId = document.getElementById("shelf-id");
				const shelfModal = document.getElementById("shelf-modal");

				if (!modalTitle || !shelfForm || !shelfId || !shelfModal) {
					console.error("Shelf modal elements not found");
					showMessage("Modal not available. Please refresh the page.", "error");
					return;
				}

				modalTitle.textContent = "Add New Shelf";
				shelfForm.reset();
				shelfId.value = "";
				
				// Hide barcode preview for new shelf
				const barcodePreviewContainer = document.getElementById("shelf-barcode-preview-container");
				if (barcodePreviewContainer) {
					barcodePreviewContainer.style.display = "none";
				}
				
				shelfModal.style.display = "block";
			}

			// Function to display barcode preview
			function displayShelfBarcodePreview(barcodeValue) {
				const previewContainer = document.getElementById("shelf-barcode-preview-container");
				const previewSvg = document.getElementById("shelf-barcode-preview");
				const errorElement = document.getElementById("shelf-barcode-error");
				
				if (!previewContainer || !previewSvg || !errorElement) {
					console.error("Barcode preview elements not found");
					return;
				}
				
				// Clear previous content
				previewSvg.innerHTML = "";
				errorElement.style.display = "none";
				errorElement.textContent = "";
				
				if (!barcodeValue || barcodeValue.trim() === "") {
					previewContainer.style.display = "none";
					return;
				}
				
				try {
					// Generate barcode using JsBarcode
					JsBarcode(previewSvg, barcodeValue, {
						format: "CODE128",
						width: 2,
						height: 80,
						displayValue: true,
						fontSize: 14,
						margin: 10
					});
					previewContainer.style.display = "block";
				} catch (error) {
					console.error("Error generating barcode:", error);
					errorElement.textContent = "Invalid barcode format";
					errorElement.style.display = "block";
					previewContainer.style.display = "block";
				}
			}

			function handleShelfNumberInput(event) {
				const rawValue = event.target.value || "";
				const generatedValue = rawValue.trim();
				const barcodeInput = document.getElementById("shelf-barcode");
				if (barcodeInput) {
					barcodeInput.value = generatedValue;
				}
				displayShelfBarcodePreview(generatedValue);
			}

			function printShelfBarcode() {
				const barcodeInput = document.getElementById("shelf-barcode");
				const previewSvg = document.getElementById("shelf-barcode-preview");
				if (!barcodeInput || !previewSvg) {
					showMessage("Barcode preview not available", "error");
					return;
				}

				const barcodeValue = (barcodeInput.value || "").trim();
				if (!barcodeValue) {
					showMessage("No barcode available to print", "error");
					return;
				}

				const svgContent = previewSvg.outerHTML;
				if (!svgContent || svgContent.trim() === "") {
					showMessage("Generate the barcode before printing", "error");
					return;
				}

				const printWindow = window.open("", "_blank", "width=420,height=600");
				if (!printWindow) {
					showMessage("Please allow pop-ups to print the barcode", "error");
					return;
				}

				const safeBarcode = typeof escapeHtml === "function" ? escapeHtml(barcodeValue) : barcodeValue;

				printWindow.document.write(`<!DOCTYPE html>
		<html>
		<head>
		<meta charset="utf-8" />
		<title>Shelf Barcode</title>
		</head>
		<body>
			<div class="barcode-wrapper">${svgContent}</div>
			<div class="barcode-text">${safeBarcode}</div>
		</body>
		</html>`);
				printWindow.document.close();
				printWindow.focus();
				printWindow.print();
				setTimeout(() => {
					printWindow.close();
				}, 250);
			}

			async function editShelf(shelfId) {
				try {
					showMessage("Loading shelf data...", "info");

					const response = await authenticatedFetch(`${API_BASE_URL}/shelves/${shelfId}`);
					if (!response.ok) {
						throw new Error("Failed to load shelf data");
					}

					const result = await response.json();
					// /shelves/:id returns { data: { shelf } } — unwrap it, otherwise
					// every field below reads off the wrapper and comes out undefined.
					const shelf = objectFrom(result, "shelf") || {};

				const elements = {
					modalTitle: document.getElementById("shelf-modal-title"),
					shelfId: document.getElementById("shelf-id"),
					shelfNumber: document.getElementById("shelf-number"),
					shelfBarcode: document.getElementById("shelf-barcode"),
					shelfDescription: document.getElementById("shelf-description"),
					shelfLocation: document.getElementById("shelf-location"),
					shelfCapacity: document.getElementById("shelf-capacity"),
					shelfStatus: document.getElementById("shelf-status"),
					shelfModal: document.getElementById("shelf-modal"),
				};

				for (const [key, element] of Object.entries(elements)) {
					if (!element) {
						console.error(`Element ${key} not found`);
						showMessage("Modal form not available. Please refresh the page.", "error");
						return;
					}
				}

				elements.modalTitle.textContent = "Edit Shelf";
				elements.shelfId.value = shelf._id;
				elements.shelfNumber.value = shelf.shelfNumber || "";
				elements.shelfBarcode.value = shelf.barcode || "";
				elements.shelfDescription.value = shelf.description || "";
				elements.shelfLocation.value = shelf.location || "";
				elements.shelfCapacity.value = shelf.capacity || 0;
				elements.shelfStatus.value = shelf.isActive ? "true" : "false";
				
				// Display barcode preview if barcode exists
				displayShelfBarcodePreview(shelf.barcode);
				
				elements.shelfModal.style.display = "block";
				} catch (error) {
					console.error("Error editing shelf:", error);
					showMessage("Error opening shelf edit form. Please try again.", "error");
				}
			}

			async function deleteShelf(shelfId, shelfNumber) {
				if (!confirm(`Are you sure you want to delete shelf "${shelfNumber}"? This action cannot be undone.`)) {
					return;
				}

				try {
					const response = await authenticatedFetch(`${API_BASE_URL}/shelves/${shelfId}`, {
						method: "DELETE",
					});

					const result = await response.json();

					if (response.ok) {
						showMessage(`Shelf "${shelfNumber}" deleted successfully`, "success");
						loadShelfs();
					} else {
						showMessage(formatApiError(result, "Failed to delete shelf"), "error");
					}
				} catch (error) {
					console.error("Error deleting shelf:", error);
					showMessage("Failed to delete shelf: " + error.message, "error");
				}
			}

			async function saveShelf() {
				try {
					const form = document.getElementById("shelf-form");
					const shelfIdElement = document.getElementById("shelf-id");

					if (!form || !shelfIdElement) {
						showMessage("Form not available. Please refresh the page.", "error");
						return;
					}

					const formData = new FormData(form);
					const shelfId = shelfIdElement.value;

					if (!formData.get("shelfNumber")) {
						showMessage("Please provide a shelf number.", "error");
						return;
					}

				const shelfData = {
					shelfNumber: formData.get("shelfNumber"),
					barcode: formData.get("barcode") || "",
					description: formData.get("description") || "",
					location: formData.get("location") || "",
					capacity: parseInt(formData.get("capacity")) || 0,
					isActive: formData.get("status") === "true",
				};					const url = shelfId
						? `${API_BASE_URL}/shelves/${shelfId}`
						: `${API_BASE_URL}/shelves`;
					const method = shelfId ? "PUT" : "POST";

					const response = await authenticatedFetch(url, {
						method: method,
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify(shelfData),
					});

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						throw new Error(formatApiError(errorData) || `HTTP ${response.status}: ${response.statusText}`);
					}

					const result = await response.json();
					showMessage(
						result.message || `Shelf ${shelfId ? "updated" : "created"} successfully`,
						"success"
					);
					closeShelfModal();
					await loadShelfs();
				} catch (error) {
					console.error("Error saving shelf:", error);
					showMessage("Error saving shelf: " + error.message, "error");
				}
			}

			function closeShelfModal() {
				const modal = document.getElementById("shelf-modal");
				if (modal) {
					modal.style.display = "none";
				}
			}

			function refreshShelfs() {
				loadShelfs();
				showMessage("Shelfs refreshed", "success");
			}

			// Promo Codes Management
			async function loadPromoCodes(isFromOwnCompany = null) {
				try {
					// Market accounts must use the market-admin API. /promocodes is
					// guarded by authorize("admin") and answers 403 for a market
					// token, so this section showed nothing at all. The market
					// endpoint also scopes results to THIS market's codes.
					const response = await authenticatedFetch(
						`${API_BASE_URL}/market-admin/promocodes`
					);
					const result = await response.json();

					if (result.success) {
						// Determine which table to populate based on the filter
						let tbodyId;
						if (isFromOwnCompany === true) {
							tbodyId = "promo-table-body";
						} else if (isFromOwnCompany === false) {
							tbodyId = "onetime-table-body";
						} else {
							// For backward compatibility, if no filter, use the old table
							tbodyId = "promocodes-table-body";
						}

						const tbody = document.getElementById(tbodyId);
						if (!tbody) return; // Skip if table doesn't exist (for backward compatibility)
						tbody.innerHTML = "";

						// The market API answers { data: { items, meta } }.
						const rows = listFrom(result, "items");

						// Filter data based on isFromOwnCompany
						const filteredData =
							isFromOwnCompany !== null
								? rows.filter(
										(promo) => promo.isFromOwnCompany === isFromOwnCompany
									)
								: rows;

						filteredData.forEach((promo) => {
							const discountDisplay = promo.discountType === "percentage" 
								? `${promo.discountValue}%`
								: `$${promo.discountValue}`;
							
							const typeDisplay = promo.isFromOwnCompany 
								? '<span class="status-badge status-active">Own Company</span>' 
								: '<span class="status-badge mdx-272">Other Company</span>';
							
							const tr = document.createElement("tr");
							tr.innerHTML = `
								<td>${promo.companyName}</td>
								<td><span class="category-badge">${promo.code}</span></td>
								<td>${promo.description || "-"}</td>
								<td>${discountDisplay}</td>
								<td>${typeDisplay}</td>
								<td>
									<span class="status-badge ${promo.isActive ? "status-active" : "status-inactive"}">
										${promo.isActive ? "Active" : "Inactive"}
									</span>
								</td>
								<td>
									<button class="btn-icon" onclick="editPromoCode('${promo._id}')" title="Edit">
										✏️
									</button>
									<button class="btn-icon delete-btn" onclick="deletePromoCode('${promo._id}')" title="Delete">
										🗑️
									</button>
								</td>
							`;
							tbody.appendChild(tr);
						});
					}
				} catch (error) {
					console.error("Error loading promo codes:", error);
					showMessage("Failed to load promo codes", "error");
				}
			}

			function showAddPromoCodeModal(tabType = 'promo') {
				document.getElementById("promocode-modal-title").textContent = tabType === 'promo' ? "Add Promo Code" : "Add Onetime Promo Code";
				document.getElementById("promocode-form").reset();
				document.getElementById("promocode-id").value = "";
				// Set default values based on tab
				document.getElementById("promocode-discount-type").value = "percentage";
				document.getElementById("promocode-own-company").value = tabType === 'promo' ? "true" : "false";
				togglePromoCodeFields();
				document.getElementById("promocode-modal").style.display = "block";
			}

			async function editPromoCode(id) {
				try {
					// Market-admin API (see loadPromoCodes) — /promocodes/:id is
					// admin-only and answers 403 for a market token.
					const response = await authenticatedFetch(
						`${API_BASE_URL}/market-admin/promocodes/${id}`
					);
					const result = await response.json();

					if (result.success) {
						// The market API answers { data: <record> }; objectFrom handles
						// both that and the admin { data: { promoCode } } shape.
						const promo = objectFrom(result, "promoCode") || {};
						document.getElementById("promocode-modal-title").textContent = "Edit Promo Code";
						document.getElementById("promocode-id").value = promo._id;
						document.getElementById("promocode-company").value = promo.companyName;
						document.getElementById("promocode-code").value = promo.code;
						document.getElementById("promocode-description").value = promo.description || "";
						document.getElementById("promocode-discount-type").value = promo.discountType || "percentage";
						document.getElementById("promocode-discount-value").value = promo.discountValue || "";
						document.getElementById("promocode-own-company").value = promo.isFromOwnCompany.toString();
						document.getElementById("promocode-min-order").value = promo.triggerCondition?.minOrderTotal || "";
						document.getElementById("promocode-email-subject").value = promo.emailSubject || "";
						document.getElementById("promocode-email-message").value = promo.emailMessage || "";
						document.getElementById("promocode-status").value = promo.isActive.toString();
						
						// Show/hide conditional fields
						togglePromoCodeFields();
						
						document.getElementById("promocode-modal").style.display = "block";
					}
				} catch (error) {
					console.error("Error fetching promo code:", error);
					showMessage("Failed to fetch promo code details", "error");
				}
			}

			async function savePromoCode() {
				try {
					const id = document.getElementById("promocode-id").value;
					const companyName = document.getElementById("promocode-company").value;
					const code = document.getElementById("promocode-code").value;
					const description = document.getElementById("promocode-description").value;
					const discountType = document.getElementById("promocode-discount-type").value;
					const discountValue = parseFloat(document.getElementById("promocode-discount-value").value);
					const isFromOwnCompany = document.getElementById("promocode-own-company").value === "true";
					const minOrderTotal = document.getElementById("promocode-min-order").value 
						? parseFloat(document.getElementById("promocode-min-order").value) 
						: null;
					const emailSubject = document.getElementById("promocode-email-subject").value;
					const emailMessage = document.getElementById("promocode-email-message").value;
					const isActive = document.getElementById("promocode-status").value === "true";

					if (!companyName || !code || !discountType || isNaN(discountValue)) {
						showMessage("Please fill in all required fields", "error");
						return;
					}

					// Validate discount value
					if (discountType === "percentage" && (discountValue < 0 || discountValue > 100)) {
						showMessage("Percentage discount must be between 0 and 100", "error");
						return;
					}

					if (discountType === "cash" && discountValue < 0) {
						showMessage("Cash discount cannot be negative", "error");
						return;
					}

					// Market-admin API (see loadPromoCodes) — the admin /promocodes
					// routes answer 403 for a market token, so saving silently failed.
					const url = id
						? `${API_BASE_URL}/market-admin/promocodes/${id}`
						: `${API_BASE_URL}/market-admin/promocodes`;
					
					const method = id ? "PUT" : "POST";

					const response = await authenticatedFetch(url, {
						method,
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							companyName,
							code,
							description,
							discountType,
							discountValue,
							isFromOwnCompany,
							triggerCondition: minOrderTotal ? { minOrderTotal } : {},
							emailSubject,
							emailMessage,
							isActive
						}),
					});

					const result = await response.json();

					if (result.success) {
						showMessage(result.message, "success");
						closePromoCodeModal();
						loadPromoCodes(isFromOwnCompany); // Reload the appropriate tab
					} else {
						showMessage(result.message || "Operation failed", "error");
					}
				} catch (error) {
					console.error("Error saving promo code:", error);
					showMessage("Failed to save promo code", "error");
				}
			}

			function togglePromoCodeFields() {
				const isFromOwnCompany = document.getElementById("promocode-own-company").value === "true";
				const triggerConditionGroup = document.getElementById("trigger-condition-group");
				const emailSubjectGroup = document.getElementById("email-subject-group");
				const emailMessageGroup = document.getElementById("email-message-group");
				
				if (isFromOwnCompany) {
					// Hide email-related fields for own company promo codes
					triggerConditionGroup.style.display = "none";
					emailSubjectGroup.style.display = "none";
					emailMessageGroup.style.display = "none";
					// Clear the values
					document.getElementById("promocode-min-order").value = "";
					document.getElementById("promocode-email-subject").value = "";
					document.getElementById("promocode-email-message").value = "";
				} else {
					// Show email-related fields for other companies' promo codes
					triggerConditionGroup.style.display = "block";
					emailSubjectGroup.style.display = "block";
					emailMessageGroup.style.display = "block";
				}
			}

			// Set up event listener for promo code type change
			document.addEventListener("DOMContentLoaded", function() {
				const promoCodeTypeSelect = document.getElementById("promocode-own-company");
				if (promoCodeTypeSelect) {
					promoCodeTypeSelect.addEventListener("change", togglePromoCodeFields);
				}
			});

			async function deletePromoCode(id) {
				if (!confirm("Are you sure you want to delete this promo code?")) return;

				try {
					const response = await authenticatedFetch(
						`${API_BASE_URL}/market-admin/promocodes/${id}`,
						{
						method: "DELETE",
					});

					const result = await response.json();

					if (result.success) {
						showMessage(result.message, "success");
						loadPromoCodes(true); // Reload both tabs
						loadPromoCodes(false);
					} else {
						showMessage(formatApiError(result, "Failed to delete promo code"), "error");
					}
				} catch (error) {
					console.error("Error deleting promo code:", error);
					showMessage("Failed to delete promo code", "error");
				}
			}

			function closePromoCodeModal() {
				document.getElementById("promocode-modal").style.display = "none";
			}

			// Announcements Management
			async function loadAnnouncements() {
				try {
					showSectionLoading("announcements", true, "Loading announcements...");
					const response = await authenticatedFetch(`${API_BASE_URL}/announcements`);
					const result = await response.json();

					if (result.success) {
						const tbody = document.getElementById("announcements-table-body");
						const countDisplay = document.getElementById("announcements-count-display");

						tbody.innerHTML = "";

						// The market-admin endpoint answers { data: { items, meta } } while the
						// admin one answers { data: { announcements } }. listFrom() handles both,
						// so the table no longer silently renders nothing on the market side.
						const announcements = listFrom(result, "announcements");

						if (announcements.length === 0) {
							tbody.innerHTML = `
								<tr>
									<td colspan="6" class="mdx-3">
										No announcements found. Click "Add Announcement" to create one.
									</td>
								</tr>
							`;
							countDisplay.textContent = "0 announcements";
						} else {
							announcements.forEach((announcement, index) => {
								const createdDate = new Date(announcement.createdAt).toLocaleDateString();
								const statusBadge = announcement.isActive
									? '<span class="status-badge active">Active</span>'
									: '<span class="status-badge inactive">Inactive</span>';

								const tr = document.createElement("tr");
								tr.innerHTML = `
									<td>${index + 1}</td>
									<td>
										<div class="item-info">
											<strong
												onclick="viewAnnouncement('${announcement._id}')"
												onmouseover="this.style.color='#0056b3'"
												onmouseout="this.style.color='#007bff'"
												title="Click to view full announcement" class="mdx-141">${announcement.title}</strong>
										</div>
									</td>
									<td>
										<div
											title="${announcement.description}" class="mdx-273">
											${announcement.description}
										</div>
									</td>
									<td>${statusBadge}</td>
									<td>${createdDate}</td>
									<td>
										<div class="actions">
											<button
												class="btn-action edit"
												onclick="editAnnouncement('${announcement._id}')"
												title="Edit Announcement"
											>
												✏️
											</button>
											<button
												class="btn-action delete"
												onclick="deleteAnnouncement('${announcement._id}')"
												title="Delete Announcement"
											>
												🗑️
											</button>
										</div>
									</td>
								`;
								tbody.appendChild(tr);
							});
							countDisplay.textContent = `${announcements.length} announcement${announcements.length !== 1 ? 's' : ''}`;
						}
					}
					showSectionLoading("announcements", false);
				} catch (error) {
					console.error("Error loading announcements:", error);
					showMessage("Failed to load announcements", "error");
					showSectionLoading("announcements", false);
				}
			}

			function openAnnouncementModal() {
				document.getElementById("announcement-modal-title").textContent = "Add Announcement";
				document.getElementById("announcement-form").reset();
				document.getElementById("announcement-id").value = "";
				document.getElementById("announcement-modal").style.display = "block";
			}

			function closeAnnouncementModal() {
				document.getElementById("announcement-modal").style.display = "none";
			}

			async function editAnnouncement(id) {
				try {
					const response = await authenticatedFetch(`${API_BASE_URL}/announcements/${id}`);
					const result = await response.json();

					if (result.success) {
						// /announcements/:id returns { data: { announcement } } — unwrap it, otherwise
						// every field below reads off the wrapper and comes out undefined.
						const announcement = objectFrom(result, "announcement") || {};
						document.getElementById("announcement-modal-title").textContent = "Edit Announcement";
						document.getElementById("announcement-id").value = announcement._id;
						document.getElementById("announcement-title").value = announcement.title;
						document.getElementById("announcement-description").value = announcement.description;
						document.getElementById("announcement-status").value = announcement.isActive.toString();

						document.getElementById("announcement-modal").style.display = "block";
					}
				} catch (error) {
					console.error("Error fetching announcement:", error);
					showMessage("Failed to fetch announcement details", "error");
				}
			}

			async function saveAnnouncement() {
				try {
					const id = document.getElementById("announcement-id").value;
					const title = document.getElementById("announcement-title").value.trim();
					const description = document.getElementById("announcement-description").value.trim();
					const isActive = document.getElementById("announcement-status").value === "true";

					if (!title || !description) {
						showMessage("Please fill in all required fields", "error");
						return;
					}

					const url = id
						? `${API_BASE_URL}/announcements/${id}`
						: `${API_BASE_URL}/announcements`;

					const method = id ? "PUT" : "POST";

					const response = await authenticatedFetch(url, {
						method,
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							title,
							description,
							isActive
						}),
					});

					const result = await response.json();

					if (result.success) {
						showMessage(result.message, "success");
						closeAnnouncementModal();
						loadAnnouncements();
					} else {
						showMessage(result.message || "Operation failed", "error");
					}
				} catch (error) {
					console.error("Error saving announcement:", error);
					showMessage("Failed to save announcement", "error");
				}
			}

			async function deleteAnnouncement(id) {
				if (!confirm("Are you sure you want to delete this announcement?")) return;

				try {
					const response = await authenticatedFetch(`${API_BASE_URL}/announcements/${id}`, {
						method: "DELETE",
					});

					const result = await response.json();

					if (result.success) {
						showMessage(result.message, "success");
						loadAnnouncements();
					} else {
						showMessage(formatApiError(result, "Failed to delete announcement"), "error");
					}
				} catch (error) {
					console.error("Error deleting announcement:", error);
					showMessage("Failed to delete announcement", "error");
				}
			}

			function viewAnnouncement(id) {
				// For now, just show an alert with the announcement details
				// In a real application, you might open a detailed view modal
				showMessage("View announcement functionality - ID: " + id, "info");
			}

			// ───────────────────── For Kitchens ─────────────────────
			let kitchensData = [];
			let kitchenProducts = [];
			let kitchenProductsFiltered = [];
			let selectedKitchenItemIds = new Set();
			let kitchenCategoriesData = [];
			let kitchenCategoriesLoaded = false;
			let kitchenCategoryCounts = {};

			async function loadKitchens() {
				const tbody = document.getElementById("kitchens-table-body");
				const countEl = document.getElementById("kitchens-count-display");
				if (tbody) {
					tbody.innerHTML =
						'<tr><td colspan="7" class="mdx-274">Loading...</td></tr>';
				}
				try {
					const response = await authenticatedFetch(`${API_BASE_URL}/kitchens`);
					if (!response.ok) {
						const err = await response.json().catch(() => ({}));
						throw new Error(err.message || "Failed to load kitchens");
					}
					const result = await response.json();
					// /kitchens answers { data: { kitchens } }, so result.data is the
					// WRAPPER object and Array.isArray() is always false — the list
					// silently became [] and the table rendered its empty state.
					kitchensData = listFrom(result, "kitchens");
					snapshotKitchenOrder();
					renderKitchens();
					if (countEl) countEl.textContent = `${kitchensData.length} kitchen${kitchensData.length === 1 ? "" : "s"}`;
				} catch (err) {
					console.error("loadKitchens:", err);
					if (tbody) {
						tbody.innerHTML =
							'<tr><td colspan="7" class="mdx-275">Failed to load kitchens.</td></tr>';
					}
					showMessage("Failed to load kitchens: " + err.message, "error");
				}
			}

			function renderKitchens() {
				const tbody = document.getElementById("kitchens-table-body");
				if (!tbody) return;
				if (!kitchensData.length) {
					tbody.innerHTML =
						'<tr><td colspan="7" class="mdx-276">No kitchens found. Click "Add Kitchen" to create one.</td></tr>';
					updateKitchenOrderButtons();
					return;
				}
				tbody.innerHTML = "";
				kitchensData.forEach((k, idx) => {
					const statusBadge = `<span class="status-badge ${k.isActive ? "active" : "inactive"}">${k.isActive ? "Active" : "Inactive"}</span>`;
					const created = k.createdAt ? new Date(k.createdAt).toLocaleDateString() : "—";
					const safeName = (k.name || "").replace(/'/g, "\\'");
					const initial = ((k.name || "?").trim().charAt(0) || "?").toUpperCase();
					const imgCell = k.picture
						? `<img src="${k.picture}" alt="" onerror="this.outerHTML='<div class=&quot;mdx-277&quot;>${initial}</div>'" />`
						: `<div class="mdx-278">${initial}</div>`;
					const row = document.createElement("tr");
					row.dataset.kitchenId = String(k._id);
					row.innerHTML = `
						<td>
							<input type="number" min="1" step="1" value="${idx + 1}"
							 class="kitchen-order-input mdx-279"
								data-kitchen-id="${k._id}"
								onchange="applyKitchenOrderChange('${k._id}', this)"
								onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
							 >
						</td>
						<td>${imgCell}</td>
						<td><strong>${k.name || "—"}</strong></td>
						<td>${k.category && k.category.name ? `<span class="status-badge mdx-280">${String(k.category.name).replace(/</g, "&lt;")}</span>` : '<span class="mdx-118">—</span>'}</td>
						<td>${statusBadge}</td>
						<td>${created}</td>
						<td>
							<div class="action-buttons">
								<button class="action-btn view" onclick="openKitchenViewModal('${k._id}')">View</button>
								<button class="action-btn edit" onclick="openKitchenModal('${k._id}')">Edit</button>
								<button class="action-btn delete" onclick="deleteKitchen('${k._id}', '${safeName}')">Delete</button>
							</div>
						</td>
					`;
					tbody.appendChild(row);
				});
				updateKitchenOrderButtons();
			}

			// === Kitchen ordering via numeric inputs ===
			let originalKitchenOrder = [];

			function snapshotKitchenOrder() {
				originalKitchenOrder = kitchensData.map((k) => String(k._id));
			}

			function currentKitchenOrder() {
				return kitchensData.map((k) => String(k._id));
			}

			function kitchenOrderDirty() {
				const cur = currentKitchenOrder();
				if (cur.length !== originalKitchenOrder.length) return true;
				for (let i = 0; i < cur.length; i++) {
					if (cur[i] !== originalKitchenOrder[i]) return true;
				}
				return false;
			}

			function updateKitchenOrderButtons() {
				const saveBtn = document.getElementById("kitchens-save-order-btn");
				const undoBtn = document.getElementById("kitchens-reset-order-btn");
				const dirty = kitchenOrderDirty();
				[saveBtn, undoBtn].forEach((b) => {
					if (!b) return;
					b.disabled = !dirty;
					b.style.opacity = dirty ? "1" : ".55";
					b.style.cursor = dirty ? "pointer" : "not-allowed";
				});
			}

			function applyKitchenOrderChange(id, inputEl) {
				const from = kitchensData.findIndex((k) => String(k._id) === String(id));
				if (from < 0) return;
				let raw = parseInt(inputEl.value, 10);
				if (!Number.isFinite(raw)) raw = from + 1;
				let to = Math.max(1, Math.min(kitchensData.length, raw)) - 1;
				if (to === from) {
					inputEl.value = String(from + 1);
					return;
				}
				const [moved] = kitchensData.splice(from, 1);
				kitchensData.splice(to, 0, moved);
				renderKitchens();
				setTimeout(() => {
					const nextInput = document.querySelector(
						`.kitchen-order-input[data-kitchen-id="${id}"]`
					);
					if (nextInput) { nextInput.focus(); nextInput.select(); }
				}, 0);
			}

			function resetKitchenOrder() {
				if (!originalKitchenOrder.length) return;
				const byId = new Map(kitchensData.map((k) => [String(k._id), k]));
				kitchensData = originalKitchenOrder.map((id) => byId.get(id)).filter(Boolean);
				renderKitchens();
			}

			async function saveKitchenOrder() {
				if (!kitchenOrderDirty()) return;
				const saveBtn = document.getElementById("kitchens-save-order-btn");
				const order = currentKitchenOrder();
				try {
					if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }
					const response = await authenticatedFetch(`${API_BASE_URL}/kitchens/reorder`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ order }),
					});
					if (!response.ok) {
						const err = await response.json().catch(() => ({}));
						throw new Error(err.message || `HTTP ${response.status}`);
					}
					const result = await response.json();
					showMessage(result.message || "Kitchen order saved", "success");
					snapshotKitchenOrder();
					updateKitchenOrderButtons();
				} catch (err) {
					console.error("saveKitchenOrder:", err);
					showMessage("Failed to save order: " + err.message, "error");
				} finally {
					if (saveBtn) saveBtn.textContent = "💾 Save order";
					updateKitchenOrderButtons();
				}
			}

			let currentKitchenViewId = null;

			function openKitchenViewModal(id) {
				const modal = document.getElementById("kitchen-view-modal");
				const body = document.getElementById("kitchen-view-body");
				const titleEl = document.getElementById("kitchen-view-title");
				if (!modal || !body) return;
				const k = kitchensData.find((x) => String(x._id) === String(id));
				if (!k) {
					showMessage("Kitchen not found", "error");
					return;
				}
				currentKitchenViewId = String(k._id);
				const items = Array.isArray(k.items) ? k.items : [];
				const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
				const initial = ((k.name || "?").trim().charAt(0) || "?").toUpperCase();
				const statusBadge = `<span class="status-badge ${k.isActive ? "active" : "inactive"}">${k.isActive ? "Active" : "Inactive"}</span>`;
				const created = k.createdAt ? new Date(k.createdAt).toLocaleString() : "—";
				const updated = k.updatedAt ? new Date(k.updatedAt).toLocaleString() : "—";
				const picture = k.picture
					? `<img src="${esc(k.picture)}" alt=""  class="mdx-281">`
					: `<div class="mdx-282">${esc(initial)}</div>`;

				const itemsList = items.length
					? items.map((it, i) => {
							const nm = it && it.name ? it.name : "—";
							const img = it && (it.picture || it.image || (Array.isArray(it.images) ? it.images[0] : "")) || "";
							const letter = (String(nm).trim().charAt(0) || "?").toUpperCase();
							const thumb = img
								? `<img src="${esc(img)}" alt=""  class="mdx-283">`
								: `<div class="mdx-284">${esc(letter)}</div>`;
							const meta = [
								it && it.barcode ? `<span>${esc(it.barcode)}</span>` : "",
								it && (it.stock !== undefined && it.stock !== null) ? `<span>Stock: ${esc(it.stock)}</span>` : "",
							].filter(Boolean).join(' <span class="mdx-285">•</span> ');
							return `
								<div class="mdx-286">
									<span class="mdx-287">${i + 1}.</span>
									${thumb}
									<div class="mdx-288">
										<div class="mdx-289">${esc(nm)}</div>
										${meta ? `<div class="mdx-95">${meta}</div>` : ""}
									</div>
								</div>`;
						}).join("")
					: `<div class="mdx-115">No items in this kitchen.</div>`;

				if (titleEl) titleEl.textContent = k.name ? `Kitchen — ${k.name}` : "Kitchen details";
				body.innerHTML = `
					<div class="mdx-290">
						${picture}
						<div class="mdx-291">
							<div class="mdx-292">${esc(k.name || "—")}</div>
							<div class="mdx-293">${statusBadge}</div>
							<div class="mdx-294">
								<div class="mdx-295">Category</div><div>${k.category && k.category.name ? esc(k.category.name) : "—"}</div>
								<div class="mdx-295">Items</div><div><strong>${items.length}</strong></div>
								<div class="mdx-295">Created</div><div>${esc(created)}</div>
								<div class="mdx-295">Updated</div><div>${esc(updated)}</div>
								<div class="mdx-295">ID</div><div class="mdx-296">${esc(k._id)}</div>
							</div>
						</div>
					</div>
					<div class="mdx-297">
						<div class="mdx-298">
							<span>Items in this kitchen</span>
							<span class="mdx-299">${items.length} total</span>
						</div>
						<div class="mdx-300">${itemsList}</div>
					</div>
				`;
				modal.style.display = "block";
				modal.scrollTop = 0;
				const mc = modal.querySelector(".modal-content");
				if (mc) mc.scrollTop = 0;
			}

			function closeKitchenViewModal() {
				const modal = document.getElementById("kitchen-view-modal");
				if (modal) modal.style.display = "none";
				currentKitchenViewId = null;
			}

			function editFromKitchenView() {
				const id = currentKitchenViewId;
				closeKitchenViewModal();
				if (id) openKitchenModal(id);
			}

			async function openKitchenModal(id) {
				const modal = document.getElementById("kitchen-modal");
				const title = document.getElementById("kitchen-modal-title");
				const form = document.getElementById("kitchen-form");
				const idInput = document.getElementById("kitchen-id");
				const statusSelect = document.getElementById("kitchen-status");
				const searchInput = document.getElementById("kitchen-items-search");
				if (!modal) return;

				form.reset();
				idInput.value = "";
				selectedKitchenItemIds = new Set();
				if (searchInput) searchInput.value = "";
				kitchenSearchQuery = "";
				const clearBtn = document.getElementById("kitchen-search-clear");
				if (clearBtn) clearBtn.style.display = "none";
				setKitchenPicture("", "");

				// Populate the kitchen category dropdown (loading categories if needed).
				await ensureKitchenCategoriesLoaded();
				const editingKitchenForCat = id
					? kitchensData.find((x) => String(x._id) === String(id))
					: null;
				populateKitchenCategoryDropdown(
					editingKitchenForCat && editingKitchenForCat.category
						? editingKitchenForCat.category._id || editingKitchenForCat.category
						: "",
				);

				if (id) {
					title.textContent = "Edit Kitchen";
					const k = kitchensData.find((x) => String(x._id) === String(id));
					if (k) {
						idInput.value = k._id;
						document.getElementById("kitchen-name").value = k.name || "";
						statusSelect.value = k.isActive ? "true" : "false";
						selectedKitchenItemIds = new Set(
							(k.items || [])
								.map((it) => (it && it._id ? String(it._id) : String(it)))
								.filter(Boolean),
						);
						setKitchenPicture(k.picture || "", k.picturePublicId || "");
					}
				} else {
					title.textContent = "Add Kitchen";
					statusSelect.value = "true";
				}

				modal.style.display = "block";
				modal.scrollTop = 0;
				const mc = modal.querySelector(".modal-content");
				if (mc) mc.scrollTop = 0;

				await loadKitchenSelectableProducts();
			}

			function closeKitchenModal() {
				const modal = document.getElementById("kitchen-modal");
				if (modal) modal.style.display = "none";
			}

			let kitchenTab = "browse";

			async function loadKitchenSelectableProducts() {
				try {
					const response = await authenticatedFetch(
						`${API_BASE_URL}/kitchens/selectable-products`,
					);
					if (!response.ok) {
						const err = await response.json().catch(() => ({}));
						throw new Error(err.message || "Failed to load products");
					}
					const result = await response.json();
					// /kitchens/selectable-products answers { data: { products } }, so result.data is the
					// WRAPPER object and Array.isArray() is always false — the list
					// silently became [] and the table rendered its empty state.
					kitchenProducts = listFrom(result, "products");

					const presentIds = new Set(kitchenProducts.map((p) => String(p._id)));
					if (selectedKitchenItemIds.size) {
						const editingKitchen = (() => {
							const id = document.getElementById("kitchen-id").value;
							return id ? kitchensData.find((x) => String(x._id) === String(id)) : null;
						})();
						const extras = [];
						if (editingKitchen && Array.isArray(editingKitchen.items)) {
							editingKitchen.items.forEach((it) => {
								const itId = it && it._id ? String(it._id) : String(it);
								if (selectedKitchenItemIds.has(itId) && !presentIds.has(itId) && it && it.name) {
									extras.push({
										_id: itId,
										name: it.name,
										picture: it.picture || it.image || (Array.isArray(it.images) ? it.images[0] : ""),
										barcode: it.barcode || "",
										stock: it.stock,
										isActive: it.isActive,
										__unavailable: true,
									});
								}
							});
						}
						if (extras.length) kitchenProducts = extras.concat(kitchenProducts);
					}

					kitchenTab = "browse";
					updateKitchenTabs();
					renderKitchenList();
					updateKitchenCounts();
				} catch (err) {
					console.error("loadKitchenSelectableProducts:", err);
					const listEl = document.getElementById("kitchen-items-list");
					if (listEl) listEl.innerHTML = '<div class="mdx-301">Failed to load products.</div>';
				}
			}

			function kitchenProductImage(p) {
				const src =
					p.picture ||
					p.image ||
					(Array.isArray(p.images) && p.images[0]) ||
					"";
				return src || "";
			}

			let kitchenSearchQuery = "";

			function runKitchenSearch() {
				const input = document.getElementById("kitchen-items-search");
				kitchenSearchQuery = (input ? input.value : "").trim().toLowerCase();
				const clearBtn = document.getElementById("kitchen-search-clear");
				if (clearBtn) clearBtn.style.display = kitchenSearchQuery ? "inline-block" : "none";
				renderKitchenList();
			}

			function clearKitchenSearch() {
				kitchenSearchQuery = "";
				const input = document.getElementById("kitchen-items-search");
				if (input) input.value = "";
				const clearBtn = document.getElementById("kitchen-search-clear");
				if (clearBtn) clearBtn.style.display = "none";
				renderKitchenList();
			}

			function setKitchenTab(tab) {
				kitchenTab = tab;
				updateKitchenTabs();
				renderKitchenList();
			}

			function updateKitchenTabs() {
				const browseBtn = document.getElementById("kitchen-tab-browse");
				const selectedBtn = document.getElementById("kitchen-tab-selected");
				if (!browseBtn || !selectedBtn) return;
				const active = "background:#fff;color:#111;padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.04);border:none;";
				const inactive = "background:transparent;color:#566275;padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;";
				browseBtn.style.cssText = kitchenTab === "browse" ? active : inactive;
				selectedBtn.style.cssText = kitchenTab === "selected" ? active : inactive;
			}

			function updateKitchenCounts() {
				const n = selectedKitchenItemIds.size;
				const footerCount = document.getElementById("kitchen-items-selected-count");
				const tabCount = document.getElementById("kitchen-tab-selected-count");
				const clearBtn = document.getElementById("kitchen-clear-all");
				if (footerCount) footerCount.textContent = String(n);
				if (tabCount) tabCount.textContent = String(n);
				if (clearBtn) clearBtn.style.display = n ? "inline-block" : "none";
			}

			function renderKitchenList() {
				const listEl = document.getElementById("kitchen-items-list");
				if (!listEl) return;
				const q = kitchenSearchQuery;

				let source = kitchenProducts;
				if (kitchenTab === "selected") {
					source = kitchenProducts.filter((p) => selectedKitchenItemIds.has(String(p._id)));
				}
				const items = q
					? source.filter((p) =>
							(p.name && p.name.toLowerCase().includes(q)) ||
							(p.barcode && String(p.barcode).toLowerCase().includes(q))
					  )
					: source;

				if (!items.length) {
					const empty = kitchenTab === "selected"
						? (q ? "No selected items match your search." : "No items selected yet. Switch to Browse to add products.")
						: (q ? "No products match your search." : "No products available.");
					listEl.innerHTML = `<div class="mdx-302">${empty}</div>`;
					return;
				}

				const MAX_ROWS = 200;
				const slice = items.slice(0, MAX_ROWS);

				listEl.innerHTML = slice.map((p) => {
					const id = String(p._id);
					const selected = selectedKitchenItemIds.has(id);
					const nameEsc = (p.name || "Unnamed").replace(/</g, "&lt;");
					const img = kitchenProductImage(p);
					const initial = (nameEsc.trim().charAt(0) || "?").toUpperCase();
					const thumb = img
						? `<img src="${img}" alt="" loading="lazy" class="mdx-303" onerror="this.outerHTML='<div class=&quot;mdx-304&quot;>${initial}</div>'" />`
						: `<div class="mdx-304">${initial}</div>`;
					const meta = [
						p.barcode ? `<span>${String(p.barcode).replace(/</g,"&lt;")}</span>` : "",
						(p.stock !== undefined && p.stock !== null) ? `<span>Stock: ${p.stock}</span>` : "",
						p.__unavailable ? '<span class="mdx-305">unavailable</span>' : ""
					].filter(Boolean).join(' <span class="mdx-285">•</span> ');
					const rowBg = selected ? "background:#f0fdf4;" : "background:#fff;";
					const btn = selected
						? `<button type="button" onclick="toggleKitchenItem('${id}')" class="mdx-306">✓ Added</button>`
						: `<button type="button" onclick="toggleKitchenItem('${id}')" class="mdx-307">+ Add</button>`;
					return `
						<div class="mdx-308">
							${thumb}
							<div class="mdx-288">
								<div class="mdx-309">${nameEsc}</div>
								${meta ? `<div class="mdx-95">${meta}</div>` : ""}
							</div>
							${btn}
						</div>`;
				}).join("") + (items.length > MAX_ROWS
					? `<div class="mdx-310">Showing first ${MAX_ROWS} of ${items.length}. Refine your search to see more.</div>`
					: "");
			}

			function toggleKitchenItem(id) {
				const key = String(id);
				if (selectedKitchenItemIds.has(key)) selectedKitchenItemIds.delete(key);
				else selectedKitchenItemIds.add(key);
				updateKitchenCounts();
				renderKitchenList();
			}

			function clearAllKitchenItems() {
				if (!selectedKitchenItemIds.size) return;
				if (!confirm("Remove all selected items from this kitchen?")) return;
				selectedKitchenItemIds.clear();
				updateKitchenCounts();
				renderKitchenList();
			}

			function setKitchenPicture(url, publicId) {
				const urlInput = document.getElementById("kitchen-picture-url");
				const pidInput = document.getElementById("kitchen-picture-public-id");
				const preview = document.getElementById("kitchen-picture-preview");
				const removeBtn = document.getElementById("kitchen-picture-remove");
				const status = document.getElementById("kitchen-picture-status");
				const fileInput = document.getElementById("kitchen-picture-file");
				if (urlInput) urlInput.value = url || "";
				if (pidInput) pidInput.value = publicId || "";
				if (fileInput) fileInput.value = "";
				if (preview) {
					if (url) {
						preview.innerHTML = `<img src="${url}" alt=""  class="mdx-311">`;
					} else {
						preview.textContent = "📷";
					}
				}
				if (removeBtn) removeBtn.style.display = url ? "inline-block" : "none";
				if (status) status.textContent = url ? "" : "No image selected";
			}

			function removeKitchenPicture() {
				setKitchenPicture("", "");
			}

			async function uploadKitchenPicture(input) {
				let file = null;
				if (input && input.files && input.files[0]) file = input.files[0];
				else if (input instanceof File) file = input;
				if (!file) return;
				if (!file.type.startsWith("image/")) {
					showMessage("Please choose an image file", "error");
					if (input && input.value !== undefined) input.value = "";
					return;
				}
				if (file.size > 5 * 1024 * 1024) {
					showMessage("Image must be 5MB or less", "error");
					if (input && input.value !== undefined) input.value = "";
					return;
				}
				const status = document.getElementById("kitchen-picture-status");
				if (status) status.textContent = "Uploading…";
				try {
					const fd = new FormData();
					fd.append("image", file);
					const res = await authenticatedFetch(`${API_BASE_URL}/kitchens/upload-image`, {
						method: "POST",
						body: fd,
					});
					if (!res.ok) {
						const err = await res.json().catch(() => ({}));
						throw new Error(err.message || `HTTP ${res.status}`);
					}
					const result = await res.json();
					const data = result.data || result;
					setKitchenPicture(data.url || data.secure_url || "", data.public_id || "");
					if (status) status.textContent = "Image ready";
				} catch (err) {
					console.error("uploadKitchenPicture:", err);
					showMessage("Failed to upload image: " + err.message, "error");
					if (status) status.textContent = "Upload failed";
					if (input && input.value !== undefined) input.value = "";
				}
			}

			function handleKitchenPictureDragOver(e) {
				e.preventDefault();
				e.stopPropagation();
				if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
				const dz = document.getElementById("kitchen-picture-dropzone");
				if (dz) {
					dz.style.background = "#eef6ff";
					dz.style.borderColor = "#3b82f6";
				}
			}

			function handleKitchenPictureDragLeave(e) {
				e.preventDefault();
				e.stopPropagation();
				const dz = document.getElementById("kitchen-picture-dropzone");
				if (!dz) return;
				if (e.relatedTarget && dz.contains(e.relatedTarget)) return;
				dz.style.background = "#fafbfc";
				dz.style.borderColor = "#d6dbe2";
			}

			function handleKitchenPictureDrop(e) {
				e.preventDefault();
				e.stopPropagation();
				const dz = document.getElementById("kitchen-picture-dropzone");
				if (dz) {
					dz.style.background = "#fafbfc";
					dz.style.borderColor = "#d6dbe2";
				}
				const dt = e.dataTransfer;
				if (!dt) return;
				let file = null;
				if (dt.files && dt.files.length) {
					file = dt.files[0];
				} else if (dt.items && dt.items.length) {
					for (let i = 0; i < dt.items.length; i++) {
						const it = dt.items[i];
						if (it.kind === "file") { file = it.getAsFile(); break; }
					}
				}
				if (!file) {
					showMessage("Please drop an image file", "error");
					return;
				}
				uploadKitchenPicture(file);
			}

			async function saveKitchen() {
				const idInput = document.getElementById("kitchen-id");
				const nameInput = document.getElementById("kitchen-name");
				const statusSelect = document.getElementById("kitchen-status");
				const id = idInput.value || "";
				const name = (nameInput.value || "").trim();
				if (!name) {
					showMessage("Please enter a kitchen name", "error");
					return;
				}
				const categorySelect = document.getElementById("kitchen-category");
				const category = categorySelect ? categorySelect.value : "";
				if (!category) {
					showMessage("Please select a kitchen category", "error");
					if (categorySelect) categorySelect.focus();
					return;
				}
				const pictureUrl = (document.getElementById("kitchen-picture-url") || {}).value || "";
				const picturePid = (document.getElementById("kitchen-picture-public-id") || {}).value || "";
				const payload = {
					name,
					category,
					isActive: statusSelect.value === "true",
					items: Array.from(selectedKitchenItemIds),
					picture: pictureUrl,
					picturePublicId: picturePid,
				};
				try {
					const url = id
						? `${API_BASE_URL}/kitchens/${id}`
						: `${API_BASE_URL}/kitchens`;
					const method = id ? "PUT" : "POST";
					const response = await authenticatedFetch(url, {
						method,
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
					});
					if (!response.ok) {
						const err = await response.json().catch(() => ({}));
						throw new Error(err.message || `HTTP ${response.status}`);
					}
					const result = await response.json();
					showMessage(result.message || "Kitchen saved", "success");
					closeKitchenModal();
					await loadKitchens();
				} catch (err) {
					console.error("saveKitchen:", err);
					showMessage("Failed to save kitchen: " + err.message, "error");
				}
			}

			async function deleteKitchen(id, name) {
				if (!confirm(`Delete kitchen "${name}"?`)) return;
				try {
					const response = await authenticatedFetch(
						`${API_BASE_URL}/kitchens/${id}`,
						{ method: "DELETE" },
					);
					if (!response.ok) {
						const err = await response.json().catch(() => ({}));
						throw new Error(err.message || `HTTP ${response.status}`);
					}
					showMessage("Kitchen deleted", "success");
					await loadKitchens();
				} catch (err) {
					console.error("deleteKitchen:", err);
					showMessage("Failed to delete kitchen: " + err.message, "error");
				}
			}

			// ============================================================
			//  Kitchen Categories
			// ============================================================

			// Make sure the category list is cached so the kitchen modal dropdown
			// can be filled without first visiting the Kitchen Categories section.
			async function ensureKitchenCategoriesLoaded() {
				if (kitchenCategoriesLoaded) return;
				try {
					const response = await authenticatedFetch(`${API_BASE_URL}/kitchen-categories`);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const result = await response.json();
					// /kitchen-categories answers { data: { categories } }, so result.data is the
					// WRAPPER object and Array.isArray() is always false — the list
					// silently became [] and the table rendered its empty state.
					kitchenCategoriesData = listFrom(result, "categories");
					kitchenCategoriesLoaded = true;
				} catch (err) {
					console.error("ensureKitchenCategoriesLoaded:", err);
				}
			}

			// Fill the kitchen modal's category <select> from the cached categories.
			function populateKitchenCategoryDropdown(selectedId) {
				const select = document.getElementById("kitchen-category");
				const hint = document.getElementById("kitchen-category-hint");
				if (!select) return;
				const sel = selectedId ? String(selectedId) : "";
				let options = (kitchenCategoriesData || []).filter((c) => c.isActive !== false);
				// Keep a currently-assigned (possibly inactive) category selectable.
				if (sel && !options.some((c) => String(c._id) === sel)) {
					const found = (kitchenCategoriesData || []).find((c) => String(c._id) === sel);
					if (found) options = [found].concat(options);
				}
				select.innerHTML =
					'<option value="">Select a category…</option>' +
					options
						.map((c) => {
							const name = (c.name || "Unnamed").replace(/</g, "&lt;");
							const inactive = c.isActive === false ? " (inactive)" : "";
							return `<option value="${c._id}">${name}${inactive}</option>`;
						})
						.join("");
				select.value = sel;
				if (hint) hint.style.display = options.length ? "none" : "block";
			}

			// Count how many kitchens use each category (best-effort, for display).
			async function loadKitchenCategoryCounts() {
				try {
					const res = await authenticatedFetch(`${API_BASE_URL}/kitchens`);
					if (!res.ok) return;
					const result = await res.json();
					// /kitchens answers { data: { kitchens } }, so result.data is the
					// WRAPPER object and Array.isArray() is always false — the list
					// silently became [] and the table rendered its empty state.
					const list = listFrom(result, "kitchens");
					const map = {};
					list.forEach((k) => {
						if (k.category) {
							const id = String(k.category._id || k.category);
							map[id] = (map[id] || 0) + 1;
						}
					});
					kitchenCategoryCounts = map;
				} catch (e) {
					/* non-fatal */
				}
			}

			async function loadKitchenCategories() {
				const tbody = document.getElementById("kitchen-categories-table-body");
				const countEl = document.getElementById("kitchen-categories-count-display");
				if (tbody) {
					tbody.innerHTML =
						'<tr><td colspan="7" class="mdx-274">Loading...</td></tr>';
				}
				try {
					const response = await authenticatedFetch(`${API_BASE_URL}/kitchen-categories`);
					if (!response.ok) {
						const err = await response.json().catch(() => ({}));
						throw new Error(err.message || "Failed to load categories");
					}
					const result = await response.json();
					// /kitchen-categories answers { data: { categories } }, so result.data is the
					// WRAPPER object and Array.isArray() is always false — the list
					// silently became [] and the table rendered its empty state.
					kitchenCategoriesData = listFrom(result, "categories");
					kitchenCategoriesLoaded = true;
					await loadKitchenCategoryCounts();
					snapshotKitchenCategoryOrder();
					renderKitchenCategories();
					if (countEl)
						countEl.textContent = `${kitchenCategoriesData.length} categor${kitchenCategoriesData.length === 1 ? "y" : "ies"}`;
				} catch (err) {
					console.error("loadKitchenCategories:", err);
					if (tbody) {
						tbody.innerHTML =
							'<tr><td colspan="7" class="mdx-275">Failed to load categories.</td></tr>';
					}
					showMessage("Failed to load kitchen categories: " + err.message, "error");
				}
			}

			function renderKitchenCategories() {
				const tbody = document.getElementById("kitchen-categories-table-body");
				if (!tbody) return;
				if (!kitchenCategoriesData.length) {
					tbody.innerHTML =
						'<tr><td colspan="7" class="mdx-276">No categories found. Click "Add Category" to create one.</td></tr>';
					updateKitchenCategoryOrderButtons();
					return;
				}
				tbody.innerHTML = "";
				kitchenCategoriesData.forEach((c, idx) => {
					const statusBadge = `<span class="status-badge ${c.isActive ? "active" : "inactive"}">${c.isActive ? "Active" : "Inactive"}</span>`;
					const created = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—";
					const safeName = (c.name || "").replace(/'/g, "\\'");
					const initial = ((c.name || "?").trim().charAt(0) || "?").toUpperCase();
					const imgCell = c.picture
						? `<img src="${c.picture}" alt="" onerror="this.outerHTML='<div class=&quot;mdx-277&quot;>${initial}</div>'" />`
						: `<div class="mdx-278">${initial}</div>`;
					const kCount = kitchenCategoryCounts[String(c._id)] || 0;
					const row = document.createElement("tr");
					row.dataset.kitchenCategoryId = String(c._id);
					row.innerHTML = `
						<td>
							<input type="number" min="1" step="1" value="${idx + 1}"
							 class="kitchen-category-order-input mdx-279"
								data-kitchen-category-id="${c._id}"
								onchange="applyKitchenCategoryOrderChange('${c._id}', this)"
								onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
							 >
						</td>
						<td>${imgCell}</td>
						<td><strong>${c.name || "—"}</strong></td>
						<td>${kCount}</td>
						<td>${statusBadge}</td>
						<td>${created}</td>
						<td>
							<div class="action-buttons">
								<button class="action-btn edit" onclick="openKitchenCategoryModal('${c._id}')">Edit</button>
								<button class="action-btn delete" onclick="deleteKitchenCategory('${c._id}', '${safeName}')">Delete</button>
							</div>
						</td>
					`;
					tbody.appendChild(row);
				});
				updateKitchenCategoryOrderButtons();
			}

			// === Kitchen category ordering via numeric inputs ===
			let originalKitchenCategoryOrder = [];

			function snapshotKitchenCategoryOrder() {
				originalKitchenCategoryOrder = kitchenCategoriesData.map((c) => String(c._id));
			}

			function currentKitchenCategoryOrder() {
				return kitchenCategoriesData.map((c) => String(c._id));
			}

			function kitchenCategoryOrderDirty() {
				const cur = currentKitchenCategoryOrder();
				if (cur.length !== originalKitchenCategoryOrder.length) return true;
				for (let i = 0; i < cur.length; i++) {
					if (cur[i] !== originalKitchenCategoryOrder[i]) return true;
				}
				return false;
			}

			function updateKitchenCategoryOrderButtons() {
				const saveBtn = document.getElementById("kitchen-categories-save-order-btn");
				const undoBtn = document.getElementById("kitchen-categories-reset-order-btn");
				const dirty = kitchenCategoryOrderDirty();
				[saveBtn, undoBtn].forEach((b) => {
					if (!b) return;
					b.disabled = !dirty;
					b.style.opacity = dirty ? "1" : ".55";
					b.style.cursor = dirty ? "pointer" : "not-allowed";
				});
			}

			function applyKitchenCategoryOrderChange(id, inputEl) {
				const from = kitchenCategoriesData.findIndex((c) => String(c._id) === String(id));
				if (from < 0) return;
				let raw = parseInt(inputEl.value, 10);
				if (!Number.isFinite(raw)) raw = from + 1;
				let to = Math.max(1, Math.min(kitchenCategoriesData.length, raw)) - 1;
				if (to === from) {
					inputEl.value = String(from + 1);
					return;
				}
				const [moved] = kitchenCategoriesData.splice(from, 1);
				kitchenCategoriesData.splice(to, 0, moved);
				renderKitchenCategories();
				setTimeout(() => {
					const nextInput = document.querySelector(
						`.kitchen-category-order-input[data-kitchen-category-id="${id}"]`
					);
					if (nextInput) { nextInput.focus(); nextInput.select(); }
				}, 0);
			}

			function resetKitchenCategoryOrder() {
				if (!originalKitchenCategoryOrder.length) return;
				const byId = new Map(kitchenCategoriesData.map((c) => [String(c._id), c]));
				kitchenCategoriesData = originalKitchenCategoryOrder.map((id) => byId.get(id)).filter(Boolean);
				renderKitchenCategories();
			}

			async function saveKitchenCategoryOrder() {
				if (!kitchenCategoryOrderDirty()) return;
				const saveBtn = document.getElementById("kitchen-categories-save-order-btn");
				const order = currentKitchenCategoryOrder();
				try {
					if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }
					const response = await authenticatedFetch(`${API_BASE_URL}/kitchen-categories/reorder`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ order }),
					});
					if (!response.ok) {
						const err = await response.json().catch(() => ({}));
						throw new Error(err.message || `HTTP ${response.status}`);
					}
					const result = await response.json();
					showMessage(result.message || "Category order saved", "success");
					snapshotKitchenCategoryOrder();
					updateKitchenCategoryOrderButtons();
				} catch (err) {
					console.error("saveKitchenCategoryOrder:", err);
					showMessage("Failed to save order: " + err.message, "error");
				} finally {
					if (saveBtn) saveBtn.textContent = "💾 Save order";
					updateKitchenCategoryOrderButtons();
				}
			}

			function openKitchenCategoryModal(id) {
				const modal = document.getElementById("kitchen-category-modal");
				const title = document.getElementById("kitchen-category-modal-title");
				const form = document.getElementById("kitchen-category-form");
				const idInput = document.getElementById("kitchen-category-id");
				const statusSelect = document.getElementById("kitchen-category-status");
				const descInput = document.getElementById("kitchen-category-description");
				if (!modal) return;

				form.reset();
				idInput.value = "";
				setKitchenCategoryPicture("", "");

				if (id) {
					title.textContent = "Edit Category";
					const c = kitchenCategoriesData.find((x) => String(x._id) === String(id));
					if (c) {
						idInput.value = c._id;
						document.getElementById("kitchen-category-name").value = c.name || "";
						statusSelect.value = c.isActive ? "true" : "false";
						if (descInput) descInput.value = c.description || "";
						setKitchenCategoryPicture(c.picture || "", c.picturePublicId || "");
					}
				} else {
					title.textContent = "Add Category";
					statusSelect.value = "true";
				}

				modal.style.display = "block";
				modal.scrollTop = 0;
				const mc = modal.querySelector(".modal-content");
				if (mc) mc.scrollTop = 0;
			}

			function closeKitchenCategoryModal() {
				const modal = document.getElementById("kitchen-category-modal");
				if (modal) modal.style.display = "none";
			}

			async function saveKitchenCategory() {
				const idInput = document.getElementById("kitchen-category-id");
				const nameInput = document.getElementById("kitchen-category-name");
				const statusSelect = document.getElementById("kitchen-category-status");
				const descInput = document.getElementById("kitchen-category-description");
				const id = idInput.value || "";
				const name = (nameInput.value || "").trim();
				if (!name) {
					showMessage("Please enter a category name", "error");
					return;
				}
				const payload = {
					name,
					description: descInput ? (descInput.value || "").trim() : "",
					isActive: statusSelect.value === "true",
					picture: (document.getElementById("kitchen-category-picture-url") || {}).value || "",
					picturePublicId: (document.getElementById("kitchen-category-picture-public-id") || {}).value || "",
				};
				try {
					const url = id
						? `${API_BASE_URL}/kitchen-categories/${id}`
						: `${API_BASE_URL}/kitchen-categories`;
					const method = id ? "PUT" : "POST";
					const response = await authenticatedFetch(url, {
						method,
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
					});
					if (!response.ok) {
						const err = await response.json().catch(() => ({}));
						throw new Error(err.message || `HTTP ${response.status}`);
					}
					const result = await response.json();
					showMessage(result.message || "Category saved", "success");
					closeKitchenCategoryModal();
					await loadKitchenCategories();
				} catch (err) {
					console.error("saveKitchenCategory:", err);
					showMessage("Failed to save category: " + err.message, "error");
				}
			}

			async function deleteKitchenCategory(id, name) {
				if (!confirm(`Delete category "${name}"? Kitchens using it will be left without a category.`)) return;
				try {
					const response = await authenticatedFetch(
						`${API_BASE_URL}/kitchen-categories/${id}`,
						{ method: "DELETE" },
					);
					if (!response.ok) {
						const err = await response.json().catch(() => ({}));
						throw new Error(err.message || `HTTP ${response.status}`);
					}
					showMessage("Category deleted", "success");
					kitchenCategoriesLoaded = false;
					await loadKitchenCategories();
				} catch (err) {
					console.error("deleteKitchenCategory:", err);
					showMessage("Failed to delete category: " + err.message, "error");
				}
			}

			// === Kitchen category image upload ===
			function setKitchenCategoryPicture(url, publicId) {
				const urlInput = document.getElementById("kitchen-category-picture-url");
				const pidInput = document.getElementById("kitchen-category-picture-public-id");
				const preview = document.getElementById("kitchen-category-picture-preview");
				const removeBtn = document.getElementById("kitchen-category-picture-remove");
				const status = document.getElementById("kitchen-category-picture-status");
				const fileInput = document.getElementById("kitchen-category-picture-file");
				if (urlInput) urlInput.value = url || "";
				if (pidInput) pidInput.value = publicId || "";
				if (fileInput) fileInput.value = "";
				if (preview) {
					if (url) preview.innerHTML = `<img src="${url}" alt=""  class="mdx-311">`;
					else preview.textContent = "📷";
				}
				if (removeBtn) removeBtn.style.display = url ? "inline-block" : "none";
				if (status) status.textContent = url ? "" : "No image selected";
			}

			function removeKitchenCategoryPicture() {
				setKitchenCategoryPicture("", "");
			}

			async function uploadKitchenCategoryPicture(input) {
				let file = null;
				if (input && input.files && input.files[0]) file = input.files[0];
				else if (input instanceof File) file = input;
				if (!file) return;
				if (!file.type.startsWith("image/")) {
					showMessage("Please choose an image file", "error");
					if (input && input.value !== undefined) input.value = "";
					return;
				}
				if (file.size > 5 * 1024 * 1024) {
					showMessage("Image must be 5MB or less", "error");
					if (input && input.value !== undefined) input.value = "";
					return;
				}
				const status = document.getElementById("kitchen-category-picture-status");
				if (status) status.textContent = "Uploading…";
				try {
					const fd = new FormData();
					fd.append("image", file);
					const res = await authenticatedFetch(`${API_BASE_URL}/kitchen-categories/upload-image`, {
						method: "POST",
						body: fd,
					});
					if (!res.ok) {
						const err = await res.json().catch(() => ({}));
						throw new Error(err.message || `HTTP ${res.status}`);
					}
					const result = await res.json();
					const data = result.data || result;
					setKitchenCategoryPicture(data.url || data.secure_url || "", data.public_id || "");
					if (status) status.textContent = "Image ready";
				} catch (err) {
					console.error("uploadKitchenCategoryPicture:", err);
					showMessage("Failed to upload image: " + err.message, "error");
					if (status) status.textContent = "Upload failed";
					if (input && input.value !== undefined) input.value = "";
				}
			}

			function handleKitchenCategoryPictureDragOver(e) {
				e.preventDefault();
				e.stopPropagation();
				if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
				const dz = document.getElementById("kitchen-category-picture-dropzone");
				if (dz) {
					dz.style.background = "#eef6ff";
					dz.style.borderColor = "#3b82f6";
				}
			}

			function handleKitchenCategoryPictureDragLeave(e) {
				e.preventDefault();
				e.stopPropagation();
				const dz = document.getElementById("kitchen-category-picture-dropzone");
				if (!dz) return;
				if (e.relatedTarget && dz.contains(e.relatedTarget)) return;
				dz.style.background = "#fafbfc";
				dz.style.borderColor = "#d6dbe2";
			}

			function handleKitchenCategoryPictureDrop(e) {
				e.preventDefault();
				e.stopPropagation();
				const dz = document.getElementById("kitchen-category-picture-dropzone");
				if (dz) {
					dz.style.background = "#fafbfc";
					dz.style.borderColor = "#d6dbe2";
				}
				const dt = e.dataTransfer;
				if (!dt) return;
				let file = null;
				if (dt.files && dt.files.length) {
					file = dt.files[0];
				} else if (dt.items && dt.items.length) {
					for (let i = 0; i < dt.items.length; i++) {
						const it = dt.items[i];
						if (it.kind === "file") { file = it.getAsFile(); break; }
					}
				}
				if (!file) {
					showMessage("Please drop an image file", "error");
					return;
				}
				uploadKitchenCategoryPicture(file);
			}
		