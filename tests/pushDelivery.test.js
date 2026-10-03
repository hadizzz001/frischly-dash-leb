const mockSend = jest.fn();
const mockReceipts = jest.fn();
const mockSendEach = jest.fn();

jest.mock("expo-server-sdk", () => ({
	Expo: class {
		static isExpoPushToken(token) {
			return typeof token === "string" && /^Expo(nent)?PushToken\[.+\]$/.test(token);
		}
		sendPushNotificationsAsync(messages) {
			return mockSend(messages);
		}
		getPushNotificationReceiptsAsync(ids) {
			return mockReceipts(ids);
		}
	},
}));
jest.mock("firebase-admin", () => ({ messaging: () => ({ sendEach: mockSendEach }) }));
jest.mock("../src/models/User", () => ({
	find: jest.fn(),
	findById: jest.fn(),
	findOne: jest.fn(),
	updateOne: jest.fn(async () => ({})),
	updateMany: jest.fn(async () => ({})),
}));
jest.mock("../src/models/Rider", () => ({ findById: jest.fn() }));
jest.mock("../src/models/Market", () => ({ findById: jest.fn() }));

const User = require("../src/models/User");
const NotificationService = require("../src/services/notifications");
const { notifyCustomerOrderStatus } = require("../src/services/orderStatusNotification");

const IPHONE = "ExponentPushToken[iphone]";
const ANDROID = "ExponentPushToken[android]";
const okTickets = (messages) => messages.map((_, i) => ({ status: "ok", id: `ticket-${i}` }));

beforeEach(() => {
	jest.useFakeTimers();
	mockSend.mockImplementation(async (messages) => okTickets(messages));
	mockReceipts.mockResolvedValue({});
	mockSendEach.mockImplementation(async (messages) => ({ responses: messages.map(() => ({ success: true })) }));
	jest.spyOn(console, "log").mockImplementation(() => {});
	jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	jest.clearAllTimers();
	jest.useRealTimers();
	jest.restoreAllMocks();
});

describe("NotificationService.deliver", () => {
	it("pushes to every device of every user, through Expo or Firebase by token type", async () => {
		const users = [
			{ _id: "u1", pushTokens: [IPHONE, ANDROID], fcmToken: ANDROID },
			{ _id: "u2", pushTokens: [], fcmToken: "raw-fcm-registration-token" },
		];
		const result = await NotificationService.deliver(users, "Hi", "There", { orderId: 7 });

		const [expoMessages] = mockSend.mock.calls[0];
		expect(expoMessages.map((m) => m.to)).toEqual([IPHONE, ANDROID]);
		expect(expoMessages[0]).toMatchObject({
			title: "Hi",
			body: "There",
			priority: "high",
			sound: "default",
			channelId: "default",
			data: { orderId: 7, userId: "u1" },
		});
		const [fcmMessages] = mockSendEach.mock.calls[0];
		expect(fcmMessages).toEqual([
			{
				token: "raw-fcm-registration-token",
				notification: { title: "Hi", body: "There" },
				data: { orderId: "7", userId: "u2" },
			},
		]);
		expect(result).toMatchObject({ success: true, totalSent: 2, devices: 3 });
		expect(result.expo.totalSent).toBe(2);
		expect(result.firebase.totalSent).toBe(1);
	});

	it("posts on the channel named in the payload without delivering it as data", async () => {
		await NotificationService.deliver([{ _id: "s1", pushTokens: [ANDROID] }], "New Order", "#1", {
			type: "new_order",
			channelId: "new-orders-v2",
		});
		const [[message]] = mockSend.mock.calls[0];
		expect(message.channelId).toBe("new-orders-v2");
		expect(message.data).toEqual({ type: "new_order", userId: "s1" });
	});

	it("drops a device Expo rejects as no longer registered", async () => {
		mockSend.mockResolvedValue([
			{ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
		]);
		const result = await NotificationService.deliver([{ _id: "u1", pushTokens: [IPHONE] }], "Hi", "There");
		expect(result.expo.totalSent).toBe(0);
		expect(User.updateMany).toHaveBeenCalledWith({ pushTokens: IPHONE }, { $pull: { pushTokens: IPHONE } });
		expect(User.updateMany).toHaveBeenCalledWith({ fcmToken: IPHONE }, { $set: { fcmToken: null } });
	});

	it("reads the receipts a minute later and drops devices Apple/Google refused", async () => {
		await NotificationService.deliver([{ _id: "u1", pushTokens: [IPHONE, ANDROID] }], "Hi", "There");
		mockReceipts.mockResolvedValueOnce({
			"ticket-0": { status: "ok" },
			"ticket-1": { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
		});
		await jest.advanceTimersByTimeAsync(60 * 1000);
		expect(mockReceipts).toHaveBeenCalledWith(["ticket-0", "ticket-1"]);
		expect(User.updateMany).toHaveBeenCalledWith({ pushTokens: ANDROID }, { $pull: { pushTokens: ANDROID } });
		expect(User.updateMany).not.toHaveBeenCalledWith({ pushTokens: IPHONE }, expect.anything());
	});

	it("asks again at 15 minutes for receipts that weren't ready", async () => {
		await NotificationService.deliver([{ _id: "u1", pushTokens: [IPHONE] }], "Hi", "There");
		await jest.advanceTimersByTimeAsync(60 * 1000);
		expect(mockReceipts).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(14 * 60 * 1000);
		expect(mockReceipts).toHaveBeenCalledTimes(2);
		expect(mockReceipts).toHaveBeenLastCalledWith(["ticket-0"]);
	});
});

describe("NotificationService queries", () => {
	it("finds users by any registered device and refuses when nobody can be reached", async () => {
		User.find.mockResolvedValue([]);
		await expect(NotificationService.sendToRole("staff", "t", "b")).rejects.toThrow("No active staffs found");
		const [query] = User.find.mock.calls[0];
		expect(query.$and[0]).toEqual({ role: "staff", isActive: true });
		expect(query.$and[1].$or).toContainEqual({ "pushTokens.0": { $exists: true } });
	});
});

describe("notifyCustomerOrderStatus", () => {
	it("notifies every phone the shopper is signed in on", async () => {
		User.findById.mockReturnValue({
			select: async () => ({ _id: "c1", name: "Lina Haddad", pushTokens: [IPHONE, ANDROID], fcmToken: ANDROID }),
		});
		const order = { _id: "o1", status: "confirmed", createdBy: "c1", customer: { name: "Lina Haddad" } };

		await notifyCustomerOrderStatus(order, "confirmed");

		const [messages] = mockSend.mock.calls[0];
		expect(messages.map((m) => m.to)).toEqual([IPHONE, ANDROID]);
		expect(messages[0]).toMatchObject({
			title: "You're all set ✅",
			data: { orderId: "o1", route: "/track/o1", status: "confirmed" },
		});
	});

	it("does nothing for a shopper without a registered device", async () => {
		User.findById.mockReturnValue({ select: async () => ({ _id: "c1", fcmToken: null }) });
		const result = await notifyCustomerOrderStatus({ _id: "o1", createdBy: "c1", customer: {} }, "confirmed");
		expect(result).toEqual({ success: false, reason: "no_token" });
		expect(mockSend).not.toHaveBeenCalled();
	});
});
