const Order = require("../models/Order");
const Product = require("../models/Product");
const PickTracking = require("../models/PickTracking");
const Rider = require("../models/Rider");
const mongoose = require("mongoose");
const { sendResponse, sendError, sendSuccess } = require("../utils/apiResponse");

// @desc    Scan barcode and retrieve product details
// @route   POST /api/scanner/scan-product
// @access  Private (staff, market, rider, market_driver)
exports.scanProductBarcode = async (req, res) => {
  try {
    const { barcode } = req.body;

    if (!barcode || barcode.trim() === "") {
      return sendError(res, 400, "Barcode is required");
    }

    const normalizedBarcode = barcode.trim().toUpperCase();

    // Search for product by barcode or SKU
    const product = await Product.findOne({
      $or: [
        { barcode: normalizedBarcode },
        { sku: normalizedBarcode },
        { _id: normalizedBarcode },
      ],
    }).populate("market", "_id name");

    if (!product) {
      return sendResponse(res, 404, false, "Product not found", null, { barcode: normalizedBarcode });
    }

    sendResponse(res, 200, true, "Success", null, { product: {
        _id: product._id,
        name: product.name,
        barcode: product.barcode,
        sku: product.sku,
        price: product.price,
        stock: product.stock,
        market: product.market,
        shelfNumber: product.shelfNumber,
        picture: product.picture,
        description: product.description,
      } });
  } catch (error) {
    console.error("Error scanning product:", error);
    sendError(res, 500, "Error scanning product", error.message);
  }
};

// @desc    Scan order barcode and retrieve order details
// @route   POST /api/scanner/scan-order
// @access  Private (staff, market, rider, market_driver)
exports.scanOrderBarcode = async (req, res) => {
  try {
    const { barcode } = req.body;

    if (!barcode || barcode.trim() === "") {
      return sendError(res, 400, "Order barcode/number is required");
    }

    const normalizedBarcode = barcode.trim().toUpperCase();

    // Search for order by order number or ID
    const order = await Order.findOne({
      $or: [
        { orderNumber: normalizedBarcode },
        { _id: mongoose.Types.ObjectId.isValid(normalizedBarcode) ? normalizedBarcode : null },
      ],
    })
      .populate("items.product", "name barcode price shelfNumber")
      .populate("market", "_id name")
      .populate("assignedRider");

    if (!order) {
      return sendResponse(res, 404, false, "Order not found", null, { barcode: normalizedBarcode });
    }

    // Check if user has permission to access this order
    if (req.user.role === "rider" || req.user.role === "market_driver") {
      const myRider = await Rider.findOne({ user: req.user.id });
      if (!myRider || order.assignedRider?._id?.toString() !== myRider._id.toString()) {
        return sendError(res, 403, "You are not assigned to this order");
      }
    } else if (req.user.role === "market") {
      if (order.market?.toString() !== req.user.marketId?.toString()) {
        return sendError(res, 403, "This order does not belong to your market");
      }
    }

    // Get pick progress for this order
    const pickProgress = await PickTracking.findOne({ orderId: order._id, userId: req.user.id });

    sendResponse(res, 200, true, "Success", null, { order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        subtotal: order.subtotal,
        delivery: order.delivery,
        discount: order.discount,
        fees: order.fees,
        customer: order.customer,
        items: order.items,
        market: order.market,
        notes: order.notes,
        shelfNumber: order.shelfNumber,
        createdAt: order.createdAt,
        assignedRider: order.assignedRider,
      }, pickProgress: pickProgress ? {
        totalItems: pickProgress.totalItems,
        pickedItems: pickProgress.pickedItems,
        skippedItems: pickProgress.skippedItems,
        pickedDetails: pickProgress.pickedDetails,
      } : null });
  } catch (error) {
    console.error("Error scanning order:", error);
    sendError(res, 500, "Error scanning order", error.message);
  }
};

