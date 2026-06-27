/*
 * Freshly.lb — Reusable camera barcode scanner overlay.
 * ---------------------------------------------------------------------------
 * Exposes a global `window.BarcodeScanner` with:
 *
 *   BarcodeScanner.open(options)      Open a fullscreen camera scanner.
 *   BarcodeScanner.close()            Close the active scanner.
 *   BarcodeScanner.isOpen()           Boolean — is a scanner currently open?
 *   BarcodeScanner.fillField(id, opt) Single-shot scan that writes the value
 *                                     into the <input id="..."> and closes.
 *
 * options for open():
 *   continuous   {boolean}  Keep scanning after each hit (default false).
 *   closeOnSuccess {boolean} Close the scanner as soon as ONE scan is accepted
 *                           (ok !== false). Works in continuous mode too;
 *                           failed/unrecognized scans keep the camera open so
 *                           the user can retry. Single-shot mode always closes
 *                           on success regardless of this flag.
 *   onDetect     {function} Called with the decoded string for every accepted
 *                           scan. May return { ok:boolean, message:string } to
 *                           drive the on-screen feedback (green/ok vs red/err).
 *   onClose      {function} Called once when the scanner closes.
 *   title        {string}   Header text.
 *   hint         {string}   Helper text under the status line.
 *   cooldownMs   {number}   In continuous mode, ignore the SAME code if it is
 *                           seen again within this many ms (default 1000). This
 *                           is what lets quantity scanning work: present an item,
 *                           wait, present the next identical item.
 *
 * Decoding uses html5-qrcode (loaded lazily from a CDN). When the browser
 * supports the native BarcodeDetector API it is used for fast, high-quality
 * decoding; otherwise html5-qrcode falls back to ZXing automatically.
 */
