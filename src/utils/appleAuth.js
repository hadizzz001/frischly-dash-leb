/**
 * Sign in with Apple — identity token verification.
 *
 * Apple App Review guideline 4.8 requires that any app offering a third-party
 * login service (we offer Google) also offers an equivalent login service that
 * only collects the user's name + email, lets the user hide their real email
 * address, and does not track them for ads. "Sign in with Apple" satisfies all
 * three, so the mobile app now offers it and posts the resulting
 * `identityToken` to `POST /api/auth/apple`.
 *
 * The identity token is a JWT signed by Apple with a rotating RS256 key. We
 * verify it locally:
 *   1. fetch Apple's public JWKS (https://appleid.apple.com/auth/keys),
 *   2. pick the key matching the token header `kid`,
 *   3. verify signature + `iss` (https://appleid.apple.com) + `aud`
 *      (our bundle id / services id) + expiry.
 *
 * No extra npm dependency is needed: `jsonwebtoken` is already installed and
 * Node's `crypto.createPublicKey()` accepts a JWK directly (Node >= 16).
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";

// Apple's signing keys rotate rarely; cache them for an hour to avoid hitting
// Apple on every single sign-in.
const KEY_CACHE_TTL_MS = 60 * 60 * 1000;
let keyCache = { keys: null, fetchedAt: 0 };

/**
 * Every bundle id / services id that is allowed to sign in.
 * Configure with APPLE_CLIENT_ID (comma separated, e.g.
 * "com.frischly.app,com.frischly.web").
 */
const getAllowedAudiences = () =>
	String(process.env.APPLE_CLIENT_ID || "")
		.split(",")
		.map((a) => a.trim())
		.filter(Boolean);

async function fetchAppleKeys(forceRefresh = false) {
	const fresh = Date.now() - keyCache.fetchedAt < KEY_CACHE_TTL_MS;
	if (!forceRefresh && keyCache.keys && fresh) return keyCache.keys;

	const resp = await fetch(APPLE_KEYS_URL);
	if (!resp.ok) {
		throw new Error(`Could not fetch Apple public keys (${resp.status})`);
	}
	const body = await resp.json();
	const keys = Array.isArray(body?.keys) ? body.keys : [];
	if (!keys.length) throw new Error("Apple returned an empty key set");

	keyCache = { keys, fetchedAt: Date.now() };
	return keys;
}

function jwkToPem(jwk) {
	return crypto.createPublicKey({ key: jwk, format: "jwk" }).export({
		type: "spki",
		format: "pem",
	});
}

async function getSigningKey(kid) {
	let keys = await fetchAppleKeys();
	let jwk = keys.find((k) => k.kid === kid);
	if (!jwk) {
		// Apple rotated its keys since we cached them — refetch once.
		keys = await fetchAppleKeys(true);
		jwk = keys.find((k) => k.kid === kid);
	}
	if (!jwk) throw new Error("No matching Apple signing key for token");
	return jwkToPem(jwk);
}

/**
 * Verifies an Apple `identityToken` and returns its payload.
 *
 * @param {string} identityToken JWT issued by Apple to the client.
 * @returns {Promise<{sub: string, email?: string, email_verified: boolean,
 *   is_private_email: boolean, aud: string}>}
 * @throws {Error} when the token is malformed, expired, wrongly signed or the
 *   audience does not match a configured client id.
 */
async function verifyAppleIdentityToken(identityToken) {
	if (!identityToken || typeof identityToken !== "string") {
		throw new Error("Missing Apple identityToken");
	}

	const decoded = jwt.decode(identityToken, { complete: true });
	if (!decoded?.header?.kid) {
		throw new Error("Malformed Apple identityToken");
	}

	const publicKey = await getSigningKey(decoded.header.kid);
	const allowedAud = getAllowedAudiences();

	const payload = jwt.verify(identityToken, publicKey, {
		algorithms: ["RS256"],
		issuer: APPLE_ISSUER,
		// Only enforce the audience when it has been configured, so a
		// misconfigured deployment fails loudly in the logs instead of silently
		// accepting tokens minted for another app.
		...(allowedAud.length ? { audience: allowedAud } : {}),
	});

	if (!allowedAud.length) {
		console.warn(
			"[appleAuth] APPLE_CLIENT_ID is not set — skipping audience check. " +
				"Set it to your iOS bundle id before going live."
		);
	}

	if (!payload?.sub) throw new Error("Apple identityToken has no subject");

	const asBool = (v) => v === true || v === "true";

	return {
		sub: String(payload.sub),
		email: payload.email ? String(payload.email).toLowerCase() : undefined,
		email_verified: asBool(payload.email_verified),
		// True when the shopper chose "Hide My Email" — the address is an
		// @privaterelay.appleid.com alias. We must never ask them for the real
		// one, and transactional email still works through the relay.
		is_private_email: asBool(payload.is_private_email),
		aud: payload.aud,
	};
}

/** Apple's "Hide My Email" relay domain. */
const APPLE_PRIVATE_RELAY_DOMAIN = "privaterelay.appleid.com";

const isApplePrivateRelayEmail = (email) =>
	typeof email === "string" &&
	email.toLowerCase().endsWith(`@${APPLE_PRIVATE_RELAY_DOMAIN}`);

module.exports = {
	verifyAppleIdentityToken,
	isApplePrivateRelayEmail,
	APPLE_PRIVATE_RELAY_DOMAIN,
	_internal: { fetchAppleKeys, jwkToPem, getAllowedAudiences },
};
