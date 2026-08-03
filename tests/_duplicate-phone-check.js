/**
 * Regression test for the "E11000 duplicate key ... phoneNumber" crash when an
 * admin creates a user whose phone number already belongs to someone else.
 *
 * Two defects were involved:
 *   1. createUser()/updateUser() called findDuplicateAccount({ name, email })
 *      and omitted phoneNumber, so a duplicate number sailed past the friendly
 *      pre-check and detonated on the unique index.
 *   2. The catch block turned that MongoServerError into a bare 500, so the
 *      user saw a stack trace instead of "this number is already used".
 *
 * Run: node tests/_duplicate-phone-check.js
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
let failures = 0;
const check = (name, ok, detail = "") => {
	console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
	if (!ok) failures++;
};

const {
	duplicateAccountMessage,
	duplicateAccountError,
	describeDuplicateKeyError,
} = require(path.join(ROOT, "src/utils/accountDuplicates"));

console.log("\n1) Raw Mongo E11000 becomes a readable response\n");

// The exact error shape the user hit.
const mongoErr = Object.assign(new Error("E11000 duplicate key error"), {
	code: 11000,
	keyPattern: { phoneNumber: 1 },
	keyValue: { phoneNumber: "+9611234567" },
});

const dup = describeDuplicateKeyError(mongoErr);
check("recognised as a duplicate", dup !== null);
check("uses 409 Conflict, not 500", dup && dup.status === 409, dup && `status=${dup.status}`);
check("names the field", dup && dup.errors[0].field === "phoneNumber");
check("echoes the clashing value", dup && dup.errors[0].received === "+9611234567");
check("message is human readable", dup && /already used by another account/.test(dup.message));
check("leaks no stack trace", dup && !/at .*node_modules|MongoServerError/.test(dup.message));
console.log(`\n  message: ${dup.message}\n`);

console.log("2) Non-duplicate errors are left alone\n");
check("plain Error ignored", describeDuplicateKeyError(new Error("boom")) === null);
check("null ignored", describeDuplicateKeyError(null) === null);
check(
	"other Mongo codes ignored",
	describeDuplicateKeyError(Object.assign(new Error("x"), { code: 121 })) === null
);
const noKeys = describeDuplicateKeyError(Object.assign(new Error("x"), { code: 11000 }));
check("E11000 without key info still handled", noKeys !== null && noKeys.status === 409);

console.log("\n3) Pre-check duplicates report the exact form field\n");
const phoneDup = { field: "phone number", owner: "user", value: "+9611234567" };
const e = duplicateAccountError(phoneDup);
check("maps 'phone number' -> form field 'phoneNumber'", e.field === "phoneNumber");
check("carries the value", e.received === "+9611234567");
check("message names the value", /\+9611234567/.test(duplicateAccountMessage(phoneDup)));
check(
	"email duplicates map too",
	duplicateAccountError({ field: "email", owner: "market", value: "a@b.c" }).field === "email"
);
console.log(`\n  message: ${duplicateAccountMessage(phoneDup)}\n`);

console.log("4) Controllers actually pass phoneNumber to the pre-check\n");
const ctrl = fs.readFileSync(path.join(ROOT, "src/controllers/authController.js"), "utf8");

const calls = ctrl.match(/findDuplicateAccount\(\s*\{[^}]*\}/g) || [];
check("found all pre-check call sites", calls.length === 3, `count=${calls.length}`);
calls.forEach((c, i) => {
	check(`call site ${i + 1} includes phoneNumber`, /phoneNumber/.test(c));
});

// Every catch that can insert a user must translate E11000.
["Server error during registration", "Server error during user creation", "Server error during user update"].forEach(
	(msg) => {
		const idx = ctrl.indexOf(msg);
		const window = ctrl.slice(Math.max(0, idx - 300), idx);
		check(`"${msg}" is guarded by describeDuplicateKeyError`, window.includes("describeDuplicateKeyError"));
	}
);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
