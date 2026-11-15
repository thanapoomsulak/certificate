/* =====================================================================
   SkillTrust Academy — Blockchain Digital Certificate Verification DApp
   ethers v6 + MetaMask (Ethereum Hoodi Testnet)
   ===================================================================== */
(() => {
  "use strict";

  const CFG = window.APP_CONFIG;
  const ABI = window.CERT_ABI;
  const LS_KEY = "skilltrust.contractAddress";
  const ZERO_HASH = "0x" + "0".repeat(64);

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const state = {
    readProvider: null,
    browserProvider: null,
    signer: null,
    account: null,
    chainOk: false,
    isOwner: false,
    isIssuer: false,
    courses: new Map(),
    issueFileHash: null,
    scanner: null
  };

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "-");
  const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-8)}` : "-");
  const toDate = (ts) => new Date(Number(ts) * 1000);
  const fmtDate = (d) => d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
  const fmtDateTime = (d) => d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  const fmtDateEn = (d) => d.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  const addrLink = (a) => `<a href="${CFG.EXPLORER}/address/${a}" target="_blank" rel="noopener" class="mono">${short(a)}</a>`;
  const txLink = (h) => `<a href="${CFG.EXPLORER}/tx/${h}" target="_blank" rel="noopener">ดูบน Etherscan ↗</a>`;

  const normName = (s) => String(s || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  const computeDataHash = (certId, courseCode, name) =>
    ethers.keccak256(ethers.toUtf8Bytes(`${certId.trim()}|${courseCode.trim()}|${normName(name)}`));
  const computeFileHash = async (file) => ethers.keccak256(new Uint8Array(await file.arrayBuffer()));

  const verifyUrl = (id) => `${location.origin}${location.pathname}?id=${encodeURIComponent(id)}#verify`;

  function genCertId() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const buf = new Uint32Array(6);
    crypto.getRandomValues(buf);
    const rand = [...buf].map((n) => chars[n % chars.length]).join("");
    return `STA-${new Date().getFullYear()}-${rand}`;
  }

  function toast(msg, type = "info", ms = 5000) {
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.innerHTML = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => el.classList.add("out"), ms);
    setTimeout(() => el.remove(), ms + 400);
    return el;
  }

  const REVERT_TH = {
    "Only admin": "เฉพาะผู้ดูแลระบบเท่านั้น",
    "Not an authorized issuer": "บัญชีนี้ไม่ได้รับสิทธิ์ออก/เพิกถอนใบรับรอง",
    "Invalid address": "Address ไม่ถูกต้อง",
    "Cannot remove admin": "ไม่สามารถถอนสิทธิ์ผู้ดูแลระบบได้",
    "Invalid course code": "รหัสหลักสูตรไม่ถูกต้อง (1–32 ตัวอักษร)",
    "Course name required": "กรุณากรอกชื่อหลักสูตร",
    "Course code already exists": "รหัสหลักสูตรนี้มีอยู่แล้ว",
    "Course not found": "ไม่พบหลักสูตร",
    "Course is inactive": "หลักสูตรนี้ถูกปิดใช้งาน",
    "Invalid certificate ID": "รหัสใบรับรองไม่ถูกต้อง (1–64 ตัวอักษร)",
    "Certificate ID already exists": "รหัสใบรับรองนี้ถูกใช้แล้ว (ต้องไม่ซ้ำกัน)",
    "Invalid recipient": "Wallet ผู้รับไม่ถูกต้อง",
    "Data hash required": "ไม่มี Hash ของข้อมูลใบรับรอง",
    "File hash already used": "ไฟล์ PDF นี้ถูกใช้กับใบรับรองอื่นแล้ว",
    "Certificate not found": "ไม่พบใบรับรอง",
    "Reason required": "กรุณาระบุเหตุผล",
    "Already revoked": "ใบรับรองนี้ถูกเพิกถอนไปแล้ว"
  };

  function errMsg(e) {
    if (e?.code === "ACTION_REJECTED" || e?.code === 4001 || e?.info?.error?.code === 4001)
      return "ยกเลิกรายการใน MetaMask แล้ว";
    const raw =
      e?.reason || e?.revert?.args?.[0] || e?.info?.error?.data?.message || e?.info?.error?.message ||
      e?.shortMessage || e?.message || String(e);
    for (const [k, v] of Object.entries(REVERT_TH)) if (raw.includes(k)) return v;
    if (/insufficient funds/i.test(raw)) return "ETH ใน Wallet ไม่พอจ่ายค่า Gas (ขอ Hoodi ETH จาก Faucet)";
    return esc(raw.length > 220 ? raw.slice(0, 220) + "…" : raw);
  }

  // ------------------------------------------------------------------
  // Contract access
  // ------------------------------------------------------------------
  const getContractAddress = () => (localStorage.getItem(LS_KEY) || CFG.CONTRACT_ADDRESS || "").trim();

  function getReadProvider() {
    if (state.browserProvider && state.chainOk) return state.browserProvider;
    if (!state.readProvider) {
      state.readProvider = new ethers.JsonRpcProvider(CFG.RPC_URLS[0], CFG.CHAIN_ID, { staticNetwork: true });
    }
    return state.readProvider;
  }

  function readContract() {
    return new ethers.Contract(getContractAddress(), ABI, getReadProvider());
  }

  async function writeContract() {
    if (!state.signer) {
      await connectWallet();
      if (!state.signer) throw new Error("กรุณาเชื่อมต่อ MetaMask");
    }
    if (!state.chainOk) {
      await ensureChain();
      throw new Error("กรุณาเปลี่ยนเครือข่ายเป็น Hoodi แล้วลองใหม่");
    }
    return new ethers.Contract(getContractAddress(), ABI, state.signer);
  }

  function contractMissingHtml() {
    return `<div class="notice warn">ยังไม่ได้ตั้งค่า Contract Address — ไปที่แท็บ <a href="#settings">ตั้งค่า</a> เพื่อใส่ Address ของ Smart Contract</div>`;
  }

  async function getCourse(code) {
    if (state.courses.has(code)) return state.courses.get(code);
    const c = await readContract().getCourse(code);
    const course = {
      code: c.code, name: c.name, category: c.category, description: c.description,
      durationHours: Number(c.durationHours), active: c.active, createdAt: toDate(c.createdAt)
    };
    state.courses.set(code, course);
    return course;
  }

  function certFromResult(r) {
    return {
      certId: r.certId, courseCode: r.courseCode, recipient: r.recipient, dataHash: r.dataHash,
      fileHash: r.fileHash, issuer: r.issuer, issuedAt: toDate(r.issuedAt), revoked: r.revoked,
      revokedAt: Number(r.revokedAt) ? toDate(r.revokedAt) : null, revokeReason: r.revokeReason
    };
  }

  // ------------------------------------------------------------------
  // Wallet
  // ------------------------------------------------------------------
  async function ensureChain() {
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CFG.CHAIN_ID_HEX }] });
    } catch (e) {
      const code = e?.code ?? e?.data?.originalError?.code;
      if (code === 4902 || /Unrecognized chain|not been added/i.test(e?.message || "")) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: CFG.CHAIN_ID_HEX, chainName: CFG.CHAIN_NAME, rpcUrls: CFG.RPC_URLS,
            nativeCurrency: CFG.NATIVE_CURRENCY, blockExplorerUrls: [CFG.EXPLORER]
          }]
        });
      } else {
        throw e;
      }
    }
  }

  async function setupWallet(requestAccess) {
    if (!window.ethereum) {
      if (requestAccess) toast("ไม่พบ MetaMask — กรุณาติดตั้ง MetaMask ก่อน", "error");
      return;
    }
    try {
      const method = requestAccess ? "eth_requestAccounts" : "eth_accounts";
      const accounts = await window.ethereum.request({ method });
      if (!accounts.length) return;
      let chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (parseInt(chainId, 16) !== CFG.CHAIN_ID && requestAccess) {
        try { await ensureChain(); } catch (e) { toast(errMsg(e), "error"); }
        chainId = await window.ethereum.request({ method: "eth_chainId" });
      }
      state.chainOk = parseInt(chainId, 16) === CFG.CHAIN_ID;
      state.browserProvider = new ethers.BrowserProvider(window.ethereum);
      state.signer = await state.browserProvider.getSigner();
      state.account = await state.signer.getAddress();
      await refreshRoles();
      updateWalletUI();
      onTabShown(currentTab());
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }
  const connectWallet = () => setupWallet(true);

  async function refreshRoles() {
    state.isOwner = false;
    state.isIssuer = false;
    if (!state.account || !getContractAddress() || !state.chainOk) return;
    try {
      const c = readContract();
      const [owner, issuer] = await Promise.all([c.owner(), c.isIssuer(state.account)]);
      state.isOwner = owner.toLowerCase() === state.account.toLowerCase();
      state.isIssuer = issuer;
    } catch (e) {
      console.warn("role check failed", e);
    }
  }

  function updateWalletUI() {
    const btn = $("#connectBtn");
    const badge = $("#roleBadge");
    const bar = $("#netbar");
    if (!state.account) {
      btn.textContent = "เชื่อมต่อ MetaMask";
      badge.classList.add("hidden");
      bar.classList.add("hidden");
      return;
    }
    btn.textContent = short(state.account);
    btn.title = state.account;
    const role = state.isOwner ? "Admin" : state.isIssuer ? "Issuer" : "ผู้เข้าอบรม";
    badge.textContent = role;
    badge.className = `role-badge role-${state.isOwner ? "admin" : state.isIssuer ? "issuer" : "user"}`;
    if (!state.chainOk) {
      bar.innerHTML = `<div class="wrap">⚠️ MetaMask ไม่ได้อยู่บนเครือข่าย ${esc(CFG.CHAIN_NAME)} <button class="btn btn-sm btn-light" id="switchNet">เปลี่ยนเครือข่าย</button></div>`;
      bar.classList.remove("hidden");
      $("#switchNet").onclick = () => ensureChain().catch((e) => toast(errMsg(e), "error"));
    } else {
      bar.classList.add("hidden");
    }
  }

  // ------------------------------------------------------------------
  // Tabs
  // ------------------------------------------------------------------
  const TABS = ["verify", "dashboard", "issue", "admin", "settings"];
  const currentTab = () => {
    const t = location.hash.replace("#", "");
    return TABS.includes(t) ? t : "verify";
  };

  function showTab(t) {
    TABS.forEach((name) => $(`#tab-${name}`).classList.toggle("hidden", name !== t));
    $$("#tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === t));
    onTabShown(t);
  }

  function onTabShown(t) {
    if (t === "dashboard") loadDashboard();
    if (t === "issue") { renderRoleNotice("issue"); loadCourseSelect(); loadAllCerts(); }
    if (t === "admin") { renderRoleNotice("admin"); loadCourses(); loadIssuers(); }
    if (t === "settings") renderSettings();
  }

  function renderRoleNotice(kind) {
    const el = kind === "admin" ? $("#adminNotice") : $("#issuerNotice");
    let html = "";
    if (!getContractAddress()) html = contractMissingHtml();
    else if (!state.account) html = `<div class="notice">เชื่อมต่อ MetaMask ด้วยบัญชีที่ได้รับสิทธิ์ก่อนทำรายการ</div>`;
    else if (kind === "admin" && !state.isOwner)
      html = `<div class="notice warn">บัญชี ${short(state.account)} ไม่ใช่ผู้ดูแลระบบ — ดูข้อมูลได้แต่ทำรายการไม่ได้</div>`;
    else if (kind === "issue" && !state.isIssuer)
      html = `<div class="notice warn">บัญชี ${short(state.account)} ยังไม่ได้รับสิทธิ์ Issuer — ให้ผู้ดูแลระบบเพิ่มสิทธิ์ในแท็บ “ผู้ดูแลระบบ”</div>`;
    el.innerHTML = html;
    el.classList.toggle("hidden", !html);
  }

  // ------------------------------------------------------------------
  // 4) Verify
  // ------------------------------------------------------------------
  async function verify(idRaw, extraNote = "") {
    const id = String(idRaw || "").trim();
    const box = $("#verifyResult");
    if (!id) return;
    $("#verifyId").value = id;
    if (!getContractAddress()) { box.innerHTML = contractMissingHtml(); return; }
    box.innerHTML = `<div class="result loading"><span class="spinner"></span> กำลังตรวจสอบกับ Blockchain…</div>`;
    try {
      const c = readContract();
      const code = await getReadProvider().getCode(getContractAddress());
      if (code === "0x") throw new Error(`ไม่พบ Smart Contract ที่ ${getContractAddress()} บน ${CFG.CHAIN_NAME}`);
      const exists = await c.certificateExists(id);
      history.replaceState(null, "", `?id=${encodeURIComponent(id)}#verify`);
      if (!exists) {
        box.innerHTML = `
          <div class="result result-bad">
            <div class="status-icon">✕</div>
            <div>
              <h3>ไม่พบใบรับรองรหัส “${esc(id)}”</h3>
              <p>ใบรับรองนี้ไม่ได้ออกโดย ${esc(CFG.ORG_NAME)} หรือรหัสไม่ถูกต้อง — โปรดระวังเอกสารปลอม</p>
            </div>
          </div>`;
        return;
      }
      const cert = certFromResult(await c.getCertificate(id));
      const course = await getCourse(cert.courseCode);
      renderVerifyResult(cert, course, extraNote);
    } catch (e) {
      box.innerHTML = `<div class="result result-bad"><div class="status-icon">!</div><div><h3>ตรวจสอบไม่สำเร็จ</h3><p>${errMsg(e)}</p></div></div>`;
    }
  }

  function renderVerifyResult(cert, course, extraNote) {
    const ok = !cert.revoked;
    const box = $("#verifyResult");
    box.innerHTML = `
      <div class="result ${ok ? "result-ok" : "result-revoked"}">
        <div class="status-icon">${ok ? "✓" : "⦸"}</div>
        <div class="result-main">
          <p class="eyebrow">${ok ? "Valid Certificate" : "Revoked Certificate"}</p>
          <h3>${ok ? "ใบรับรองนี้ถูกต้องและยังมีผลใช้งาน" : "ใบรับรองนี้ถูกเพิกถอนแล้ว"}</h3>
          ${extraNote ? `<p class="note-ok">${extraNote}</p>` : ""}
          ${!ok ? `<p class="revoke-reason">เหตุผล: ${esc(cert.revokeReason)} · เมื่อ ${fmtDateTime(cert.revokedAt)}</p>` : ""}
          <dl class="kv">
            <dt>รหัสใบรับรอง</dt><dd class="mono">${esc(cert.certId)}</dd>
            <dt>หลักสูตร</dt><dd>${esc(course.name)} <span class="tag">${esc(course.code)}</span> <span class="tag">${esc(course.category)}</span></dd>
            <dt>จำนวนชั่วโมง</dt><dd>${course.durationHours} ชั่วโมง</dd>
            <dt>วันที่ออก</dt><dd>${fmtDateTime(cert.issuedAt)}</dd>
            <dt>Wallet ผู้รับ</dt><dd>${addrLink(cert.recipient)}</dd>
            <dt>ออกโดย</dt><dd>${addrLink(cert.issuer)}</dd>
            <dt>Data Hash</dt><dd class="mono small">${shortHash(cert.dataHash)}</dd>
            <dt>File Hash</dt><dd class="mono small">${cert.fileHash === ZERO_HASH ? "— (ไม่ได้แนบไฟล์)" : shortHash(cert.fileHash)}</dd>
          </dl>
        </div>
        <div class="result-qr" id="resultQr"></div>
      </div>

      <div class="grid-2 doc-check">
        <form class="card" id="nameCheck">
          <h4>ยืนยันชื่อบนใบรับรอง</h4>
          <p class="muted small">กรอกชื่อ-นามสกุลตามที่พิมพ์บนใบรับรอง ระบบจะคำนวณ Hash แล้วเทียบกับที่บันทึกบน Blockchain</p>
          <div class="input-row"><input id="checkName" placeholder="ชื่อ-นามสกุล" required /><button class="btn btn-primary">ตรวจ</button></div>
          <div id="nameCheckResult"></div>
        </form>
        <div class="card">
          <h4>ยืนยันไฟล์ PDF ไม่ถูกแก้ไข</h4>
          <p class="muted small">เลือกไฟล์ PDF ที่ได้รับ ระบบจะคำนวณ Hash ในเครื่องของคุณ (ไม่อัปโหลดไฟล์)</p>
          <label class="btn btn-ghost file-btn">เลือกไฟล์ PDF<input type="file" id="checkFile" accept="application/pdf,.pdf" hidden /></label>
          <div id="fileCheckResult"></div>
        </div>
      </div>`;

    makeQr($("#resultQr"), verifyUrl(cert.certId), 112);

    $("#nameCheck").onsubmit = (ev) => {
      ev.preventDefault();
      const h = computeDataHash(cert.certId, cert.courseCode, $("#checkName").value);
      $("#nameCheckResult").innerHTML = h === cert.dataHash
        ? `<p class="pill pill-ok">✓ ชื่อตรงกับข้อมูลที่บันทึกไว้บน Blockchain</p>`
        : `<p class="pill pill-bad">✕ ชื่อไม่ตรง — ข้อมูลบนเอกสารอาจถูกแก้ไข</p>`;
    };
    $("#checkFile").onchange = async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const out = $("#fileCheckResult");
      if (cert.fileHash === ZERO_HASH) {
        out.innerHTML = `<p class="pill">ใบรับรองนี้ไม่ได้บันทึก Hash ของไฟล์ไว้ — ใช้การยืนยันชื่อแทน</p>`;
        return;
      }
      const h = await computeFileHash(f);
      out.innerHTML = h === cert.fileHash
        ? `<p class="pill pill-ok">✓ ไฟล์ตรงกับต้นฉบับ ไม่ถูกแก้ไข</p>`
        : `<p class="pill pill-bad">✕ ไฟล์ไม่ตรงกับต้นฉบับ — อาจถูกแก้ไข</p><p class="mono small">${shortHash(h)}</p>`;
      ev.target.value = "";
    };
  }

  async function verifyByPdf(file) {
    if (!file) return;
    const box = $("#verifyResult");
    if (!getContractAddress()) { box.innerHTML = contractMissingHtml(); return; }
    box.innerHTML = `<div class="result loading"><span class="spinner"></span> กำลังคำนวณ Hash ของไฟล์…</div>`;
    try {
      const h = await computeFileHash(file);
      const id = await readContract().findByFileHash(h);
      if (!id) {
        box.innerHTML = `
          <div class="result result-bad"><div class="status-icon">✕</div><div>
            <h3>ไม่พบไฟล์นี้ในระบบ</h3>
            <p>ไฟล์ไม่ตรงกับใบรับรองใดที่บันทึกไว้ — อาจถูกแก้ไข หรือใบรับรองไม่ได้บันทึก Hash ของไฟล์ ลองตรวจด้วยรหัสใบรับรองแทน</p>
            <p class="mono small">${h}</p></div></div>`;
        return;
      }
      await verify(id, `✓ ไฟล์ PDF “${esc(file.name)}” ตรงกับต้นฉบับที่บันทึกบน Blockchain`);
    } catch (e) {
      box.innerHTML = `<div class="result result-bad"><div class="status-icon">!</div><div><h3>ตรวจสอบไม่สำเร็จ</h3><p>${errMsg(e)}</p></div></div>`;
    }
  }

  // QR
  function makeQr(el, text, size) {
    if (!el) return;
    el.innerHTML = "";
    if (typeof QRCode === "undefined") { el.textContent = "QR"; return; }
    new QRCode(el, { text, width: size, height: size, colorDark: "#0b1f33", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  }

  function extractId(text) {
    try {
      const u = new URL(text);
      return u.searchParams.get("id") || text.trim();
    } catch {
      return text.trim();
    }
  }

  async function toggleScanner() {
    const reader = $("#qrReader");
    if (typeof Html5Qrcode === "undefined") { toast("โหลดตัวสแกน QR ไม่สำเร็จ", "error"); return; }
    if (state.scanner) { await stopScanner(); return; }
    reader.classList.remove("hidden");
    $("#scanBtn").textContent = "■ หยุดสแกน";
    state.scanner = new Html5Qrcode("qrReader");
    try {
      await state.scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, async (text) => {
        await stopScanner();
        verify(extractId(text));
      });
    } catch (e) {
      toast("เปิดกล้องไม่ได้: " + esc(e?.message || e), "error");
      await stopScanner();
    }
  }

  async function stopScanner() {
    try { if (state.scanner?.isScanning) await state.scanner.stop(); state.scanner?.clear(); } catch {}
    state.scanner = null;
    $("#qrReader").classList.add("hidden");
    $("#scanBtn").textContent = "📷 สแกน QR ด้วยกล้อง";
  }

  async function scanImage(file) {
    if (!file) return;
    if (typeof Html5Qrcode === "undefined") { toast("โหลดตัวสแกน QR ไม่สำเร็จ", "error"); return; }
    if (state.scanner) await stopScanner();
    const reader = new Html5Qrcode("qrReader");
    try {
      const text = await reader.scanFile(file, false);
      verify(extractId(text));
    } catch {
      toast("ไม่พบ QR Code ในรูปภาพ", "error");
    } finally {
      try { reader.clear(); } catch {}
    }
  }

  // ------------------------------------------------------------------
  // 6) Dashboard
  // ------------------------------------------------------------------
  async function loadDashboard() {
    const body = $("#dashBody");
    if (!getContractAddress()) { body.innerHTML = contractMissingHtml(); return; }
    if (!state.account) {
      body.innerHTML = `<div class="empty">เชื่อมต่อ MetaMask เพื่อดูใบรับรองของคุณ<br /><button class="btn btn-primary" id="dashConnect">เชื่อมต่อ MetaMask</button></div>`;
      $("#dashConnect").onclick = connectWallet;
      return;
    }
    body.innerHTML = `<div class="empty"><span class="spinner"></span> กำลังโหลด…</div>`;
    try {
      const c = readContract();
      const ids = [...(await c.getCertificatesOf(state.account))].reverse();
      if (!ids.length) {
        body.innerHTML = `<div class="empty">ยังไม่มีใบรับรองที่ผูกกับ ${short(state.account)}</div>`;
        return;
      }
      const certs = await Promise.all(ids.map(async (id) => {
        const cert = certFromResult(await c.getCertificate(id));
        return { cert, course: await getCourse(cert.courseCode) };
      }));
      const valid = certs.filter((x) => !x.cert.revoked).length;
      body.innerHTML = `
        <div class="stats">
          <div><strong>${certs.length}</strong><span>ใบรับรองทั้งหมด</span></div>
          <div><strong>${valid}</strong><span>ใช้งานได้</span></div>
          <div><strong>${certs.length - valid}</strong><span>ถูกเพิกถอน</span></div>
        </div>
        <div class="cert-grid">${certs.map(({ cert, course }, i) => `
          <article class="cert-card ${cert.revoked ? "is-revoked" : ""}">
            <header>
              <span class="tag">${esc(course.category)}</span>
              <span class="pill ${cert.revoked ? "pill-bad" : "pill-ok"}">${cert.revoked ? "ถูกเพิกถอน" : "ใช้งานได้"}</span>
            </header>
            <h3>${esc(course.name)}</h3>
            <p class="mono small">${esc(cert.certId)}</p>
            <p class="muted small">ออกเมื่อ ${fmtDate(cert.issuedAt)} · ${course.durationHours} ชม.</p>
            ${cert.revoked ? `<p class="revoke-reason small">เหตุผล: ${esc(cert.revokeReason)}</p>` : ""}
            <div class="cert-card-qr" id="dq${i}"></div>
            <form class="input-row" data-i="${i}">
              <input placeholder="ชื่อตามใบรับรอง" required />
              <button class="btn btn-primary btn-sm">ดูใบรับรอง</button>
            </form>
            <div class="row-actions">
              <button class="btn btn-ghost btn-sm" data-copy="${esc(cert.certId)}">คัดลอกลิงก์ตรวจสอบ</button>
              <a class="btn btn-ghost btn-sm" href="?id=${encodeURIComponent(cert.certId)}#verify">ตรวจสอบ</a>
            </div>
          </article>`).join("")}
        </div>`;
      certs.forEach(({ cert }, i) => makeQr($(`#dq${i}`), verifyUrl(cert.certId), 84));
      $$("form[data-i]", body).forEach((f) => {
        f.onsubmit = (ev) => {
          ev.preventDefault();
          const { cert, course } = certs[Number(f.dataset.i)];
          const name = $("input", f).value;
          const match = computeDataHash(cert.certId, cert.courseCode, name) === cert.dataHash;
          openCertificate({ cert, course, name }, match
            ? "✓ ชื่อตรงกับ Hash ที่บันทึกบน Blockchain"
            : "⚠️ ชื่อไม่ตรงกับ Hash บน Blockchain — ตรวจการสะกดให้ตรงกับที่ลงทะเบียน");
        };
      });
      bindCopyButtons(body);
    } catch (e) {
      body.innerHTML = `<div class="notice warn">${errMsg(e)}</div>`;
    }
  }

  function bindCopyButtons(root) {
    $$("[data-copy]", root).forEach((b) => {
      b.onclick = async () => {
        try { await navigator.clipboard.writeText(verifyUrl(b.dataset.copy)); toast("คัดลอกลิงก์แล้ว", "ok", 2000); }
        catch { toast(verifyUrl(b.dataset.copy), "info"); }
      };
    });
  }

  // ------------------------------------------------------------------
  // Courses (shared)
  // ------------------------------------------------------------------
  async function fetchAllCourses() {
    const codes = await readContract().getCourseCodes();
    state.courses.clear();
    return Promise.all([...codes].map((code) => getCourse(code)));
  }

  async function loadCourseSelect() {
    const sel = $("#issueCourse");
    if (!getContractAddress()) return;
    try {
      const courses = await fetchAllCourses();
      const prev = sel.value;
      sel.innerHTML = `<option value="">— เลือกหลักสูตร —</option>` + courses.filter((c) => c.active)
        .map((c) => `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`).join("");
      if (prev) sel.value = prev;
      if (!courses.length) sel.innerHTML = `<option value="">ยังไม่มีหลักสูตร — ให้ผู้ดูแลระบบสร้างก่อน</option>`;
    } catch (e) {
      console.warn(e);
    }
    if (!$("#issueCertId").value) $("#issueCertId").value = genCertId();
    updateHashPreview();
    checkCertId();
  }

  async function loadCourses() {
    const list = $("#courseList");
    if (!getContractAddress()) { list.innerHTML = contractMissingHtml(); return; }
    list.innerHTML = `<div class="empty small"><span class="spinner"></span> กำลังโหลด…</div>`;
    try {
      const courses = await fetchAllCourses();
      if (!courses.length) { list.innerHTML = `<div class="empty small">ยังไม่มีหลักสูตร</div>`; return; }
      list.innerHTML = courses.map((c) => `
        <div class="course ${c.active ? "" : "inactive"}">
          <div class="course-top"><span class="tag">${esc(c.category)}</span><span class="pill ${c.active ? "pill-ok" : ""}">${c.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span></div>
          <h4>${esc(c.name)}</h4>
          <p class="mono small">${esc(c.code)} · ${c.durationHours} ชม.</p>
          <p class="muted small">${esc(c.description) || "—"}</p>
          <button class="btn btn-ghost btn-sm" data-toggle="${esc(c.code)}" data-active="${c.active}">${c.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>
        </div>`).join("");
      $$("[data-toggle]", list).forEach((b) => {
        b.onclick = () => sendTx(
          (c) => c.setCourseActive(b.dataset.toggle, b.dataset.active !== "true"),
          "อัปเดตสถานะหลักสูตรแล้ว",
          () => loadCourses()
        );
      });
    } catch (e) {
      list.innerHTML = `<div class="notice warn">${errMsg(e)}</div>`;
    }
  }

  async function loadIssuers() {
    const el = $("#issuerList");
    if (!getContractAddress()) { el.innerHTML = ""; return; }
    try {
      const c = readContract();
      const [owner, list] = await Promise.all([c.owner(), c.getIssuers()]);
      const flags = await Promise.all([...list].map((a) => c.isIssuer(a)));
      el.innerHTML = [...list].map((a, i) => `
        <div class="list-row">
          ${addrLink(a)}
          <span>${a.toLowerCase() === owner.toLowerCase() ? `<span class="pill">Admin</span>` : ""}
          <span class="pill ${flags[i] ? "pill-ok" : "pill-bad"}">${flags[i] ? "มีสิทธิ์" : "ถอนสิทธิ์แล้ว"}</span></span>
        </div>`).join("");
    } catch (e) {
      el.innerHTML = `<div class="notice warn">${errMsg(e)}</div>`;
    }
  }

  async function loadAllCerts() {
    const el = $("#allCerts");
    if (!getContractAddress()) { el.innerHTML = contractMissingHtml(); return; }
    el.innerHTML = `<div class="empty small"><span class="spinner"></span> กำลังโหลด…</div>`;
    try {
      const c = readContract();
      const ids = [...(await c.getAllCertificateIds())].reverse().slice(0, 30);
      if (!ids.length) { el.innerHTML = `<div class="empty small">ยังไม่มีใบรับรอง</div>`; return; }
      const certs = await Promise.all(ids.map(async (id) => certFromResult(await c.getCertificate(id))));
      el.innerHTML = certs.map((x) => `
        <div class="list-row">
          <div>
            <a href="?id=${encodeURIComponent(x.certId)}#verify" class="mono">${esc(x.certId)}</a>
            <div class="muted small">${esc(x.courseCode)} · ${short(x.recipient)} · ${fmtDate(x.issuedAt)}</div>
          </div>
          <span class="list-actions">
            <span class="pill ${x.revoked ? "pill-bad" : "pill-ok"}">${x.revoked ? "เพิกถอน" : "ใช้งานได้"}</span>
            ${x.revoked ? "" : `<button class="btn btn-ghost btn-sm" data-revoke="${esc(x.certId)}" title="เพิกถอน">⦸</button>`}
          </span>
        </div>`).join("");
      $$("[data-revoke]", el).forEach((b) => {
        b.onclick = () => { $("#revokeId").value = b.dataset.revoke; $("#revokeReason").focus(); };
      });
    } catch (e) {
      el.innerHTML = `<div class="notice warn">${errMsg(e)}</div>`;
    }
  }

  // ------------------------------------------------------------------
  // Transactions
  // ------------------------------------------------------------------
  async function sendTx(fn, successMsg, after) {
    let pending;
    try {
      const c = await writeContract();
      pending = toast(`<span class="spinner"></span> รอยืนยันใน MetaMask…`, "info", 120000);
      const tx = await fn(c);
      pending.innerHTML = `<span class="spinner"></span> ส่งธุรกรรมแล้ว รอบันทึกบน Blockchain… ${txLink(tx.hash)}`;
      const receipt = await tx.wait();
      pending.remove();
      toast(`✓ ${successMsg} · ${txLink(receipt.hash)}`, "ok", 8000);
      if (after) await after(receipt);
      return receipt;
    } catch (e) {
      pending?.remove();
      toast(errMsg(e), "error", 8000);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // 2) + 3) Issue
  // ------------------------------------------------------------------
  function issueFormData() {
    return {
      certId: $("#issueCertId").value.trim(),
      courseCode: $("#issueCourse").value,
      name: $("#issueName").value.trim(),
      wallet: $("#issueWallet").value.trim()
    };
  }

  function updateHashPreview() {
    const d = issueFormData();
    const el = $("#hashPreview");
    if (!d.certId || !d.courseCode || !d.name) {
      el.innerHTML = `<span class="muted small">Hash จะแสดงเมื่อกรอกหลักสูตร รหัส และชื่อครบ</span>`;
      return;
    }
    el.innerHTML = `
      <div><span>dataHash</span><code>${computeDataHash(d.certId, d.courseCode, d.name)}</code></div>
      <div><span>fileHash</span><code>${state.issueFileHash || "— (ไม่แนบไฟล์)"}</code></div>`;
  }

  let idTimer;
  function checkCertId() {
    clearTimeout(idTimer);
    const hint = $("#certIdHint");
    const id = $("#issueCertId").value.trim();
    if (!id || !getContractAddress()) { hint.textContent = ""; return; }
    idTimer = setTimeout(async () => {
      try {
        const used = await readContract().certificateExists(id);
        hint.textContent = used ? "✕ รหัสนี้ถูกใช้แล้ว" : "✓ รหัสนี้ใช้ได้";
        hint.className = `hint ${used ? "bad" : "ok"}`;
      } catch { hint.textContent = ""; }
    }, 400);
  }

  async function previewCertificate() {
    const d = issueFormData();
    if (!d.courseCode || !d.name || !d.certId) { toast("กรอกหลักสูตร รหัส และชื่อผู้รับก่อน", "error"); return; }
    try {
      const course = await getCourse(d.courseCode);
      openCertificate({
        cert: { certId: d.certId, courseCode: d.courseCode, issuedAt: new Date(), recipient: d.wallet,
          dataHash: computeDataHash(d.certId, d.courseCode, d.name), revoked: false },
        course, name: d.name
      }, "ตัวอย่าง — กด “พิมพ์ / บันทึก PDF” แล้วนำไฟล์มาแนบก่อนออกใบรับรอง");
    } catch (e) { toast(errMsg(e), "error"); }
  }

  async function submitIssue(ev) {
    ev.preventDefault();
    const d = issueFormData();
    if (!ethers.isAddress(d.wallet)) { toast("Wallet ผู้รับไม่ถูกต้อง", "error"); return; }
    if (!d.courseCode) { toast("กรุณาเลือกหลักสูตร", "error"); return; }
    const recipient = ethers.getAddress(d.wallet);
    const dataHash = computeDataHash(d.certId, d.courseCode, d.name);
    const fileHash = state.issueFileHash || ZERO_HASH;
    await sendTx(
      (c) => c.issueCertificate(d.certId, d.courseCode, recipient, dataHash, fileHash),
      `ออกใบรับรอง ${esc(d.certId)} แล้ว`,
      async () => {
        const c = readContract();
        const cert = certFromResult(await c.getCertificate(d.certId));
        const course = await getCourse(d.courseCode);
        openCertificate({ cert, course, name: d.name }, "ออกใบรับรองสำเร็จ — พิมพ์หรือบันทึกเป็น PDF ส่งให้ผู้เข้าอบรม");
        $("#issueForm").reset();
        state.issueFileHash = null;
        $("#fileHint").textContent = "ยังไม่ได้แนบไฟล์";
        $("#issueCertId").value = genCertId();
        $("#issueCourse").value = d.courseCode;
        updateHashPreview();
        checkCertId();
        loadAllCerts();
      }
    );
  }

  // ------------------------------------------------------------------
  // Certificate rendering / print
  // ------------------------------------------------------------------
  function openCertificate({ cert, course, name }, note) {
    const issued = cert.issuedAt instanceof Date ? cert.issuedAt : toDate(cert.issuedAt);
    $("#modalNote").innerHTML = esc(note || "");
    $("#certPrint").innerHTML = `
      <div class="certificate ${cert.revoked ? "revoked" : ""}">
        <div class="cert-border">
          ${cert.revoked ? `<div class="cert-stamp">REVOKED · ถูกเพิกถอน</div>` : ""}
          <div class="cert-head">
            <div class="cert-logo">
              <svg viewBox="0 0 32 32"><path d="M16 2 4 7v8c0 7.2 5.1 13.4 12 15 6.9-1.6 12-7.8 12-15V7L16 2Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="m10.5 16 4 4 7-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>${esc(CFG.ORG_NAME)}</span>
            </div>
            <span class="cert-cat">${esc(course.category)}</span>
          </div>
          <p class="cert-kicker">Certificate of Completion</p>
          <h2 class="cert-title">ใบรับรองการผ่านการอบรม</h2>
          <p class="cert-sub">ขอมอบใบรับรองฉบับนี้เพื่อแสดงว่า</p>
          <p class="cert-name">${esc(name)}</p>
          <p class="cert-sub">ได้ผ่านการอบรมหลักสูตร</p>
          <p class="cert-course">${esc(course.name)}</p>
          <p class="cert-meta">รหัสหลักสูตร ${esc(course.code)} · ระยะเวลา ${course.durationHours} ชั่วโมง</p>
          <div class="cert-foot">
            <div class="cert-sign">
              <div class="sig-line"></div>
              <p>ผู้อำนวยการฝ่ายฝึกอบรม<br />${esc(CFG.ORG_NAME)}</p>
            </div>
            <div class="cert-info">
              <p><span>วันที่ออก</span>${fmtDate(issued)}<br /><small>${fmtDateEn(issued)}</small></p>
              <p><span>Certificate ID</span><b class="mono">${esc(cert.certId)}</b></p>
              <p><span>Blockchain Proof</span><b class="mono">${shortHash(cert.dataHash)}</b></p>
            </div>
            <div class="cert-qr">
              <div id="certQr"></div>
              <small>สแกนเพื่อตรวจสอบ</small>
            </div>
          </div>
          <p class="cert-verify">ตรวจสอบความถูกต้องได้ที่ ${esc(location.host + location.pathname)} · บันทึกบน ${esc(CFG.CHAIN_NAME)}</p>
        </div>
      </div>`;
    makeQr($("#certQr"), verifyUrl(cert.certId), 104);
    $("#certModal").classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    $("#certModal").classList.add("hidden");
    document.body.classList.remove("modal-open");
  }

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------
  async function renderSettings() {
    $("#setAddress").value = getContractAddress();
    const el = $("#netInfo");
    const addr = getContractAddress();
    el.innerHTML = `
      <dt>เครือข่าย</dt><dd>${esc(CFG.CHAIN_NAME)} (Chain ID ${CFG.CHAIN_ID})</dd>
      <dt>RPC</dt><dd class="mono small">${esc(CFG.RPC_URLS[0])}</dd>
      <dt>ที่มาของ Address</dt><dd>${localStorage.getItem(LS_KEY) ? "ตั้งค่าในเบราว์เซอร์นี้" : CFG.CONTRACT_ADDRESS ? "js/config.js" : "ยังไม่ได้ตั้งค่า"}</dd>
      <dt>สถานะสัญญา</dt><dd id="codeStatus">${addr ? `<span class="spinner"></span>` : "—"}</dd>`;
    if (!addr) return;
    try {
      const code = await getReadProvider().getCode(addr);
      if (code === "0x") { $("#codeStatus").innerHTML = `<span class="pill pill-bad">ไม่พบ Smart Contract ที่ Address นี้</span>`; return; }
      const c = readContract();
      const [owner, total] = await Promise.all([c.owner(), c.totalCertificates()]);
      $("#codeStatus").innerHTML = `<span class="pill pill-ok">เชื่อมต่อได้</span> Admin ${addrLink(owner)} · ใบรับรอง ${total} ใบ · ${addrLink(addr)}`;
    } catch (e) {
      $("#codeStatus").innerHTML = `<span class="pill pill-bad">${errMsg(e)}</span>`;
    }
  }

  async function onContractChanged() {
    state.courses.clear();
    await refreshRoles();
    updateWalletUI();
    renderSettings();
  }

  // ------------------------------------------------------------------
  // Bindings
  // ------------------------------------------------------------------
  function bind() {
    window.addEventListener("hashchange", () => showTab(currentTab()));
    $("#connectBtn").onclick = () => { if (state.account) location.hash = "#dashboard"; else connectWallet(); };

    $("#verifyForm").onsubmit = (ev) => { ev.preventDefault(); verify($("#verifyId").value); };
    $("#scanBtn").onclick = toggleScanner;
    $("#qrImage").onchange = (ev) => { scanImage(ev.target.files[0]); ev.target.value = ""; };
    $("#pdfVerify").onchange = (ev) => { verifyByPdf(ev.target.files[0]); ev.target.value = ""; };

    $("#refreshDash").onclick = loadDashboard;
    $("#refreshAll").onclick = loadAllCerts;
    $("#refreshCourses").onclick = loadCourses;

    // Issue form
    $("#genIdBtn").onclick = () => { $("#issueCertId").value = genCertId(); updateHashPreview(); checkCertId(); };
    ["#issueCertId", "#issueName", "#issueCourse"].forEach((s) => $(s).addEventListener("input", updateHashPreview));
    $("#issueCourse").addEventListener("change", updateHashPreview);
    $("#issueCertId").addEventListener("input", checkCertId);
    $("#issueFile").onchange = async (ev) => {
      const f = ev.target.files[0];
      state.issueFileHash = f ? await computeFileHash(f) : null;
      $("#fileHint").textContent = f ? `แนบแล้ว: ${f.name} (${(f.size / 1024).toFixed(1)} KB)` : "ยังไม่ได้แนบไฟล์";
      updateHashPreview();
    };
    $("#previewBtn").onclick = previewCertificate;
    $("#issueForm").onsubmit = submitIssue;

    // Revoke
    $("#revokeForm").onsubmit = (ev) => {
      ev.preventDefault();
      const id = $("#revokeId").value.trim();
      const reason = $("#revokeReason").value.trim();
      if (!window.confirm(`ยืนยันเพิกถอนใบรับรอง ${id}?\nเหตุผล: ${reason}`)) return;
      sendTx((c) => c.revokeCertificate(id, reason), `เพิกถอน ${esc(id)} แล้ว`, () => { $("#revokeForm").reset(); loadAllCerts(); });
    };

    // Admin: course
    $("#courseForm").onsubmit = (ev) => {
      ev.preventDefault();
      const code = $("#cCode").value.trim().toUpperCase();
      const hours = BigInt(Math.max(0, parseInt($("#cHours").value || "0", 10)));
      sendTx(
        (c) => c.createCourse(code, $("#cName").value.trim(), $("#cCategory").value, $("#cDesc").value.trim(), hours),
        `สร้างหลักสูตร ${esc(code)} แล้ว`,
        () => { $("#courseForm").reset(); loadCourses(); }
      );
    };

    // Admin: issuer
    const issuerTx = (allowed) => {
      const a = $("#issuerAddr").value.trim();
      if (!ethers.isAddress(a)) { toast("Address ไม่ถูกต้อง", "error"); return; }
      sendTx((c) => c.setIssuer(ethers.getAddress(a), allowed), allowed ? "ให้สิทธิ์ Issuer แล้ว" : "ถอนสิทธิ์ Issuer แล้ว",
        async () => { $("#issuerAddr").value = ""; await refreshRoles(); updateWalletUI(); loadIssuers(); });
    };
    $("#issuerForm").onsubmit = (ev) => { ev.preventDefault(); issuerTx(true); };
    $("#removeIssuerBtn").onclick = () => issuerTx(false);

    // Settings
    $("#settingsForm").onsubmit = (ev) => {
      ev.preventDefault();
      const a = $("#setAddress").value.trim();
      if (!ethers.isAddress(a)) { toast("Contract Address ไม่ถูกต้อง", "error"); return; }
      localStorage.setItem(LS_KEY, ethers.getAddress(a));
      toast("บันทึก Contract Address แล้ว", "ok", 2500);
      onContractChanged();
    };
    $("#resetAddress").onclick = () => { localStorage.removeItem(LS_KEY); toast("ใช้ค่าจาก config.js", "ok", 2500); onContractChanged(); };

    // Modal
    $$("[data-close]").forEach((b) => (b.onclick = closeModal));
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeModal());
    $("#printBtn").onclick = () => window.print();

    // Wallet events
    if (window.ethereum) {
      window.ethereum.on?.("accountsChanged", (accs) => {
        if (!accs.length) {
          Object.assign(state, { signer: null, account: null, isOwner: false, isIssuer: false });
          updateWalletUI();
          onTabShown(currentTab());
        } else setupWallet(false);
      });
      window.ethereum.on?.("chainChanged", () => location.reload());
    }
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  function init() {
    if (typeof ethers === "undefined") {
      document.body.insertAdjacentHTML("afterbegin", `<div class="notice warn">โหลดไลบรารี ethers.js ไม่สำเร็จ — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต</div>`);
      return;
    }
    bind();
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    if (id && currentTab() !== "verify") location.hash = "#verify";
    showTab(currentTab());
    if (id) verify(id);
    setupWallet(false);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
