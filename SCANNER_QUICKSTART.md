# Zebra Scanner App - Quick Start Guide

## Prerequisites

- Node.js 16+ and npm
- Expo CLI: `npm install -g expo-cli`
- Zebra Mobile Device (Android)
- Frischly server running (development or production)

## Setup Steps

### 1. Install Dependencies

```bash
cd scanner
npm install
```

### 2. Start Development Server

```bash
npm start
```

This will show a QR code. Use Expo app on your mobile device to scan it.

### 3. Building for Zebra Device

#### Option A: Using EAS (Recommended)

```bash
# Build APK for Android
npm run android

# Or build with EAS
eas build --platform android --local
```

#### Option B: Local Build with Android Studio

```bash
# Requires Android SDK and emulator setup
npm run android
```

### 4. First Launch Configuration

1. **Enter API URL**: When app launches, enter your server URL:
   - Development: `http://192.168.x.x:5000/api`
   - Production: `https://api.frischlyshop.com/api`

2. **Login**: Use your staff/market/rider credentials:
   - Email: your-email@example.com
   - Password: your-password

3. **Permissions**: Grant required permissions:
   - Camera (for barcode scanning)
   - Network access

## Main Screens

### 1. Login Screen

- Enter API base URL (stored for future sessions)
- Enter email and password
- Automatically connects to server and retrieves user info

### 2. Orders Screen

- View orders in "Pending", "Confirmed", "Processing" status
- Filter by status: Active, Ready, Delivered, Cancelled
- Scan order barcode to open
- Tap order to view details and start picking

### 3. Order Details Screen

- View order items with product info
- Scan product barcode or manually select items
- "Pick" button to mark item as picked
- "Skip" button for unavailable items
- "Complete" button when all items handled
- Real-time progress updates

### 4. Inventory Screen

- Search products by name or barcode
- View product details
- Check stock/shelf location
- Navigate to product location in warehouse

## Keyboard Shortcuts (Testing)

### On Development Device

- `R` - Reload app
- `D` - Toggle debug menu
- `I` - Toggle inspector
- `J` - Show console

### Zebra Device Specifics

- Long-press physical trigger on back of device to scan
- Use on-screen keyboard for text input
- Device maintains Wi-Fi connection for API calls

## Network Configuration

### Development (Local Network)

If your phone/device is on the same Wi-Fi network as your development machine:

1. Find your machine's IP: `ifconfig | grep inet`
2. Enter URL as: `http://YOUR_IP:5000/api`
3. Ensure Node.js server allows CORS from your device

### Production

Use your deployed server URL with HTTPS:
```
https://api.frischlyshop.com/api
```

## Testing Without Barcode Scanner

### Mock Barcode Input

For testing on regular Android device without barcode hardware:

1. Use Android emulator keyboard
2. Type order numbers: `ORD-12345`
3. Type barcodes: `1234567890`
4. Press Enter to "scan"

### Test Orders

Use these test scenarios:

```bash
# Create test order via API
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {"name": "Test Customer", "email": "test@example.com"},
    "items": [
      {"product": "PRODUCT_ID", "quantity": 2}
    ]
  }'
```

## Troubleshooting

### App Won't Connect to Server

```bash
# Check if server is running
curl http://localhost:5000/api/ping

# Verify CORS is enabled
curl -i -X OPTIONS http://localhost:5000/api/scanner \
  -H "Origin: http://localhost:8081"
```

### Barcode Scanning Not Working

1. **Debug Scanner Input**: 
   - Open console (CMD+D or shake device)
   - Type manual barcode to test

2. **Check Zebra Hardware**: 
   - Long-press trigger button
   - Should see red laser on device
   - Scan test barcode from label

3. **Verify Barcode Format**: 
   - Products need barcode field populated
   - Check database: `db.products.findOne({}, {name: 1, barcode: 1})`

### Token/Authentication Issues

```bash
# Test authentication
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

# Should return { success: true, token: "...", user: {...} }
```

## Development Workflow

### 1. Local Development

```bash
# Terminal 1: Node.js server
cd frischly-server
npm run dev

# Terminal 2: Expo
cd scanner
npm start
```

### 2. Testing Changes

- Edit TypeScript/React files
- Hot reload on save (usually automatic)
- For API changes, restart Node server

### 3. Building for Devices

```bash
# Build production APK
eas build --platform android --local

# Or quick local build (requires Android SDK)
npm run android
```

## Performance Tips

### For Smoother Operation

1. **Reduce Network Latency**:
   - Use dedicated Wi-Fi network
   - Minimize background apps
   - Disable VPN if possible

2. **Optimize Scanner Performance**:
   - Close unused apps
   - Clear app cache periodically
   - Use device's native barcode scanner

3. **Database Optimization**:
   - Ensure product barcodes indexed
   - Minimize order items per order
   - Archive old pick tracking records

## Environment Variables

Create `.env` file in `scanner/` directory:

```env
# API Configuration
EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:5000/api

# Feature Flags
EXPO_PUBLIC_ENABLE_OFFLINE_MODE=false
EXPO_PUBLIC_DEBUG_MODE=false

# Scanner Settings
EXPO_PUBLIC_BARCODE_TIMEOUT=5000
EXPO_PUBLIC_AUTO_REFRESH_INTERVAL=30000
```

## Advanced Configuration

### Custom Scanner Integration

To integrate with specific Zebra device APIs:

1. Install Zebra SDK for React Native
2. Update barcode capture in `ScannerCaptureInput.tsx`
3. Configure device-specific trigger buttons

### Offline Mode

For future offline support:

1. Implement SQLite local storage
2. Queue API calls while offline
3. Sync when connection restored

## Support & Debugging

### View Logs

```bash
# React Native console
npx react-native log-android

# Or in Expo CLI
Press 'j' for logs in Expo CLI
```

### Report Issues

When reporting bugs, include:
- Error message and stack trace
- Steps to reproduce
- Device model and Android version
- Network connection type
- User role and permissions

## Next Steps

1. ✅ Install and run scanner app
2. ✅ Connect to development server
3. ✅ Create test orders
4. ✅ Test barcode scanning
5. ✅ Verify pick tracking
6. ✅ Build APK for Zebra device
7. Deploy to production

## Resources

- [Expo Documentation](https://docs.expo.dev)
- [React Native Docs](https://reactnative.dev)
- [Zebra Mobile Device Docs](https://techdocs.zebra.com)
- [Frischly Server API](./SCANNER_INTEGRATION.md)
