const https = require("https");
const zlib = require("zlib");
const connectToDatabase = require("../lib/db");
const Person = require("../lib/models/Person");

function makeHttpsRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      method: options.method || "GET",
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: options.headers || {},
      rejectUnauthorized: false,
    };
    const req = https.request(reqOptions, (res) => {
      let chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const enc = res.headers["content-encoding"];
        if (enc === "gzip") {
          zlib.gunzip(buffer, (e, d) => e ? reject(e) : resolve({ status: res.statusCode, body: d.toString() }));
        } else if (enc === "br") {
          zlib.brotliDecompress(buffer, (e, d) => e ? reject(e) : resolve({ status: res.statusCode, body: d.toString() }));
        } else {
          resolve({ status: res.statusCode, body: buffer.toString() });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function checkTokenValid(token) {
  try {
    const result = await makeHttpsRequest(
      `https://nin-support-api.donidcr.gov.np/api/v1/enid/verify?token=${encodeURIComponent(token)}`,
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
        },
      }
    );
    if (result.status >= 400) return false;
    try {
      const parsed = JSON.parse(result.body);
      if (parsed && parsed.error) return false;
    } catch (e) { /* HTML response = valid */ }
    return true;
  } catch (e) {
    return false;
  }
}

function getVerifyHeaderCopy(person, mode) {
  const normalizedStatus = String(person && person.status ? person.status : '').trim().toLowerCase();

  if (normalizedStatus === 'done') {
    return {
      title: 'Verification Ready',
      subtitle: 'Your e-NID token has already been configured and the system is ready for the next step. If you are not redirected automatically, it may have expired or been misplaced, and you can simply re-verify using the steps below.',
      badgeColor: 'emerald'
    };
  }

  if (normalizedStatus === 'inprogress') {
    return {
      title: 'Mobile Number Not Yet Updated',
      subtitle: 'To proceed with the e-NID verification process, your mobile number must be updated in the system. If you believe it has already been updated, please wait a little while for the information to sync online. Once the update is reflected, your status will change from “Mobile Not Registered” to “Pending”.',
      badgeColor: 'red'
    };
  }

  if (normalizedStatus === 'not online') {
    return {
      title: 'Not Updated in the Citizen Portal',
      subtitle: 'Your information has not yet been updated in the official citizen portal, or the details currently available do not match your NIN records. If your information is correct, please wait for some time for the portal to reflect the update. Once it becomes available, your status will change and you can continue the verification process.',
      badgeColor: 'amber'
    };
  }

  if (normalizedStatus === 'pending') {
    return {
      title: 'Ready for e-NID Verification',
      subtitle: 'Your account is now ready for the e-NID verification process. Please complete the verification steps below using the OTP and follow the instructions carefully.',
      badgeColor: 'blue'
    };
  }

  if (mode === 'expired_token') {
    return {
      title: 'Token Expired — Re-verification Required',
      subtitle: 'Your NID download token has expired or is no longer valid. Please complete the verification process again so that a fresh token can be generated for your e-NID card.',
      badgeColor: 'red'
    };
  }

  return {
    title: 'Identity Token Not Configured',
    subtitle: 'Your NID card has not been verified yet. Please use the option below to complete the verification process and obtain your digital NID card.',
    badgeColor: 'amber'
  };
}

function renderVerifyPage(person, mode, nin) {
  // mode: "no_token" | "expired_token"
  const statusCopy = getVerifyHeaderCopy(person, mode);
  const title = statusCopy.title;
  const subtitle = statusCopy.subtitle;
  const badgeColor = statusCopy.badgeColor;

  const dobNpJs = (person.dobNp || "").replace(/'/g, "\\'");
  const citDateJs = (person.citDate || "").replace(/'/g, "\\'");
  const givenEnJs = (person.givenEn || "").replace(/'/g, "\\'");
  const surnameEnJs = (person.surnameEn || "").replace(/'/g, "\\'");
  const givenNpJs = (person.givenNp || "").replace(/'/g, "\\'");
  const surnameNpJs = (person.surnameNp || "").replace(/'/g, "\\'");
  const ninEnJs = (person.ninEn || "").replace(/'/g, "\\'");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Identity Verification — ${person.givenEn} ${person.surnameEn}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>
  <script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Mukta:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f1f5f9; }
    .nepali-font { font-family: 'Mukta', sans-serif; }
    .step-card { display: none; }
    .step-card.active { display: block; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner { animation: spin 1s linear infinite; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: fadeIn 0.3s ease forwards; }
    .captcha-img { image-rendering: pixelated; }
  </style>
</head>
<body class="min-h-screen bg-slate-100 p-4 antialiased flex flex-col items-center justify-start pt-8 pb-8">

  <div class="w-full max-w-2xl space-y-4">

    <!-- Header Card -->
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <!-- Logo / Brand -->
      <div class="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
        <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5m-4 0V5a2 2 0 012-2h2a2 2 0 012 2v1m-4 0h4"/>
          </svg>
        </div>
        <div>
          <div class="text-sm font-bold text-slate-900">National Identity Card — Nepal</div>
          <div class="text-xs text-slate-500">राष्ट्रिय परिचयपत्र प्रणाली</div>
        </div>
        <div class="ml-auto">
          <span class="text-[10px] font-bold px-2.5 py-1 rounded-full border ${badgeColor === "red" ? "bg-red-50 text-red-600 border-red-200" : badgeColor === "blue" ? "bg-blue-50 text-blue-600 border-blue-200" : badgeColor === "emerald" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-amber-50 text-amber-600 border-amber-200"} uppercase tracking-wider">
            ${badgeColor === "red" ? "Re-verify" : badgeColor === "blue" ? "Pending" : badgeColor === "emerald" ? "Ready" : "Unverified"}
          </span>
        </div>
      </div>

      <!-- Status Message -->
      <div class="flex items-start gap-3 p-4 rounded-xl ${badgeColor === "red" ? "bg-red-50 border border-red-100" : badgeColor === "blue" ? "bg-blue-50 border border-blue-100" : badgeColor === "emerald" ? "bg-emerald-50 border border-emerald-100" : "bg-amber-50 border border-amber-100"} mb-5">
        <svg class="w-5 h-5 ${badgeColor === "red" ? "text-red-500" : badgeColor === "blue" ? "text-blue-500" : badgeColor === "emerald" ? "text-emerald-500" : "text-amber-500"} mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <div>
          <div class="text-sm font-bold ${badgeColor === "red" ? "text-red-700" : badgeColor === "blue" ? "text-blue-700" : badgeColor === "emerald" ? "text-emerald-700" : "text-amber-700"}">${title}</div>
          <div class="text-xs ${badgeColor === "red" ? "text-red-600" : badgeColor === "blue" ? "text-blue-600" : badgeColor === "emerald" ? "text-emerald-600" : "text-amber-600"} mt-0.5">${subtitle}</div>
        </div>
      </div>

      <!-- Identity Info Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">NID Number</div>
          <div class="text-sm font-bold text-blue-700 font-mono">${person.ninEn}</div>
          ${person.ninNp ? `<div class="text-xs text-slate-400 nepali-font">${person.ninNp}</div>` : ""}
        </div>
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Full Name</div>
          <div class="text-sm font-bold text-slate-900 uppercase">${person.givenEn || ""} ${person.surnameEn || ""}</div>
          ${(person.givenNp || person.surnameNp) ? `<div class="text-xs text-slate-500 nepali-font">${person.givenNp || ""} ${person.surnameNp || ""}</div>` : ""}
        </div>
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Date of Birth (AD / BS)</div>
          <div class="text-sm font-semibold text-slate-800 font-mono">${person.dobEn || "—"} <span class="text-slate-400">/</span> ${person.dobNp || "—"}</div>
        </div>
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Citizenship Issue Date</div>
          <div class="text-sm font-semibold text-slate-800 font-mono">${person.citDate || "—"}</div>
        </div>
        ${person.addressEn ? `
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-100 sm:col-span-2">
          <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Permanent Address</div>
          <div class="text-sm font-semibold text-slate-800">${person.addressEn}</div>
          ${person.addressNp ? `<div class="text-xs text-slate-500 nepali-font">${person.addressNp}</div>` : ""}
        </div>` : ""}
        ${person.mobile ? `
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Mobile (Registered)</div>
          <div class="text-sm font-semibold text-slate-800">${person.mobile.replace(/(\d{2})(\d{5})(\d{3})/, "$1XXXXX$3")}</div>
        </div>` : ""}
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Workflow Status</div>
          <div class="text-sm font-bold ${person.status === "inprogress" ? "text-rose-600" : person.status === "not online" ? "text-slate-500" : "text-amber-600"}">
            ${person.status === "inprogress" ? "Mobile Not Registered" :
              person.status === "not online" ? "Not Online" :
              person.status === "pending" ? "Pending Verification" :
              person.status === "done" ? "Verified" : "Unverified"}
          </div>
        </div>
      </div>

      <!-- CTA Button -->
      <div id="verifyBtnArea" class="space-y-2">
        <button onclick="startVerifyFlow()" id="startVerifyBtn"
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-600/20">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          Verify &amp; Download NID Card
        </button>
        <button onclick="loadVoterListDetails()" id="viewDetailsBtn"
          class="hidden w-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-blue-600 hover:from-fuchsia-700 hover:via-violet-700 hover:to-blue-700 text-white font-bold py-3 rounded-2xl text-sm transition-all items-center justify-center gap-2 shadow-lg shadow-fuchsia-600/25 ring-1 ring-white/20">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm-9 8a9 9 0 1118 0"/>
          </svg>
          View Details
        </button>
      </div>

      <!-- Verification Flow Modal -->
      <div id="verifyFlowModal"
        class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[99995] hidden items-center justify-center p-4"
        onclick="if(event.target===this) closeVerifyFlowModal()">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden transform scale-95 transition-all duration-300 max-h-[90vh]">
          <div class="flex justify-between items-center border-b border-slate-100 px-4 py-3 bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700">
            <div>
              <h3 class="text-xs font-bold text-white uppercase tracking-wider">Verify &amp; Download NID</h3>
              <p class="text-[10px] text-blue-100 mt-0.5">Complete captcha, OTP, and download steps here</p>
            </div>
            <button onclick="closeVerifyFlowModal()" class="text-blue-100 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <div class="p-5 overflow-y-auto">
            <div id="otpFlowCard" class="space-y-4 fade-in">
              <h3 class="text-sm font-bold text-slate-900 mb-1">Identity Verification</h3>
              <p class="text-xs text-slate-500 mb-4">Complete the steps below to verify your identity and download your NID card.</p>

              <!-- Step Indicator -->
              <div class="flex flex-wrap items-center gap-2 mb-5 text-[10px] font-bold uppercase tracking-wider">
                <span id="stepInd1" class="px-2.5 py-1 rounded-full bg-blue-600 text-white">1. Captcha</span>
                <span class="text-slate-300">→</span>
                <span id="stepInd2" class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-400">2. OTP</span>
                <span class="text-slate-300">→</span>
                <span id="stepInd3" class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-400">3. Download</span>
                <span class="text-slate-300">→</span>
                <span id="stepInd4" class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-400">4. Token Scan</span>
              </div>

              <!-- Step 1: Captcha -->
              <div id="step1" class="step-card active space-y-4">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-xs font-bold text-slate-700 mb-0.5">Enter the captcha code shown</div>
                    <div class="text-[11px] text-slate-500">Can't read? Click the refresh icon.</div>
                  </div>
                  <div class="flex items-center gap-2 border border-slate-200 rounded-xl p-2 bg-slate-50">
                    <img id="captchaImg" src="" alt="Captcha" class="h-12 w-36 object-contain rounded captcha-img" />
                    <button onclick="loadCaptcha()" title="Refresh" class="p-1.5 text-slate-500 hover:text-blue-600 transition-all">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="flex gap-2">
                  <input id="captchaInput" type="text" placeholder="Enter captcha code"
                    class="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 transition-all" />
                  <button onclick="requestOtp()" id="btnRequestOtp"
                    class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shrink-0">
                    Send OTP
                  </button>
                </div>
                <div id="step1Error" class="hidden text-xs text-red-600 bg-red-50 rounded-xl p-3 border border-red-100"></div>
              </div>

              <!-- Step 2: OTP -->
              <div id="step2" class="step-card space-y-4">
                <div class="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <div class="text-xs text-blue-700 font-medium">OTP sent to: <span id="maskedMobileDisplay" class="font-bold"></span></div>
                  <div class="text-[11px] text-blue-600 mt-0.5">NIN: <span id="ninDisplay" class="font-mono font-bold"></span></div>
                </div>
                <div class="flex gap-2">
                  <input id="otpInput" type="text" placeholder="Enter OTP code" maxlength="6"
                    class="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest text-slate-900 focus:outline-none focus:border-blue-500 transition-all" />
                  <button onclick="verifyOtp()" id="btnVerifyOtp"
                    class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shrink-0">
                    Verify OTP
                  </button>
                </div>
                <div class="flex justify-end">
                  <button onclick="loadCaptcha()" class="text-xs text-slate-500 hover:text-blue-600 transition-all">↩ Resend OTP / Start Over</button>
                </div>
                <div id="step2Error" class="hidden text-xs text-red-600 bg-red-50 rounded-xl p-3 border border-red-100"></div>
              </div>

              <!-- Step 3: Download -->
              <div id="step3" class="step-card space-y-4">
                <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <div class="text-xs text-emerald-700 font-bold flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    OTP Verified Successfully
                  </div>
                  <div class="text-[11px] text-emerald-600 mt-0.5">Ready to download the digital NID card PDF.</div>
                </div>
                <button onclick="downloadAndSave()" id="btnDownload"
                  class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  Download NID Card PDF
                </button>
                <div id="step3Error" class="hidden text-xs text-red-600 bg-red-50 rounded-xl p-3 border border-red-100"></div>
              </div>

              <!-- Step 4: Scanned Token Entry -->
              <div id="step4" class="step-card space-y-4">
                <div class="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <div class="text-xs text-amber-700 font-bold flex items-center gap-1.5">
                    ⚠️ PDF Downloaded Successfully!
                  </div>
                  <div class="text-[11px] text-amber-600 mt-1 font-semibold leading-relaxed">
                    Please open the downloaded NID card PDF, scan the QR code inside the PDF, copy that URL/text, and paste it in the field below.
                    <br/><span class="text-red-500 font-bold">Do not close or refresh this page.</span>
                  </div>
                </div>
                <div>
                  <label class="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Pasted Scanned QR URL / Token</label>
                  <textarea id="pastedTokenInput" rows="3" placeholder="Paste the full scanned QR URL here..."
                    class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono transition-all"></textarea>
                </div>
                <button onclick="verifyAndSaveScannedToken()" id="btnSubmitScannedToken"
                  class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2">
                  Verify &amp; Save Token
                </button>
                <div id="step4Error" class="hidden text-xs text-red-600 bg-red-50 rounded-xl p-3 border border-red-100"></div>
              </div>

              <!-- Step 5: Success -->
              <div id="step5" class="step-card space-y-4 text-center">
                <div class="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center mx-auto">
                  <svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
                <div>
                  <div class="text-lg font-bold text-emerald-700">Verification Complete!</div>
                  <div class="text-sm text-slate-600 mt-1">Your NID card token has been verified and saved to the database.</div>
                  <div class="text-xs text-slate-400 mt-2">Redirecting to official NID verification page in <span id="countdownTimer">5</span>s...</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    <!-- Voter Details Modal -->
    <div id="verifyDetailsModal"
      class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[99990] hidden items-center justify-center p-4"
      onclick="if(event.target===this) closeVerifyDetailsModal()">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl mx-4 flex flex-col overflow-hidden transform scale-95 transition-all duration-300 max-h-[90vh]">
        <div class="flex justify-between items-center border-b border-slate-100 px-4 py-3 bg-gradient-to-r from-blue-700 to-blue-800">
          <div>
            <h3 class="text-xs font-bold text-white uppercase tracking-wider">NIN Details</h3>
            <p class="text-[10px] text-blue-100 mt-0.5">Saved voter list record for this NID</p>
          </div>
          <button onclick="closeVerifyDetailsModal()" class="text-blue-100 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div id="verifyDetailsContent" class="p-4 space-y-4 overflow-y-auto"></div>
        <div class="border-t border-slate-100 px-4 py-3 flex justify-end">
          <button onclick="closeVerifyDetailsModal()" class="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition-all">Close</button>
        </div>
      </div>
    </div>

    <!-- Embedded PDF Decryptor and QR Scanner Modal -->
    <div id="embeddedPdfModal"
      class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[99950] flex items-center justify-center hidden"
      onclick="if(event.target===this) closeEmbeddedPdfModal()">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl mx-4 p-5 flex flex-col gap-4 transform scale-95 transition-all duration-300 max-h-[90vh]">
        <div class="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h3 class="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              📂 Secure PDF Preview &amp; QR Scanner
            </h3>
            <p class="text-[10px] text-slate-400 font-medium mt-0.5" id="embeddedPdfNameLabel">NID_Card.pdf</p>
          </div>
          <button onclick="closeEmbeddedPdfModal()" class="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <!-- Password Prompt Block -->
        <div id="embeddedPdfPasswordPrompt" class="hidden bg-slate-50 border border-slate-200 rounded-xl p-4 text-center space-y-3">
          <p class="text-xs font-medium text-slate-700">Enter PDF Password to decrypt and view preview:</p>
          <div class="flex gap-2 justify-center max-w-sm mx-auto">
            <input type="text" id="embeddedPdfPasswordInput" placeholder="Password (e.g. SUJA2062)"
              class="flex-1 bg-white border border-slate-200 rounded-lg p-2 font-mono text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-all uppercase" autocomplete="off" />
            <button onclick="submitEmbeddedPdfPassword()"
              class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shrink-0">
              Submit
            </button>
          </div>
          <div id="embeddedPdfPasswordError" class="text-[10px] text-red-600 font-semibold hidden">Incorrect password. Please try again.</div>
        </div>

        <!-- PDF Canvas Viewport Container -->
        <div class="flex-1 overflow-auto bg-slate-900 border border-slate-850 rounded-xl p-4 flex items-center justify-center relative min-h-[250px]" style="scrollbar-width:thin;">
          <div id="embeddedPdfCanvasContainer" class="hidden shadow-lg bg-white p-1 rounded">
            <canvas id="embeddedPdfCanvas" class="max-w-full rounded"></canvas>
          </div>
          <div id="embeddedPdfLoadingText" class="text-xs text-slate-400 flex flex-col items-center gap-2">
            <div class="w-6 h-6 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin"></div>
            <span>Loading secure document...</span>
          </div>
        </div>

        <div class="flex items-center justify-between border-t border-slate-100 pt-3">
          <div class="flex gap-2">
            <button id="btnEmbeddedScanQR" onclick="scanEmbeddedPdfQR()" disabled
              class="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-150 disabled:text-slate-400 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all">
              🔍 Scan QR Code
            </button>
            <button id="btnEmbeddedDownloadUnlocked" onclick="downloadEmbeddedUnlocked()" disabled
              class="bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-300 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all">
              🔓 Download Unlocked PDF
            </button>
          </div>
          <button onclick="closeEmbeddedPdfModal()"
            class="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-650 font-bold px-5 py-2 rounded-xl text-xs transition-all">
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="text-center text-[10px] text-slate-400">
    </div>
  </div>

  <script>
    const PERSON_NIN = '${ninEnJs}';
    const PERSON_FULL_NAME = '${givenEnJs} ${surnameEnJs}';
    const PERSON_FULL_NAME_NP = '${givenNpJs} ${surnameNpJs}';
    const PERSON_DOB_LOC = '${dobNpJs}';
    const PERSON_CIT_DATE_LOC = '${citDateJs}';

    // Listen for scanned token from the secure PDF viewer page
    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "QR_SCANNED") {
        const qrVal = event.data.data;
        console.log("Received QR token from viewer tab:", qrVal);
        const inp = document.getElementById("pastedTokenInput");
        if (inp) {
          inp.value = qrVal;
          verifyAndSaveScannedToken();
        }
      }
    });

    let verifyNin = '';
    let verifyTransactionId = '';
    let verifyDownloadToken = '';
    let currentVerifyFlowSession = 0;
    let verifyFlowActive = false;
    let verifySuccessTimer = null;

    function getPortraitImageFromRecord(record) {
      if (!record) return '';
      const profile = Object.assign({}, record, record && record.profileData ? record.profileData : {}, record && record.rawPayload ? record.rawPayload : {});
      return String(record.portraitImage || profile.PortraitImage || profile.portraitImage || '').trim();
    }

    function setViewDetailsButtonVisibility(hasPortrait) {
      const btn = document.getElementById('viewDetailsBtn');
      if (!btn) return;
      if (hasPortrait) {
        btn.classList.remove('hidden');
        btn.classList.add('flex');
      } else {
        btn.classList.add('hidden');
        btn.classList.remove('flex');
      }
    }

    async function checkViewDetailsAvailability() {
      try {
        const res = await fetch('/api/save-voter-list-record?nidNumber=' + encodeURIComponent(PERSON_NIN));
        if (!res.ok) {
          setViewDetailsButtonVisibility(false);
          return;
        }

        const data = await res.json();
        const record = data.found || data.record || null;
        const portrait = getPortraitImageFromRecord(record);
        setViewDetailsButtonVisibility(Boolean(portrait));
      } catch (err) {
        setViewDetailsButtonVisibility(false);
      }
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    window.addEventListener('load', () => {
      checkViewDetailsAvailability();
    });

    function getVerifyAddressParts(profile) {
      const provinceEn = profile.ProvinceNameEn || profile.ProvinceNameNp || profile.provinceEn || profile.provinceNp || '—';
      const provinceNp = profile.ProvinceNameNp || profile.provinceNp || profile.ProvinceNameEn || profile.provinceEn || '—';
      const districtEn = profile.DistrictNameEn || profile.districtEn || profile.PermanentDistrictNameEn || '—';
      const districtNp = profile.DistrictNameNp || profile.districtNp || profile.PermanentDistrictNameNp || '—';
      const muniEn = profile.MunicipalityNameEn || profile.municipalityEn || profile.PermanentVdcMunicipalityNameEn || '—';
      const muniNp = profile.MunicipalityNameNp || profile.municipalityNp || profile.PermanentVdcMunicipalityNameNp || '—';
      const ward = profile.PermanentWardLoc || profile.WardName || profile.PermanentWard || '—';
      const tole = profile.PermanentVillageTol || profile.ToleName || profile.PermanentVillageTolLoc || '—';
      return { provinceEn, provinceNp, districtEn, districtNp, muniEn, muniNp, ward, tole };
    }

    function buildVerifyDetailsHtml(record) {
      const profile = Object.assign({}, record, record && record.profileData ? record.profileData : {}, record && record.rawPayload ? record.rawPayload : {});
      const firstName = [profile.VoterFirstNameEn || profile.FirstNameEn || profile.FirstName || '', profile.VoterMiddleNameEn || profile.MiddleNameEn || profile.MiddleName || ''].filter(Boolean).join(' ').trim();
      const lastName = [profile.VoterLastNameEn || profile.LastNameEn || profile.LastName || ''].filter(Boolean).join(' ').trim();
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || '—';
      const fullNameNp = [profile.VoterFirstName || profile.FirstNameLoc || '', profile.VoterMiddleName || profile.MiddleNameLoc || '', profile.VoterLastName || profile.LastNameLoc || ''].filter(Boolean).join(' ').trim() || '—';
      const nid = profile.Nidno || profile.nidNumber || record && record.nidNumber || PERSON_NIN || '—';
      const dob = profile.Dob || profile.dob || profile.DOB || '—';
      const dobNp = profile.dobNp || profile.DobNp || profile.DOBNp || '—';
      const citizenshipNo = profile.CitizenshipCertificateNumberLoc || profile.CitizenshipCertificateNumber || profile.CitizenshipNo || profile.CitizenshipNoLoc || '—';
      const citDate = profile.CitizenshipIssuingDateLoc || profile.CitizenshipIssueDate || profile.citDate || profile.CitizenshipDate || '—';
      const gender = profile.GenderCode === 'F' ? 'FEMALE' : profile.GenderCode === 'M' ? 'MALE' : (profile.Gender || profile.gender || '—');
      const mobile = profile.Mobile || profile.mobile || profile.MobileNo || profile.ContactNo || '—';
      const address = getVerifyAddressParts(profile);
      const addressEn = [address.tole, address.ward, address.muniEn, address.districtEn, address.provinceEn].filter(v => v && v !== '—').join(', ') || '—';
      const addressNp = [address.tole, address.ward, address.muniNp, address.districtNp, address.provinceNp].filter(v => v && v !== '—').join(', ') || '—';
      const portraitImage = record && record.portraitImage ? record.portraitImage : (profile.PortraitImage || profile.portraitImage || '');
      const portrait = portraitImage
        ? '<div class="w-24 h-32 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center"><img src="data:image/jpeg;base64,' + escapeHtml(portraitImage) + '" alt="Portrait" class="w-full h-full object-cover" /></div>'
        : '<div class="w-24 h-32 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] font-semibold text-slate-400">No Photo</div>';
      const status = profile.Status || profile.status || record && record.status || 'pending';
      const statusLabel = status === 'done' ? 'Verified' : status === 'pending' ? 'Pending' : status === 'inprogress' ? 'Mobile Not Registered' : status === 'not online' ? 'Not Online' : 'Available';
      const voterListNumber = profile.VoterListNumber || profile.voterListNumber || record && record.voterListNumber || '—';
      const notes = profile.ApprovalMessage || profile.ApprovalMassage || profile.Approvalmessage || profile.Notes || '';
      const fatherEn = [profile.FatherFirstName, profile.FatherMiddleName, profile.FatherLastName].filter(Boolean).join(' ') || '—';
      const fatherNp = [profile.FatherFirstNameLoc, profile.FatherMiddleNameLoc, profile.FatherLastNameLoc].filter(Boolean).join(' ') || '—';
      const motherEn = [profile.MotherFirstName, profile.MotherMiddleName, profile.MotherLastName].filter(Boolean).join(' ') || '—';
      const motherNp = [profile.MotherFirstNameLoc, profile.MotherMiddleNameLoc, profile.MotherLastNameLoc].filter(Boolean).join(' ') || '—';
      const grandfatherEn = [profile.GrandfatherFirstName, profile.GrandfatherMiddleName, profile.GrandfatherLastName].filter(Boolean).join(' ') || '—';
      const grandfatherNp = [profile.GrandfatherFirstNameLoc, profile.GrandfatherMiddleNameLoc, profile.GrandfatherLastNameLoc].filter(Boolean).join(' ') || '—';
      const spouseEn = [profile.SpouseFirstName, profile.SpouseMiddleName, profile.SpouseLastName].filter(Boolean).join(' ') || [profile.HusbandWifeFirstName, profile.HusbandWifeMiddleName, profile.HusbandWifeLastName].filter(Boolean).join(' ') || profile.HusbandWifeName || profile.SpouseName || '—';
      const spouseNp = [profile.SpouseFirstNameLoc, profile.SpouseMiddleNameLoc, profile.SpouseLastNameLoc].filter(Boolean).join(' ') || [profile.HusbandWifeFirstNameLoc, profile.HusbandWifeMiddleNameLoc, profile.HusbandWifeLastNameLoc].filter(Boolean).join(' ') || profile.HusbandWifeNameLoc || profile.SpouseNameLoc || '—';
      const spouseLabel = gender === 'FEMALE' ? 'Husband' : 'Wife / Spouse';
      const highlightRows = [
        ['English Name', fullName],
        ['Nepali Name', fullNameNp],
        ['Gender', gender],
        ['NID', nid]
      ].map(([label, value]) => '<div class="rounded-xl border border-slate-200 bg-white/70 p-2.5"><div class="text-[9px] uppercase tracking-wider font-bold text-slate-400">' + escapeHtml(label) + '</div><div class="text-sm font-semibold text-slate-800 mt-0.5">' + escapeHtml(value) + '</div></div>').join('');

      return '<div class="space-y-4">' +
        (notes ? '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">' + escapeHtml(notes) + '</div>' : '') +
        '<div class="rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 p-4 space-y-3">' +
        '  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">' +
        '    <div class="flex items-start gap-3">' + portrait +
        '      <div>' +
        '        <div class="text-sm font-bold text-slate-900">' + escapeHtml(fullName) + '</div>' +
        '        <div class="text-[11px] text-slate-500 nepali-font mt-0.5">' + escapeHtml(fullNameNp) + '</div>' +
        '        <div class="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mt-2">NID ' + escapeHtml(nid) + '</div>' +
        '      </div>' +
        '    </div>' +
        '    <div class="flex flex-wrap gap-2">' +
        '      <span class="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider">' + escapeHtml(statusLabel) + '</span>' +
        '      <span class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">Voter No. ' + escapeHtml(voterListNumber) + '</span>' +
        '    </div>' +
        '  </div>' +
        '  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' + highlightRows + '</div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        '  <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">' +
        '    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Gender</div>' +
        '    <div class="text-sm font-semibold text-slate-800">' + escapeHtml(gender) + '</div>' +
        '  </div>' +
        '  <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">' +
        '    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Date of Birth (AD)</div>' +
        '    <div class="text-sm font-semibold text-slate-800">' + escapeHtml(dob) + '</div>' +
        '  </div>' +
        '  <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">' +
        '    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">जन्म मिति (BS)</div>' +
        '    <div class="text-sm font-semibold text-slate-800 nepali-font">' + escapeHtml(dobNp) + '</div>' +
        '  </div>' +
        '  <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">' +
        '    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Citizenship Number</div>' +
        '    <div class="text-sm font-semibold text-slate-800 font-mono">' + escapeHtml(citizenshipNo) + '</div>' +
        '  </div>' +
        '  <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">' +
        '    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Citizenship Issued</div>' +
        '    <div class="text-sm font-semibold text-slate-800">' + escapeHtml(citDate) + '</div>' +
        '  </div>' +
        '  <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">' +
        '    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Mobile</div>' +
        '    <div class="text-sm font-semibold text-slate-800">' + escapeHtml(mobile) + '</div>' +
        '  </div>' +
        '  <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:col-span-2">' +
        '    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Permanent Address</div>' +
        '    <div class="text-sm font-semibold text-slate-800">' + escapeHtml(addressEn) + '</div>' +
        '    <div class="text-[11px] text-slate-500 mt-0.5 nepali-font">' + escapeHtml(addressNp) + '</div>' +
        '  </div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        '  <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">' +
        '    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Father</div>' +
        '    <div class="text-sm font-semibold text-slate-800">' + escapeHtml(fatherEn) + '</div>' +
        '    <div class="text-[11px] text-slate-500 mt-0.5 nepali-font">' + escapeHtml(fatherNp) + '</div>' +
        '  </div>' +
        '  <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">' +
        '    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Mother</div>' +
        '    <div class="text-sm font-semibold text-slate-800">' + escapeHtml(motherEn) + '</div>' +
        '    <div class="text-[11px] text-slate-500 mt-0.5 nepali-font">' + escapeHtml(motherNp) + '</div>' +
        '  </div>' +
        '  <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">' +
        '    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Grandfather</div>' +
        '    <div class="text-sm font-semibold text-slate-800">' + escapeHtml(grandfatherEn) + '</div>' +
        '    <div class="text-[11px] text-slate-500 mt-0.5 nepali-font">' + escapeHtml(grandfatherNp) + '</div>' +
        '  </div>' +
        '  <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">' +
        '    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">' + escapeHtml(spouseLabel) + '</div>' +
        '    <div class="text-sm font-semibold text-slate-800">' + escapeHtml(spouseEn) + '</div>' +
        '    <div class="text-[11px] text-slate-500 mt-0.5 nepali-font">' + escapeHtml(spouseNp) + '</div>' +
        '  </div>' +
        '</div>' +
        '</div>';
    }

    function openVerifyDetailsModal() {
      const modal = document.getElementById('verifyDetailsModal');
      const content = document.getElementById('verifyDetailsContent');
      if (!modal || !content) return;
      content.innerHTML = '<div class="text-sm text-slate-500">Loading details...</div>';
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      setTimeout(() => {
        const dialog = modal.querySelector('div > div');
        if (dialog) dialog.classList.remove('scale-95');
      }, 10);
    }

    function closeVerifyDetailsModal() {
      const modal = document.getElementById('verifyDetailsModal');
      if (!modal) return;
      const dialog = modal.querySelector('div > div');
      if (dialog) dialog.classList.add('scale-95');
      setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }, 150);
    }

    async function loadVoterListDetails() {
      const btn = document.getElementById('viewDetailsBtn');
      const content = document.getElementById('verifyDetailsContent');
      if (!content) return;

      openVerifyDetailsModal();
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="w-4 h-4 spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89"/></svg> Loading...';
      }

      try {
        const res = await fetch('/api/save-voter-list-record?nidNumber=' + encodeURIComponent(PERSON_NIN));
        if (!res.ok) {
          if (res.status === 404) {
            content.innerHTML = '<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">No voter list record was found for this NID yet.</div>';
          } else {
            throw new Error('Unable to fetch voter list details.');
          }
          return;
        }

        const data = await res.json();
        const record = data.found || data.record || null;
        if (!record) {
          content.innerHTML = '<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">No voter list record was found for this NID yet.</div>';
          return;
        }

        content.innerHTML = buildVerifyDetailsHtml(record);
      } catch (err) {
        content.innerHTML = '<div class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">' + escapeHtml(err.message || 'Unable to load details.') + '</div>';
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm-9 8a9 9 0 1118 0"/></svg> View Details';
        }
      }
    }

    // Nepali to English digit translation
    const nepToEn = {'०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9'};
    const enToNep = {'0':'०','1':'१','2':'२','3':'३','4':'४','5':'५','6':'६','7':'७','8':'८','9':'९'};
    function translateDigits(str, map) {
      return str.split('').map(c => map[c] || c).join('');
    }

    function showStep(n) {
      document.querySelectorAll('.step-card').forEach(el => el.classList.remove('active'));
      document.getElementById('step' + n).classList.add('active');
      ['stepInd1','stepInd2','stepInd3','stepInd4'].forEach((id, i) => {
        const el = document.getElementById(id);
        if (i + 1 <= n) {
          el.className = 'px-2.5 py-1 rounded-full bg-blue-600 text-white';
        } else {
          el.className = 'px-2.5 py-1 rounded-full bg-slate-100 text-slate-400';
        }
      });
    }

    function showError(stepNum, msg) {
      const el = document.getElementById('step' + stepNum + 'Error');
      el.textContent = msg;
      el.classList.remove('hidden');
    }
    function hideError(stepNum) {
      document.getElementById('step' + stepNum + 'Error').classList.add('hidden');
    }

    function openVerifyFlowModal() {
      const modal = document.getElementById('verifyFlowModal');
      if (!modal) return;
      verifyFlowActive = true;
      currentVerifyFlowSession += 1;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      setTimeout(() => {
        const dialog = modal.querySelector('div > div');
        if (dialog) dialog.classList.remove('scale-95');
      }, 10);
    }

    function resetStartVerifyButton() {
      const btn = document.getElementById('startVerifyBtn');
      if (!btn) return;
      btn.disabled = false;
      btn.classList.remove('opacity-70');
      btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg> Verify &amp; Download NID Card';
    }

    function closeVerifyFlowModal() {
      const modal = document.getElementById('verifyFlowModal');
      const verifyArea = document.getElementById('verifyBtnArea');
      if (!modal) return;
      verifyFlowActive = false;
      currentVerifyFlowSession += 1;
      if (verifySuccessTimer) {
        clearInterval(verifySuccessTimer);
        verifySuccessTimer = null;
      }
      const dialog = modal.querySelector('div > div');
      if (dialog) dialog.classList.add('scale-95');
      setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        if (verifyArea) {
          verifyArea.classList.remove('hidden');
        }
        resetStartVerifyButton();
      }, 150);
    }

    function startVerifyFlow() {
      const btn = document.getElementById('startVerifyBtn');
      if (btn) {
        btn.disabled = false;
        btn.classList.add('opacity-70');
        btn.innerHTML = '<svg class="w-4 h-4 spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89"/></svg> Loading captcha...';
      }
      openVerifyFlowModal();
      loadCaptcha();
    }

    async function loadCaptcha() {
      // Reset to step 1
      document.getElementById('captchaInput').value = '';
      document.getElementById('captchaImg').src = '';
      verifyNin = '';
      verifyDownloadToken = '';
      showStep(1);
      hideError(1);

      try {
        const res = await fetch('/api/captcha');
        if (!res.ok) throw new Error('Failed to load captcha');
        const data = await res.json();
        if (!data.image) throw new Error('Invalid captcha format');
        document.getElementById('captchaImg').src = 'data:image/png;base64,' + data.image;
        resetStartVerifyButton();
      } catch (err) {
        showError(1, 'Could not load captcha: ' + err.message);
        // Re-enable button if captcha failed to load
        resetStartVerifyButton();
      }
    }

    async function requestOtp() {
      const sessionId = currentVerifyFlowSession;
      hideError(1);
      const captchaCode = document.getElementById('captchaInput').value.trim();
      if (!captchaCode) { showError(1, 'Please enter the captcha code.'); return; }

      const btn = document.getElementById('btnRequestOtp');
      btn.disabled = true;
      btn.textContent = 'Sending...';

      const dobLoc = translateDigits(PERSON_DOB_LOC, enToNep);
      const ccnIssuingDateLoc = translateDigits(PERSON_CIT_DATE_LOC, enToNep);

      try {
        const res = await fetch('/api/request-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Captcha-Code': captchaCode },
          body: JSON.stringify({
            fullName: PERSON_FULL_NAME.trim().toUpperCase(),
            fullNameLoc: PERSON_FULL_NAME_NP.trim(),
            dobLoc: dobLoc,
            ccnIssuingDateLoc: ccnIssuingDateLoc,
          }),
        });

        // Safe body parsing
        const rawText = await res.text();
        let data;
        try { data = JSON.parse(rawText); } catch (e) { data = rawText; }

        if (!verifyFlowActive || sessionId !== currentVerifyFlowSession) return;

        if (!res.ok) {
          let errMsg = "";
          if (typeof data === "object" && data !== null) {
            errMsg = data.error || data.message || JSON.stringify(data);
          } else {
            errMsg = String(data);
          }

          if (errMsg.includes("MOBILE_NOT_REGISTERED")) {
            errMsg = "Mobile number is not registered on the NID portal.";
          } else if (errMsg.includes("DATA_NOT_FOUND")) {
            errMsg = "Citizen data is not found on the NID portal.";
          }
          showError(1, 'OTP request failed: ' + errMsg);
          loadCaptcha();
          return;
        }
        verifyTransactionId = data.transactionId || '';
        verifyNin = data.nin || PERSON_NIN;
        document.getElementById('maskedMobileDisplay').textContent = data.maskedMobile || '—';
        document.getElementById('ninDisplay').textContent = verifyNin;
        showStep(2);
      } catch (err) {
        showError(1, 'Network error: ' + err.message);
        loadCaptcha();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send OTP';
      }
    }

    async function verifyOtp() {
      const sessionId = currentVerifyFlowSession;
      hideError(2);
      const otp = document.getElementById('otpInput').value.trim();
      if (!otp) { showError(2, 'Please enter the OTP code.'); return; }

      const btn = document.getElementById('btnVerifyOtp');
      btn.disabled = true;
      btn.textContent = 'Verifying...';

      try {
        const payload = verifyTransactionId
          ? { transactionId: verifyTransactionId, otp }
          : { nin: verifyNin, otp };

        const res = await fetch('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        // Safe body parsing
        const rawText = await res.text();
        let data;
        try { data = JSON.parse(rawText); } catch (e) { data = rawText; }

        if (!verifyFlowActive || sessionId !== currentVerifyFlowSession) return;

        if (!res.ok) {
          let errMsg = "";
          if (typeof data === "object" && data !== null) {
            errMsg = data.error || data.message || JSON.stringify(data);
          } else {
            errMsg = String(data);
          }
          showError(2, 'OTP verification failed: ' + errMsg);
          return;
        }
        verifyDownloadToken = data.downloadToken;
        if (!verifyFlowActive || sessionId !== currentVerifyFlowSession) return;
        showStep(3);
        if (data.downloadToken) {
          // Auto-trigger download
          downloadAndSave();
        }
      } catch (err) {
        showError(2, 'Network error: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Verify OTP';
      }
    }

    async function downloadAndSave() {
      const sessionId = currentVerifyFlowSession;
      hideError(3);
      const btn = document.getElementById('btnDownload');
      btn.disabled = true;
      btn.innerHTML = '<svg class="w-4 h-4 spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89"/></svg> Downloading...';

      const dobLoc = translateDigits(PERSON_DOB_LOC, enToNep);
      const ccnIssuingDateLoc = translateDigits(PERSON_CIT_DATE_LOC, enToNep);

      try {
        // Download PDF
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Download-Token': verifyDownloadToken,
          },
          body: JSON.stringify({
            full_name: PERSON_FULL_NAME.trim().toUpperCase(),
            full_name_loc: PERSON_FULL_NAME_NP.trim(),
            dob_loc: dobLoc,
            ccn_issuing_date_loc: ccnIssuingDateLoc,
          }),
        });

        if (!verifyFlowActive || sessionId !== currentVerifyFlowSession) return;

        if (!res.ok) {
          let errMsg = res.statusText;
          try {
            const rawErr = await res.text();
            try { const d = JSON.parse(rawErr); errMsg = d.error || d.message || errMsg; } catch(e) { errMsg = rawErr || errMsg; }
          } catch(e) {}

          // Translate raw API codes to friendly messages
          if (errMsg.includes('MOBILE_NOT_REGISTERED')) {
            errMsg = 'Mobile number is not registered on the NID portal.';
          } else if (errMsg.includes('DATA_NOT_FOUND')) {
            errMsg = 'Citizen data was not found on the NID portal.';
          } else if (errMsg.includes('INVALID_TOKEN') || errMsg.includes('invalid token')) {
            errMsg = 'Download session expired. Please start over.';
          }

          showError(3, '❌ ' + errMsg);
          btn.disabled = false;
          btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Retry Download';
          return;
        }

        const encryptedBlob = await res.blob();
        
        // Calculate Password
        const nameOnly = PERSON_FULL_NAME.trim().replace(/\\s+/g,'');
        const namePart = nameOnly.substring(0,4).toUpperCase();
        const dobEn = translateDigits(PERSON_DOB_LOC, nepToEn);
        const yearPart = dobEn.replace(/\\//g, "-").split('-')[0].substring(0,4);
        const clipboardCode = namePart + yearPart;

        try {
          await navigator.clipboard.writeText(clipboardCode);
        } catch(e) {}

        // Open embedded PDF viewer modal on the same page
        const filename = 'NID_Card_' + PERSON_FULL_NAME.trim().replace(/\\s+/g,'_') + '.pdf';
        openEmbeddedPdfModal(encryptedBlob, filename, clipboardCode);

        if (!verifyFlowActive || sessionId !== currentVerifyFlowSession) return;

        // Show step 4
        showStep(4);
        document.getElementById('pastedTokenInput').value = '';

      } catch (err) {
        showError(3, 'Error: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Retry Download';
      }
    }

    function extractToken(str) {
      str = str.trim();
      const matches = str.match(/token=([^&]+)/g);
      if (matches && matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        return decodeURIComponent(lastMatch.substring(6));
      }
      return str;
    }

    // ── Embedded PDF Viewer ──────────────────────────────────────────────────
    let embeddedPdfBuffer = null;
    let embeddedPdfDoc = null;
    let embeddedPdfPassword = '';
    let embeddedPdfName = '';

    async function openEmbeddedPdfModal(blob, filename, autoPassword) {
      const modal = document.getElementById('embeddedPdfModal');
      document.getElementById('embeddedPdfNameLabel').innerText = filename;
      document.getElementById('embeddedPdfPasswordInput').value = autoPassword || '';
      document.getElementById('embeddedPdfPasswordPrompt').classList.add('hidden');
      document.getElementById('embeddedPdfPasswordError').classList.add('hidden');
      document.getElementById('embeddedPdfCanvasContainer').classList.add('hidden');
      document.getElementById('embeddedPdfLoadingText').classList.remove('hidden');
      document.getElementById('btnEmbeddedScanQR').disabled = true;
      document.getElementById('btnEmbeddedDownloadUnlocked').disabled = true;

      embeddedPdfName = filename;
      embeddedPdfPassword = autoPassword || '';
      embeddedPdfBuffer = await blob.arrayBuffer();

      modal.classList.remove('hidden');
      setTimeout(() => modal.firstElementChild.classList.add('scale-100'), 10);

      await loadEmbeddedPdf();
    }

    function closeEmbeddedPdfModal() {
      const modal = document.getElementById('embeddedPdfModal');
      modal.firstElementChild.classList.remove('scale-100');
      setTimeout(() => modal.classList.add('hidden'), 150);
    }

    async function loadEmbeddedPdf() {
      document.getElementById('embeddedPdfPasswordPrompt').classList.add('hidden');
      document.getElementById('embeddedPdfPasswordError').classList.add('hidden');
      document.getElementById('embeddedPdfLoadingText').classList.remove('hidden');
      document.getElementById('embeddedPdfCanvasContainer').classList.add('hidden');

      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      try {
        const loadingTask = pdfjsLib.getDocument({ data: embeddedPdfBuffer, password: embeddedPdfPassword });
        embeddedPdfDoc = await loadingTask.promise;
        await renderEmbeddedPageOne();

        document.getElementById('embeddedPdfLoadingText').classList.add('hidden');
        document.getElementById('embeddedPdfCanvasContainer').classList.remove('hidden');
        document.getElementById('btnEmbeddedScanQR').disabled = false;
        document.getElementById('btnEmbeddedDownloadUnlocked').disabled = false;

        // Auto-scan QR on load
        scanEmbeddedPdfQR();
      } catch (err) {
        if (err.name === 'PasswordException' || err.code === 1) {
          document.getElementById('embeddedPdfLoadingText').classList.add('hidden');
          document.getElementById('embeddedPdfPasswordPrompt').classList.remove('hidden');
          if (embeddedPdfPassword) {
            document.getElementById('embeddedPdfPasswordError').classList.remove('hidden');
          }
        } else {
          console.error(err);
          alert('Error loading PDF: ' + err.message);
          closeEmbeddedPdfModal();
        }
      }
    }

    async function submitEmbeddedPdfPassword() {
      embeddedPdfPassword = document.getElementById('embeddedPdfPasswordInput').value.trim().toUpperCase();
      await loadEmbeddedPdf();
    }

    async function renderEmbeddedPageOne() {
      if (!embeddedPdfDoc) return;
      const page = await embeddedPdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.getElementById('embeddedPdfCanvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    }

    async function scanEmbeddedPdfQR() {
      try {
        const canvas = document.getElementById('embeddedPdfCanvas');
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });

        if (code && code.data) {
          const inp = document.getElementById('pastedTokenInput');
          if (inp) { inp.value = code.data; }
          closeEmbeddedPdfModal();
          verifyAndSaveScannedToken();
        } else {
          alert('Could not detect a QR code in this PDF. Make sure the QR code is fully visible, then try again.');
        }
      } catch (err) {
        alert('Scan failed: ' + err.message);
      }
    }

    async function downloadEmbeddedUnlocked() {
      const btn = document.getElementById('btnEmbeddedDownloadUnlocked');
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = 'Decrypting...';
      try {
        const url = URL.createObjectURL(new Blob([embeddedPdfBuffer], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = embeddedPdfName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    async function verifyAndSaveScannedToken() {
      const sessionId = currentVerifyFlowSession;
      hideError(4);
      const inputVal = document.getElementById('pastedTokenInput').value.trim();
      if (!inputVal) {
        showError(4, 'Please paste the scanned QR URL or token.');
        return;
      }

      const extracted = extractToken(inputVal);
      const btn = document.getElementById('btnSubmitScannedToken');
      btn.disabled = true;
      btn.textContent = 'Verifying...';

      try {
        if (!verifyFlowActive || sessionId !== currentVerifyFlowSession) return;

        // Verify with API
        const checkRes = await fetch('/api/check-token?token=' + encodeURIComponent(extracted));
        if (!checkRes.ok) throw new Error('Verification request failed.');
        const checkData = await checkRes.json();
        if (!checkData.valid) {
          throw new Error('This token could not be verified by the government server.');
        }

        if (!verifyFlowActive || sessionId !== currentVerifyFlowSession) return;

        // Save token + status=done in DB
        const saveRes = await fetch('/api/people?originalNin=' + encodeURIComponent(PERSON_NIN), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: extracted, status: 'done' }),
        });
        if (!saveRes.ok) throw new Error('Failed to save verified token to database.');

        if (!verifyFlowActive || sessionId !== currentVerifyFlowSession) return;

        // Save to webpage cache (localStorage) for refreshing
        localStorage.setItem('nid_token_' + PERSON_NIN, extracted);

        // Show Success
        showStep(5);

        // Countdown redirect
        let count = 5;
        verifySuccessTimer = setInterval(() => {
          count--;
          const el = document.getElementById('countdownTimer');
          if (el) el.textContent = count;
          if (count <= 0) {
            clearInterval(verifySuccessTimer);
            verifySuccessTimer = null;
            if (verifyFlowActive && sessionId === currentVerifyFlowSession) {
              window.location.href = 'https://citizenportal.donidcr.gov.np/en/verify?token=' + encodeURIComponent(extracted);
            }
          }
        }, 1000);

      } catch(err) {
        showError(4, err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Verify & Save Token';
      }
    }

    // Auto-start captcha load and check local cache when page loads
    window.addEventListener('DOMContentLoaded', async () => {
      const cached = localStorage.getItem('nid_token_' + PERSON_NIN);
      if (cached) {
        try {
          const res = await fetch('/api/check-token?token=' + encodeURIComponent(cached));
          const data = await res.json();
          if (data && data.valid) {
            window.location.href = 'https://citizenportal.donidcr.gov.np/en/verify?token=' + encodeURIComponent(cached);
          } else {
            localStorage.removeItem('nid_token_' + PERSON_NIN);
          }
        } catch(e) {}
      }
    });
  </script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  if (typeof res.status !== "function") {
    res.status = function (s) { this.statusCode = s; return this; };
  }
  if (typeof res.json !== "function") {
    res.json = function (d) { this.setHeader("Content-Type", "application/json"); this.end(JSON.stringify(d)); return this; };
  }
  if (typeof res.send !== "function") {
    res.send = function (d) { this.end(d); return this; };
  }

  try {
    await connectToDatabase();
  } catch (error) {
    return res.status(500).json({ error: "Database connection failed" });
  }

  const { nin } = req.query;
  if (!nin) return res.status(400).json({ error: "NIN parameter is required" });

  try {
    const person = await Person.findOne({ ninEn: nin.trim() });

    // CASE A: Not found
    if (!person) {
      res.setHeader("Content-Type", "text/html");
      return res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Identity Not Found</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f1f5f9; }</style>
</head>
<body class="min-h-screen flex items-center justify-center p-4 antialiased">
  <div class="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center space-y-5">
    <div class="w-16 h-16 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center mx-auto">
      <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </div>
    <div>
      <h2 class="text-lg font-bold text-slate-900">Record Not Found</h2>
      <p class="text-sm text-slate-500 mt-2">No registered profile could be matched with NIN: <strong class="font-mono text-blue-600">${nin}</strong>.</p>
    </div>
    <div class="text-[10px] text-slate-400"></div>
  </div>
</body>
</html>`);
    }

    // CASE B: Token exists — check validity
    if (person.token && person.token.trim() !== "") {
      const tokenValid = await checkTokenValid(person.token.trim());
      if (tokenValid) {
        // Valid — redirect to citizen portal
        const redirectUrl = `https://citizenportal.donidcr.gov.np/en/verify?token=${encodeURIComponent(person.token.trim())}`;
        res.writeHead(302, { Location: redirectUrl });
        return res.end();
      }
      // Invalid/expired — show verify page with "Token Expired" mode
      res.setHeader("Content-Type", "text/html");
      return res.status(200).send(renderVerifyPage(person, "expired_token", nin));
    }

    // CASE C: No token — show verify page with "no_token" mode
    res.setHeader("Content-Type", "text/html");
    return res.status(200).send(renderVerifyPage(person, "no_token", nin));

  } catch (err) {
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};