// @desc    Record item picked from order (for order fulfillment)
// @route   POST /api/scanner/pick-item
// @access  Private (staff, market, rider, market_driver)
exports.pickItem = async (req, res) => {
  try {
    const { orderId, itemId, quantity, productId, shelfNumber } = req.body;

    if (!orderId || !itemId || !quantity || quantity <= 0) {
      return sendError(res, 400, "orderId, itemId, and quantity (>0) are required");
    }

    // Verify order exists and user has access
    const order = await Order.findById(orderId);
    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (req.user.role === "rider" || req.user.role === "market_driver") {
      const myRider = await Rider.findOne({ user: req.user.id });
      if (!myRider || order.assignedRider?.toString() !== myRider._id.toString()) {
        return sendError(res, 403, "You are not assigned to this order");
      }
    } else if (req.user.role === "market") {
      if (order.market?.toString() !== req.user.marketId?.toString()) {
        return sendError(res, 403, "This order does not belong to your market");
      }
    }

    // Find or create pick tracking record
    let pickTracking = await PickTracking.findOne({
      orderId: orderId,
      userId: req.user.id,
    });

    if (!pickTracking) {
      pickTracking = await PickTracking.create({
        orderId: orderId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        totalItems: order.items.length,
        pickedItems: [],
        skippedItems: [],
      });
    }

    // Check if item already picked
    const alreadyPicked = pickTracking.pickedItems.find(
      (p) => p.itemId.toString() === itemId
    );

    if (alreadyPicked) {
      return sendError(res, 400, "Item already marked as picked");
    }

    // Add to picked items
    pickTracking.pickedItems.push({
      itemId: itemId,
      productId: productId,
      quantity: quantity,
      shelfNumber: shelfNumber,
      pickedAt: new Date(),
    });

    await pickTracking.save();

    // Calculate progress
    const totalOrderItems = order.items.length;
    const pickedCount = pickTracking.pickedItems.length;
    const percentage = Math.round((pickedCount / totalOrderItems) * 100);

    sendResponse(res, 200, true, "Item marked as picked", null, { progress: {
        pickedItems: pickedCount,
        totalItems: totalOrderItems,
        percentage: percentage,
        remaining: totalOrderItems - pickedCount,
      }, pickTracking: {
        _id: pickTracking._id,
        pickedItems: pickTracking.pickedItems,
        skippedItems: pickTracking.skippedItems,
      } });
  } catch (error) {
    console.error("Error picking item:", error);
    sendError(res, 500, "Error picking item", error.message);
  }
};

// @desc    Skip item during order fulfillment (item out of stock, damaged, etc.)
// @route   POST /api/scanner/skip-item
// @access  Private (staff, market, rider, market_driver)
exports.skipItem = async (req, res) => {
  try {
    const { orderId, itemId, reason } = req.body;

    if (!orderId || !itemId) {
      return sendError(res, 400, "orderId and itemId are required");
    }

    // Verify order exists and user has access
    const order = await Order.findById(orderId);
    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (req.user.role === "rider" || req.user.role === "market_driver") {
      const myRider = await Rider.findOne({ user: req.user.id });
      if (!myRider || order.assignedRider?.toString() !== myRider._id.toString()) {
        return sendError(res, 403, "You are not assigned to this order");
      }
    } else if (req.user.role === "market") {
      if (order.market?.toString() !== req.user.marketId?.toString()) {
        return sendError(res, 403, "This order does not belong to your market");
      }
    }

    // Find or create pick tracking record
    let pickTracking = await PickTracking.findOne({
      orderId: orderId,
      userId: req.user.id,
    });

    if (!pickTracking) {
      pickTracking = await PickTracking.create({
        orderId: orderId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        totalItems: order.items.length,
        pickedItems: [],
        skippedItems: [],
      });
    }

    // Check if item already skipped
    const alreadySkipped = pickTracking.skippedItems.find(
      (s) => s.itemId.toString() === itemId
    );

    if (alreadySkipped) {
      return sendError(res, 400, "Item already marked as skipped");
    }

    // Add to skipped items
    pickTracking.skippedItems.push({
      itemId: itemId,
      reason: reason || "Unknown",
      skippedAt: new Date(),
    });

    await pickTracking.save();

    // Calculate progress
    const totalOrderItems = order.items.length;
    const pickedCount = pickTracking.pickedItems.length;
    const percentage = Math.round((pickedCount / totalOrderItems) * 100);

    sendResponse(res, 200, true, "Item marked as skipped", null, { progress: {
        pickedItems: pickedCount,
        totalItems: totalOrderItems,
        percentage: percentage,
        remaining: totalOrderItems - pickedCount,
      }, pickTracking: {
        _id: pickTracking._id,
        pickedItems: pickTracking.pickedItems,
        skippedItems: pickTracking.skippedItems,
      } });
  } catch (error) {
    console.error("Error skipping item:", error);
    sendError(res, 500, "Error skipping item", error.message);
  }
};

// @desc    Get pick progress for an order
// @route   GET /api/scanner/pick-progress/:orderId
// @access  Private (staff, market, rider, market_driver)
exports.getPickProgress = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId).populate(
      "items.product",
      "name barcode price shelfNumber"
    );

    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (req.user.role === "rider" || req.user.role === "market_driver") {
      const myRider = await Rider.findOne({ user: req.user.id });
      if (!myRider || order.assignedRider?.toString() !== myRider._id.toString()) {
        return sendError(res, 403, "You are not assigned to this order");
      }
    } else if (req.user.role === "market") {
      if (order.market?.toString() !== req.user.marketId?.toString()) {
        return sendError(res, 403, "This order does not belong to your market");
      }
    }

    const pickTracking = await PickTracking.findOne({
      orderId: orderId,
      userId: req.user.id,
    });

    const totalItems = order.items.length;
    const pickedCount = pickTracking?.pickedItems?.length || 0;
    const skippedCount = pickTracking?.skippedItems?.length || 0;
    const remainingCount = totalItems - pickedCount - skippedCount;

    sendResponse(res, 200, true, "Success", null, { progress: {
        totalItems: totalItems,
        pickedItems: pickedCount,
        skippedItems: skippedCount,
        remainingItems: remainingCount,
        percentage: Math.round((pickedCount / totalItems) * 100),
      }, pickTracking: pickTracking || null, order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        items: order.items,
      } });
  } catch (error) {
    console.error("Error getting pick progress:", error);
    sendError(res, 500, "Error getting pick progress", error.message);
  }
};

