
			// Global variables
			// Context: market admins arrive from the market dashboard (?ctx=market)
			// and authenticate with `marketToken`; main admin/staff use `authToken`.
			// Detect explicitly so a stale authToken can't hide the market's drivers.
			const _ctxParam = new URLSearchParams(location.search).get("ctx");
			const _authToken = localStorage.getItem("authToken");
			const _marketToken = localStorage.getItem("marketToken");

			// Read the role out of a JWT without verifying it. The signature is the
			// server's business; here we only need to know which orders endpoint the
			// holder is actually allowed to call.
			//
			// This matters because market_staff / market_manager sign in through the
			// SAME form as admins and therefore hold an `authToken` too. Deciding the
			// context from token presence alone classed them as main-store users, so
			// the page called the admin-only /api/orders, got 403 and rendered an
			// empty table — the exact symptom being fixed. Reading the role makes the
			// page correct no matter which URL (or bookmark) it was opened from.
			const MARKET_ROLES = [
				"market",
				"market_staff",
				"market_manager",
				"market_driver",
			];
			function roleFromToken(token) {
				if (!token) return null;
				try {
					const part = token.split(".")[1];
					if (!part) return null;
					const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
					const payload = JSON.parse(json);
					if (payload.isMarket) return "market";
					return payload.role || null;
				} catch (_) {
					return null;
				}
			}

			const _authRole = roleFromToken(_authToken);
			const IS_MARKET_CTX =
				_ctxParam === "market" ||
				(_ctxParam !== "admin" &&
					(MARKET_ROLES.includes(_authRole) ||
						(!_authToken && !!_marketToken)));
			let currentToken = IS_MARKET_CTX
				? (MARKET_ROLES.includes(_authRole) ? _authToken : _marketToken) ||
				  _marketToken ||
				  _authToken
				: _authToken || _marketToken;
			let currentUser = null;
			// Always route order CRUD through the market-scoped API when the page
			// is opened in a market context, since market_staff/market_manager/
			// market tokens are NOT authorized on the main /api/orders route.
			function ordersEndpoint() {
				return IS_MARKET_CTX
					? `${API_BASE_URL}/market-admin/orders`
					: `${API_BASE_URL}/orders`;
			}
			let allOrders = [];
			let filteredOrders = [];
			let currentPage = 1;
			let totalPages = 1;
			let totalOrders = 0;
			let pageSize = 20; // Orders per page
			let currentStatusFilter = null;
			let currentSearchFilter = null;
			let currentDateFromFilter = null;
			let currentDateToFilter = null;

			// Initialize the page
			document.addEventListener("DOMContentLoaded", function () {
				checkAuthentication();
				loadUserProfile();
				loadOrders(currentPage); // Load with no filters initially
			});

			// Check if user is authenticated
			function checkAuthentication() {
				if (!currentToken) {
					//window.location.href = "signin.html";
					//return;
				}
			}

			// Load user profile
			async function loadUserProfile() {
				try {
					showLoading();
					const response = await fetch(`${API_BASE_URL}/auth/me`, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					const result = await response.json();

					if (response.ok) {
						currentUser = result.data.user;
						console.log("User profile loaded:", currentUser); // Debug log
						updateUserInfo();
					} else {
						console.log("Authentication error:", result.message);
						handleAuthError();
					}
				} catch (error) {
					console.error("Error loading user profile:", error);
					handleAuthError();
				} finally {
					hideLoading();
				}
			}

			// Update user info in header
			function updateUserInfo() {
				if (currentUser) {
					const userAvatar = document.getElementById("user-avatar");
					const userName = document.getElementById("user-name");

					if (userAvatar && currentUser.name) {
						userAvatar.textContent = currentUser.name.charAt(0).toUpperCase();
					} else if (userAvatar) {
						userAvatar.textContent = "U"; // Default avatar for unknown user
					}
					if (userName) {
						userName.textContent = currentUser.name || "Staff User";
					}
				}
			}

			// Handle authentication errors
			function handleAuthError() {
				console.log("error");
				localStorage.removeItem("authToken");
				localStorage.removeItem("refreshToken");
				window.location.href = "signin.html";
			}

			// Logout function
			function logout() {
				localStorage.removeItem("authToken");
				localStorage.removeItem("refreshToken");
				window.location.href = "signin.html";
			}

			// Load orders
			async function loadOrders(
				page = 1,
				statusFilter = null,
				searchFilter = null,
				dateFromFilter = null,
				dateToFilter = null
			) {
				showTableLoading(true);
				showLoading();

				// Store current filters
				currentStatusFilter = statusFilter;
				currentSearchFilter = searchFilter;
				currentDateFromFilter = dateFromFilter;
				currentDateToFilter = dateToFilter;

				try {
					// Build query parameters
					const params = new URLSearchParams({
						page: page.toString(),
						limit: pageSize.toString(),
						sortBy: "createdAt",
						sortOrder: "desc",
					});

					// Add status filter if provided
					if (statusFilter && statusFilter !== "all") {
						params.append("status", statusFilter);
					}

					// Add search filter if provided
					if (searchFilter && searchFilter.trim()) {
						params.append("search", searchFilter.trim());
					}

					// Add date filters if provided
					if (dateFromFilter) {
						params.append("dateFrom", dateFromFilter);
					}

					if (dateToFilter) {
						params.append("dateTo", dateToFilter);
					}

					const request = (url) =>
						fetch(`${url}?${params}`, {
							method: "GET",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
						});

					let response = await request(ordersEndpoint());

					// Safety net: if the role was misclassified (an unusual token, an
					// old bookmark, a future market role), the correct endpoint is the
					// other one. Retry it rather than showing an empty table, which
					// gives the user no clue that anything went wrong.
					if (response.status === 401 || response.status === 403) {
						const fallback = IS_MARKET_CTX
							? `${API_BASE_URL}/orders`
							: `${API_BASE_URL}/market-admin/orders`;
						const retry = await request(fallback);
						if (retry.ok) response = retry;
					}

					const result = await response.json();

					if (response.ok) {
						// The two order endpoints do NOT share an envelope:
						//   /api/orders              -> { data: { orders, pagination } }
						//   /api/market-admin/orders -> { data: { items,  meta } }
						// Reading `data.orders` therefore yielded undefined for every
						// market role, the list fell back to [] and the table showed
						// "No orders found" with no error anywhere. listFrom() accepts
						// both shapes (and a bare array), so the page works for all
						// roles regardless of which endpoint answered.
						allOrders = listFrom(result, "orders");
						filteredOrders = [...allOrders];

						// Pagination is likewise named differently per endpoint, and
						// the market `meta` block carries neither currentPage nor
						// totalPages. Normalise both, deriving anything missing from
						// the values we do have so the pager and the "Showing X to Y
						// of N" label stay correct on either endpoint.
						const meta =
							(result.data && (result.data.pagination || result.data.meta)) || {};
						const total =
							meta.totalOrders ?? meta.total ?? allOrders.length;
						const perPage = Number(meta.limit) || pageSize;

						currentPage = meta.currentPage ?? meta.page ?? page;
						totalOrders = total;
						totalPages =
							meta.totalPages ?? Math.max(1, Math.ceil(total / perPage));

						displayOrders(filteredOrders);
						updatePaginationControls();
						updateStats();
					} else {
						showMessage(
							(result && result.message) || "Failed to load orders",
							"error"
						);
					}
				} catch (error) {
					console.error("Error loading orders:", error);
					showMessage("Error loading orders", "error");
				} finally {
					showTableLoading(false);
					hideLoading();
				}
			}

			// Display orders in table
			function displayOrders(orders) {
				const tbody = document.getElementById("orders-table-body");
				tbody.innerHTML = "";

				if (orders.length === 0) {
					tbody.innerHTML = `
						<tr>
							<td colspan="8" class="empty-state">
								<div class="icon">📦</div>
								<h3>No orders found</h3>
								<p>No orders match your current filters.</p>
							</td>
						</tr>
					`;
					return;
				}

				orders.forEach((order) => {
					const customerName = order.customer?.name || "N/A";
					const itemCount = order.items?.length || 0;
					const totalAmount = order.total || 0;
					const status = order.status || "pending";
					const shelfNumber = order.shelfNumber || "N/A";
					const orderDate = new Date(order.createdAt).toLocaleDateString();

					const row = document.createElement("tr");
					row.innerHTML = `
						<td><strong>${order.orderNumber}</strong></td>
						<td>${customerName}</td>
						<td>${itemCount} item${itemCount !== 1 ? "s" : ""}</td>
						<td>$${totalAmount.toFixed(2)}</td>
						<td><span class="status-badge status-${status}">${status}</span></td>
						<td>${shelfNumber}</td>
						<td>${orderDate}</td>
						<td>
							<div class="table-actions">
								<button class="action-btn view" onclick="viewOrderDetails('${order._id}')">
									View
								</button>
								${getStatusActionButton(order)}
								${getPaymentActionButton(order)}
							</div>
						</td>
					`;
					tbody.appendChild(row);
				});
			}

			// Get status-specific action button
			function getStatusActionButton(order) {
				const status = order.status || "pending";

				switch (status) {
					case "confirmed":
						return `<button class="action-btn edit" onclick="updateOrderStatus('${order._id}', 'processing')">
							Start Processing
						</button>`;
					case "processing":
						return `<button class="action-btn edit" onclick="processOrder('${order._id}')">
							Process Order
						</button>
						<button class="action-btn edit" onclick="updateOrderStatus('${order._id}', 'ready for pickup')">
							Mark Ready
						</button>`;
					case "ready for pickup":
						// No button. A driver is attached and the order dispatched
						// automatically the moment it reaches this status; anything
						// still sitting here had no driver free at that moment and is
						// picked up by the background sweep as soon as one is. The
						// only useful thing to show is why it is waiting, which the
						// row's coverage warning already says.
						return "";
					case "OnTheWay":
						return `<button class="action-btn edit" onclick="updateOrderStatus('${order._id}', 'delivered')">
							Mark Delivered
						</button>`;
					case "pending":
						return `<button class="action-btn edit" onclick="updateOrderStatus('${order._id}', 'confirmed')">
							Confirm Order
						</button>`;
					default:
						return "";
				}
			}

			// Get payment-specific action button
			function getPaymentActionButton(order) {
				const paymentStatus = order.paymentStatus || "pending";

				if (paymentStatus !== "paid") {
					return `<button class="action-btn edit" onclick="updatePaymentStatus('${order._id}', 'paid')">
						Mark as Paid
					</button>`;
				}

				return "";
			}

			// Update order status
			async function updateOrderStatus(orderId, newStatus) {
				try {
					showLoading();
					const response = await fetch(`${ordersEndpoint()}/${orderId}`, {
						method: "PUT",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ status: newStatus }),
					});

					const result = await response.json();

					if (response.ok) {
						showMessage(`Order status updated to ${newStatus}`, "success");

						// If status changed to processing, automatically open the process modal
						if (newStatus === "processing") {
							// Get the updated order data and open process modal
							setTimeout(() => {
								processOrder(orderId);
							}, 500); // Small delay to ensure status update is processed
						} else {
							loadOrders(
								currentPage,
								currentStatusFilter,
								currentSearchFilter,
								currentDateFromFilter,
								currentDateToFilter
							); // Refresh the current page with current filters
						}
					} else {
						showMessage(
							formatApiError(result, "Failed to update order status"),
							"error"
						);
					}
				} catch (error) {
					console.error("Error updating order status:", error);
					showMessage("Error updating order status", "error");
				} finally {
					hideLoading();
				}
			}

			// The manual "Assign Driver" modal used to live here. Both the main store
			// and every market now attach a driver automatically the moment an order
			// becomes ready for pickup, each from their own driver pool, so there is
			// nothing left to pick. The result is reported when the shelf number is
			// entered (see completeOrderProcessing below).

			// Update payment status
			async function updatePaymentStatus(orderId, newPaymentStatus) {
				try {
					showLoading();
					const response = await fetch(`${ordersEndpoint()}/${orderId}`, {
						method: "PUT",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ paymentStatus: newPaymentStatus }),
					});

					const result = await response.json();

					if (response.ok) {
						showMessage(
							`Payment status updated to ${newPaymentStatus}`,
							"success"
						);
						loadOrders(
							currentPage,
							currentStatusFilter,
							currentSearchFilter,
							currentDateFromFilter,
							currentDateToFilter
						); // Refresh the current page with current filters
					} else {
						showMessage(
							formatApiError(result, "Failed to update payment status"),
							"error"
						);
					}
				} catch (error) {
					console.error("Error updating payment status:", error);
					showMessage("Error updating payment status", "error");
				} finally {
					hideLoading();
				}
			}

			// View order details
			async function viewOrderDetails(orderId) {
				try {
					showLoading();
					const response = await fetch(`${ordersEndpoint()}/${orderId}`, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					const result = await response.json();

					if (response.ok) {
						// The endpoint wraps the record as { data: { order } };
						// passing the wrapper made every field render as "N/A".
						const order = objectFrom(result, "order");
						if (!order) {
							showMessage("Order details are unavailable.", "error");
							return;
						}
						showOrderDetailsModal(order);
					} else {
						showMessage("Failed to load order details", "error");
					}
				} catch (error) {
					console.error("Error loading order details:", error);
					showMessage("Error loading order details", "error");
				} finally {
					hideLoading();
				}
			}

			// Show order details modal
			async function showOrderDetailsModal(order) {
				showLoading();
				try {
					const modal = document.getElementById("order-details-modal");
					const content = document.getElementById("order-details-content");

					const customerName = order.customer?.name || "N/A";
					const customerEmail = order.customer?.email || "N/A";
					const customerPhone = order.customer?.phoneNumber || "N/A";
					const customerAddress = order.customer?.address;
					const orderDate = new Date(order.createdAt).toLocaleString();
					const status = order.status || "pending";

					// Format full address
					let fullAddress = "N/A";
					let city = "";
					let customerLat = null;
					let customerLng = null;
					if (customerAddress) {
						if (typeof customerAddress === "object") {
							const street = customerAddress.street || "";
							city = customerAddress.city || "";
							fullAddress = [street, city]
								.filter(Boolean)
								.join(", ");
							if (
								customerAddress.location &&
								typeof customerAddress.location.latitude === "number" &&
								typeof customerAddress.location.longitude === "number"
							) {
								customerLat = customerAddress.location.latitude;
								customerLng = customerAddress.location.longitude;
							}
						} else {
							fullAddress = customerAddress;
						}
					}

					// Build a Google Maps pin link if we have exact coordinates
					const customerMapHtml =
						customerLat !== null && customerLng !== null
							? `<p><strong>Map Pin:</strong> <a href="https://www.google.com/maps/search/?api=1&query=${customerLat},${customerLng}" target="_blank" rel="noopener noreferrer">📍 View on Google Maps</a></p>`
							: "";

					// Fetch zone information
					let zoneInfo = null;
					let ridersInfo = [];
					if (city) {
						try {
							const zoneResponse = await fetch(
								`${API_BASE_URL}/zones?search=${encodeURIComponent(city)}&isActive=true&limit=1`,
								{
									method: "GET",
									headers: {
										Authorization: `Bearer ${currentToken}`,
										"Content-Type": "application/json",
									},
								}
							);

							if (zoneResponse.ok) {
								const zoneResult = await zoneResponse.json();
								const zonesArr = (zoneResult.data && zoneResult.data.zones) || [];
								zoneInfo = Array.isArray(zonesArr) ? zonesArr[0] : null;

								// Fetch available riders for this zone
								if (zoneInfo && zoneInfo.zoneName) {
									try {
										const ridersResponse = await fetch(
											`${API_BASE_URL}/riders/available/${encodeURIComponent(
												zoneInfo.zoneName
											)}`,
											{
												method: "GET",
												headers: {
													Authorization: `Bearer ${currentToken}`,
													"Content-Type": "application/json",
												},
											}
										);

										if (ridersResponse.ok) {
											const ridersResult = await ridersResponse.json();
											ridersInfo = (ridersResult.data && ridersResult.data.availableRiders) || [];
										}
									} catch (ridersError) {
										console.error(
											"Error fetching riders information:",
											ridersError
										);
									}
								}
							}
						} catch (error) {
							console.error("Error fetching zone information:", error);
						}
					}

					// Format zone information
					let zoneHtml = "";
					if (zoneInfo) {
						const zoneName = zoneInfo.zoneName || "N/A";
						const zoneDistance = zoneInfo.distance
							? `${zoneInfo.distance} ${zoneInfo.distanceUnit || "km"}`
							: "N/A";
						const deliveryFee = zoneInfo.deliveryFee
							? `$${zoneInfo.deliveryFee.toFixed(2)}`
							: "$0.00";
						const estimatedTime = zoneInfo.estimatedDeliveryTime
							? `${zoneInfo.estimatedDeliveryTime} min`
							: "N/A";
						const zoneStatus = zoneInfo.isActive ? "Active" : "Inactive";

						// Format riders information
						let ridersHtml = "";
						if (ridersInfo.length > 0) {
							ridersHtml = ridersInfo
								.map((rider) => {
									const riderName = rider.user?.name || "Unknown Rider";
									const riderStatus = rider.status || "offline";
									const vehicleType = rider.vehicleType || "N/A";

									return `<div class="rider-item">
									<strong>${riderName}</strong>
									<small>Status: <span class="status-badge status-${riderStatus}">${riderStatus}</span> | Vehicle: ${vehicleType}</small>
								</div>`;
								})
								.join("");
						} else {
							ridersHtml = `<p class="omx-17">No available riders in this zone</p>`;
						}

						zoneHtml = `
						<div class="order-details-card">
							<h4>🚚 Zone Information</h4>
							<p><strong>Zone:</strong> ${zoneName}</p>
							<p><strong>Distance:</strong> ${zoneDistance}</p>
							<p><strong>Delivery Fee:</strong> ${deliveryFee}</p>
							<p><strong>Est. Time:</strong> ${estimatedTime}</p>
							<p><strong>Status:</strong> <span class="status-badge status-${zoneStatus.toLowerCase()}">${zoneStatus}</span></p>

							<h5 class="omx-18">Available Riders (${
								ridersInfo.length
							})</h5>
							<div class="riders-list">
								${ridersHtml}
							</div>
						</div>
					`;
					} else {
						zoneHtml = `
						<div class="order-details-card">
							<h4>🚚 Zone Information</h4>
							<p class="omx-17">No zone found for this address</p>
						</div>
					`;
					}

					let itemsHtml = "";
					if (order.items && order.items.length > 0) {
						itemsHtml = order.items
							.map(
								(item) => `
						<tr>
							<td>${item.product?.name || "N/A"}</td>
							<td>${item.product?.shelfNumber || "N/A"}</td>
							<td>${item.quantity}</td>
							<td>$${item.product.price?.toFixed(2) || "0.00"}</td>
							<td>${item.product?.tax || 0}%</td>
							<td>${item.product?.discount || 0}%</td>
							<td>$${item.product?.bottlerefund?.toFixed(2) || "0.00"}</td>
							<td>$${(item.totalPrice || 0).toFixed(2)}</td>
						</tr>
					`
							)
							.join("");
					}

					content.innerHTML = `
					<div class="order-details-header">
						<h3>📋 Order #${order.orderNumber}</h3>
					</div>

					<div class="order-details-grid">
						<div class="order-details-card">
							<h4>👤 Customer Information</h4>
							<p><strong>Name:</strong> ${customerName}</p>
							<p><strong>Email:</strong> ${customerEmail}</p>
							<p><strong>Phone:</strong> ${customerPhone}</p>
							<p><strong>Address:</strong> ${fullAddress}</p>
							${customerMapHtml}
						</div>

						<div class="order-details-card">
							<h4>📦 Order Information</h4>
							<p><strong>Status:</strong> <span class="status-badge status-${status}">${status}</span></p>
							<p><strong>Order Date:</strong> ${orderDate}</p>
							<p><strong>Total Amount:</strong> $${order.total?.toFixed(2) || "0.00"}</p>
							<p><strong>Items Count:</strong> ${order.items?.length || 0}</p>
						</div>

						${zoneHtml}
					</div>

					<div class="order-items-section">
						<h4>🛒 Order Items</h4>
						<div class="users-table-container">
							<table class="users-table order-items-table">
								<thead>
									<tr>
										<th>📦 Product</th>
										<th>🏷️ Shelf #</th>
										<th>🔢 Quantity</th>
										<th>💰 Unit Price</th>
										<th>📊 Tax (%)</th>
										<th>🎯 Discount (%)</th>
										<th>♻️ Bottle Refund</th>
										<th>💵 Total</th>
									</tr>
								</thead>
								<tbody>
									${itemsHtml}
								</tbody>
							</table>
						</div>
					</div>

					<div class="order-actions">
						${getStatusActionButton(order)}
					</div>
				`;

					modal.style.display = "block";
				} finally {
					hideLoading();
				}
			}

			// Close order details modal
			function closeOrderDetailsModal() {
				document.getElementById("order-details-modal").style.display = "none";
			}

			// Filter orders
			function filterOrders() {
				// Get current filter values
				const statusFilter = document.getElementById("status-filter").value;
				const searchFilter = document.getElementById("search-input").value;
				const dateFromFilter = document.getElementById("date-from").value;
				const dateToFilter = document.getElementById("date-to").value;

				// Reset to page 1 when filtering
				currentPage = 1;
				loadOrders(
					currentPage,
					statusFilter,
					searchFilter,
					dateFromFilter,
					dateToFilter
				);
			}

			// Update pagination controls
			function updatePaginationControls() {
				const container = document.getElementById("pagination-container");
				const info = document.getElementById("pagination-info");
				const pageNumbers = document.getElementById("page-numbers");
				const prevBtn = document.getElementById("prev-page-btn");
				const nextBtn = document.getElementById("next-page-btn");

				if (totalPages <= 1) {
					container.style.display = "none";
					return;
				}

				container.style.display = "flex";

				// Update info text
				const startItem = (currentPage - 1) * pageSize + 1;
				const endItem = Math.min(currentPage * pageSize, totalOrders);
				info.textContent = `Showing ${startItem} to ${endItem} of ${totalOrders} orders`;

				// Update navigation buttons
				prevBtn.disabled = currentPage <= 1;
				nextBtn.disabled = currentPage >= totalPages;

				// Generate page numbers
				pageNumbers.innerHTML = "";
				const maxVisiblePages = 5;
				let startPage = Math.max(
					1,
					currentPage - Math.floor(maxVisiblePages / 2)
				);
				let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

				// Adjust start page if we're near the end
				if (endPage - startPage + 1 < maxVisiblePages) {
					startPage = Math.max(1, endPage - maxVisiblePages + 1);
				}

				// Add page numbers
				for (let i = startPage; i <= endPage; i++) {
					const pageBtn = document.createElement("button");
					pageBtn.className = `page-number ${
						i === currentPage ? "active" : ""
					}`;
					pageBtn.textContent = i;
					pageBtn.onclick = () => changePage(i);
					pageNumbers.appendChild(pageBtn);
				}
			}

			// Change page
			function changePage(action) {
				let newPage = currentPage;

				if (action === "prev" && currentPage > 1) {
					newPage = currentPage - 1;
				} else if (action === "next" && currentPage < totalPages) {
					newPage = currentPage + 1;
				} else if (typeof action === "number") {
					newPage = action;
				}

				if (newPage !== currentPage && newPage >= 1 && newPage <= totalPages) {
					currentPage = newPage;
					loadOrders(
						currentPage,
						currentStatusFilter,
						currentSearchFilter,
						currentDateFromFilter,
						currentDateToFilter
					);
				}
			}

			// Update statistics
			function updateStats() {
				// For now, we'll show basic stats from current page
				// In a real implementation, you might want to fetch aggregate stats separately
				document.getElementById("total-orders").textContent = totalOrders;
				document.getElementById("pending-orders").textContent =
					allOrders.filter((order) => order.status === "pending").length;
				document.getElementById("confirmed-orders").textContent =
					allOrders.filter((order) => order.status === "confirmed").length;
				document.getElementById("processing-orders").textContent =
					allOrders.filter((order) => order.status === "processing").length;
				document.getElementById("ready-orders").textContent = allOrders.filter(
					(order) => order.status === "ready for pickup"
				).length;
				document.getElementById("OnTheWay-orders").textContent =
					allOrders.filter((order) => order.status === "OnTheWay").length;
				document.getElementById("delivered-orders").textContent =
					allOrders.filter((order) => order.status === "delivered").length;
				document.getElementById("cancelled-orders").textContent =
					allOrders.filter((order) => order.status === "cancelled").length;
			}

			// Refresh orders
			function refreshOrders() {
				currentPage = 1; // Reset to first page when refreshing
				loadOrders(
					currentPage,
					currentStatusFilter,
					currentSearchFilter,
					currentDateFromFilter,
					currentDateToFilter
				);
				showMessage("Orders refreshed", "success");
			}

			// Show table loading state
			function showTableLoading(show) {
				const tbody = document.getElementById("orders-table-body");
				if (show) {
					tbody.innerHTML = `
						<tr>
							<td colspan="8" class="loading">
								<div class="spinner"></div>
								<p>Loading orders...</p>
							</td>
						</tr>
					`;
				}
			}

			// Show message (you can implement this based on your existing message system)
			function showMessage(message, type) {
				const container = document.getElementById("message-container");
				container.textContent = `${type.toUpperCase()}: ${message}`;
				container.className = `message-container message-${type}`;
				container.style.display = "block";
				setTimeout(() => {
					container.style.display = "none";
				}, 3000);
			}

			// Loading functions
			function showLoading() {
				document.getElementById("loading-container").style.display = "block";
			}

			function hideLoading() {
				document.getElementById("loading-container").style.display = "none";
			}

			// Process Order Functions
			let currentProcessingOrder = null;
			let processedItems = new Set();
			// Per-item scan progress: itemId -> number of units scanned so far.
			// An item is only fully "processed" once its count reaches its quantity.
			let scanCounts = new Map();

			// Process order function
			async function processOrder(orderId) {
				try {
					showLoading();
					const response = await fetch(`${ordersEndpoint()}/${orderId}`, {
						method: "GET",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
					});

					const result = await response.json();

					if (response.ok) {
						// Admin API wraps the record as { data: { order } } while the
						// market-scoped API returns it directly as { data: order } —
						// objectFrom() normalizes both shapes (same fix as
						// viewOrderDetails, otherwise market ctx got null and the
						// modal threw "Error loading order details").
						const order = objectFrom(result, "order");
						if (!order) {
							showMessage("Order details are unavailable.", "error");
							return;
						}
						currentProcessingOrder = order;
						processedItems.clear();
						scanCounts.clear();
						showProcessOrderModal(order);
					} else {
						showMessage("Failed to load order details", "error");
					}
				} catch (error) {
					console.error("Error loading order for processing:", error);
					showMessage("Error loading order details", "error");
				} finally {
					hideLoading();
				}
			}

			// Show process order modal
			function showProcessOrderModal(order) {
				const modal = document.getElementById("process-order-modal");
				const orderInfo = document.getElementById("process-order-info");
				const itemsTable = document.getElementById("process-items-table");

				// Start each processing session fresh so progress + the pending
				// list reflect only this order.
				processedItems.clear();
				scanCounts.clear();

				// Populate order info
				const customerName = order.customer?.name || "N/A";
				const orderDate = new Date(order.createdAt).toLocaleString();

				orderInfo.innerHTML = `
					<div class="omx-19">
						<div>
							<strong>Order #:</strong> ${order.orderNumber}<br>
							<strong>Customer:</strong> ${customerName}<br>
							<strong>Status:</strong> <span class="status-badge status-${order.status}">${
					order.status
				}</span>
						</div>
						<div>
							<strong>Order Date:</strong> ${orderDate}<br>
							<strong>Total Items:</strong> ${order.items?.length || 0}<br>
							<strong>Total Amount:</strong> $${order.total?.toFixed(2) || "0.00"}
						</div>
					</div>
				`;

				// Populate items table
				itemsTable.innerHTML = "";
				if (order.items && order.items.length > 0) {
					order.items.forEach((item, index) => {
						const row = document.createElement("tr");
						const productName = item.product?.name || "N/A";
						const shelfNumber = item.product?.shelfNumber || "N/A";
						const barcode = item.product?.barcode || "N/A";
						const quantity = Number(item.quantity) || 1;
						const itemId = item.product?._id || `item-${index}`;

						row.innerHTML = `
							<td>${productName}</td>
							<td>${shelfNumber}</td>
							<td>${barcode}</td>
							<td>${quantity}</td>
							<td>
								<span id="scanned-${itemId}" class="omx-20">
									0 / ${quantity}
								</span>
							</td>
							<td>
								<span id="status-${itemId}" class="status-badge status-pending">
									Pending
								</span>
							</td>
							<td>
								<button id="btn-${itemId}" class="action-btn edit" onclick="markItemProcessed('${itemId}')">
									＋ Mark 1
								</button>
							</td>
						`;
						itemsTable.appendChild(row);
					});
				} else {
					itemsTable.innerHTML = `
						<tr>
							<td colspan="7" class="omx-21">
								No items found in this order
							</td>
						</tr>
					`;
				}

				// Reset barcode input
				document.getElementById("barcode-input").value = "";
				document.getElementById("process-status").textContent =
					"Ready to scan items...";
				document.getElementById("process-status").className =
					"processing-status pending";

				// Hide complete button initially
				document.getElementById("complete-btn").style.display = "none";

				modal.style.display = "block";
				// The camera is NOT opened automatically. Most orders are scanned
				// with a USB/keyboard scanner into the barcode box, so grabbing the
				// webcam on every open was an unwanted permission prompt and a live
				// video feed nobody asked for. "Scan items with camera" still opens
				// it on demand.
			}

			// Close process order modal
			function closeProcessOrderModal() {
				if (window.BarcodeScanner && BarcodeScanner.isOpen()) {
					BarcodeScanner.close();
				}
				document.getElementById("process-order-modal").style.display = "none";
				currentProcessingOrder = null;
				processedItems.clear();
				scanCounts.clear();
			}

			// Handle barcode keypress (Enter key)
			function handleBarcodeKeypress(event) {
				if (event.key === "Enter") {
					event.preventDefault();
					processBarcode();
				}
			}

			// Handle barcode input change (for auto-processing)
			let barcodeInputTimeout = null;
			function handleBarcodeInput(event) {
				const input = event.target;
				const value = input.value.trim();

				// Clear any existing timeout
				if (barcodeInputTimeout) {
					clearTimeout(barcodeInputTimeout);
				}

				// If input is empty, don't process
				if (!value) return;

				// Set a timeout to process the barcode after a short delay
				// This prevents processing while the barcode scanner is still typing
				barcodeInputTimeout = setTimeout(() => {
					// Only auto-process if we have a reasonable barcode length
					// Most barcodes are at least 8-12 characters
					if (value.length >= 8) {
						processBarcode();
					}
				}, 300); // 300ms delay to allow barcode scanner to finish input
			}

			// Process a barcode typed in the box or sent by a USB/keyboard scanner.
			function processBarcode() {
				const barcodeInput = document.getElementById("barcode-input");
				const barcode = barcodeInput.value.trim();

				// Clear any pending input timeout to prevent double processing
				if (barcodeInputTimeout) {
					clearTimeout(barcodeInputTimeout);
					barcodeInputTimeout = null;
				}

				if (!barcode) {
					showMessage("Please enter a barcode", "error");
					return;
				}

				const res = handleScannedBarcode(barcode, { source: "input" });
				barcodeInput.value = "";
				barcodeInput.focus();

				const statusElement = document.getElementById("process-status");
				if (res.ok) {
					statusElement.innerHTML = `✅ ${res.message}`;
					statusElement.className = "processing-status completed";
					setTimeout(() => updateProcessStatus(), 2000);
				} else {
					showMessage(res.message, "error");
				}
			}

			// Open the live camera scanner in continuous mode for fast scanning.
			function openProcessingScanner() {
				if (!currentProcessingOrder) {
					showMessage("No order is being processed", "error");
					return;
				}
				if (!window.BarcodeScanner) {
					showMessage("Camera scanner is unavailable", "error");
					return;
				}
				BarcodeScanner.open({
					continuous: true,
					closeOnSuccess: true,
					cooldownMs: 1000,
					title: pendingItemsTitle(),
					hint: "The camera closes after each successful scan. Tap “Scan items with camera” again for the next unit.",
					onDetect: (code) => handleScannedBarcode(code, { source: "camera" }),
				});
			}

			// Resolve a scanned/typed barcode to an order item and count one unit.
			// Returns { ok, message } so the camera overlay can show feedback.
			function handleScannedBarcode(rawBarcode, ctx) {
				ctx = ctx || {};
				const barcode = String(rawBarcode || "").trim();
				if (!barcode) return { ok: false, message: "Empty barcode" };
				if (!currentProcessingOrder || !currentProcessingOrder.items) {
					return { ok: false, message: "No order is being processed" };
				}
				const idx = currentProcessingOrder.items.findIndex(
					(item) => item.product?.barcode === barcode
				);
				if (idx === -1) {
					return { ok: false, message: `Not in this order: ${barcode}` };
				}
				const itemId =
					currentProcessingOrder.items[idx].product?._id || `item-${idx}`;
				return incrementItemScan(itemId, { source: ctx.source || "scan" });
			}

			// Build the comma-separated list of items that still need scanning. Shown
			// as the camera title so the picker knows exactly what to grab next. Items
			// with more than one unit left show a ×count suffix.
			function pendingItemsTitle() {
				if (!currentProcessingOrder || !currentProcessingOrder.items) {
					return "Scan items";
				}
				const names = [];
				currentProcessingOrder.items.forEach((item, index) => {
					const itemId = item.product?._id || `item-${index}`;
					const required = Number(item.quantity) || 1;
					const current = scanCounts.get(itemId) || 0;
					const remaining = required - current;
					if (remaining > 0) {
						const name = item.product?.name || "Unnamed item";
						names.push(remaining > 1 ? `${name} \u00d7${remaining}` : name);
					}
				});
				if (!names.length) return "\u2705 All items scanned";
				return names.join(", ");
			}

			// Count one scanned/clicked unit for an item. An item is only fully
			// processed once its count reaches its ordered quantity.
			function incrementItemScan(itemId, opts) {
				opts = opts || {};
				const info = itemIndexById(itemId);
				if (!info) return { ok: false, message: "Unknown item" };
				const name = info.item.product?.name || "Item";
				const required = Number(info.item.quantity) || 1;
				let current = scanCounts.get(itemId) || 0;

				if (current >= required) {
					return {
						ok: false,
						message: `"${name}" already complete (${required}/${required})`,
					};
				}

				current += 1;
				scanCounts.set(itemId, current);
				if (current >= required) processedItems.add(itemId);

				updateItemRow(itemId, current, required);
				updateProcessStatus();
				const allDone = checkAllItemsProcessed();

				let message = `"${name}" ${current}/${required} • ${processedItems.size} of ${currentProcessingOrder.items.length} items done`;
				if (allDone) {
					message = "✅ All items processed! Ready to complete.";
					// Close the camera shortly after the last item.
					setTimeout(() => {
						if (window.BarcodeScanner && BarcodeScanner.isOpen()) {
							BarcodeScanner.close();
						}
					}, 700);
				}
				return { ok: true, message, complete: current >= required, allDone };
			}

			// Find an order item (and its index) by the id used in the table rows.
			function itemIndexById(itemId) {
				if (!currentProcessingOrder || !currentProcessingOrder.items) return null;
				const items = currentProcessingOrder.items;
				for (let i = 0; i < items.length; i++) {
					const id = items[i].product?._id || `item-${i}`;
					if (id === itemId) return { item: items[i], index: i };
				}
				return null;
			}

			// Update a single row's scan progress, status badge and button.
			function updateItemRow(itemId, current, required) {
				const progress = document.getElementById(`scanned-${itemId}`);
				if (progress) {
					progress.textContent = `${current} / ${required}`;
					progress.style.color = current >= required ? "#155724" : "#856404";
				}
				const statusElement = document.getElementById(`status-${itemId}`);
				if (statusElement) {
					if (current >= required) {
						statusElement.className = "status-badge status-processing";
						statusElement.textContent = "Processed";
					} else {
						statusElement.className = "status-badge status-pending";
						statusElement.textContent = `Scanning ${current}/${required}`;
					}
					const row = statusElement.closest("tr");
					if (row) {
						row.style.backgroundColor =
							current >= required ? "#d4edda" : "#fff7df";
						if (current < required) {
							setTimeout(() => {
								if ((scanCounts.get(itemId) || 0) < required) {
									row.style.backgroundColor = "";
								}
							}, 900);
						}
					}
				}
				const button = document.getElementById(`btn-${itemId}`);
				if (button) {
					if (current >= required) {
						button.disabled = true;
						button.textContent = "✓ Done";
					} else {
						button.textContent = `＋ Mark 1 (${current}/${required})`;
					}
				}
			}

			// Manual "Mark 1" button — counts a single unit, same as one scan.
			function markItemProcessed(itemId) {
				const res = incrementItemScan(itemId, { source: "manual" });
				const statusElement = document.getElementById("process-status");
				if (res.ok) {
					statusElement.innerHTML = `✅ ${res.message}`;
					statusElement.className = "processing-status completed";
					setTimeout(() => updateProcessStatus(), 2000);
				} else {
					showMessage(res.message, "error");
				}
			}

			// Check if all items are fully processed; returns true when complete.
			function checkAllItemsProcessed() {
				if (!currentProcessingOrder || !currentProcessingOrder.items)
					return false;

				const totalItems = currentProcessingOrder.items.length;
				const processedCount = processedItems.size;
				const allDone = totalItems > 0 && processedCount === totalItems;

				const completeBtn = document.getElementById("complete-btn");
				if (completeBtn) {
					completeBtn.style.display = allDone ? "inline-block" : "none";
				}
				if (allDone) {
					const statusElement = document.getElementById("process-status");
					statusElement.innerHTML = `✅ All items processed! Ready to complete.`;
					statusElement.className = "processing-status completed";
				}
				return allDone;
			}

			// Update process status
			function updateProcessStatus() {
				if (!currentProcessingOrder || !currentProcessingOrder.items) return;

				const totalItems = currentProcessingOrder.items.length;
				const processedCount = processedItems.size;

				const statusElement = document.getElementById("process-status");
				statusElement.innerHTML = `${processedCount} of ${totalItems} items processed`;
				statusElement.className = "processing-status processing";
			}

			// Complete order processing
			async function completeOrderProcessing() {
				if (!currentProcessingOrder) {
					showMessage("No order is currently being processed", "error");
					return;
				}

				// Ask for shelf number before completing
				const shelfNumber = prompt(
					"Enter the shelf number for this completed order:"
				);

				if (shelfNumber === null) {
					// User cancelled
					return;
				}

				if (!shelfNumber.trim()) {
					showMessage("Shelf number is required", "error");
					return;
				}

				try {
					showLoading();
					// First, update the order with the shelf number
					const updateResponse = await fetch(
						`${ordersEndpoint()}/${currentProcessingOrder._id}`,
						{
							method: "PUT",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								shelfNumber: shelfNumber.trim(),
								status: "ready for pickup",
							}),
						}
					);

					const updateResult = await updateResponse.json();

					if (!updateResponse.ok) {
						showMessage(
							updateResult.message || "Failed to update shelf number",
							"error"
						);
						return;
					}

					// Update the current processing order with the shelf number
					currentProcessingOrder.shelfNumber = shelfNumber.trim();

					// Marking the order ready for pickup triggers automatic driver
					// assignment on the server. Report the outcome here, since this is
					// the moment the operator would otherwise have gone looking for an
					// assign button.
					const auto = updateResult && updateResult.data && updateResult.data.autoAssignment;
					if (auto && auto.assigned) {
						showMessage(
							`Order ready — automatically assigned to ${auto.riderName}${auto.zoneName ? ` (${auto.zoneName})` : ""}.`,
							"success"
						);
					} else if (auto && auto.message) {
						showMessage(auto.message, "error");
					} else {
						showMessage("Order processing completed successfully!", "success");
					}
					closeProcessOrderModal();
					loadOrders(
						currentPage,
						currentStatusFilter,
						currentSearchFilter,
						currentDateFromFilter,
						currentDateToFilter
					); // Refresh the current page with current filters
				} catch (error) {
					console.error("Error completing order processing:", error);
					showMessage("Error completing order processing", "error");
				} finally {
					hideLoading();
				}
			}

			// Refund order function
			async function refundOrder(orderId) {
				if (!confirm("Are you sure you want to refund this order?")) {
					return;
				}

				try {
					showLoading();
					const response = await fetch(
						`${API_BASE_URL}/payments/refund/${orderId}`,
						{
							method: "POST",
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
						}
					);

					const result = await response.json();

					if (response.ok) {
						showMessage("Refund processed successfully", "success");
						loadOrders(
							currentPage,
							currentStatusFilter,
							currentSearchFilter,
							currentDateFromFilter,
							currentDateToFilter
						); // Refresh the current page with current filters
					} else {
						showMessage(formatApiError(result, "Failed to process refund"), "error");
					}
				} catch (error) {
					console.error("Error processing refund:", error);
					showMessage("Error processing refund", "error");
				} finally {
					hideLoading();
				}
			}
		