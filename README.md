# Frischly Server

Node.js API server for Frischly - a comprehensive order management, delivery, and marketplace platform.

## Features

### Core Functionality
- ✅ User authentication (staff, customers, riders, markets)
- ✅ Product and category management
- ✅ Order creation and fulfillment
- ✅ Rider assignment and tracking
- ✅ Market administration
- ✅ Promotional codes and discounts
- ✅ Real-time notifications
- ✅ Payment processing (Stripe integration)

### 🆕 Zebra Scanner Integration
- ✅ Barcode scanning for products and orders
- ✅ Real-time order fulfillment tracking
- ✅ Item picking with skip reasons
- ✅ Mobile warehouse mode
- ✅ Audit trail for all picking activities

See [SCANNER_INTEGRATION_SUMMARY.md](./SCANNER_INTEGRATION_SUMMARY.md) for complete details.

## Project Structure

```
frischly-server/
├── src/
│   ├── config/          # Database and Firebase configuration
│   ├── controllers/     # Business logic and API handlers
│   ├── middleware/      # Authentication, authorization, error handling
│   ├── models/          # MongoDB schemas
│   ├── routes/          # API endpoint definitions
│   ├── services/        # Third-party integrations
│   └── utils/           # Helper functions
├── scanner/             # Zebra scanner mobile app (React Native)
├── scripts/             # Database migrations and utilities
├── tests/               # Test files
├── public/              # Frontend static files
├── server.js            # Main application entry point
└── package.json         # Dependencies and scripts
```

## Quick Start

### Prerequisites
- Node.js 14+ and npm
- MongoDB 4.4+
- Stripe account (for payments)
- Firebase project (for notifications)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file with required variables
4. Start the server:
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

## Scanner Integration

The Frischly server now includes integrated Zebra scanner support for warehouse order fulfillment.

### Quick Links
- 📖 [Full Integration Guide](./SCANNER_INTEGRATION.md)
- 🚀 [Quick Start Guide](./SCANNER_QUICKSTART.md)
- 📚 [API Reference](./SCANNER_API_REFERENCE.md)

### Key Scanner Features
- Scan product barcodes to verify inventory
- Scan order numbers to retrieve order details
- Pick items with real-time progress tracking
- Skip unavailable items with audit trail
- Complete orders and update status automatically

### Scanner API Endpoints

All endpoints require JWT authentication and are under `/api/scanner`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/scan-product` | POST | Get product details from barcode |
| `/scan-order` | POST | Get order details from order number |
| `/pick-item` | POST | Mark item as picked |
| `/skip-item` | POST | Mark item as skipped |
| `/pick-progress/:orderId` | GET | Get order fulfillment progress |
| `/complete-order` | POST | Finish order fulfillment |
| `/orders` | GET | Get orders ready for picking |

## API Documentation

### Main API Endpoints

#### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Create new account
- `POST /api/auth/refresh-token` - Refresh JWT token

#### Orders
- `GET /api/orders` - Get all orders (with filters)
- `POST /api/orders` - Create new order
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id` - Update order
- `POST /api/orders/:id/cancel` - Cancel order

#### Products
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `GET /api/products/:id` - Get product details
- `PUT /api/products/:id` - Update product

#### Markets
- `GET /api/markets` - List all markets
- `POST /api/markets` - Create market
- `GET /api/markets/:id` - Get market details

#### Riders
- `GET /api/riders` - List riders
- `POST /api/riders` - Create rider
- `PUT /api/riders/:id/location` - Update rider location

See [SCANNER_API_REFERENCE.md](./SCANNER_API_REFERENCE.md) for complete endpoint documentation.

## Environment Variables

Key environment variables (see `.env.example`):

```env
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/frischly

# JWT
JWT_SECRET=your_secret_key
JWT_EXPIRE=7d

# Firebase
FIREBASE_PROJECT_ID=your-project
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-email

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...

# Server
CLIENT_URL=http://localhost:3000
```

## Security Features

- ✅ JWT authentication with refresh tokens
- ✅ Role-based access control (RBAC)
- ✅ Rate limiting on all endpoints
- ✅ NoSQL injection protection
- ✅ Data sanitization
- ✅ CORS configuration
- ✅ Helmet security headers
- ✅ Secure password hashing

## Database Models

- **User** - Authentication and profile management
- **Order** - Order details and history
- **Product** - Product catalog
- **Category** - Product categories
- **Market** - Market/store information
- **Rider** - Delivery rider management
- **Zone** - Delivery zones
- **PickTracking** - Scanner order fulfillment tracking
- And more...

## Development

### Available Scripts

```bash
npm start              # Start production server
npm run dev            # Start with nodemon (auto-reload)
npm run validate-env   # Check environment variables
npm run test-cors      # Test CORS configuration
npm run create-admin   # Create admin user
npm run send-test-notification  # Test push notifications
```

### Testing

Run the test suite:
```bash
npm test
```

### Database Migrations

Scripts are available in `scripts/` directory for:
- Database initialization
- Data seeding
- Schema migrations
- User creation

## Performance Optimization

- Database indexes on frequently queried fields
- Response compression
- Request rate limiting
- Caching strategies
- Query optimization

## Monitoring & Logging

- Request/response logging
- Error tracking and reporting
- Database query monitoring
- Performance metrics

## Deployment

The server is configured for deployment on:
- Node.js hosting platforms (Heroku, Render, etc.)
- Docker containers
- Cloud platforms (AWS, Google Cloud, Azure)

### Deploy to Production

1. Set up environment variables
2. Build: `npm run prepare-deploy`
3. Deploy to your hosting platform
4. Run migrations if needed
5. Verify with health checks

## Support & Documentation

- 📖 [Scanner Integration Guide](./SCANNER_INTEGRATION.md)
- 🚀 [Scanner Quick Start](./SCANNER_QUICKSTART.md)
- 📚 [API Reference](./SCANNER_API_REFERENCE.md)
- 📋 [Firebase Notifications](./FIREBASE_NOTIFICATIONS_README.md)
- 🎟️ [Promo Codes API](./PROMO_CODE_API_DOCS.md)
- 📢 [Announcements API](./ANNOUNCEMENT_API_DOCS.md)

## Troubleshooting

### Server won't start
- Check MongoDB connection string
- Verify all environment variables are set
- Check port 5000 is not in use

### Database errors
- Ensure MongoDB is running
- Check connection credentials
- Verify indexes are created

### API requests failing
- Check authentication token
- Verify CORS settings
- Review server logs

## License

MIT
