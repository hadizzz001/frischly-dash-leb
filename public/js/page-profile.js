
			let currentToken = localStorage.getItem("authToken");

			// Check if user is logged in
			if (!currentToken) {
				window.location.href = "signin.html";
			}

			function showMessage(message, type) {
				const messageDiv = document.getElementById("message");
				messageDiv.innerHTML = `<div class="message ${type}">${message}</div>`;
				setTimeout(() => {
					messageDiv.innerHTML = "";
				}, 5000);
			}

			function showLoading(show) {
				document.getElementById("loading").style.display = show
					? "block"
					: "none";
				document.getElementById("profile-content").style.display = show
					? "none"
					: "block";
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
				return date.toLocaleDateString("en-US", {
					year: "numeric",
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
			}

			// Sign out function
			function signOut() {
				localStorage.removeItem("authToken");
				showMessage("Signed out successfully! Redirecting...", "success");
				setTimeout(() => {
					window.location.href = "index.html";
				}, 1500);
			}

			// Delete account function
			async function deleteAccount() {
				const password = prompt(
					"Please enter your password to confirm account deletion:"
				);
				if (!password) {
					return; // User cancelled
				}

				if (
					!confirm(
						"Are you sure you want to delete your account? This action cannot be undone."
					)
				) {
					return;
				}

				showLoading(true);

				try {
					const response = await fetch(`${API_BASE_URL}/auth/delete-account`, {
						method: "DELETE",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${currentToken}`,
						},
						body: JSON.stringify({ password }),
					});

					const data = await response.json();

					if (response.ok) {
						showMessage(
							"Account deleted successfully! Redirecting...",
							"success"
						);
						localStorage.removeItem("authToken");
						setTimeout(() => {
							window.location.href = "index.html";
						}, 2000);
					} else {
						showMessage(formatApiError(data, "Failed to delete account"), "error");
					}
				} catch (error) {
					console.error("Delete account error:", error);
					showMessage("An error occurred while deleting your account", "error");
				} finally {
					showLoading(false);
				}
			}

			// Edit profile function
			function editProfile() {
				// These buttons live inside the driver settings popup; close it so the
				// form that replaces #profile-content underneath is actually visible.
				if (typeof closeSettingsModal === "function") closeSettingsModal();
				const profileContent = document.getElementById("profile-content");

				// Get current values
				const currentName = document.getElementById("user-name").textContent;
				const currentEmail = document.getElementById("user-email").textContent;
				const currentPhone = document.getElementById("user-phone").textContent;
				const currentAddress =
					document.getElementById("user-address").textContent;

				// Parse address components (format: "street, city")
				const addressParts = currentAddress.split(", ");
				const street = addressParts[0] || "";
				const city = addressParts[1] || "";

				profileContent.innerHTML = `
					<div class="prx-16">
						<h3 class="prx-17">Edit Profile</h3>
						<div class="prx-18">
							<div class="prx-19">
								<label class="prx-20">Name:</label>
								<input type="text" id="edit-name" value="${currentName}" 
								 class="prx-21">
							</div>
							<div class="prx-19">
								<label class="prx-20">Email:</label>
								<input type="email" id="edit-email" value="${currentEmail}" readonly
								 class="prx-22">
								<small class="prx-23">Email cannot be changed</small>
							</div>
							<div class="prx-19">
								<label class="prx-20">Phone:</label>
								<input type="tel" id="edit-phone" value="${currentPhone}" 
								 class="prx-21">
							</div>
							<div class="prx-19">
								<label class="prx-20">Street Address:</label>
								<input type="text" id="edit-street" value="${street}" 
								 class="prx-21">
							</div>
							<div class="prx-19">
								<label class="prx-20">City:</label>
								<select id="edit-city" data-lebanese-city-select
								 class="prx-21">
									${renderLebaneseCityOptions(city)}
								</select>
							</div>
							<div class="prx-19">
								<label class="prx-20">Cardholder Name:</label>
								<input type="text" id="edit-cardholder" value="" 
								 class="prx-21">
							</div>
							<div class="prx-19">
								<label class="prx-20">Card Number:</label>
								<input type="text" id="edit-cardnumber" value="" placeholder="1234 5678 9012 3456"
								 class="prx-21">
							</div>
							<div class="prx-24">
								<div class="prx-25">
									<label class="prx-20">Expiry Month:</label>
									<select id="edit-expmonth" class="prx-21">
										<option value="">MM</option>
										<option value="01">01</option>
										<option value="02">02</option>
										<option value="03">03</option>
										<option value="04">04</option>
										<option value="05">05</option>
										<option value="06">06</option>
										<option value="07">07</option>
										<option value="08">08</option>
										<option value="09">09</option>
										<option value="10">10</option>
										<option value="11">11</option>
										<option value="12">12</option>
									</select>
								</div>
								<div class="prx-25">
									<label class="prx-20">Expiry Year:</label>
									<select id="edit-expyear" class="prx-21">
										<option value="">YYYY</option>
										${Array.from({ length: 10 }, (_, i) => {
											const year = new Date().getFullYear() + i;
											return `<option value="${year}">${year}</option>`;
										}).join("")}
									</select>
								</div>
							</div>
							<div class="prx-26">
								<label class="prx-20">Card Type:</label>
								<select id="edit-cardtype" class="prx-21">
									<option value="other">Select Card Type</option>
									<option value="visa">Visa</option>
									<option value="mastercard">Mastercard</option>
									<option value="amex">American Express</option>
									<option value="discover">Discover</option>
									<option value="other">Other</option>
								</select>
							</div>
							<div class="prx-27">
								<button onclick="saveProfile()" class="btn prx-28">Save Changes</button>
								<button onclick="window.location.reload()" class="btn prx-29">Cancel</button>
							</div>
						</div>
					</div>
				`;
			}

			// Save profile changes
			async function saveProfile() {
				const name = document.getElementById("edit-name").value.trim();
				const phoneNumber = document.getElementById("edit-phone").value.trim();
				const street = document.getElementById("edit-street").value.trim();
				const city = document.getElementById("edit-city").value.trim();

				// Credit card information
				const cardholderName = document
					.getElementById("edit-cardholder")
					.value.trim();
				const cardNumber = document
					.getElementById("edit-cardnumber")
					.value.trim()
					.replace(/\s/g, "");
				const expiryMonth = document.getElementById("edit-expmonth").value;
				const expiryYear = document.getElementById("edit-expyear").value;
				const cardType = document.getElementById("edit-cardtype").value;

				// Validation
				if (!name) {
					showMessage("Name is required", "error");
					return;
				}

				if (!street || !city) {
					showMessage("All address fields are required", "error");
					return;
				}

				// Credit card validation (optional)
				if (cardNumber && !/^\d{13,19}$/.test(cardNumber)) {
					showMessage("Please enter a valid card number", "error");
					return;
				}

				if (cardNumber && (!expiryMonth || !expiryYear)) {
					showMessage("Please select expiry month and year", "error");
					return;
				}

				try {
					const updateData = {
						name,
						phoneNumber,
						address: {
							street,
							city,
						},
					};

					// Add credit card data if provided
					if (cardNumber || cardholderName) {
						updateData.creditCard = {
							holderName: cardholderName,
							cardNumber: cardNumber,
							expiryMonth: expiryMonth,
							expiryYear: expiryYear,

							cardType: cardType,
						};
					}

					const response = await fetch(`${API_BASE_URL}/auth/profile`, {
						method: "PUT",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(updateData),
					});

					if (response.ok) {
						showMessage("Profile updated successfully!", "success");
						setTimeout(() => {
							window.location.reload(); // Refresh the page to show updated data
						}, 2000);
					} else {
						const errorData = await response.json();
						showMessage(
							formatApiError(errorData) || "Failed to update profile",
							"error"
						);
					}
				} catch (error) {
					showMessage("Failed to update profile. Please try again.", "error");
				}
			}

			// Change password function
			function changePassword() {
				// These buttons live inside the driver settings popup; close it so the
				// form that replaces #profile-content underneath is actually visible.
				if (typeof closeSettingsModal === "function") closeSettingsModal();
				// Show password change form
				const profileContent = document.getElementById("profile-content");
				profileContent.innerHTML = `
					<div class="prx-16">
						<h3 class="prx-17">Change Password</h3>
						<div class="prx-30">
							<div class="prx-31">
								<input type="password" id="current-password" placeholder="Current Password" 
								 class="prx-21">
							</div>
							<div class="prx-31">
								<input type="password" id="new-password" placeholder="New Password" 
								 class="prx-21">
							</div>
							<div class="prx-32">
								<input type="password" id="confirm-password" placeholder="Confirm New Password" 
								 class="prx-21">
							</div>
							<div class="prx-27">
								<button onclick="submitPasswordChange()" class="btn prx-28">Update Password</button>
								<button onclick="window.location.reload()" class="btn prx-29">Back to Profile</button>
							</div>
						</div>
					</div>
				`;
			}

			// Submit password change
			async function submitPasswordChange() {
				const currentPassword =
					document.getElementById("current-password").value;
				const newPassword = document.getElementById("new-password").value;
				const confirmPassword =
					document.getElementById("confirm-password").value;

				// Validation
				if (!currentPassword || !newPassword || !confirmPassword) {
					showMessage("Please fill in all fields", "error");
					return;
				}

				if (newPassword !== confirmPassword) {
					showMessage("New passwords do not match", "error");
					return;
				}

				if (newPassword.length < 6) {
					showMessage(
						"New password must be at least 6 characters long",
						"error"
					);
					return;
				}

				try {
					const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
						method: "PUT",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							currentPassword,
							newPassword,
						}),
					});

					if (response.ok) {
						showMessage("Password changed successfully!", "success");
						setTimeout(() => {
							window.location.reload(); // Refresh the page
						}, 2000);
					} else {
						const errorData = await response.json();
						showMessage(
							formatApiError(errorData) || "Failed to change password",
							"error"
						);
					}
				} catch (error) {
					showMessage("Failed to change password. Please try again.", "error");
				}
			}

			// Load user profile
			async function loadUserProfile() {
				showLoading(true);

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

						// Update profile information
						document.getElementById("user-name").textContent = user.name;
						document.getElementById("user-email").textContent = user.email;
						document.getElementById("user-phone").textContent =
							user.phoneNumber;

						// Update role badge
						const roleBadge = document.getElementById("user-role");
						roleBadge.textContent = user.role.toUpperCase();
						roleBadge.className = `role-badge ${user.role}`;

						// Show the live-location section for riders and market drivers.
						if (user.role === "rider" || user.role === "market_driver") {
							const sec = document.getElementById(
								"rider-location-section"
							);
							if (sec) sec.style.display = "";
							// Ask for location permission directly (no click needed);
							// the button remains only as a fallback if this is denied.
							setTimeout(() => tryAutoStartLocation(), 300);
							// Show the driver's assigned orders right here on the profile.
							const delSec = document.getElementById(
								"my-deliveries-section"
							);
							if (delSec) delSec.style.display = "";
							loadMyDeliveries();
							// Keep the deliveries table in sync automatically: when an
							// admin/market reassigns an order to (or away from) this driver
							// on the orders pages, it appears/disappears here within the
							// polling interval — no manual Refresh needed.
							startDeliveriesAutoSync();
							// Drivers get a minimal screen: deliveries on top, everything
							// else tucked into the settings popup in the corner.
							setupDriverMinimalLayout();
						}

						// Update address
						const addressText = [user.address.street, user.address.city]
							.filter(Boolean)
							.join(", ");
						document.getElementById("user-address").textContent = addressText;

						// Update account info
						document.getElementById("member-since").textContent = formatDate(
							user.createdAt
						);
						document.getElementById("last-login").textContent = user.lastLogin
							? formatDateTime(user.lastLogin)
							: "First time";
						document.getElementById("account-status").textContent =
							user.isActive ? "Active" : "Inactive";

						showLoading(false);
					} else {
						throw new Error("Failed to load profile");
					}
				} catch (error) {
					showMessage("Failed to load profile. Please try again.", "error");
					showLoading(false);
				}
			}

			// ───────── Driver deliveries (rider / market_driver) ─────────
			// The backend automatically scopes /api/orders to the logged-in driver's
			// own assigned orders, so we just ask for the ones still in progress.
			// The list response already carries everything the detail dialogs need
			// (customer + address pin, items with their products, totals, payment,
			// notes, store), so the dialogs render from it without another request.
			let __deliveriesSyncInterval = null;
			let __deliveryOrders = {}; // order id -> order, from the last list load
			function startDeliveriesAutoSync() {
				if (__deliveriesSyncInterval) clearInterval(__deliveriesSyncInterval);
				// Poll periodically so reassignments made elsewhere show up on their
				// own. Pause while the tab is hidden to avoid needless requests, and
				// refresh immediately when the driver returns to the tab.
				__deliveriesSyncInterval = setInterval(() => {
					if (document.visibilityState === "visible") loadMyDeliveries();
				}, 20000);
				document.addEventListener("visibilitychange", () => {
					if (document.visibilityState === "visible") loadMyDeliveries();
				});
			}

			async function loadMyDeliveries() {
				const list = document.getElementById("deliveries-list");
				if (!list) return;
				// Only show the placeholder on a first/empty load: the 20s auto-sync
				// must not blank the cards the driver is looking at.
				if (!list.querySelector(".dlv-card")) {
					list.innerHTML = '<div class="dlv-empty">Loading…</div>';
				}
				try {
					const res = await fetch(
						`${API_BASE_URL}/orders?status=${encodeURIComponent(
							"OnTheWay,ready for pickup"
						)}&limit=50`,
						{
							headers: {
								Authorization: `Bearer ${currentToken}`,
								"Content-Type": "application/json",
							},
						}
					);
					if (!res.ok) {
						list.innerHTML =
							'<div class="dlv-empty error">Failed to load deliveries.</div>';
						return;
					}
					const data = await res.json();
					renderDeliveries((data.data && data.data.orders) || []);
				} catch (e) {
					list.innerHTML =
						'<div class="dlv-empty error">Error loading deliveries.</div>';
				}
			}

			// Order data is typed by customers (names, street, notes), so every
			// value is escaped before it goes into markup.
			function __esc(value) {
				return String(value == null ? "" : value).replace(
					/[&<>"']/g,
					(ch) =>
						({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
				);
			}
			function __num(value) {
				const n = Number(value);
				return isFinite(n) ? n : 0;
			}
			function __money(value) {
				return `$${__num(value).toFixed(2)}`;
			}
			function __dateTime(value) {
				if (!value) return "";
				const d = new Date(value);
				if (isNaN(d.getTime())) return "";
				return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
			}
			const __STATUS_LABELS = {
				OnTheWay: "On the way",
				"ready for pickup": "Ready for pickup",
				delivered: "Delivered",
				cancelled: "Cancelled",
				pending: "Pending",
				confirmed: "Confirmed",
				processing: "Processing",
			};
			function __statusBadge(status) {
				const value = status || "pending";
				const label = __STATUS_LABELS[value] || value;
				const cls = String(value).toLowerCase().replace(/\s+/g, "-");
				return `<span class="status-badge ${__esc(cls)}">${__esc(label)}</span>`;
			}
			const __PAYMENT_LABELS = {
				cash: "Cash on delivery",
				card: "Card",
				online: "Online",
				wallet: "Wallet",
			};
			function __paymentLabel(method) {
				return __PAYMENT_LABELS[method] || (method ? String(method) : "Cash on delivery");
			}

			// Where the customer is: their exact map pin when the order has one,
			// otherwise the typed address (street is sometimes just the city name
			// repeated, so that duplicate is dropped).
			function __customerPlace(order) {
				const addr = (order.customer && order.customer.address) || {};
				const loc = addr.location || {};
				const lat = Number(loc.latitude);
				const lng = Number(loc.longitude);
				const hasPin =
					loc.latitude != null &&
					loc.longitude != null &&
					isFinite(lat) &&
					isFinite(lng) &&
					!(lat === 0 && lng === 0);
				const city = String(addr.city || "").trim();
				let street = String(addr.street || "").trim();
				if (street && city && street.toLowerCase() === city.toLowerCase()) street = "";
				const text = [street, city].filter(Boolean).join(", ");
				return { hasPin, lat, lng, street, city, text };
			}
			function __mapLinks(place) {
				const query = place.hasPin
					? `${place.lat},${place.lng}`
					: place.text
					? `${place.text}, Lebanon`
					: "";
				if (!query) return null;
				const q = encodeURIComponent(query);
				return {
					embed: `https://maps.google.com/maps?q=${q}&z=${place.hasPin ? 16 : 14}&hl=en&output=embed`,
					open: `https://www.google.com/maps/search/?api=1&query=${q}`,
					directions: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
				};
			}
			// wa.me needs the full international number without "+". Lebanese
			// numbers are often stored locally ("03 123 456", "70123456").
			function __whatsappNumber(phone) {
				let digits = String(phone || "").replace(/\D/g, "");
				if (!digits) return "";
				if (digits.startsWith("00")) digits = digits.slice(2);
				else if (digits.startsWith("0")) digits = "961" + digits.slice(1);
				else if (digits.length <= 8) digits = "961" + digits;
				return digits;
			}
			function __initials(name) {
				const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
				if (!parts.length) return "?";
				return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
			}
			function __itemCount(order) {
				const n = Array.isArray(order.items) ? order.items.length : 0;
				return `${n} item${n !== 1 ? "s" : ""}`;
			}

			function renderDeliveries(orders) {
				const list = document.getElementById("deliveries-list");
				if (!list) return;
				__deliveryOrders = {};
				orders.forEach((o) => {
					if (o && o._id) __deliveryOrders[o._id] = o;
				});
				if (!orders.length) {
					list.innerHTML =
						'<div class="dlv-empty">No orders assigned to you right now.</div>';
					return;
				}
				list.innerHTML = orders
					.map((o) => {
						const id = __esc(o._id);
						const customer = o.customer || {};
						const place = __customerPlace(o);
						const deliverBtn =
							o.status === "OnTheWay"
								? `<button type="button" class="btn btn-primary btn-sm" onclick="markDelivered('${id}')"><i data-lucide=check></i> Mark delivered</button>`
								: "";
						return `
							<article class="dlv-card">
								<div class="dlv-card-head">
									<span class="dlv-order-no">${__esc(o.orderNumber || "Order")}</span>
									${__statusBadge(o.status)}
								</div>
								<div class="dlv-card-customer"><i data-lucide=user-round></i> ${__esc(customer.name || "Customer")}</div>
								<div class="dlv-card-meta">
									${place.city ? `<span><i data-lucide=map-pin></i> ${__esc(place.city)}</span>` : ""}
									<span><i data-lucide=shopping-bag></i> ${__itemCount(o)}</span>
									<span><i data-lucide=wallet></i> ${__money(o.total)} · ${__esc(__paymentLabel(o.paymentMethod))}</span>
								</div>
								<div class="dlv-actions">
									<button type="button" class="btn btn-secondary btn-sm" onclick="openOrderDetails('${id}')"><i data-lucide=receipt></i> Order details</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick="openClientDetails('${id}')"><i data-lucide=user-round></i> Client details</button>
									${deliverBtn}
								</div>
							</article>`;
					})
					.join("");
			}

			// ───────── Order / client detail dialogs ─────────
			function __openDeliveryModal(id) {
				["order-details-modal", "client-details-modal"].forEach((other) => {
					if (other !== id) {
						const el = document.getElementById(other);
						if (el) el.classList.remove("show");
					}
				});
				const modal = document.getElementById(id);
				if (!modal) return;
				modal.classList.add("show");
				document.body.classList.add("modal-open");
				const content = modal.querySelector(".modal-content");
				if (content) content.scrollTop = 0;
			}
			function closeDeliveryModal(id) {
				const modal = document.getElementById(id);
				if (modal) modal.classList.remove("show");
				if (!document.querySelector(".dlv-modal.show")) {
					document.body.classList.remove("modal-open");
				}
				// Stop the embedded map from staying alive in the background.
				if (id === "client-details-modal") {
					const body = document.getElementById("client-details-body");
					if (body) body.innerHTML = "";
				}
			}

			function openOrderDetails(orderId) {
				const o = __deliveryOrders[orderId];
				if (!o) {
					showMessage("This order is no longer assigned to you.", "error");
					return;
				}
				const id = __esc(o._id);
				const customer = o.customer || {};
				const place = __customerPlace(o);
				const items = Array.isArray(o.items) ? o.items : [];
				const storeName =
					o.market && typeof o.market === "object" && o.market.name
						? o.market.name
						: "Freshly LB";

				document.getElementById("order-details-title").textContent =
					o.orderNumber || "Order details";
				document.getElementById("order-details-sub").innerHTML = `${__statusBadge(
					o.status
				)} <span>Placed ${__esc(__dateTime(o.createdAt) || "—")}</span>`;

				const facts = [
					["Store", storeName],
					["Payment", __paymentLabel(o.paymentMethod)],
					["Payment status", null, __statusBadge(o.paymentStatus || "pending")],
					["Delivery time", __dateTime(o.deliveryTime)],
					["Shelf", o.shelfNumber],
					["Assigned to you", __dateTime(o.riderAssignedAt)],
					["Out for delivery", __dateTime(o.deliveryStartedAt)],
				]
					.filter(([, text, html]) => html || (text != null && String(text).trim() !== ""))
					.map(
						([label, text, html]) =>
							`<div><dt>${__esc(label)}</dt><dd>${html || __esc(text)}</dd></div>`
					)
					.join("");

				const itemsHtml = items.length
					? items
							.map((item) => {
								const p = item.product && typeof item.product === "object" ? item.product : {};
								const qty = __num(item.quantity) || 1;
								const line = isFinite(Number(item.totalPrice))
									? __num(item.totalPrice)
									: __num(p.price) * qty;
								const img = p.picture
									? `<img class="dlv-item-img" src="${__esc(p.picture)}" alt="" loading="lazy" />`
									: `<div class="dlv-item-img"><i data-lucide=package></i></div>`;
								const sub = [p.weight, `${__money(line / qty)} each`]
									.filter(Boolean)
									.map(__esc)
									.join(" · ");
								return `
									<div class="dlv-item">
										${img}
										<div class="dlv-item-info">
											<div class="dlv-item-name">${__esc(p.name || "Product unavailable")}</div>
											<div class="dlv-item-sub">${sub}</div>
										</div>
										<div class="dlv-item-qty">× ${qty}</div>
										<div class="dlv-item-total">${__money(line)}</div>
									</div>`;
							})
							.join("")
					: '<div class="dlv-item"><div class="dlv-item-info dlv-item-sub">No items on this order.</div></div>';

				const totalRows = [
					["Subtotal", o.subtotal, true],
					["Delivery", o.delivery, true],
					["Fees", o.fees, __num(o.fees) > 0],
					["Discount", -__num(o.discount), __num(o.discount) > 0],
				]
					.filter(([, , show]) => show)
					.map(
						([label, value]) =>
							`<div class="dlv-total-row"><span>${label}</span><span>${
								__num(value) < 0 ? "−" + __money(-__num(value)) : __money(value)
							}</span></div>`
					)
					.join("");

				let collect = "";
				if (o.paymentStatus === "paid") {
					collect = `<div class="dlv-collect paid"><i data-lucide=circle-check></i> Already paid — nothing to collect.</div>`;
				} else if (!o.paymentMethod || o.paymentMethod === "cash") {
					collect = `<div class="dlv-collect"><i data-lucide=banknote></i> Collect ${__money(
						o.total
					)} in cash on delivery.</div>`;
				}

				document.getElementById("order-details-body").innerHTML = `
					<section class="dlv-section">
						<h4 class="dlv-section-title">Summary</h4>
						<dl class="dlv-kv">${facts}</dl>
					</section>
					<section class="dlv-section">
						<h4 class="dlv-section-title">Client</h4>
						<div class="dlv-client-strip">
							<div class="dlv-avatar sm">${__esc(__initials(customer.name))}</div>
							<div class="dlv-client-strip-info">
								<div class="dlv-item-name">${__esc(customer.name || "Customer")}</div>
								<div class="dlv-item-sub">${__esc(
									[customer.phoneNumber, place.text].filter(Boolean).join(" · ") || "No contact details"
								)}</div>
							</div>
							<button type="button" class="btn btn-secondary btn-sm" onclick="openClientDetails('${id}')"><i data-lucide=user-round></i> View</button>
						</div>
					</section>
					<section class="dlv-section">
						<h4 class="dlv-section-title">Items (${items.length})</h4>
						<div class="dlv-items">${itemsHtml}</div>
						<div class="dlv-totals">
							${totalRows}
							<div class="dlv-total-row grand"><span>Total</span><span>${__money(o.total)}</span></div>
						</div>
						${collect}
					</section>
					${
						o.notes && String(o.notes).trim()
							? `<section class="dlv-section">
									<h4 class="dlv-section-title">Notes from the client</h4>
									<div class="dlv-note">${__esc(o.notes)}</div>
								</section>`
							: ""
					}`;

				document.getElementById("order-details-footer").innerHTML = `
					<button type="button" class="btn btn-secondary" onclick="closeDeliveryModal('order-details-modal')">Close</button>
					<button type="button" class="btn btn-secondary" onclick="openClientDetails('${id}')"><i data-lucide=user-round></i> Client details</button>
					${
						o.status === "OnTheWay"
							? `<button type="button" class="btn btn-primary" onclick="markDelivered('${id}')"><i data-lucide=check></i> Mark delivered</button>`
							: ""
					}`;

				__openDeliveryModal("order-details-modal");
			}

			function openClientDetails(orderId) {
				const o = __deliveryOrders[orderId];
				if (!o) {
					showMessage("This order is no longer assigned to you.", "error");
					return;
				}
				const id = __esc(o._id);
				const customer = o.customer || {};
				const place = __customerPlace(o);
				const links = __mapLinks(place);
				const phone = String(customer.phoneNumber || "").trim();
				const email = String(customer.email || "").trim();
				const wa = __whatsappNumber(phone);

				document.getElementById("client-details-avatar").textContent = __initials(customer.name);
				document.getElementById("client-details-title").textContent =
					customer.name || "Client details";
				document.getElementById("client-details-sub").textContent = `Order ${
					o.orderNumber || ""
				}`.trim();

				const contact = [
					phone
						? `<a class="btn btn-secondary" href="tel:${__esc(phone.replace(/[^\d+]/g, ""))}"><i data-lucide=phone></i> Call</a>`
						: "",
					wa
						? `<a class="btn btn-secondary" href="https://wa.me/${wa}" target="_blank" rel="noopener"><i data-lucide=message-circle></i> WhatsApp</a>`
						: "",
					email
						? `<a class="btn btn-secondary" href="mailto:${__esc(email)}"><i data-lucide=mail></i> Email</a>`
						: "",
				]
					.filter(Boolean)
					.join("");

				const facts = [
					["Phone", phone || "Not provided"],
					["Email", email || "Not provided"],
					["City", place.city || "Not provided"],
					["Street / address", place.street || "Not provided"],
					[
						"Map pin",
						place.hasPin
							? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`
							: "No exact pin on this order",
					],
				]
					.map(
						([label, value]) =>
							`<div><dt>${__esc(label)}</dt><dd>${__esc(value)}</dd></div>`
					)
					.join("");

				const map = links
					? `
						<div class="dlv-map">
							<iframe src="${__esc(links.embed)}" title="Client location" loading="lazy" referrerpolicy="no-referrer-when-downgrade" tabindex="-1"></iframe>
							<a class="dlv-map-link" href="${__esc(links.open)}" target="_blank" rel="noopener" aria-label="Open the client's location in Google Maps">
								<span class="dlv-map-chip"><i data-lucide=external-link></i> Open in Google Maps</span>
							</a>
						</div>
						<div class="dlv-map-note">${
							place.hasPin
								? "Exact pin the client set in the app. Tap the map to open it in Google Maps."
								: "Approximate — this order has no map pin, so the map is based on the typed address."
						}</div>
						<div class="dlv-map-actions">
							<a class="btn btn-primary" href="${__esc(links.directions)}" target="_blank" rel="noopener"><i data-lucide=navigation></i> Directions</a>
							<a class="btn btn-secondary" href="${__esc(links.open)}" target="_blank" rel="noopener"><i data-lucide=map></i> Open in Google Maps</a>
						</div>`
					: `
						<div class="dlv-map">
							<div class="dlv-map-empty"><i data-lucide=map-pin-off></i> No location on file for this client.</div>
						</div>`;

				document.getElementById("client-details-body").innerHTML = `
					${contact ? `<section class="dlv-section"><div class="dlv-contact">${contact}</div></section>` : ""}
					<section class="dlv-section">
						<h4 class="dlv-section-title">Contact &amp; address</h4>
						<dl class="dlv-kv">${facts}</dl>
					</section>
					<section class="dlv-section">
						<h4 class="dlv-section-title">Location</h4>
						${map}
					</section>`;

				document.getElementById("client-details-footer").innerHTML = `
					<button type="button" class="btn btn-secondary" onclick="closeDeliveryModal('client-details-modal')">Close</button>
					<button type="button" class="btn btn-secondary" onclick="openOrderDetails('${id}')"><i data-lucide=receipt></i> Order details</button>`;

				__openDeliveryModal("client-details-modal");
			}

			async function markDelivered(orderId) {
				if (!confirm("Mark this order as delivered?")) return;
				try {
					const res = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
						method: "PUT",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ status: "delivered" }),
					});
					const result = await res.json().catch(() => ({}));
					if (res.ok) {
						showMessage("Order marked as delivered.", "success");
						closeDeliveryModal("order-details-modal");
						closeDeliveryModal("client-details-modal");
						loadMyDeliveries();
					} else {
						showMessage(formatApiError(result, "Failed to update order."), "error");
					}
				} catch (e) {
					showMessage("Error updating order.", "error");
				}
			}

			// ───────── Driver minimal layout & settings popup ─────────
			// For drivers the deliveries list is the whole job, so it moves to the
			// top and every other section (personal info, live location, address,
			// account) plus the action buttons are relocated into a settings popup
			// opened from the gear in the header corner. Non-drivers are untouched.
			function setupDriverMinimalLayout() {
				const profileContent = document.getElementById("profile-content");
				const modalBody = document.getElementById("settings-modal-body");
				const delSec = document.getElementById("my-deliveries-section");
				const gear = document.getElementById("settings-gear-btn");
				if (!profileContent || !modalBody || !delSec) return;

				// Deliveries first — it is the reason this screen exists.
				profileContent.insertBefore(delSec, profileContent.firstChild);

				// Everything else (sections + the action buttons), in document
				// order, goes into the popup. Skip the deliveries section itself.
				const toMove = [];
				Array.from(profileContent.children).forEach((el) => {
					if (el === delSec) return;
					if (
						el.classList.contains("profile-section") ||
						el.classList.contains("actions")
					) {
						toMove.push(el);
					}
				});
				toMove.forEach((el) => modalBody.appendChild(el));

				if (gear) gear.style.display = "";
			}

			function openSettingsModal() {
				const modal = document.getElementById("settings-modal");
				if (modal) modal.style.display = "flex";
			}

			function closeSettingsModal() {
				const modal = document.getElementById("settings-modal");
				if (modal) modal.style.display = "none";
			}

			// Close the settings popup when clicking the dimmed backdrop or Escape.
			document.addEventListener("click", (e) => {
				const modal = document.getElementById("settings-modal");
				if (modal && e.target === modal) closeSettingsModal();
				// Same for the order / client detail dialogs.
				if (e.target && e.target.classList && e.target.classList.contains("dlv-modal")) {
					closeDeliveryModal(e.target.id);
				}
			});
			document.addEventListener("keydown", (e) => {
				if (e.key !== "Escape") return;
				closeSettingsModal();
				document
					.querySelectorAll(".dlv-modal.show")
					.forEach((m) => closeDeliveryModal(m.id));
			});

			// Load profile when page loads
			document.addEventListener("DOMContentLoaded", loadUserProfile);

			// ===== Rider live location tracking =====
			let __locWatchId = null;
			let __autoPushIntervalId = null;
			let __lastPushAt = 0;
			let __lastPushed = { lat: null, lng: null };
			let __permissionRequested = false; // ensures we only ever auto-ask once

			function __setStatus(text, color) {
				const el = document.getElementById("gps-status");
				if (el) {
					el.textContent = text;
					el.style.color = color || "#888";
				}
			}
			function __setLastUpdate(lat, lng) {
				const el = document.getElementById("gps-last-update");
				if (el)
					el.textContent = `${lat.toFixed(5)}, ${lng.toFixed(
						5
					)} — ${new Date().toLocaleTimeString()}`;
			}
			function __haversineMeters(a, b) {
				if (a.lat == null || b.lat == null) return Infinity;
				const toRad = (d) => (d * Math.PI) / 180;
				const R = 6371000;
				const dLat = toRad(b.lat - a.lat);
				const dLng = toRad(b.lng - a.lng);
				const h =
					Math.sin(dLat / 2) ** 2 +
					Math.cos(toRad(a.lat)) *
						Math.cos(toRad(b.lat)) *
						Math.sin(dLng / 2) ** 2;
				return 2 * R * Math.asin(Math.sqrt(h));
			}
			async function __pushLocation(latitude, longitude) {
				try {
					const r = await fetch(`${API_BASE_URL}/riders/location`, {
						method: "PATCH",
						headers: {
							Authorization: `Bearer ${currentToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ latitude, longitude }),
					});
					if (r.ok) {
						__lastPushAt = Date.now();
						__lastPushed = { lat: latitude, lng: longitude };
						__setStatus("Live location active", "#28a745");
						__setLastUpdate(latitude, longitude);
					} else {
						const j = await r.json().catch(() => ({}));
						__setStatus(
							`Server rejected location: ${j.message || r.status}`,
							"#dc3545"
						);
					}
				} catch (e) {
					console.error(e);
					__setStatus("Network error pushing location", "#dc3545");
				}
			}
			function __isSecureForGeo() {
				return (
					window.isSecureContext ||
					location.protocol === "https:" ||
					location.hostname === "localhost" ||
					location.hostname === "127.0.0.1"
				);
			}
			function __startWatch() {
				if (__locWatchId !== null) return;
				__locWatchId = navigator.geolocation.watchPosition(
					(pos) => {
						const { latitude, longitude } = pos.coords;
						const now = Date.now();
						const moved = __haversineMeters(__lastPushed, {
							lat: latitude,
							lng: longitude,
						});
						if (moved > 20 || now - __lastPushAt > 30000) {
							__pushLocation(latitude, longitude);
						}
					},
					(err) => {
						let msg = "GPS unavailable";
						if (err.code === 1)
							msg =
								"Permission denied — open the padlock icon in the address bar and set Location to Allow, then click the button again";
						else if (err.code === 2) msg = "Position unavailable";
						else if (err.code === 3) msg = "GPS timed out";
						__setStatus(msg, "#dc3545");
						console.warn("watchPosition error:", err);
					},
					{ enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
				);
			}

			// Guarantees a location push at least once every 1 minute, even if the
			// driver hasn't moved (watchPosition above only fires on movement, so
			// a stationary driver could otherwise go stale on the admin/market map).
			function __startAutoPushInterval() {
				if (__autoPushIntervalId !== null) return;
				__autoPushIntervalId = setInterval(() => {
					if (!("geolocation" in navigator)) return;
					navigator.geolocation.getCurrentPosition(
						(pos) =>
							__pushLocation(pos.coords.latitude, pos.coords.longitude),
						(err) => console.warn("Auto location refresh failed:", err),
						{ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
					);
				}, 60000); // every 1 minute
			}

			// Called automatically after profile loads. Directly requests location
			// permission — no button click required. The browser's native "Allow
			// location access?" prompt appears immediately on its own. Guarded by
			// __permissionRequested so this is only ever triggered ONE time; the
			// browser itself also never re-prompts once the user has answered.
			function tryAutoStartLocation() {
				if (__permissionRequested) return;
				__permissionRequested = true;

				if (!("geolocation" in navigator)) {
					__setStatus("Geolocation not supported", "#dc3545");
					return;
				}
				if (!__isSecureForGeo()) {
					__setStatus(
						"Use http://localhost or HTTPS (LAN IPs are blocked by browsers)",
						"#dc3545"
					);
					return;
				}

				__setStatus("Requesting permission…", "#b08900");
				navigator.geolocation.getCurrentPosition(
					(pos) => {
						__pushLocation(pos.coords.latitude, pos.coords.longitude);
						__startWatch();
						__startAutoPushInterval();
						const lbl = document.getElementById("enable-location-label");
						if (lbl) lbl.textContent = "Tracking active";
						const btn = document.getElementById("enable-location-btn");
						if (btn) btn.style.display = "none";
					},
					(err) => {
						if (err.code === 1) {
							__setStatus(
								"Location permission denied — click the button below to allow, or enable it via the browser's site settings",
								"#dc3545"
							);
						} else if (err.code === 2) {
							__setStatus(
								"Position unavailable — click the button to retry",
								"#dc3545"
							);
						} else {
							__setStatus(
								"GPS timed out — click the button to retry",
								"#dc3545"
							);
						}
					},
					{ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
				);
			}

			// Fallback for when the automatic request above failed or was denied
			// (e.g. the user needs to retry after allowing location in the
			// browser's site settings). A real click here guarantees a user
			// gesture so the browser will show the permission popup again if it
			// hasn't been permanently blocked.
			function enableRiderLiveLocation() {
				__permissionRequested = true;
				if (!("geolocation" in navigator)) {
					alert("Geolocation is not supported by this browser.");
					return;
				}
				if (!__isSecureForGeo()) {
					alert(
						"Geolocation only works on http://localhost or HTTPS. " +
							"Open this page on localhost (not on a LAN IP like 192.168.x.x)."
					);
					return;
				}
				__setStatus("Requesting permission…", "#b08900");
				navigator.geolocation.getCurrentPosition(
					(pos) => {
						__pushLocation(pos.coords.latitude, pos.coords.longitude);
						__startWatch();
						__startAutoPushInterval();
						const lbl = document.getElementById("enable-location-label");
						if (lbl) lbl.textContent = "Tracking active";
						const btn = document.getElementById("enable-location-btn");
						if (btn) btn.style.display = "none";
					},
					(err) => {
						let msg = "Unable to get your location.";
						if (err.code === 1)
							msg =
								"Location permission was denied.\n\n" +
								"To fix: click the  padlock icon next to the URL  Site settings  Location  Allow  reload the page.";
						else if (err.code === 2)
							msg = "Position unavailable. Check device GPS / Wi-Fi.";
						else if (err.code === 3) msg = "Location request timed out.";
						__setStatus(" " + msg.split("\n")[0], "#dc3545");
						alert(msg);
					},
					{ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
				);
			}
		