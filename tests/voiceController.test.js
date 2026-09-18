const {
	interpretVoice,
	_internal: { correctMishearings, normaliseTerms, providerError, VoiceError },
} = require("../src/controllers/voiceController");

// Minimal Express Response mock
const createMockRes = () => {
	const res = { statusCode: null, body: null };
	res.status = jest.fn((code) => {
		res.statusCode = code;
		return res;
	});
	res.json = jest.fn((payload) => {
		res.body = payload;
		return res;
	});
	return res;
};

describe("voice proxy controller", () => {
	describe("correctMishearings", () => {
		it("repairs common speech-to-text food mishearings", () => {
			expect(correctMishearings("I want not bad and catch up")).toBe(
				"I want hot dog and ketchup",
			);
		});
		it("collapses whitespace and trims", () => {
			expect(correctMishearings("  milk   and  eggs ")).toBe("milk and eggs");
		});
	});

	describe("normaliseTerms", () => {
		it("lowercases, strips punctuation, de-duplicates and caps at 10", () => {
			const out = normaliseTerms(["Milk!", "milk", "Eggs?", ...Array(20).fill("x")]);
			expect(out.slice(0, 3)).toEqual(["milk", "eggs", "x"]);
			expect(out.length).toBeLessThanOrEqual(10);
		});
		it("keeps Arabic letters", () => {
			expect(normaliseTerms(["لبنة"])).toEqual(["لبنة"]);
		});
	});

	describe("providerError", () => {
		const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
		afterAll(() => spy.mockRestore());

		it("maps a 401 to not_configured without leaking the body", () => {
			const err = providerError(401, '{"error":{"message":"Incorrect API key sk-proj-abc"}}');
			expect(err).toBeInstanceOf(VoiceError);
			expect(err.status).toBe(503);
			expect(err.code).toBe("not_configured");
			expect(err.message).not.toContain("sk-proj");
		});
		it("maps 429 to rate_limited and others to provider_error", () => {
			expect(providerError(429, "").code).toBe("rate_limited");
			expect(providerError(500, "").code).toBe("provider_error");
		});
	});

	describe("interpretVoice handler", () => {
		it("answers 400 no_audio when no file was uploaded", async () => {
			const prev = process.env.OPENAI_API_KEY;
			process.env.OPENAI_API_KEY = "test";
			// The module reads the key at load time; re-require with the env set.
			jest.resetModules();
			const fresh = require("../src/controllers/voiceController");
			const res = createMockRes();
			await fresh.interpretVoice({ file: undefined }, res);
			expect(res.statusCode).toBe(400);
			expect(res.body.message).toBe("no_audio");
			process.env.OPENAI_API_KEY = prev;
		});

		it("answers 503 not_configured when the server has no key", async () => {
			const prev = process.env.OPENAI_API_KEY;
			delete process.env.OPENAI_API_KEY;
			jest.resetModules();
			const fresh = require("../src/controllers/voiceController");
			const res = createMockRes();
			await fresh.interpretVoice({ file: { buffer: Buffer.from("x") } }, res);
			expect(res.statusCode).toBe(503);
			expect(res.body.message).toBe("not_configured");
			process.env.OPENAI_API_KEY = prev;
		});
	});
});

// keep a reference so the top-level import isn't flagged unused by linters
void interpretVoice;
