# SkillTrust Academy — Blockchain Digital Certificate Verification System

ระบบออกและตรวจสอบใบรับรองดิจิทัลด้วย Ethereum Smart Contract (โจทย์ที่ 3)
เว็บ DApp เชื่อมต่อ MetaMask โดยตรง บนเครือข่าย **Ethereum Hoodi Testnet**

## ฟังก์ชันตามโจทย์

| # | Requirement | ใน Smart Contract | บนเว็บ |
|---|---|---|---|
| 1 | Create Training Course | `createCourse`, `setCourseActive` (Admin) | แท็บ **ผู้ดูแลระบบ** |
| 2 | Issue Certificate | `issueCertificate` (Issuer) — รหัสไม่ซ้ำ, วันที่ออก = block timestamp, Wallet ผู้รับ | แท็บ **ออก / เพิกถอน** |
| 3 | Store Certificate Hash | `dataHash` + `fileHash` (keccak256) | คำนวณ Hash ในเบราว์เซอร์ก่อนส่ง |
| 4 | Verify Certificate | `certificateExists`, `getCertificate`, `verifyCertificate`, `findByFileHash` | แท็บ **ตรวจสอบใบรับรอง** — ค้นด้วยรหัส / สแกน QR / อัปโหลด PDF (ไม่ต้องมี Wallet) |
| 5 | Revoke Certificate | `revokeCertificate` — เก็บเหตุผลและเวลา ประวัติไม่ถูกลบ | แท็บ **ออก / เพิกถอน** |
| 6 | Certificate Dashboard | `getCertificatesOf(address)` | แท็บ **ใบรับรองของฉัน** |

### กฎทางธุรกิจ
- **รหัสไม่ซ้ำ** — `require(!certExists[...], "Certificate ID already exists")`
- **เฉพาะผู้ได้รับสิทธิ์** — `onlyOwner` (Admin) สร้างหลักสูตร/ให้สิทธิ์, `onlyIssuer` ออก/เพิกถอน
- **ไม่เก็บข้อมูลส่วนบุคคลบน Blockchain** — ชื่อผู้รับไม่ถูกส่งขึ้น chain เก็บเพียง
  `dataHash = keccak256("certId|courseCode|ชื่อ (ตัดช่องว่างเกิน, ตัวพิมพ์เล็ก)")`
  ผู้ตรวจสอบต้องรู้ชื่อบนใบรับรองจึงยืนยันได้ และ `certId` ทำหน้าที่เป็น salt ต่อใบ

## โครงสร้างไฟล์

```
contracts/SkillTrustCertificates.sol   Smart Contract
index.html                             หน้าเว็บ (Single Page)
css/style.css                          สไตล์ + รูปแบบใบรับรองสำหรับพิมพ์ A4
js/config.js                           Contract Address / เครือข่าย
js/abi.js                              ABI
js/app.js                              ตรรกะ DApp (ethers v6)
```

## วิธี Deploy Smart Contract

1. เปิด [Remix](https://remix.ethereum.org) สร้างไฟล์ `SkillTrustCertificates.sol` แล้ววางโค้ดจาก `contracts/`
2. Compile ด้วย Solidity **0.8.20** ขึ้นไป
3. แท็บ *Deploy & Run* → Environment: **Injected Provider – MetaMask** (เลือกเครือข่าย Hoodi, Chain ID 560048)
4. กด **Deploy** — บัญชีที่ deploy จะเป็น Admin และ Issuer คนแรก
5. คัดลอก Contract Address ใส่ใน `js/config.js` (`CONTRACT_ADDRESS`) แล้ว commit
   หรือกรอกในแท็บ **ตั้งค่า** บนเว็บ (จำไว้เฉพาะเบราว์เซอร์นั้น)

## ลำดับการใช้งาน (Demo)

1. **Admin** เชื่อมต่อ MetaMask → แท็บ *ผู้ดูแลระบบ* → สร้างหลักสูตร เช่น `AI-101`
2. (ถ้ามี) ให้สิทธิ์ Issuer กับ Wallet อื่น
3. **Issuer** → แท็บ *ออก / เพิกถอน* → เลือกหลักสูตร, กรอกชื่อ + Wallet ผู้รับ
   → *ดูตัวอย่าง / พิมพ์* → บันทึกเป็น PDF → แนบ PDF → *ออกใบรับรอง*
4. **ผู้เข้าอบรม** เชื่อมต่อ Wallet → แท็บ *ใบรับรองของฉัน* เห็นใบรับรองทั้งหมด + QR Code
5. **ผู้ว่าจ้าง** เปิดลิงก์/สแกน QR → เห็นสถานะ *ใช้งานได้ / ถูกเพิกถอน* → ยืนยันชื่อหรือไฟล์ PDF
6. **Issuer** เพิกถอนใบรับรอง → ผลตรวจสอบเปลี่ยนเป็น *ถูกเพิกถอน* พร้อมเหตุผล

## เทคโนโลยี
Solidity 0.8 · ethers.js v6 · MetaMask · qrcodejs · html5-qrcode · GitHub Pages
