# Rider Location Update API - Implementation Summary

## What Was Added

### 1. New Controller Function

**File**: `src/controllers/riderController.js`

Added `updateRiderLocation` function that:

- Validates rider ID format
- Validates latitude (-90 to 90) and longitude (-180 to 180) ranges
- Checks user authorization (admin, manager, or the rider themselves)
- Updates the rider's current location with coordinates and timestamp
- Returns updated location data

### 2. New API Route

**File**: `src/routes/riders.js`

Added new endpoint:

```
PATCH /api/riders/:id/location
```

Protected by authentication and authorization middleware. Accessible by:

- Admins (can update any rider)
- Managers (can update any rider)
- Riders (can update only their own location)

### 3. Documentation

**File**: `docs/UPDATE-RIDER-LOCATION-API.md`

Comprehensive API documentation including:

- Endpoint details
- Authentication/authorization requirements
- Request/response formats
- Error handling
- Usage examples (cURL, JavaScript, React Native, Axios)
- Best practices
- Integration notes

### 4. Test Script

**File**: `scripts/test-rider-location.js`

Testing utilities that can:

- Update rider location
- Validate coordinates
- Test invalid input scenarios
- Simulate continuous location tracking
- Verify updates by fetching rider details

## API Endpoint Details

**URL**: `PATCH /api/riders/:id/location`

**Request Body**:

```json
{
	"latitude": 52.520008,
	"longitude": 13.404954
}
```

**Success Response**:

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

## How to Test

### Using the Test Script

```bash
# Set environment variables
$env:RIDER_ID="your_rider_id_here"
$env:AUTH_TOKEN="your_jwt_token_here"

# Run basic test
node scripts/test-rider-location.js

# Run with invalid coordinate tests
node scripts/test-rider-location.js --test-invalid

# Run with location tracking simulation
node scripts/test-rider-location.js --simulate
```

### Using cURL (PowerShell)

```powershell
$riderId = "your_rider_id_here"
$token = "your_jwt_token_here"

$body = @{
    latitude = 52.520008
    longitude = 13.404954
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/riders/$riderId/location" `
    -Method PATCH `
    -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    } `
    -Body $body
```

## Security Features

1. **Authentication Required**: All requests must include valid JWT token
2. **Authorization Check**: Users can only update their own location (unless admin/manager)
3. **Input Validation**:
   - Valid MongoDB ObjectId for rider ID
   - Latitude range: -90 to 90
   - Longitude range: -180 to 180
4. **Error Handling**: Comprehensive error messages for different scenarios

## Integration Notes

### For Rider Mobile Apps

1. Request location permissions
2. Get GPS coordinates
3. Send PATCH request to update location
4. Recommended update frequency: 30-60 seconds when active
5. Consider battery optimization strategies

### For Admin/Manager Dashboards

- Can view real-time rider locations
- Track rider movements
- Use for order assignment optimization
- Monitor rider availability by location

## Database Schema

The location is stored in the Rider model:

```javascript
currentLocation: {
  latitude: Number,      // -90 to 90
  longitude: Number,     // -180 to 180
  lastUpdated: Date      // Auto-set by server
}
```

## Files Modified/Created

### Modified

1. `src/controllers/riderController.js` - Added updateRiderLocation function
2. `src/routes/riders.js` - Added route and import

### Created

1. `docs/UPDATE-RIDER-LOCATION-API.md` - API documentation
2. `scripts/test-rider-location.js` - Test script

## Next Steps (Optional Enhancements)

1. **Real-time Updates**: Implement WebSocket for live location streaming
2. **Location History**: Store location history for analytics
3. **Geofencing**: Alert when riders enter/exit zones
4. **Distance Calculation**: Calculate distance traveled
5. **Battery Optimization**: Implement adaptive location update frequency
6. **Location Validation**: Verify coordinates are within service area
