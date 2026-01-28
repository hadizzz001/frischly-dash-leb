# Announcement API Documentation for React Native Developers

## Overview

The Announcement API allows React Native applications to fetch and display system announcements from the FRISCHLY server. This API provides endpoints for retrieving active announcements that can be displayed to users.

## Base URL

```
https://your-server-domain.com/api
```

## Authentication

Most announcement endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Get Active Announcements (Public)

**Endpoint:** `GET /api/announcements/public/active`

**Description:** Retrieves all active announcements for public display.

**Authentication:** Not required

**Response Format:**

```json
{
	"success": true,
	"count": 2,
	"data": [
		{
			"_id": "507f1f77bcf86cd799439011",
			"title": "Welcome to FRISCHLY!",
			"description": "Thank you for choosing FRISCHLY. Enjoy fresh groceries delivered to your doorstep.",
			"createdAt": "2024-01-15T10:30:00.000Z"
		},
		{
			"_id": "507f1f77bcf86cd799439012",
			"title": "New Feature: Express Delivery",
			"description": "We now offer express delivery within 1 hour for select items!",
			"createdAt": "2024-01-20T14:45:00.000Z"
		}
	]
}
```

**React Native Implementation:**

```javascript
import axios from "axios";

const API_BASE_URL = "https://your-server-domain.com/api";

export const getActiveAnnouncements = async () => {
	try {
		const response = await axios.get(
			`${API_BASE_URL}/announcements/public/active`,
		);

		if (response.data.success) {
			return response.data.data; // Array of announcements
		} else {
			throw new Error("Failed to fetch announcements");
		}
	} catch (error) {
		console.error("Error fetching announcements:", error);
		throw error;
	}
};
```

**Usage in React Native Component:**

```javascript
import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { getActiveAnnouncements } from "../services/api";

const AnnouncementsScreen = () => {
	const [announcements, setAnnouncements] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		loadAnnouncements();
	}, []);

	const loadAnnouncements = async () => {
		try {
			const data = await getActiveAnnouncements();
			setAnnouncements(data);
		} catch (error) {
			console.error("Failed to load announcements:", error);
		} finally {
			setLoading(false);
		}
	};

	const renderAnnouncement = ({ item }) => (
		<View style={styles.announcementCard}>
			<Text style={styles.title}>{item.title}</Text>
			<Text style={styles.description}>{item.description}</Text>
			<Text style={styles.date}>
				{new Date(item.createdAt).toLocaleDateString()}
			</Text>
		</View>
	);

	if (loading) {
		return (
			<View style={styles.center}>
				<Text>Loading announcements...</Text>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<Text style={styles.header}>Announcements</Text>
			<FlatList
				data={announcements}
				renderItem={renderAnnouncement}
				keyExtractor={(item) => item._id}
				ListEmptyComponent={
					<Text style={styles.emptyText}>No announcements available</Text>
				}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 20,
		backgroundColor: "#f5f5f5",
	},
	header: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 20,
		color: "#333",
	},
	announcementCard: {
		backgroundColor: "white",
		padding: 15,
		marginBottom: 10,
		borderRadius: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	title: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 8,
		color: "#333",
	},
	description: {
		fontSize: 14,
		color: "#666",
		marginBottom: 8,
		lineHeight: 20,
	},
	date: {
		fontSize: 12,
		color: "#999",
		textAlign: "right",
	},
	center: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	emptyText: {
		textAlign: "center",
		fontSize: 16,
		color: "#666",
		marginTop: 50,
	},
});

export default AnnouncementsScreen;
```

### 2. Get All Announcements (Admin Only)

**Endpoint:** `GET /api/announcements`

**Description:** Retrieves all announcements (requires admin authentication).

**Authentication:** Required (Admin)

**Response Format:**

```json
{
	"success": true,
	"count": 2,
	"data": [
		{
			"_id": "507f1f77bcf86cd799439011",
			"title": "Welcome to FRISCHLY!",
			"description": "Thank you for choosing FRISCHLY...",
			"isActive": true,
			"createdAt": "2024-01-15T10:30:00.000Z",
			"updatedAt": "2024-01-15T10:30:00.000Z"
		}
	]
}
```

### 3. Get Single Announcement (Admin Only)

**Endpoint:** `GET /api/announcements/:id`

**Description:** Retrieves a specific announcement by ID.

