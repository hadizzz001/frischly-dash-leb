
			// Check system status on load
			async function checkSystemStatus() {
				try {
					const response = await fetch("/api/settings/public");
					const data = await response.json();
					if (data.success) {
						if (data.data.isMaintenanceMode) {
							document.body.innerHTML = `
								<div class="shx-2">
									<h1 class="shx-3">🚧</h1>
									<h2>Maintenance Mode</h2>
									<p>${data.data.maintenanceMessage}</p>
								</div>
							`;
						} else if (data.data.areOrdersDisabled) {
							const checkoutBtn = document.getElementById("checkout-btn");
							if (checkoutBtn) {
								checkoutBtn.disabled = true;
								checkoutBtn.textContent = "Ordering Disabled";
								checkoutBtn.title = data.data.maintenanceMessage;
								checkoutBtn.style.backgroundColor = "#ccc";
								checkoutBtn.style.cursor = "not-allowed";
							}
							// Also show a banner
							const banner = document.createElement("div");
							banner.style.cssText =
								"background: #ffc107; color: #000; text-align: center; padding: 10px; position: fixed; top: 0; left: 0; right: 0; z-index: 1000; font-weight: bold;";
							banner.textContent =
								"⚠️ " +
								(data.data.maintenanceMessage ||
									"Ordering is currently disabled.");
							document.body.prepend(banner);
							// Adjust header position if needed
							const header = document.querySelector(".header");
							if (header) header.style.top = "40px";
						}
					}
				} catch (error) {
					console.error("Error checking system status:", error);
				}
			}

			// Call on load
			checkSystemStatus();

			let allProducts = [];
			let filteredProducts = [];
			let allCategories = [];
			let cart = [];

			// Pagination variables
			let currentPage = 1;
			let totalPages = 1;
			let totalProducts = 0;
			let productsPerPage = 20; // Show 20 products per page
			let currentFilters = {
				search: "",
				category: "all",
				sortBy: "name",
			};

			// Initialize the page
			document.addEventListener("DOMContentLoaded", async function () {
				loadCategories();
				loadProducts();
				await loadCart();
			});

			// Load categories for filter dropdown
			async function loadCategories() {
				try {
					// Load categories with their subcategories
					const [categoriesResponse, subcategoriesResponse] = await Promise.all(
						[
							fetch(`${API_BASE_URL}/categories`),
							fetch(`${API_BASE_URL}/subcategories`),
						]
					);

					let categories = [];
					let subcategories = [];

					if (categoriesResponse.ok) {
						const categoriesData = await categoriesResponse.json();
						categories = (categoriesData.data && categoriesData.data.categories) || [];
					}

					if (subcategoriesResponse.ok) {
						const subcategoriesData = await subcategoriesResponse.json();
						subcategories = (subcategoriesData.data && subcategoriesData.data.subcategories) || [];
					}

					allCategories = categories;
					populateCategoryFilter(subcategories);
				} catch (error) {
					console.error("Error loading categories and subcategories:", error);
				}
			}

			// Populate category filter dropdown
			function populateCategoryFilter(subcategories) {
				const categoryFilter = document.getElementById("category-filter");
				categoryFilter.innerHTML =
					'<option value="all">All Categories</option>';

				// Create a map of categories for easy lookup
				const categoryMap = {};
				allCategories.forEach((category) => {
					categoryMap[category._id] = category;
				});

				// Group subcategories by parent category
				const subcategoriesByCategory = {};
				subcategories.forEach((subcategory) => {
					const parentId =
						subcategory.parentCategory?._id || subcategory.parentCategory;
					if (!subcategoriesByCategory[parentId]) {
						subcategoriesByCategory[parentId] = [];
					}
					subcategoriesByCategory[parentId].push(subcategory);
				});

				// Add categories and their subcategories
				allCategories.forEach((category) => {
					if (category.isActive) {
						const option = document.createElement("option");
						option.value = `category-${category._id}`;
						option.textContent = category.name;
						option.setAttribute("data-type", "category");
						categoryFilter.appendChild(option);

						// Add subcategories for this category
						const categorySubcategories =
							subcategoriesByCategory[category._id] || [];
						categorySubcategories.forEach((subcategory) => {
							if (subcategory.isActive) {
								const subOption = document.createElement("option");
								subOption.value = `subcategory-${subcategory._id}`;
								subOption.textContent = `  └ ${subcategory.name}`;
								subOption.setAttribute("data-type", "subcategory");
								categoryFilter.appendChild(subOption);
							}
						});
					}
				});
			}

			// Load products from API with pagination and filters
			async function loadProducts(page = 1, filters = {}) {
				const loadingDiv = document.getElementById("products-loading");
				const gridDiv = document.getElementById("products-grid");

				loadingDiv.style.display = "block";
				gridDiv.style.display = "none";

				try {
					// Debug API_BASE_URL
					console.log("API_BASE_URL:", API_BASE_URL);
					console.log("typeof API_BASE_URL:", typeof API_BASE_URL);

					// Build query parameters
					const params = new URLSearchParams({
						page: page,
						limit: productsPerPage,
						isActive: true,
						...filters,
					});

					console.log(`Loading products: page ${page}, filters:`, filters);
					console.log(`API URL: ${API_BASE_URL}/products?${params}`);
					console.log(
						`Full URL: ${API_BASE_URL}/products?${params.toString()}`
					);

					const response = await fetch(`${API_BASE_URL}/products?${params}`);
					console.log("Response status:", response.status);
					console.log("Response ok:", response.ok);

					if (!response.ok) {
						const errorText = await response.text();
						console.error("Response error:", errorText);
						throw new Error(
							`Failed to load products: ${response.status} ${response.statusText}`
						);
					}

					const data = await response.json();
					console.log(`API Response:`, data);

					allProducts = (data.data && data.data.products) || [];
					filteredProducts = [...allProducts];

					// Update pagination info
					const dataPagination = data.data && data.data.pagination;
					currentPage = dataPagination?.currentPage || 1;
					totalPages = dataPagination?.totalPages || 1;
					totalProducts = dataPagination?.totalProducts || 0;

					console.log(
						`Pagination: Page ${currentPage}/${totalPages}, Total: ${totalProducts}`
					);

					displayProducts(filteredProducts);
					updatePaginationControls();

					loadingDiv.style.display = "none";
					gridDiv.style.display = "grid";
				} catch (error) {
					console.error("Error loading products:", error);
					console.error("Error details:", error.message);
					loadingDiv.innerHTML =
						'<div class="shx-4">Error loading products. Please try again.</div>';
				}
			}

			// Display products in grid
			function displayProducts(products) {
				const gridDiv = document.getElementById("products-grid");
				const emptyState = document.getElementById("empty-state");

				if (products.length === 0) {
					gridDiv.style.display = "none";
					emptyState.style.display = "block";
					return;
				}

				emptyState.style.display = "none";
				gridDiv.style.display = "grid";

				gridDiv.innerHTML = products
					.map((product) => {
						const imageUrl = product.picture
							? product.picture.replace(
									"https://res.cloudinary.com/dbgnsnrto/image/upload/",
									"https://res.cloudinary.com/dbgnsnrto/image/upload/"
							  )
							: "";
						const price = product.price || 0;
						const finalPrice = calculateFinalPrice(product);
						const categoryName =
							product.subcategory?.parentCategory?.name || "Uncategorized";
						const subcategoryName = product.subcategory?.name || "";
						const displayCategory = subcategoryName
							? `${categoryName} > ${subcategoryName}`
							: categoryName;
						const stockStatus = getStockStatus(product.stock);

						return `
							<div class="product-card">
								<div class="product-image">
									${
										imageUrl
											? `<img src="${imageUrl}" alt="${product.name}" onerror="this.parentElement.innerHTML='<div class=\\'no-image\\'>📦</div>'">`
											: '<div class="no-image">📦</div>'
									}
								</div>
								<div class="product-info">
									<div class="product-name">${product.name}</div>
									<div class="product-price">$${finalPrice.toFixed(2)}</div>
									<div class="product-description">${
										product.description || "No description available."
									}</div>
									<div class="product-meta">
										<span class="product-category">${displayCategory}</span>
										<span class="product-stock ${stockStatus.class}">${stockStatus.text}</span>
									</div>
									<button onclick="addToCart('${product._id}', '${product.name.replace(
							/'/g,
							"\\'"
						)}', ${finalPrice}, '${imageUrl}')" class="add-to-cart-btn" ${
							stockStatus.class === "out" ? "disabled" : ""
						}>
										${stockStatus.class === "out" ? "Out of Stock" : "Add to Cart"}
									</button>
								</div>
							</div>
						`;
					})
					.join("");
			}

			// Calculate final price including tax and bottle refund
			function calculateFinalPrice(product) {
				const basePrice = product.price || 0;
				const discount = product.discount || 0;
				const tax = product.tax || 0;
				const bottlerefund = product.bottlerefund || 0;

				// Calculate discounted price
				const discountAmount = (basePrice * discount) / 100;
				const discountedPrice = basePrice - discountAmount;

				// Calculate final price with tax and bottle refund
				const taxAmount = (discountedPrice * tax) / 100;
				const bottlerefundAmount = bottlerefund;

				return discountedPrice + taxAmount + bottlerefundAmount;
			}

			// Get stock status
			function getStockStatus(stock) {
				if (!stock || stock <= 0) {
					return { text: "Out of Stock", class: "out" };
				} else if (stock <= 10) {
					return { text: `Low Stock (${stock})`, class: "low" };
				} else {
					return { text: `In Stock (${stock})`, class: "" };
				}
			}

			// Filter products based on search and category
			function filterProducts() {
				const searchTerm = document
					.getElementById("search-input")
					.value.toLowerCase();
				const categoryValue = document.getElementById("category-filter").value;
				const sortBy = document.getElementById("sort-select").value;

				// Update current filters
				currentFilters = {
					search: searchTerm,
					category: categoryValue,
					sortBy: sortBy,
				};

				// Build API filter parameters
				const apiFilters = {};

				if (searchTerm) {
					apiFilters.search = searchTerm;
				}

				if (categoryValue !== "all") {
					if (categoryValue.startsWith("category-")) {
						// Filter by parent category
						const categoryId = categoryValue.replace("category-", "");
						apiFilters.category = categoryId;
					} else if (categoryValue.startsWith("subcategory-")) {
						// Filter by subcategory
						const subcategoryId = categoryValue.replace("subcategory-", "");
						apiFilters.subcategory = subcategoryId;
					}
				}

				if (sortBy) {
					apiFilters.sortBy = sortBy;
					apiFilters.sortOrder = "desc"; // Default to descending
				}

				// Reset to first page when filtering
				loadProducts(1, apiFilters);
			}

			// Update pagination controls
			function updatePaginationControls() {
				const paginationSection = document.getElementById("pagination-section");
				const paginationInfo = document.getElementById("pagination-info");
				const paginationNumbers = document.getElementById("pagination-numbers");
				const prevBtn = document.getElementById("prev-page");
				const nextBtn = document.getElementById("next-page");

				if (totalPages <= 1) {
					paginationSection.style.display = "none";
					return;
				}

				paginationSection.style.display = "flex";

				// Update pagination info
				const startItem = (currentPage - 1) * productsPerPage + 1;
				const endItem = Math.min(currentPage * productsPerPage, totalProducts);
				paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${totalProducts} products`;

				// Update prev/next buttons
				prevBtn.disabled = currentPage <= 1;
				nextBtn.disabled = currentPage >= totalPages;

				// Generate page numbers
				paginationNumbers.innerHTML = generatePageNumbers();
			}

			// Generate page number buttons
			function generatePageNumbers() {
				let pages = [];
				const maxVisiblePages = 5;

				if (totalPages <= maxVisiblePages) {
					// Show all pages
					for (let i = 1; i <= totalPages; i++) {
						pages.push(createPageButton(i));
					}
				} else {
					// Show pages with ellipsis
					if (currentPage <= 3) {
						// Show first 3 pages + ellipsis + last page
						for (let i = 1; i <= 3; i++) {
							pages.push(createPageButton(i));
						}
						pages.push('<span class="page-dots">...</span>');
						pages.push(createPageButton(totalPages));
					} else if (currentPage >= totalPages - 2) {
						// Show first page + ellipsis + last 3 pages
						pages.push(createPageButton(1));
						pages.push('<span class="page-dots">...</span>');
						for (let i = totalPages - 2; i <= totalPages; i++) {
							pages.push(createPageButton(i));
						}
					} else {
						// Show first page + ellipsis + current-1, current, current+1 + ellipsis + last page
						pages.push(createPageButton(1));
						pages.push('<span class="page-dots">...</span>');
						for (let i = currentPage - 1; i <= currentPage + 1; i++) {
							pages.push(createPageButton(i));
						}
						pages.push('<span class="page-dots">...</span>');
						pages.push(createPageButton(totalPages));
					}
				}

				return pages.join("");
			}

			// Create a page number button
			function createPageButton(pageNum) {
				const isActive = pageNum === currentPage;
				return `<button class="page-number ${
					isActive ? "active" : ""
				}" onclick="changePage(${pageNum})">${pageNum}</button>`;
			}

			// Change page
			function changePage(page) {
				console.log(`changePage called with page: ${page}`);
				console.log(`currentFilters:`, currentFilters);
				console.log(`currentPage: ${currentPage}, totalPages: ${totalPages}`);

				if (page < 1 || page > totalPages || page === currentPage) {
					console.log(
						`Invalid page change: page=${page}, currentPage=${currentPage}, totalPages=${totalPages}`
					);
					return;
				}

				// Build API filter parameters from current filters
				const apiFilters = {};

				if (currentFilters.search) {
					apiFilters.search = currentFilters.search;
				}

				if (currentFilters.category !== "all") {
					if (currentFilters.category.startsWith("category-")) {
						// Filter by parent category
						const categoryId = currentFilters.category.replace("category-", "");
						apiFilters.category = categoryId;
						console.log(`Filtering by category: ${categoryId}`);
					} else if (currentFilters.category.startsWith("subcategory-")) {
						// Filter by subcategory
						const subcategoryId = currentFilters.category.replace(
							"subcategory-",
							""
						);
						apiFilters.subcategory = subcategoryId;
						console.log(`Filtering by subcategory: ${subcategoryId}`);
					}
				}

				if (currentFilters.sortBy) {
					apiFilters.sortBy = currentFilters.sortBy;
					apiFilters.sortOrder = "desc"; // Default to descending
				}

				console.log(
					`Calling loadProducts with page=${page}, apiFilters=`,
					apiFilters
				);

				// Load products with current page and properly formatted filters
				loadProducts(page, apiFilters);
			}

			// Cart Functions
			async function loadCart() {
				const savedCart = localStorage.getItem("cart");
				if (savedCart) {
					cart = JSON.parse(savedCart);
					await updateCartDisplay();
				}
			}

			function saveCart() {
				localStorage.setItem("cart", JSON.stringify(cart));
			}

			async function addToCart(productId, productName, price, imageUrl) {
				const existingItem = cart.find((item) => item.id === productId);

				if (existingItem) {
					existingItem.quantity += 1;
				} else {
					cart.push({
						id: productId,
						name: productName,
						price: price,
						imageUrl: imageUrl,
						quantity: 1,
					});
				}

				saveCart();
				await updateCartDisplay();
				showAddToCartFeedback(productId);
			}

			async function removeFromCart(productId) {
				cart = cart.filter((item) => item.id !== productId);
				saveCart();
				await updateCartDisplay();
			}

			async function updateQuantity(productId, newQuantity) {
				if (newQuantity <= 0) {
					await removeFromCart(productId);
					return;
				}

				const item = cart.find((item) => item.id === productId);
				if (item) {
					item.quantity = newQuantity;
					saveCart();
					await updateCartDisplay();
				}
			}

			// Get delivery fee from API
			async function getDeliveryFee() {
				try {
					// Get current user information
					const authToken = localStorage.getItem("authToken");
					if (!authToken) {
						return 2.0; // Default delivery fee if not logged in
					}

					const userResponse = await fetch(`${API_BASE_URL}/auth/me`, {
						headers: {
							Authorization: `Bearer ${authToken}`,
						},
					});

					if (!userResponse.ok) {
						return 2.0; // Default delivery fee if user fetch fails
					}

					const userData = await userResponse.json();
					const city = userData.data?.user?.address?.city;

					if (!city) {
						return 2.0; // Default delivery fee if no city
					}

					// Calculate delivery fee
					const deliveryResponse = await fetch(
						`${API_BASE_URL}/zones/calculate-delivery`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								city,
								baseRate: 0,
							}),
						}
					);

					if (!deliveryResponse.ok) {
						return 2.0; // Default delivery fee if calculation fails
					}

					const deliveryData = await deliveryResponse.json();
					return deliveryData.data?.deliveryFee || 2.0;
				} catch (error) {
					console.error("Error calculating delivery fee:", error);
					return 2.0; // Default delivery fee on error
				}
			}

			async function updateCartDisplay() {
				const cartCount = document.getElementById("cart-count");
				const cartItems = document.getElementById("cart-items");
				const cartTotal = document.getElementById("cart-total");
				const cartDelivery = document.getElementById("cart-delivery");
				const cartDeliveryContainer = document.querySelector(".cart-delivery");
				const checkoutBtn = document.querySelector(".checkout-btn");

				const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
				const totalPrice = cart.reduce(
					(sum, item) => sum + item.price * item.quantity,
					0
				);

				// Update cart count
				cartCount.textContent = totalItems;
				cartCount.classList.toggle("show", totalItems > 0);

				// Get delivery fee
				let deliveryFee = 0.0;
				if (cart.length > 0) {
					try {
						deliveryFee = await getDeliveryFee();
					} catch (error) {
						console.error("Error getting delivery fee:", error);
						deliveryFee = 2.0; // Fallback to default
					}
				}

				// Update delivery fee display
				cartDelivery.textContent = `$${deliveryFee.toFixed(2)}`;
				cartDeliveryContainer.style.display = cart.length > 0 ? "flex" : "none";

				// Update cart items
				if (cart.length === 0) {
					cartItems.innerHTML = `
						<div class="empty-cart">
							<div class="empty-cart-icon">🛒</div>
							<h3>Your cart is empty</h3>
							<p>Add some products to get started!</p>
						</div>
					`;
				} else {
					cartItems.innerHTML = cart
						.map(
							(item) => `
						<div class="cart-item">
							<div class="cart-item-image">
								${
									item.imageUrl
										? `<img src="${item.imageUrl}" alt="${item.name}" class="shx-5" onerror="this.parentElement.innerHTML='📦'">`
										: "📦"
								}
							</div>
							<div class="cart-item-info">
								<div class="cart-item-name">${item.name}</div>
								<div class="cart-item-price">$${item.price.toFixed(2)}</div>
							</div>
							<div class="cart-item-controls">
								<button onclick="updateQuantity('${item.id}', ${
								item.quantity - 1
							})" class="quantity-btn">-</button>
								<span class="cart-item-quantity">${item.quantity}</span>
								<button onclick="updateQuantity('${item.id}', ${
								item.quantity + 1
							})" class="quantity-btn">+</button>
								<span onclick="removeFromCart('${
									item.id
								}')" class="remove-item" title="Remove item">🗑️</span>
							</div>
						</div>
					`
						)
						.join("");
				}

				// Update total
				const finalTotal = totalPrice + deliveryFee;
				cartTotal.textContent = `$${finalTotal.toFixed(2)}`;

				// Update checkout button
				checkoutBtn.disabled = cart.length === 0;

				// Set default delivery time to now if not already set
				const deliveryTimeInput = document.getElementById("delivery-time");
				if (deliveryTimeInput && !deliveryTimeInput.value) {
					const now = new Date();
					const formattedNow = now.toISOString().slice(0, 16); // Format for datetime-local
					deliveryTimeInput.value = formattedNow;
				}
			}

			function toggleAddressForm() {
				const addressSection = document.querySelector(".address-section");
				const addressForm = document.getElementById("address-form");
				const isExpanded = addressSection.classList.contains("expanded");

				if (isExpanded) {
					addressForm.style.display = "none";
					addressSection.classList.remove("expanded");
				} else {
					addressForm.style.display = "block";
					addressSection.classList.add("expanded");
				}
			}

			function toggleCart() {
				const sidebar = document.getElementById("cart-sidebar");
				const overlay = document.getElementById("cart-overlay");

				sidebar.classList.toggle("open");
				overlay.classList.toggle("active");

				if (sidebar.classList.contains("open")) {
					document.body.style.overflow = "hidden";
				} else {
					document.body.style.overflow = "";
				}
			}

			function showAddToCartFeedback(productId) {
				// Find the add to cart button for this product and show feedback
				const buttons = document.querySelectorAll(
					`[onclick*="addToCart('${productId}'"]`
				);
				buttons.forEach((button) => {
					const originalText = button.textContent;
					button.textContent = "Added!";
					button.classList.add("added");

					setTimeout(() => {
						button.textContent = originalText;
						button.classList.remove("added");
					}, 1500);
				});
			}

			async function checkout() {
				if (cart.length === 0) return;

				// Show loading state
				const checkoutBtn = document.querySelector(".checkout-btn");
				const originalText = checkoutBtn.textContent;
				checkoutBtn.textContent = "Processing...";
				checkoutBtn.disabled = true;

				try {
					// Get current user information
					const authToken = localStorage.getItem("authToken");
					if (!authToken) {
						alert("Please log in to place an order.");
						window.location.href = "signin.html";
						return;
					}

					const userResponse = await fetch(`${API_BASE_URL}/auth/me`, {
						headers: {
							Authorization: `Bearer ${authToken}`,
						},
					});

					if (!userResponse.ok) {
						throw new Error("Failed to get user information");
					}

					const userData = await userResponse.json();
					console.log("User data received:", userData);

					// Check if user data has the expected structure
					if (!userData.data || !userData.data.user) {
						throw new Error("Invalid user data structure received from API");
					}

					if (!userData.data.user.name) {
						throw new Error("User name is missing from profile");
					}

					// Prepare order items from cart
					const orderItems = cart.map((item) => ({
						product: item.id,
						quantity: item.quantity,
						//unitPrice: item.price,
						//tax: item.tax, // Assuming tax is included in price
						//bottlerefund: item.bottlerefund,
						//discount: item.discount || 0, // Assuming no bottle refund for simplicity
					}));

					// Calculate totals
					const subtotal = cart.reduce(
						(sum, item) => sum + item.price * item.quantity,
						0
					);
					const tax = subtotal; // 10% tax
					const total = subtotal + tax;

					// Get selected payment method
					const selectedPaymentMethod = document.querySelector(
						'input[name="paymentMethod"]:checked'
					).value;

					// Get delivery time
					const deliveryTimeInput = document.getElementById("delivery-time");
					const deliveryTime = deliveryTimeInput.value
						? new Date(deliveryTimeInput.value).toISOString()
						: null;

					// Get delivery address
					let deliveryAddress = null;
					const street = document.getElementById("street").value.trim();
					const city = document.getElementById("city").value.trim();

					if (street || city) {
						deliveryAddress = {
							street: street || undefined,
							city: city || undefined,
						};
					}

					// Prepare order data
					const orderData = {
						customer: {
							id: userData.data.user._id,
							address: deliveryAddress,
						},
						items: orderItems,

						paymentMethod: selectedPaymentMethod,
						deliveryTime: deliveryTime,
						notes: "Order placed from shop",
					};
					console.log("Order data to be sent:", orderData);

					// Create the order
					const orderResponse = await fetch(`${API_BASE_URL}/orders`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${authToken}`,
						},
						body: JSON.stringify(orderData),
					});

					if (!orderResponse.ok) {
						const errorData = await orderResponse.json();
						throw new Error(formatApiError(errorData) || "Failed to create order");
					}

					const orderResult = await orderResponse.json();

					// Success! Clear cart and show confirmation
					cart = [];
					saveCart();
					await updateCartDisplay();

					// Show success message
					showOrderSuccess(orderResult.data, orderResult.paymentUrl);
				} catch (error) {
					console.error("Checkout error:", error);
					alert(`Order failed: ${error.message}`);
				} finally {
					// Reset button state
					checkoutBtn.textContent = originalText;
					checkoutBtn.disabled = cart.length === 0;
				}
			}

			// Show order success message
			function showOrderSuccess(order, url) {
				const mainContent = document.querySelector(".main-content");
				const orderTotal = order.total.toFixed(2);

				mainContent.innerHTML = `
					<div class="shx-6">
						<div class="shx-7">🎉</div>
						<h2 class="shx-8">Order Placed Successfully!</h2>
						<div class="shx-9">
							<h3 class="shx-10">Order Details</h3>
							<p class="shx-11"><strong>Order ID:</strong> ${
								order.orderNumber || order._id
							}</p>
							<p class="shx-11"><strong>Total Amount:</strong> $${orderTotal}</p>
							<p class="shx-11"><strong>Items:</strong> ${
								order.items.length
							}</p>
							<p class="shx-11"><strong>Status:</strong> ${
								order.status || "Processing"
							}</p>
							<p class="shx-12"><strong>Payment:</strong> ${
								order.paymentMethod
							}</p>
						</div>
						<div class="shx-13">
							<strong>✅ Your order has been placed successfully!</strong><br>
							You will receive a confirmation email shortly.<br>
							${
								url
									? `<a href="${url}" target="_blank" class="shx-14">Complete Payment Here</a>`
									: order.paymentMethod === "cash"
									? "<strong>💵 Cash on Delivery</strong> - Please have the exact amount ready."
									: ""
							}
						</div>
						<div class="shx-15">
							<a href="shop1.html" class="btn btn-primary shx-16">Continue Shopping</a>
							<a href="index.html" class="btn btn-secondary shx-16">Home</a>
						</div>
					</div>
				`;
			}

			// Close cart when clicking overlay
			document
				.getElementById("cart-overlay")
				.addEventListener("click", toggleCart);

			// Close cart on escape key
			document.addEventListener("keydown", function (e) {
				if (e.key === "Escape") {
					const sidebar = document.getElementById("cart-sidebar");
					const overlay = document.getElementById("cart-overlay");
					if (sidebar.classList.contains("open")) {
						toggleCart();
					}
				}
			});

			// Logout function
			function logout() {
				// Clear cart from localStorage
				localStorage.removeItem("cart");

				// Clear auth token
				localStorage.removeItem("authToken");

				// Show feedback message and redirect
				const mainContent = document.querySelector(".main-content");
				mainContent.innerHTML = `
					<div class="shx-17">
						<div class="shx-18">
							✅ Signed out successfully!
						</div>
						<a href="signin.html" class="btn btn-primary shx-19">Sign In</a>
						<a href="index.html" class="btn btn-secondary">Home</a>
					</div>
				`;
			}
		