// @desc    Complete order fulfillment and update order status
// @route   POST /api/scanner/complete-order
// @access  Private (staff, market, rider, market_driver)
exports.completeOrder = async (req, res) => {
  try {
    const { orderId, notes } = req.body;

    if (!orderId) {
      return sendError(res, 400, "orderId is required");
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (req.user.role === "rider" || req.user.role === "market_driver") {
      const myRider = await Rider.findOne({ user: req.user.id });
      if (!myRider || order.assignedRider?.toString() !== myRider._id.toString()) {
        return sendError(res, 403, "You are not assigned to this order");
      }
    } else if (req.user.role === "market") {
      if (order.market?.toString() !== req.user.marketId?.toString()) {
        return sendError(res, 403, "This order does not belong to your market");
      }
    }

    const pickTracking = await PickTracking.findOne({
      orderId: orderId,
      userId: req.user.id,
    });

    const totalItems = order.items.length;
    const pickedCount = pickTracking?.pickedItems?.length || 0;
    const skippedCount = pickTracking?.skippedItems?.length || 0;

    // Update order status based on pick results
    let newStatus = order.status;
    const fulfillmentNotes = `Picked: ${pickedCount}/${totalItems} items. Skipped: ${skippedCount} items.`;

    if (pickedCount === totalItems) {
      // All items picked
      newStatus = "ready for pickup";
    } else if (pickedCount + skippedCount === totalItems) {
      // All items either picked or skipped
      if (pickedCount === 0) {
        newStatus = "cancelled"; // Nothing picked
      } else {
        newStatus = "ready for pickup"; // Partial fulfillment accepted
      }
    }

    order.status = newStatus;
    if (notes) {
      order.notes = (order.notes || "") + "\n[Scanner] " + notes;
    }
    order.notes = (order.notes || "") + "\n[Fulfillment] " + fulfillmentNotes;

    await order.save();

    // Mark pick tracking as completed
    if (pickTracking) {
      pickTracking.completedAt = new Date();
      await pickTracking.save();
    }

    sendResponse(res, 200, true, "Order fulfillment completed", null, { order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: newStatus,
        notes: order.notes,
      }, fulfillmentSummary: {
        totalItems: totalItems,
        pickedItems: pickedCount,
        skippedItems: skippedCount,
      } });
  } catch (error) {
    console.error("Error completing order:", error);
    sendError(res, 500, "Error completing order", error.message);
  }
};

// @desc    Get filtered orders for scanner (warehouse mode)
// @route   GET /api/scanner/orders
// @access  Private (staff, market, rider, market_driver)
exports.getScannerOrders = async (req, res) => {
  try {
    const {
      status = "pending,confirmed,processing",
      limit = 50,
      page = 1,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    // Parse status filter
    if (status) {
      const statusArray = status.split(",").map((s) => s.trim());
      filter.status = { $in: statusArray };
    }

    // Apply role-based filtering
    if (req.user.role === "rider" || req.user.role === "market_driver") {
      const myRider = await Rider.findOne({ user: req.user.id });
      if (myRider) {
        filter.assignedRider = myRider._id;
      }
    } else if (req.user.role === "market") {
      filter.market = req.user.marketId;
    }

    const orders = await Order.find(filter)
      .populate("items.product", "name barcode price shelfNumber")
      .populate("market", "_id name")
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip);

    const total = await Order.countDocuments(filter);

    // Get pick progress for each order
    const progressMap = {};
    for (const order of orders) {
      const progress = await PickTracking.findOne({
        orderId: order._id,
        userId: req.user.id,
      });
      progressMap[order._id] = {
        pickedItems: progress?.pickedItems?.length || 0,
        totalItems: order.items.length,
      };
    }

    sendResponse(res, 200, true, "Success", null, { orders: orders.map((order) => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        customer: order.customer,
        items: order.items,
        market: order.market,
        createdAt: order.createdAt,
        progress: progressMap[order._id],
      })), pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      } });
  } catch (error) {
    console.error("Error getting scanner orders:", error);
    sendError(res, 500, "Error retrieving orders", error.message);
  }
};
