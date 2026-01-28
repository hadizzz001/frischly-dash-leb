# Promo Code API Documentation

## Validate Promo Code

### Endpoint
```
POST /api/promocodes/validate
```

### Description
Validates and applies a promo code to calculate the discount on an order total. Only promo codes from your own company (`isFromOwnCompany: true`) can be validated. Messages are returned in the user's preferred language based on the `Accept-Language` header (supports English and German).

### Access
Public

### Request Body
```json
{
  "code": "string", // Required: The promo code to validate (case-insensitive)
  "orderTotal": "number" // Required: The total amount of the order before discount
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "promoCode": {
      "id": "string",
      "code": "string",
      "companyName": "string",
      "description": "string",
      "discountType": "percentage" | "cash",
      "discountValue": "number"
    },
    "discountAmount": "number", // Calculated discount amount (2 decimal places)
    "originalTotal": "number", // The provided orderTotal
    "finalTotal": "number" // Order total after discount (2 decimal places)
  },
  "message": "Promo code applied successfully"
}
```

### Error Responses

#### 400 Bad Request - Missing Code
```json
{
  "success": false,
  "message": "Promo code is required"
}
```

#### 404 Not Found - Invalid Code
```json
{
  "success": false,
  "message": "Invalid or inactive promo code"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Server Error",
  "error": "string"
}
```

### React Native Example

#### Using Fetch
```javascript
const validatePromoCode = async (code, orderTotal) => {
  try {
    const response = await fetch('https://your-api-url/api/promocodes/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: code.toUpperCase(), // Ensure uppercase
        orderTotal: orderTotal,
      }),
    });

    const data = await response.json();

    if (data.success) {
      console.log('Discount applied:', data.data.discountAmount);
      console.log('Final total:', data.data.finalTotal);
      return data.data;
    } else {
      console.error('Validation failed:', data.message);
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Error validating promo code:', error);
    throw error;
  }
};

// Usage
validatePromoCode('SUMMER2024', 100.00)
  .then(result => {
    // Handle success
  })
  .catch(error => {
    // Handle error
  });
```

#### Using Axios
```javascript
import axios from 'axios';

const validatePromoCode = async (code, orderTotal) => {
  try {
    const response = await axios.post('https://your-api-url/api/promocodes/validate', {
      code: code.toUpperCase(),
      orderTotal: orderTotal,
    });

    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    console.error('Error validating promo code:', error.response?.data?.message || error.message);
    throw error;
  }
};
```

### Notes
- The promo code is converted to uppercase before validation
- For percentage discounts, the discount is calculated as `(orderTotal * discountValue) / 100`
- For cash discounts, the discount cannot exceed the order total
- Only active promo codes from your own company can be validated
- All monetary values are returned with 2 decimal places
- API responses are localized based on the `Accept-Language` header (en/de)