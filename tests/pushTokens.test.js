// In-memory stand-in for the few User model calls pushTokens.js makes, so the
// tests exercise the real bookkeeping (who owns which device) end to end.
const mockUsers = new Map();
jest.mock("../src/models/User", () => {
	const copy = (value) => JSON.parse(JSON.stringify(value));
	const matches = (doc, filter) =>
		Object.entries(filter).every(([key, want]) => {
			if (key === "_id") {
				return want && typeof want === "object" && "$ne" in want
					? doc._id !== String(want.$ne)
					: doc._id === String(want);
			}
			if (key === "pushTokens") return (doc.pushTokens || []).includes(want);
			return doc[key] === want;
		});
	const apply = (doc, update) => {
		if (update.$set) Object.assign(doc, copy(update.$set));
		for (const [key, value] of Object.entries(update.$pull || {})) {
			doc[key] = (doc[key] || []).filter((t) => t !== value);
		}
	};
	return {
		findById: (id) => ({
			select: () => ({
				lean: async () => (mockUsers.has(String(id)) ? copy(mockUsers.get(String(id))) : null),
			}),
		}),
		updateOne: jest.fn(async (filter, update) => {
			const doc = [...mockUsers.values()].find((d) => matches(d, filter));
			if (doc) apply(doc, update);
		}),
		updateMany: jest.fn(async (filter, update) => {
			for (const doc of mockUsers.values()) if (matches(doc, filter)) apply(doc, update);
		}),
	};
});

const {
	MAX_PUSH_TOKENS,
	withPushToken,
	pushTokensOf,
	addPushToken,
	removePushToken,
	clearPushTokens,
	dropPushToken,
} = require("../src/services/pushTokens");

const EXPO_GO = "ExponentPushToken[expo-go]";
const IPHONE = "ExponentPushToken[iphone]";
const ANDROID = "ExponentPushToken[android]";

const seed = (id, fields) => mockUsers.set(id, { _id: id, fcmToken: null, ...fields });
const user = (id) => mockUsers.get(id);

beforeEach(() => mockUsers.clear());

describe("pushTokensOf", () => {
	it("merges the device list with the legacy single token, without duplicates", () => {
		expect(pushTokensOf({ pushTokens: [IPHONE, ANDROID], fcmToken: ANDROID })).toEqual([IPHONE, ANDROID]);
		expect(pushTokensOf({ fcmToken: EXPO_GO })).toEqual([EXPO_GO]);
		expect(pushTokensOf({ pushTokens: ["", null], fcmToken: null })).toEqual([]);
		expect(pushTokensOf(null)).toEqual([]);
	});
});

describe("withPushToken", () => {
	it("narrows a filter to users with a device, without clobbering its own $or", () => {
		const filter = { isActive: true, $or: [{ role: "staff" }] };
		const query = withPushToken(filter);
		expect(query.$and[0]).toBe(filter);
		expect(query.$and[1].$or).toEqual([
			{ fcmToken: { $nin: [null, ""] } },
			{ "pushTokens.0": { $exists: true } },
		]);
	});
});

describe("addPushToken", () => {
	it("keeps every device of the account, including one registered before the list existed", async () => {
		seed("u1", { fcmToken: EXPO_GO });
		await addPushToken("u1", IPHONE);
		await addPushToken("u1", ANDROID);
		expect(user("u1").pushTokens).toEqual([EXPO_GO, IPHONE, ANDROID]);
		expect(user("u1").fcmToken).toBe(ANDROID);
	});

	it("moves a device that registers again to the end instead of duplicating it", async () => {
		seed("u1", { pushTokens: [EXPO_GO, IPHONE, ANDROID], fcmToken: ANDROID });
		await addPushToken("u1", IPHONE);
		expect(user("u1").pushTokens).toEqual([EXPO_GO, ANDROID, IPHONE]);
		expect(user("u1").fcmToken).toBe(IPHONE);
	});

	it("takes the device away from the account that used it before", async () => {
		seed("u1", {});
		seed("u2", { pushTokens: [IPHONE, ANDROID], fcmToken: IPHONE });
		await addPushToken("u1", IPHONE);
		expect(user("u1").pushTokens).toEqual([IPHONE]);
		expect(user("u2").pushTokens).toEqual([ANDROID]);
		expect(pushTokensOf(user("u2"))).toEqual([ANDROID]);
	});

	it("keeps only the newest devices once the list is full", async () => {
		seed("u1", {});
		const tokens = Array.from({ length: MAX_PUSH_TOKENS + 2 }, (_, i) => `ExponentPushToken[d${i}]`);
		for (const token of tokens) await addPushToken("u1", token);
		expect(user("u1").pushTokens).toEqual(tokens.slice(-MAX_PUSH_TOKENS));
	});

	it("returns null for an unknown user", async () => {
		expect(await addPushToken("missing", IPHONE)).toBeNull();
	});
});

describe("removing devices", () => {
	it("removePushToken forgets only the signing-out device", async () => {
		seed("u1", { pushTokens: [EXPO_GO, IPHONE, ANDROID], fcmToken: ANDROID });
		await removePushToken("u1", ANDROID);
		expect(user("u1").pushTokens).toEqual([EXPO_GO, IPHONE]);
		expect(user("u1").fcmToken).toBe(IPHONE);
	});

	it("clearPushTokens forgets every device (logout from an older app build)", async () => {
		seed("u1", { pushTokens: [IPHONE, ANDROID], fcmToken: ANDROID });
		await clearPushTokens("u1");
		expect(pushTokensOf(user("u1"))).toEqual([]);
	});

	it("dropPushToken takes a dead device off whichever account has it", async () => {
		seed("u1", { pushTokens: [IPHONE, ANDROID], fcmToken: ANDROID });
		seed("u2", { fcmToken: ANDROID });
		await dropPushToken(ANDROID);
		expect(pushTokensOf(user("u1"))).toEqual([IPHONE]);
		expect(pushTokensOf(user("u2"))).toEqual([]);
	});
});
