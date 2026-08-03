
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
			async function loadMyDeliveries() {
				const tbody = document.getElementById("deliveries-table-body");
				if (!tbody) return;
				tbody.innerHTML =
					'<tr><td colspan="6" class="prx-14">Loading…</td></tr>';
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
						tbody.innerHTML =
							'<tr><td colspan="6" class="prx-33">Failed to load deliveries.</td></tr>';
						return;
					}
					const data = await res.json();
					renderDeliveries((data.data && data.data.orders) || []);
				} catch (e) {
					tbody.innerHTML =
						'<tr><td colspan="6" class="prx-33">Error loading deliveries.</td></tr>';
				}
			}

			function renderDeliveries(orders) {
				const tbody = document.getElementById("deliveries-table-body");
				if (!tbody) return;
				if (!orders.length) {
					tbody.innerHTML =
						'<tr><td colspan="6" class="prx-14">No orders assigned to you right now.</td></tr>';
					return;
				}
				tbody.innerHTML = orders
					.map((o) => {
						const customer = (o.customer && o.customer.name) || "N/A";
						const itemCount = (o.items && o.items.length) || 0;
						const total = (o.total || 0).toFixed(2);
						const status = o.status || "pending";
						const action =
							status === "OnTheWay"
								? `<button class="btn prx-34" onclick="markDelivered('${o._id}')">✓ Mark Delivered</button>`
								: '<span class="prx-3">—</span>';
						return `
							<tr>
								<td class="prx-35"><strong>${o.orderNumber}</strong></td>
								<td class="prx-35">${customer}</td>
								<td class="prx-35">${itemCount} item${
							itemCount !== 1 ? "s" : ""
						}</td>
								<td class="prx-35">$${total}</td>
								<td class="prx-35">${status}</td>
								<td class="prx-35">${action}</td>
							</tr>`;
					})
					.join("");
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
						loadMyDeliveries();
					} else {
						showMessage(formatApiError(result, "Failed to update order."), "error");
					}
				} catch (e) {
					showMessage("Error updating order.", "error");
				}
			}

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
						__setStatus("🟢 Live location active", "#28a745");
						__setLastUpdate(latitude, longitude);
					} else {
						const j = await r.json().catch(() => ({}));
						__setStatus(
							`🔴 Server rejected location: ${j.message || r.status}`,
							"#dc3545"
						);
					}
				} catch (e) {
					console.error(e);
					__setStatus("🔴 Network error pushing location", "#dc3545");
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
						let msg = "🔴 GPS unavailable";
						if (err.code === 1)
							msg =
								"🔴 Permission denied — open the padlock icon in the address bar and set Location to Allow, then click the button again";
						else if (err.code === 2) msg = "🔴 Position unavailable";
						else if (err.code === 3) msg = "🔴 GPS timed out";
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
					__setStatus("🔴 Geolocation not supported", "#dc3545");
					return;
				}
				if (!__isSecureForGeo()) {
					__setStatus(
						"🔴 Use http://localhost or HTTPS (LAN IPs are blocked by browsers)",
						"#dc3545"
					);
					return;
				}

				__setStatus("🟡 Requesting permission…", "#b08900");
				navigator.geolocation.getCurrentPosition(
					(pos) => {
						__pushLocation(pos.coords.latitude, pos.coords.longitude);
						__startWatch();
						__startAutoPushInterval();
						const lbl = document.getElementById("enable-location-label");
						if (lbl) lbl.textContent = "✓ Tracking active";
						const btn = document.getElementById("enable-location-btn");
						if (btn) btn.style.display = "none";
					},
					(err) => {
						if (err.code === 1) {
							__setStatus(
								"🔴 Location permission denied — click the button below to allow, or enable it via the browser's site settings",
								"#dc3545"
							);
						} else if (err.code === 2) {
							__setStatus(
								"🔴 Position unavailable — click the button to retry",
								"#dc3545"
							);
						} else {
							__setStatus(
								"🔴 GPS timed out — click the button to retry",
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
				__setStatus("🟡 Requesting permission…", "#b08900");
				navigator.geolocation.getCurrentPosition(
					(pos) => {
						__pushLocation(pos.coords.latitude, pos.coords.longitude);
						__startWatch();
						__startAutoPushInterval();
						const lbl = document.getElementById("enable-location-label");
						if (lbl) lbl.textContent = "✓ Tracking active";
						const btn = document.getElementById("enable-location-btn");
						if (btn) btn.style.display = "none";
					},
					(err) => {
						let msg = "Unable to get your location.";
						if (err.code === 1)
							msg =
								"Location permission was denied.\n\n" +
								"To fix: click the 🔒 padlock icon next to the URL → Site settings → Location → Allow → reload the page.";
						else if (err.code === 2)
							msg = "Position unavailable. Check device GPS / Wi-Fi.";
						else if (err.code === 3) msg = "Location request timed out.";
						__setStatus("🔴 " + msg.split("\n")[0], "#dc3545");
						alert(msg);
					},
					{ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
				);
			}
		