**Authentication:** Required (Admin)

### 4. Create Announcement (Admin Only)

**Endpoint:** `POST /api/announcements`

**Description:** Creates a new announcement.

**Authentication:** Required (Admin)

**Request Body:**

```json
{
	"title": "New Announcement Title",
	"description": "Announcement description text",
	"isActive": true
}
```

### 5. Update Announcement (Admin Only)

**Endpoint:** `PUT /api/announcements/:id`

**Description:** Updates an existing announcement.

**Authentication:** Required (Admin)

### 6. Delete Announcement (Admin Only)

**Endpoint:** `DELETE /api/announcements/:id`

**Description:** Deletes an announcement.

**Authentication:** Required (Admin)

## Error Handling

All API responses follow this error format:

```json
{
	"success": false,
	"message": "Error description",
	"error": "Detailed error message"
}
```

**Common HTTP Status Codes:**

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

## React Native Integration Example

### API Service Setup

```javascript
// services/api.js
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL = "https://your-server-domain.com/api";

// Create axios instance with default config
const api = axios.create({
	baseURL: API_BASE_URL,
	timeout: 10000,
});

// Request interceptor to add auth token
api.interceptors.request.use(
	async (config) => {
		const token = await AsyncStorage.getItem("authToken");
		if (token) {
			config.headers.Authorization = `Bearer ${token}`;
		}
		return config;
	},
	(error) => Promise.reject(error),
);

// Response interceptor for error handling
api.interceptors.response.use(
	(response) => response,
	(error) => {
		if (error.response?.status === 401) {
			// Handle unauthorized access
			AsyncStorage.removeItem("authToken");
			// Navigate to login screen
		}
		return Promise.reject(error);
	},
);

export const announcementAPI = {
	getActive: () => api.get("/announcements/public/active"),
	getAll: () => api.get("/announcements"),
	getById: (id) => api.get(`/announcements/${id}`),
	create: (data) => api.post("/announcements", data),
	update: (id, data) => api.put(`/announcements/${id}`, data),
	delete: (id) => api.delete(`/announcements/${id}`),
};

export default api;
```

### Redux Integration (Optional)

```javascript
// store/announcementsSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { announcementAPI } from "../services/api";

export const fetchActiveAnnouncements = createAsyncThunk(
	"announcements/fetchActive",
	async (_, { rejectWithValue }) => {
		try {
			const response = await announcementAPI.getActive();
			return response.data.data;
		} catch (error) {
			return rejectWithValue(
				error.response?.data?.message || "Failed to fetch announcements",
			);
		}
	},
);

const announcementsSlice = createSlice({
	name: "announcements",
	initialState: {
		items: [],
		loading: false,
		error: null,
	},
	reducers: {},
	extraReducers: (builder) => {
		builder
			.addCase(fetchActiveAnnouncements.pending, (state) => {
				state.loading = true;
				state.error = null;
			})
			.addCase(fetchActiveAnnouncements.fulfilled, (state, action) => {
				state.loading = false;
				state.items = action.payload;
			})
			.addCase(fetchActiveAnnouncements.rejected, (state, action) => {
				state.loading = false;
				state.error = action.payload;
			});
	},
});

export default announcementsSlice.reducer;
```

## Best Practices

1. **Caching**: Cache announcements locally to reduce API calls
2. **Offline Support**: Store announcements in local storage for offline access
3. **Pull to Refresh**: Implement pull-to-refresh functionality
4. **Error Boundaries**: Wrap announcement components in error boundaries
5. **Loading States**: Always show loading indicators during API calls
6. **Retry Logic**: Implement retry logic for failed requests

## Testing

```javascript
// __tests__/announcements.test.js
import { getActiveAnnouncements } from "../services/api";

describe("Announcement API", () => {
	it("should fetch active announcements", async () => {
		const announcements = await getActiveAnnouncements();
		expect(Array.isArray(announcements)).toBe(true);
		if (announcements.length > 0) {
			expect(announcements[0]).toHaveProperty("title");
			expect(announcements[0]).toHaveProperty("description");
		}
	});
});
```

## Support

For questions or issues with the Announcement API, please contact the development team.</content>
<parameter name="filePath">c:\Users\alker\FrichlyGmbH\frischly server\ANNOUNCEMENT_API_DOCS.md
