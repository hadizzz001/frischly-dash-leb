# Firebase Notifications Integration

This guide explains how to use the Firebase Cloud Messaging (FCM) integration for sending push notifications to users.

## Setup

1. **Firebase Project**: Make sure you have a Firebase project set up with FCM enabled.

2. **Service Account**: The service account key is configured using the `GOOGLE_APPLICATION_CREDENTIALS` environment variable pointing to `src/config/firebase-service-account.json`.

3. **Environment Configuration**: The `.env` file contains:

   ```
   GOOGLE_APPLICATION_CREDENTIALS=./src/config/firebase-service-account.json
   ```

4. **Security**: The Firebase service account JSON file is added to `.gitignore` to prevent accidental commits.

## Security Best Practices

- ✅ Uses `GOOGLE_APPLICATION_CREDENTIALS` environment variable (industry standard)
- ✅ Service account JSON file is in `.gitignore`
- ✅ Firebase Admin SDK automatically detects credentials from environment
- ✅ No sensitive credentials in code or version control

## API Endpoints

### User Token Management

- `POST /api/notifications/token` - Update user's FCM token (authenticated users)
- `DELETE /api/notifications/token` - Remove user's FCM token (authenticated users)

### Admin Notification Management

- `POST /api/notifications/send/user` - Send to specific user
- `POST /api/notifications/send/users` - Send to multiple users
- `POST /api/notifications/send/all` - Send to all users
- `POST /api/notifications/send/role` - Send to users by role
- `GET /api/notifications/stats` - Get notification statistics

### Campaign Management

- `POST /api/notifications/campaigns` - Create a campaign
- `GET /api/notifications/campaigns` - Get all campaigns
- `GET /api/notifications/campaigns/:id` - Get specific campaign
- `PUT /api/notifications/campaigns/:id` - Update campaign
- `DELETE /api/notifications/campaigns/:id` - Delete campaign
- `POST /api/notifications/campaigns/:id/send` - Send campaign

## Using the Campaign Script

The easiest way to send notifications is using the provided script:

```bash
# Send default welcome campaign
npm run send-notification-campaign

# Send custom campaign
node scripts/send-notification-campaign.js --title "Custom Title" --message "Custom message" --targetType "role" --targetRole "customer"
```

### Command Line Options

- `--title`: Notification title
- `--message`: Notification message
- `--targetType`: Target type (`all`, `role`, `specific_users`, `segment`)
- `--targetRole`: Role to target (when targetType is `role`)
- `--targetSegment`: Segment to target (when targetType is `segment`)
- `--notes`: Campaign notes

## Campaign Types

### 1. Send to All Users

```javascript
{
  "title": "Welcome!",
  "message": "Thank you for joining us",
  "targetType": "all"
}
```

### 2. Send to Specific Role

```javascript
{
  "title": "Staff Update",
  "message": "New schedule available",
  "targetType": "role",
  "targetRole": "staff"
}
```

### 3. Send to Specific Users

```javascript
{
  "title": "Personal Message",
  "message": "Your order is ready",
  "targetType": "specific_users",
  "targetUserIds": ["userId1", "userId2"]
}
```

### 4. Send to Segment

```javascript
{
  "title": "Premium Update",
  "message": "Exclusive offer for premium members",
  "targetType": "segment",
  "targetSegment": "premium"
}
```

## Client-Side Integration

### Register FCM Token (Client App)

```javascript
// Get FCM token
const token = await messaging.getToken();

// Send to server
await fetch("/api/notifications/token", {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		Authorization: `Bearer ${userToken}`,
	},
	body: JSON.stringify({ fcmToken: token }),
});
```

### Handle Notifications (Client App)

```javascript
// Handle foreground messages
messaging.onMessage((payload) => {
	console.log("Message received:", payload);
	// Show notification
});

// Handle background messages
messaging.onBackgroundMessage((payload) => {
	console.log("Background message:", payload);
});
```

## Notification Data Structure

Notifications can include custom data:

```javascript
{
  "title": "Order Update",
  "message": "Your order #123 is ready",
  "data": {
    "type": "order_update",
    "orderId": "123",
    "action": "view_order"
  }
}
```

## Statistics

Get notification statistics:

```bash
GET /api/notifications/stats
```

Response:

```json
{
	"success": true,
	"data": {
		"totalUsers": 100,
		"usersWithTokens": 75,
		"tokenCoverage": "75.00",
		"roleBreakdown": [
			{ "_id": "customer", "count": 60 },
			{ "_id": "rider", "count": 10 },
			{ "_id": "staff", "count": 5 }
		]
	}
}
```

## Troubleshooting

1. **No users with FCM tokens**: Users need to register their tokens first
2. **Firebase initialization failed**: Check that `GOOGLE_APPLICATION_CREDENTIALS` points to the correct path
3. **Campaign not sent**: Check user permissions and campaign status

## Deployment

### Development

- Service account JSON file is stored locally in `src/config/firebase-service-account.json`
- Environment variable: `GOOGLE_APPLICATION_CREDENTIALS=./src/config/firebase-service-account.json`

### Production

- Upload the service account JSON file to your cloud platform's secure storage
- Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the file path
- Example for Heroku/Render: Set environment variable in dashboard
- Example for Google Cloud: Use service account attached to the instance

## Security Notes

- Only admin/manager/staff can send notifications
- Users can only manage their own FCM tokens
- All notification data is logged in campaigns for tracking