(function () {
	"use strict";

	if (window.BarcodeScanner) return; // singleton guard

	var LIB_SRC =
		"https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
	var READER_ID = "bcs-reader";

	var libPromise = null;
	var stylesInjected = false;
	var audioCtx = null;

	// Module-scoped UI references / state for the single active scanner.
	var el = {}; // overlay element references
	var state = {
		open: false,
		scanner: null, // Html5Qrcode instance
		options: null,
		lastCode: null,
		lastTime: 0,
		torchOn: false,
		torchSupported: false,
		flashTimer: null,
		locked: false, // true once a final (closing) scan has been accepted
	};

	/* ----------------------------- library load ---------------------------- */
	function loadLibrary() {
		if (window.Html5Qrcode) return Promise.resolve();
		if (libPromise) return libPromise;
		libPromise = new Promise(function (resolve, reject) {
			var s = document.createElement("script");
			s.src = LIB_SRC;
			s.async = true;
			s.onload = function () {
				resolve();
			};
			s.onerror = function () {
				libPromise = null;
				reject(new Error("Could not load the scanner library."));
			};
			document.head.appendChild(s);
		});
		return libPromise;
	}

	/* ------------------------------- styles -------------------------------- */
	function injectStyles() {
		if (stylesInjected) return;
		stylesInjected = true;
		var css =
			"" +
			"#bcs-overlay{position:fixed;inset:0;z-index:2147483000;background:#000;" +
			"display:flex;flex-direction:column;color:#fff;font-family:'Segoe UI',Tahoma,sans-serif;overflow:hidden;}" +
			"#bcs-reader{position:absolute;inset:0;width:100%;height:100%;}" +
			"#bcs-reader video{width:100%!important;height:100%!important;object-fit:cover!important;}" +
			"#bcs-overlay .bcs-header{position:relative;z-index:5;display:flex;align-items:center;justify-content:space-between;" +
			"gap:12px;padding:14px 16px;background:linear-gradient(180deg,rgba(0,0,0,.75),rgba(0,0,0,0));}" +
			"#bcs-overlay .bcs-title{font-size:17px;font-weight:700;line-height:1.2;}" +
			"#bcs-overlay .bcs-close{appearance:none;border:none;background:rgba(255,255,255,.18);color:#fff;width:40px;height:40px;" +
			"border-radius:50%;font-size:22px;line-height:1;cursor:pointer;flex:0 0 auto;}" +
			"#bcs-overlay .bcs-close:hover{background:rgba(255,255,255,.32);}" +
			"#bcs-overlay .bcs-spacer{flex:1 1 auto;}" +
			"#bcs-overlay .bcs-footer{position:relative;z-index:5;margin-top:auto;padding:14px 16px calc(16px + env(safe-area-inset-bottom,0px));" +
			"background:linear-gradient(0deg,rgba(0,0,0,.82),rgba(0,0,0,0));display:flex;flex-direction:column;gap:12px;}" +
			"#bcs-overlay .bcs-status{min-height:22px;font-size:15px;font-weight:600;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.6);}" +
			"#bcs-overlay .bcs-status.ok{color:#4ade80;}" +
			"#bcs-overlay .bcs-status.err{color:#f87171;}" +
			"#bcs-overlay .bcs-status.info{color:#fff;}" +
			"#bcs-overlay .bcs-hint{font-size:12.5px;opacity:.85;text-align:center;}" +
			"#bcs-overlay .bcs-controls{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}" +
			"#bcs-overlay .bcs-btn{appearance:none;border:none;border-radius:999px;padding:11px 18px;font-size:14px;font-weight:700;" +
			"cursor:pointer;background:rgba(255,255,255,.16);color:#fff;display:inline-flex;align-items:center;gap:8px;}" +
			"#bcs-overlay .bcs-btn:hover{background:rgba(255,255,255,.28);}" +
			"#bcs-overlay .bcs-btn.primary{background:#ffc300;color:#000;}" +
			"#bcs-overlay .bcs-btn.primary:hover{background:#e6ad00;}" +
			"#bcs-overlay .bcs-btn[hidden]{display:none;}" +
			"#bcs-overlay .bcs-manual{display:flex;gap:8px;justify-content:center;}" +
			"#bcs-overlay .bcs-manual[hidden]{display:none;}" +
			"#bcs-overlay .bcs-manual input{flex:1;max-width:340px;padding:11px 12px;border-radius:8px;border:2px solid #ffc300;" +
			"background:#fff;color:#000;font-size:15px;}" +
			"#bcs-overlay .bcs-flash{position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;transition:opacity .12s ease;}" +
			"#bcs-overlay .bcs-flash.show-ok{opacity:1;box-shadow:inset 0 0 0 6px #22c55e;background:rgba(34,197,94,.12);}" +
			"#bcs-overlay .bcs-flash.show-err{opacity:1;box-shadow:inset 0 0 0 6px #ef4444;background:rgba(239,68,68,.12);}" +
			"@media (max-width:600px){#bcs-overlay .bcs-title{font-size:15px;}}";
		var styleTag = document.createElement("style");
		styleTag.id = "bcs-styles";
		styleTag.textContent = css;
		document.head.appendChild(styleTag);
	}

	/* ----------------------------- feedback -------------------------------- */
	function beep(ok) {
		try {
			var Ctx = window.AudioContext || window.webkitAudioContext;
			if (!Ctx) return;
			audioCtx = audioCtx || new Ctx();
			if (audioCtx.state === "suspended") audioCtx.resume();
			var osc = audioCtx.createOscillator();
			var gain = audioCtx.createGain();
			osc.type = "sine";
			osc.frequency.value = ok ? 880 : 220;
			gain.gain.value = 0.06;
			osc.connect(gain);
			gain.connect(audioCtx.destination);
			var t = audioCtx.currentTime;
			osc.start(t);
			osc.stop(t + (ok ? 0.12 : 0.22));
		} catch (e) {
			/* ignore */
		}
	}

	function vibrate(pattern) {
		try {
			if (navigator.vibrate) navigator.vibrate(pattern);
		} catch (e) {
			/* ignore */
		}
	}

	function flash(ok) {
		if (!el.flash) return;
		if (state.flashTimer) clearTimeout(state.flashTimer);
		el.flash.className = "bcs-flash " + (ok ? "show-ok" : "show-err");
		state.flashTimer = setTimeout(function () {
			if (el.flash) el.flash.className = "bcs-flash";
		}, 260);
	}

	function setStatus(message, kind) {
		if (!el.status) return;
		el.status.textContent = message || "";
		el.status.className = "bcs-status " + (kind || "info");
	}

	/* ----------------------------- overlay UI ------------------------------ */
	function buildOverlay(options) {
		var overlay = document.createElement("div");
		overlay.id = "bcs-overlay";
		overlay.innerHTML =
			'<div class="bcs-header">' +
			'<div class="bcs-title"></div>' +
			'<div class="bcs-spacer"></div>' +
			'<button type="button" class="bcs-close" aria-label="Close scanner">&times;</button>' +
			"</div>" +
			'<div id="' +
			READER_ID +
			'"></div>' +
			'<div class="bcs-flash"></div>' +
			'<div class="bcs-footer">' +
			'<div class="bcs-status info">Starting camera&hellip;</div>' +
			'<div class="bcs-hint"></div>' +
			'<div class="bcs-controls">' +
			'<button type="button" class="bcs-btn bcs-torch" hidden>🔦 Light</button>' +
			'<button type="button" class="bcs-btn bcs-manual-toggle">⌨️ Enter manually</button>' +
			'<button type="button" class="bcs-btn bcs-retry" hidden>↻ Retry camera</button>' +
			"</div>" +
			'<div class="bcs-manual" hidden>' +
			'<input type="text" inputmode="numeric" autocomplete="off" placeholder="Type barcode&hellip;" />' +
			'<button type="button" class="bcs-btn primary bcs-manual-go">Use</button>' +
			"</div>" +
			"</div>";
		document.body.appendChild(overlay);

		el.overlay = overlay;
		el.title = overlay.querySelector(".bcs-title");
		el.status = overlay.querySelector(".bcs-status");
		el.hint = overlay.querySelector(".bcs-hint");
		el.flash = overlay.querySelector(".bcs-flash");
		el.torchBtn = overlay.querySelector(".bcs-torch");
		el.retryBtn = overlay.querySelector(".bcs-retry");
		el.manualToggle = overlay.querySelector(".bcs-manual-toggle");
		el.manualWrap = overlay.querySelector(".bcs-manual");
		el.manualInput = overlay.querySelector(".bcs-manual input");
		el.manualGo = overlay.querySelector(".bcs-manual-go");

		el.title.textContent = options.title || "Scan barcode";
		el.hint.textContent = options.hint || "";

		overlay.querySelector(".bcs-close").addEventListener("click", function () {
			close();
		});
		el.torchBtn.addEventListener("click", toggleTorch);
		el.retryBtn.addEventListener("click", function () {
			el.retryBtn.hidden = true;
			setStatus("Starting camera\u2026", "info");
			startCameraChain();
		});
		el.manualToggle.addEventListener("click", function () {
			var show = el.manualWrap.hidden;
			el.manualWrap.hidden = !show;
			if (show) el.manualInput.focus();
		});
		el.manualGo.addEventListener("click", submitManual);
		el.manualInput.addEventListener("keydown", function (e) {
			if (e.key === "Enter") {
				e.preventDefault();
				submitManual();
			}
		});
		document.addEventListener("keydown", onEscKey);
	}

	function onEscKey(e) {
		if (e.key === "Escape" && state.open) close();
	}

	function submitManual() {
		var v = (el.manualInput.value || "").trim();
		if (!v) return;
		el.manualInput.value = "";
		handleHit(v, true); // force-accept manual entries (bypass cooldown)
	}

	/* ----------------------------- detection ------------------------------- */
	// Called by html5-qrcode for every successful decode, and by manual entry.
	function handleHit(decodedText, force) {
		var opts = state.options || {};
		// Once a final (closing) scan has been accepted, ignore any further
		// frames so a single barcode can't be processed/counted twice while the
		// brief close animation plays out.
		if (state.locked) return;
		var now = Date.now();
		var cooldown = opts.cooldownMs != null ? opts.cooldownMs : 1000;

		if (!force && opts.continuous) {
			// Debounce the SAME code so a single physical item is not counted
			// many times per second. A different code is always accepted at once.
			if (decodedText === state.lastCode && now - state.lastTime < cooldown) {
				return;
			}
		}
		state.lastCode = decodedText;
		state.lastTime = now;

		var result;
		try {
			result = opts.onDetect ? opts.onDetect(decodedText) : undefined;
		} catch (err) {
			result = { ok: false, message: "Error: " + (err && err.message) };
		}
		var ok = !result || result.ok !== false;
		var message =
			(result && result.message) ||
			(ok ? "Scanned: " + decodedText : "Not recognized: " + decodedText);

		setStatus(message, ok ? "ok" : "err");
		flash(ok);
		beep(ok);
		vibrate(ok ? 60 : [40, 30, 40]);

		// Close the camera after a single SUCCESSFUL scan. This always happens in
		// single-shot mode, and also in continuous mode when the caller asks for
		// it via closeOnSuccess. Failed/unrecognized scans keep the camera open so
		// the user can immediately try again.
		if (ok && (!opts.continuous || opts.closeOnSuccess)) {
			state.locked = true; // block any further frames during the close delay
			setTimeout(close, 320);
		}
	}

	/* ------------------------------ camera --------------------------------- */
	function supportedFormats() {
		var F = window.Html5QrcodeSupportedFormats;
		if (!F) return undefined;
		return [
			F.EAN_13,
			F.EAN_8,
			F.UPC_A,
			F.UPC_E,
			F.UPC_EAN_EXTENSION,
			F.CODE_128,
			F.CODE_39,
			F.CODE_93,
			F.CODABAR,
			F.ITF,
			F.QR_CODE,
		];
	}

	// Ask the browser for the highest practical resolution. More pixels across
	// the barcode means far more reliable, much faster 1D/2D decoding. `ideal`
	// keeps it a soft request, so devices that top out lower still start cleanly
	// instead of failing outright. These are passed as the getUserMedia video
	// constraints (first arg of start()), which reliably applies the resolution
	// and avoids the library's stricter `videoConstraints` validation.
	var IDEAL_WIDTH = 1920;
	var IDEAL_HEIGHT = 1080;

	function cameraConstraints(extra) {
		var base = {
			width: { ideal: IDEAL_WIDTH },
			height: { ideal: IDEAL_HEIGHT },
			frameRate: { ideal: 30 },
			// Best-effort hint — applied where supported, ignored otherwise.
			advanced: [{ focusMode: "continuous" }],
		};
		return Object.assign(base, extra || {});
	}

	function scanConfig() {
		return {
			fps: 20,
			qrbox: function (vw, vh) {
				var w = Math.max(220, Math.floor(Math.min(vw * 0.86, 480)));
				var h = Math.max(150, Math.floor(Math.min(vh * 0.5, w * 0.64)));
				return { width: w, height: h };
			},
			aspectRatio: undefined,
			disableFlip: false,
			formatsToSupport: supportedFormats(),
			experimentalFeatures: { useBarCodeDetectorIfSupported: true },
			rememberLastUsedCamera: true,
		};
	}

	function freshInstance() {
		if (state.scanner) {
			try {
				state.scanner.clear();
			} catch (e) {
				/* ignore */
			}
		}
		state.scanner = new Html5Qrcode(READER_ID, {
			formatsToSupport: supportedFormats(),
			useBarCodeDetectorIfSupported: true,
			verbose: false,
		});
		return state.scanner;
	}

	function onScanError() {
		/* per-frame "not found" — ignored on purpose */
	}

	function afterStart() {
		setStatus("Point the camera at a barcode", "info");
		// Continuous autofocus + a nudge toward high resolution dramatically
		// improve (and speed up) 1D barcode reads. All best-effort.
		try {
			state.scanner
				.applyVideoConstraints({
					width: { ideal: IDEAL_WIDTH },
					height: { ideal: IDEAL_HEIGHT },
					advanced: [{ focusMode: "continuous" }],
				})
				.catch(function () {});
		} catch (e) {
			/* not supported — ignore */
		}
		// Torch availability.
		try {
			var caps = state.scanner.getRunningTrackCapabilities();
			state.torchSupported = !!(caps && caps.torch);
			el.torchBtn.hidden = !state.torchSupported;
		} catch (e) {
			el.torchBtn.hidden = true;
		}
	}

	function showCameraError(err) {
		var msg = (err && err.message) || String(err || "Camera error");
		setStatus("Camera unavailable. " + msg, "err");
		el.retryBtn.hidden = false;
		el.manualWrap.hidden = false;
		setTimeout(function () {
			if (el.manualInput) el.manualInput.focus();
		}, 50);
	}

	// Try the rear camera first via facingMode, then fall back to enumerating
	// cameras (handles laptops / devices where facingMode is rejected).
	function startCameraChain() {
		var cfg = scanConfig();
		freshInstance();
		// First attempt: rear camera at high resolution. Passing the constraints
		// as the first argument sends them straight to getUserMedia.
		return state.scanner
			.start(
				cameraConstraints({ facingMode: { ideal: "environment" } }),
				cfg,
				handleHit,
				onScanError
			)
			.then(afterStart)
			.catch(function () {
				freshInstance();
				return Html5Qrcode.getCameras().then(function (cams) {
					if (!cams || !cams.length) throw new Error("No camera found.");
					var back = null;
					for (var i = 0; i < cams.length; i++) {
						if (/back|rear|environment/i.test(cams[i].label || "")) {
							back = cams[i];
							break;
						}
					}
					var camId = (back || cams[cams.length - 1]).id;
					// Bind to the chosen device, still at high resolution.
					return state.scanner
						.start(
							cameraConstraints({ deviceId: { exact: camId } }),
							cfg,
							handleHit,
							onScanError
						)
						.then(afterStart);
				});
			})
			.catch(showCameraError);
	}

	function toggleTorch() {
		if (!state.scanner || !state.torchSupported) return;
		var next = !state.torchOn;
		state.scanner
			.applyVideoConstraints({ advanced: [{ torch: next }] })
			.then(function () {
				state.torchOn = next;
				el.torchBtn.textContent = next ? "🔦 Light on" : "🔦 Light";
			})
			.catch(function () {});
	}

	/* ----------------------------- lifecycle ------------------------------- */
	function open(options) {
		options = options || {};
		if (state.open) {
			// Already open — just update behaviour/labels.
			state.options = options;
			if (el.title) el.title.textContent = options.title || "Scan barcode";
			if (el.hint) el.hint.textContent = options.hint || "";
			return;
		}
		injectStyles();
		buildOverlay(options);
		state.open = true;
		state.options = options;
		state.lastCode = null;
		state.lastTime = 0;
		state.torchOn = false;
		state.locked = false;

		loadLibrary()
			.then(function () {
				return startCameraChain();
			})
			.catch(function (err) {
				showCameraError(err);
			});
	}

	function close() {
		if (!state.open && !el.overlay) return;
		var opts = state.options;
		var sc = state.scanner;
		state.open = false;
		state.options = null;
		state.scanner = null;
		state.lastCode = null;
		state.lastTime = 0;
		state.torchOn = false;
		state.torchSupported = false;
		document.removeEventListener("keydown", onEscKey);

		function teardown() {
			try {
				if (sc) sc.clear();
			} catch (e) {
				/* ignore */
			}
			if (el.overlay && el.overlay.parentNode) {
				el.overlay.parentNode.removeChild(el.overlay);
			}
			el = {};
			if (opts && typeof opts.onClose === "function") {
				try {
					opts.onClose();
				} catch (e) {
					/* ignore */
				}
			}
		}

		if (sc) {
			sc.stop().then(teardown, teardown);
		} else {
			teardown();
		}
	}

	/* ------------------------------- public -------------------------------- */
	window.BarcodeScanner = {
		open: open,
		close: close,
		isOpen: function () {
			return state.open;
		},
		/**
		 * Single-shot helper: scan once and write the value into an <input>.
		 * @param {string} inputId  id of the target input element
		 * @param {object} [opts]   extra open() options (title, hint, ...)
		 */
		fillField: function (inputId, opts) {
			opts = opts || {};
			open(
				Object.assign(
					{
						continuous: false,
						title: opts.title || "Scan barcode",
						hint: opts.hint || "Hold the barcode steady inside the frame.",
					},
					opts,
					{
						onDetect: function (code) {
							var input = document.getElementById(inputId);
							if (input) {
								input.value = code;
								input.dispatchEvent(new Event("input", { bubbles: true }));
								input.dispatchEvent(new Event("change", { bubbles: true }));
							}
							return { ok: true, message: "Scanned: " + code };
						},
					}
				)
			);
		},
	};
})();
