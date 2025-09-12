# FRISCHLY Server

# FRISCHLY Server

Node.js API server with MongoDB and Express, featuring user authentication and role-based access control.

## Features

- **User Authentication**: Registration, login, profile management
- **JWT Tokens**: Access and refresh token implementation
- **Security**: Helmet, CORS, rate limiting
- **Validation**: Input validation with express-validator
- **Password Hashing**: Secure password storage with bcrypt
- **MongoDB**: Mongoose ODM for database operations
- **Error Handling**: Comprehensive error handling middleware

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or MongoDB Atlas)
- npm or yarn

### Installation

1. Clone the repository or navigate to the project directory

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file with your configuration:

   ```env
   NODE_ENV=development
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/frischly-server
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRE=30d
   JWT_REFRESH_SECRET=your-super-secret-refresh-jwt-key-change-this-in-production
   JWT_REFRESH_EXPIRE=7d
   CLIENT_URL=http://localhost:3000
   ```

4. Start MongoDB (if running locally)

5. Run the server:

   ```bash
   # Development mode with nodemon
   npm run dev

   # Production mode
   npm start
   ```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication

| Method | Endpoint                    | Description              | Auth Required |
| ------ | --------------------------- | ------------------------ | ------------- |
| POST   | `/api/auth/register`        | Register a new user      | No            |
| POST   | `/api/auth/login`           | Login user               | No            |
| GET    | `/api/auth/me`              | Get current user profile | Yes           |
| PUT    | `/api/auth/profile`         | Update user profile      | Yes           |
| PUT    | `/api/auth/change-password` | Change user password     | Yes           |

### Health Check

| Method | Endpoint      | Description         | Auth Required |
| ------ | ------------- | ------------------- | ------------- |
| GET    | `/api/health` | Server health check | No            |

## API Usage Examples

### Register User

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "phoneNumber": "+1234567890",
    "email": "john@example.com",
    "password": "Password123",
    "address": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "USA"
    }
  }'
```

### Login User

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "Password123"
  }'
```

### Get User Profile (Protected Route)

```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Project Structure

```
frischly-server/
├── src/
│   ├── config/
│   │   └── database.js          # Database connection
│   ├── controllers/
│   │   └── authController.js    # Authentication controllers
│   ├── middleware/
│   │   └── auth.js             # Authentication middleware
│   ├── models/
│   │   └── User.js             # User model
│   ├── routes/
│   │   └── auth.js             # Authentication routes
│   └── utils/
│       └── jwt.js              # JWT utilities
├── server.js                   # Main server file
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Security Features

- **Password Hashing**: All passwords are hashed using bcrypt
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: Request validation using express-validator
- **Rate Limiting**: Protection against brute force attacks
- **CORS**: Cross-origin resource sharing configuration
- **Helmet**: Security headers middleware

## Environment Variables

| Variable           | Description               | Default                                   |
| ------------------ | ------------------------- | ----------------------------------------- |
| NODE_ENV           | Environment mode          | development                               |
| PORT               | Server port               | 5000                                      |
| MONGODB_URI        | MongoDB connection string | mongodb://localhost:27017/frischly-server |
| JWT_SECRET         | JWT secret key            | Required                                  |
| JWT_EXPIRE         | JWT token expiration      | 30d                                       |
| JWT_REFRESH_SECRET | Refresh token secret      | Required                                  |
| JWT_REFRESH_EXPIRE | Refresh token expiration  | 7d                                        |
| CLIENT_URL         | Client URL for CORS       | http://localhost:3000                     |

## Development

To start development mode with auto-reload:

```bash
npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
