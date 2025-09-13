# 📱 FRISCHLY React Native Integration Guide

## 🎯 Production Setup Guide for Mobile App Integration

This guide explains how to integrate your React Native mobile app with the FRISCHLY server API in production.

---

## 📋 Table of Contents

1. [Server Configuration](#server-configuration)
2. [API Endpoints](#api-endpoints)
3. [Authentication Flow](#authentication-flow)
4. [React Native Setup](#react-native-setup)
5. [Configuration Examples](#configuration-examples)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## 🔧 Server Configuration

### 1. Production Environment Variables

Create/update your production `.env` file:

```env
# Server Configuration
NODE_ENV=production
PORT=3001

# Database
MONGODB_URI=your_production_mongodb_connection_string

# JWT Configuration
JWT_SECRET=your_super_secure_jwt_secret_key_min_32_chars
JWT_EXPIRES_IN=7d

# CORS - Add your React Native app domains
CLIENT_URL=https://frischly-server.onrender.com,http://localhost:3000,capacitor://localhost,ionic://localhost

# Mobile App Configuration
MOBILE_APP_SCHEME=frischly
ALLOWED_ORIGINS=https://frischly-server.onrender.com,capacitor://localhost,ionic://localhost
```

### 2. CORS Configuration

The server already supports mobile apps with these CORS settings:

```javascript
// Supports Capacitor/Ionic apps
const allowedOrigins = [
	"http://localhost:3000",
	"https://frischly-server.onrender.com",
	"capacitor://localhost", // Capacitor apps
	"ionic://localhost", // Ionic apps
	// Add your production domains
];
```

---

## 🔌 API Endpoints

### Base URL Configuration

**Production:** `https://frischly-server.onrender.com/api`  
**Development:** `http://localhost:3001/api`

### Core Endpoints

#### Authentication

```
POST /api/auth/register          - User registration
POST /api/auth/login            - User login
POST /api/auth/login-profile    - Profile-based login
GET  /api/auth/me               - Get current user
GET  /api/auth/users            - Get all users (admin/manager)
PUT  /api/auth/users/:id        - Update user
DELETE /api/auth/users/:id      - Delete user
```

#### Products

```
GET    /api/products            - Get products (with pagination)
POST   /api/products            - Create product (admin/manager)
PUT    /api/products/:id        - Update product
DELETE /api/products/:id        - Delete product
GET    /api/products/search     - Search products
```

#### Categories

```
GET    /api/categories          - Get categories
POST   /api/categories          - Create category (admin/manager)
PUT    /api/categories/:id      - Update category
DELETE /api/categories/:id      - Delete category
```

#### Orders

```
GET    /api/orders              - Get orders
POST   /api/orders              - Create order
PUT    /api/orders/:id          - Update order
DELETE /api/orders/:id          - Delete order
GET    /api/orders/stats        - Get order statistics
GET    /api/orders/user/:userId - Get user orders
```

#### Health Check

```
GET    /api/health              - Server health status
```

---

## 🔐 Authentication Flow

### 1. User Registration

```javascript
const registerUser = async (userData) => {
	const response = await fetch(`${API_BASE_URL}/auth/register`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			name: userData.name,
			phoneNumber: userData.phone,
			email: userData.email,
			password: userData.password,
			address: {
				street: userData.street,
				city: userData.city,
				state: userData.state,
				zipCode: userData.zipCode,
				country: userData.country,
			},
		}),
	});

	const result = await response.json();
	if (result.success) {
		// Store token securely
		await AsyncStorage.setItem("authToken", result.data.token);
		return result.data;
	}
	throw new Error(result.message);
};
```

### 2. User Login

```javascript
const loginUser = async (email, password) => {
	const response = await fetch(`${API_BASE_URL}/auth/login`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ email, password }),
	});

	const result = await response.json();
	if (result.success) {
		await AsyncStorage.setItem("authToken", result.data.token);
		return result.data;
	}
	throw new Error(result.message);
};
```

### 3. Authenticated Requests

```javascript
const makeAuthenticatedRequest = async (endpoint, options = {}) => {
	const token = await AsyncStorage.getItem("authToken");

	const response = await fetch(`${API_BASE_URL}${endpoint}`, {
		...options,
		headers: {
			...options.headers,
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
	});

	if (response.status === 401) {
		// Token expired, redirect to login
		await AsyncStorage.removeItem("authToken");
		// Navigate to login screen
		throw new Error("Session expired");
	}

	return response.json();
};
```

---

## ⚛️ React Native Setup

### 1. Install Dependencies

```bash
npm install @react-native-async-storage/async-storage
npm install react-native-vector-icons
npm install @react-navigation/native
npm install @react-navigation/stack
```

### 2. API Service Configuration

Create `services/apiService.js`:

```javascript
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL = __DEV__
	? "http://localhost:3001/api" // Development
	: "https://frischly-server.onrender.com/api"; // Production

class ApiService {
	async getAuthToken() {
		return await AsyncStorage.getItem("authToken");
	}

	async setAuthToken(token) {
		await AsyncStorage.setItem("authToken", token);
	}

	async removeAuthToken() {
		await AsyncStorage.removeItem("authToken");
	}

	async request(endpoint, options = {}) {
		const token = await this.getAuthToken();

		const config = {
			...options,
			headers: {
				"Content-Type": "application/json",
				...options.headers,
			},
		};

		if (token) {
			config.headers.Authorization = `Bearer ${token}`;
		}

		const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

		if (response.status === 401) {
			await this.removeAuthToken();
			throw new Error("SESSION_EXPIRED");
		}

		const result = await response.json();

		if (!response.ok) {
			throw new Error(result.message || "Request failed");
		}

		return result;
	}

	// Authentication methods
	async register(userData) {
		return this.request("/auth/register", {
			method: "POST",
			body: JSON.stringify(userData),
		});
	}

	async login(email, password) {
		const result = await this.request("/auth/login", {
			method: "POST",
			body: JSON.stringify({ email, password }),
		});

		if (result.success) {
			await this.setAuthToken(result.data.token);
		}

		return result;
	}

	async getCurrentUser() {
		return this.request("/auth/me");
	}

	// Product methods
	async getProducts(page = 1, limit = 20) {
		return this.request(`/products?page=${page}&limit=${limit}`);
	}

	async searchProducts(query) {
		return this.request(`/products/search?q=${encodeURIComponent(query)}`);
	}

	// Order methods
	async createOrder(orderData) {
		return this.request("/orders", {
			method: "POST",
			body: JSON.stringify(orderData),
		});
	}

	async getUserOrders(userId) {
		return this.request(`/orders/user/${userId}`);
	}

	async getOrderStats() {
		return this.request("/orders/stats");
	}

	// Category methods
	async getCategories() {
		return this.request("/categories");
	}
}

export default new ApiService();
```

### 3. User Role Management

```javascript
// utils/userRoles.js
export const USER_ROLES = {
	CUSTOMER: "customer",
	RIDER: "rider",
	STAFF: "staff",
	MANAGER: "manager",
	ADMIN: "admin",
};

export const hasPermission = (userRole, requiredRole) => {
	const roleHierarchy = {
		[USER_ROLES.CUSTOMER]: 0,
		[USER_ROLES.RIDER]: 1,
		[USER_ROLES.STAFF]: 2,
		[USER_ROLES.MANAGER]: 3,
		[USER_ROLES.ADMIN]: 4,
	};

	return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};

export const isManager = (userRole) => {
	return userRole === USER_ROLES.MANAGER || userRole === USER_ROLES.ADMIN;
};

export const isAdmin = (userRole) => {
	return userRole === USER_ROLES.ADMIN;
};
```

---

## 📝 Configuration Examples

### 1. Environment Configuration

Create `config/env.js`:

```javascript
const config = {
	development: {
		API_BASE_URL: "http://localhost:3001/api",
		WEB_URL: "http://localhost:3000",
	},
	production: {
		API_BASE_URL: "https://frischly-server.onrender.com/api",
		WEB_URL: "https://frischly-server.onrender.com",
	},
};

export default config[__DEV__ ? "development" : "production"];
```

### 2. Order Creation Example

```javascript
// screens/CreateOrderScreen.js
import ApiService from "../services/apiService";

const createOrder = async (orderItems, customerInfo) => {
	try {
		const orderData = {
			customer: customerInfo.userId,
			items: orderItems.map((item) => ({
				product: item.productId,
				quantity: item.quantity,
				price: item.price,
			})),
			shippingAddress: customerInfo.address,
			paymentMethod: "cash", // or 'card'
			notes: orderNotes,
		};

		const result = await ApiService.createOrder(orderData);

		if (result.success) {
			Alert.alert("Success", "Order created successfully!");
			navigation.navigate("OrderConfirmation", {
				orderId: result.data.order._id,
			});
		}
	} catch (error) {
		Alert.alert("Error", error.message);
	}
};
```

### 3. Product Display Component

```javascript
// components/ProductCard.js
import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";

const ProductCard = ({ product, onPress }) => {
	const finalPrice = product.price - product.discount;
	const hasDiscount = product.discount > 0;

	return (
		<TouchableOpacity style={styles.card} onPress={() => onPress(product)}>
			<Image
				source={{ uri: product.imageUrl || "https://via.placeholder.com/150" }}
				style={styles.image}
			/>
			<View style={styles.content}>
				<Text style={styles.name}>{product.name}</Text>
				<Text style={styles.category}>{product.category.name}</Text>

				<View style={styles.priceContainer}>
					{hasDiscount && (
						<Text style={styles.originalPrice}>
							${product.price.toFixed(2)}
						</Text>
					)}
					<Text style={styles.finalPrice}>${finalPrice.toFixed(2)}</Text>
				</View>

				{product.tax > 0 && (
					<Text style={styles.tax}>Tax: ${product.tax.toFixed(2)}</Text>
				)}

				<Text style={styles.stock}>
					{product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
				</Text>
			</View>
		</TouchableOpacity>
	);
};
```

---

## ⚠️ Error Handling

### 1. Global Error Handler

```javascript
// utils/errorHandler.js
import { Alert } from "react-native";

export const handleApiError = (error) => {
	console.error("API Error:", error);

	switch (error.message) {
		case "SESSION_EXPIRED":
			Alert.alert("Session Expired", "Please log in again.", [
				{ text: "OK", onPress: () => navigateToLogin() },
			]);
			break;

		case "NETWORK_ERROR":
			Alert.alert("Network Error", "Please check your internet connection.");
			break;

		default:
			Alert.alert("Error", error.message || "Something went wrong");
	}
};
```

### 2. Network Connectivity Check

```javascript
// utils/networkCheck.js
import NetInfo from "@react-native-netinfo/netinfo";

export const checkNetworkConnectivity = async () => {
	const state = await NetInfo.fetch();
	return state.isConnected;
};

export const handleOfflineMode = () => {
	Alert.alert(
		"No Internet Connection",
		"Please check your internet connection and try again."
	);
};
```

---

## 🎯 Best Practices

### 1. Security

- ✅ Always use HTTPS in production
- ✅ Store tokens securely using AsyncStorage or Keychain
- ✅ Implement proper token refresh mechanism
- ✅ Validate user input before sending to API
- ✅ Handle sensitive data properly

### 2. Performance

- ✅ Implement pagination for large datasets
- ✅ Use image caching for product images
- ✅ Implement proper loading states
- ✅ Cache frequently accessed data
- ✅ Optimize network requests

### 3. User Experience

- ✅ Provide clear error messages
- ✅ Implement loading indicators
- ✅ Handle offline scenarios gracefully
- ✅ Add pull-to-refresh functionality
- ✅ Implement proper navigation flow

### 4. Code Organization

- ✅ Separate API logic into service layers
- ✅ Use consistent error handling
- ✅ Implement proper state management
- ✅ Create reusable components
- ✅ Follow React Native best practices

---

## 🔧 Troubleshooting

### Common Issues

#### 1. CORS Errors

**Problem:** Cross-origin request blocked  
**Solution:** Ensure your app's origin is added to `CLIENT_URL` in `.env`

```env
CLIENT_URL=https://frischly-server.onrender.com,capacitor://localhost,ionic://localhost
```

#### 2. Authentication Issues

**Problem:** Token not being sent with requests  
**Solution:** Check token storage and header format

```javascript
headers: {
  'Authorization': `Bearer ${token}`, // Note the 'Bearer ' prefix
  'Content-Type': 'application/json'
}
```

#### 3. Network Request Failed

**Problem:** Unable to connect to server  
**Solution:** Check if server is running and URL is correct

```javascript
// For Android emulator, use 10.0.2.2 instead of localhost
const API_BASE_URL =
	Platform.OS === "android"
		? "http://10.0.2.2:3001/api"
		: "http://localhost:3001/api";
```

#### 4. Image Loading Issues

**Problem:** Product images not displaying  
**Solution:** Ensure image URLs are absolute and accessible

```javascript
const imageUrl = product.imageUrl?.startsWith("http")
	? product.imageUrl
	: `${BASE_URL}${product.imageUrl}`;
```

---

## 📱 Platform-Specific Notes

### iOS Configuration

- Add network security exception for development
- Configure App Transport Security if needed
- Test on physical device for network requests

### Android Configuration

- Add INTERNET permission to AndroidManifest.xml
- Configure network security config for HTTP (development only)
- Test network requests on different Android versions

---

## 🚀 Deployment Checklist

### Before Production

- [ ] Update API_BASE_URL to production server
- [ ] Test all API endpoints with production data
- [ ] Verify CORS configuration on server
- [ ] Test authentication flow end-to-end
- [ ] Implement proper error handling
- [ ] Add loading states for all network requests
- [ ] Test offline scenarios
- [ ] Verify image loading and caching
- [ ] Test on both iOS and Android devices
- [ ] Implement app versioning and update mechanism

### Server Requirements

- [ ] HTTPS certificate installed
- [ ] Environment variables configured
- [ ] Database connection secured
- [ ] CORS properly configured for mobile apps
- [ ] Rate limiting appropriate for mobile usage
- [ ] Monitoring and logging enabled

---

## 📞 Support

For additional support or questions:

1. Check the server logs for API errors
2. Use the web dashboard to verify data integrity
3. Test API endpoints using the provided examples
4. Review the authentication flow carefully
5. Ensure proper error handling is implemented

---

## 📄 License

This integration guide is part of the FRISCHLY Server project.

---

**Happy Coding! 🚀**
