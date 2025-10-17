const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

/**
 * @route POST /api/payments/payment-links
 * @description Create a payment link with full data
 * @access Public
 */
router.post("/payment-links", paymentController.createPaymentLink);

/**
 * @route POST /api/payments/create-simple-link
 * @description Create a payment link with minimal required fields
 * @access Public
 */
router.post("/create-simple-link", paymentController.createSimplePaymentLink);

/**
 * @route GET /api/payments/payment-links
 * @description Get all payment links
 * @access Public
 */
router.get("/payment-links", paymentController.getPaymentLinks);

/**
 * @route GET /api/payments/payment-links/:linkId
 * @description Get a specific payment link by ID
 * @access Public
 */
router.get("/payment-links/:linkId", paymentController.getPaymentLink);

/**
 * @route PUT /api/payments/payment-links/:linkId
 * @description Update a payment link
 * @access Public
 */
router.put("/payment-links/:linkId", paymentController.updatePaymentLink);

module.exports = router;
