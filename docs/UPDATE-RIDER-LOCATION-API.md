# Update Rider Location API

## Overview

This API endpoint allows updating the current location (GPS coordinates) of a rider. It's designed to be used by rider applications to track real-time location.

## Endpoint

```
PATCH /api/riders/:id/location
```

## Authentication

Requires a valid JWT token in the Authorization header.

## Authorization

- **Admin**: Can update any rider's location
- **Manager**: Can update any rider's location
- **Rider**: Can only update their own location

## Request

### Headers

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### URL Parameters

- `id` (required): The MongoDB ObjectId of the rider

### Request Body

```json
{
	"latitude": 52.520008,
	"longitude": 13.404954
}
```

### Field Descriptions

- `latitude` (required, Number): GPS latitude coordinate (-90 to 90)
- `longitude` (required, Number): GPS longitude coordinate (-180 to 180)

## Response

### Success Response (200 OK)

```json
{
	"success": true,
	"data": {
		"riderId": "507f1f77bcf86cd799439011",
		"currentLocation": {
			"latitude": 52.520008,
			"longitude": 13.404954,
			"lastUpdated": "2025-09-30T10:30:00.000Z"
		}
	},
	"message": "Rider location updated successfully"
}
```

### Error Responses

#### 400 Bad Request - Invalid Rider ID

```json
{
	"success": false,
	"message": "Invalid rider ID"
}
```

#### 400 Bad Request - Missing Required Fields

```json
{
	"success": false,
	"message": "Latitude and longitude are required"
}
```

#### 400 Bad Request - Invalid Latitude

```json
{
	"success": false,
	"message": "Latitude must be between -90 and 90"
}
```

#### 400 Bad Request - Invalid Longitude

```json
{
	"success": false,
	"message": "Longitude must be between -180 and 180"
}
```

#### 401 Unauthorized

```json
{
	"success": false,
	"message": "Not authorized to access this route"
}
```

#### 403 Forbidden

```json
{
	"success": false,
	"message": "Not authorized to update this rider's location"
}
```

#### 404 Not Found

```json
{
	"success": false,
	"message": "Rider not found"
}
```

#### 500 Internal Server Error

```json
{
	"success": false,
	"message": "Error updating rider location",
	"error": "Error details"
}
```

## Usage Examples

### cURL Example

```bash
curl -X PATCH \
  https://your-api.com/api/riders/507f1f77bcf86cd799439011/location \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "latitude": 52.520008,
    "longitude": 13.404954
  }'
```

### JavaScript/Fetch Example

```javascript
const updateRiderLocation = async (riderId, latitude, longitude) => {
	try {
		const response = await fetch(
			`https://your-api.com/api/riders/${riderId}/location`,
			{
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					latitude,
					longitude,
				}),
			}
		);

		const data = await response.json();

		if (data.success) {
			console.log("Location updated:", data.data.currentLocation);
		} else {
			console.error("Error:", data.message);
		}

		return data;
	} catch (error) {
		console.error("Request failed:", error);
		throw error;
	}
};

// Usage
updateRiderLocation("507f1f77bcf86cd799439011", 52.520008, 13.404954);
```

### React Native Example with Geolocation

```javascript
import Geolocation from "@react-native-community/geolocation";

const updateCurrentLocation = async (riderId, token) => {
	Geolocation.getCurrentPosition(
		async (position) => {
			const { latitude, longitude } = position.coords;

			try {
				const response = await fetch(
					`https://your-api.com/api/riders/${riderId}/location`,
					{
						method: "PATCH",
						headers: {
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							latitude,
							longitude,
						}),
					}
				);

				const data = await response.json();
				console.log("Location updated:", data);
			} catch (error) {
				console.error("Failed to update location:", error);
			}
		},
		(error) => {
			console.error("Geolocation error:", error);
		},
		{
			enableHighAccuracy: true,
			timeout: 20000,
			maximumAge: 1000,
		}
	);
};
```

### Axios Example

```javascript
import axios from "axios";

const updateRiderLocation = async (riderId, latitude, longitude, token) => {
	try {
		const response = await axios.patch(
			`https://your-api.com/api/riders/${riderId}/location`,
			{
				latitude,
				longitude,
			},
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			}
		);

		return response.data;
	} catch (error) {
		if (error.response) {
			// Server responded with error
			console.error("Error:", error.response.data.message);
		} else {
			// Network error
			console.error("Network error:", error.message);
		}
		throw error;
	}
};
```

## Best Practices

1. **Frequency**: Update location at reasonable intervals (e.g., every 30-60 seconds when active) to avoid excessive API calls
2. **Battery Optimization**: Use appropriate accuracy settings based on requirements
3. **Error Handling**: Implement retry logic for failed updates
4. **Validation**: Validate coordinates on client-side before sending
5. **Background Updates**: Consider using background location services for continuous tracking
6. **Privacy**: Only update location when rider is on duty/active

## Integration with Rider Status

The location can also be updated when changing rider status using the `/api/riders/:id/status` endpoint:

```javascript
// Update status and location together
const response = await fetch(
	`https://your-api.com/api/riders/${riderId}/status`,
	{
		method: "PATCH",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			status: "available",
			location: {
				latitude: 52.520008,
				longitude: 13.404954,
			},
		}),
	}
);
```

## Notes

- The `lastUpdated` timestamp is automatically set by the server
- Location updates are tracked in the rider's profile
- Location data can be used for rider tracking, assignment optimization, and analytics
- All coordinates are stored as decimal degrees
