// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  SkillTrust Academy — Blockchain Digital Certificate Verification System
 * @notice ระบบออกและตรวจสอบใบรับรองดิจิทัล (โจทย์ที่ 3)
 *
 *  - ไม่เก็บข้อมูลส่วนบุคคล (ชื่อ-นามสกุล) บน Public Blockchain
 *    เก็บเพียง dataHash = keccak256("certId|courseCode|ชื่อผู้รับ (normalized)")
 *    และ fileHash = keccak256(ไฟล์ PDF ของใบรับรอง) (ถ้ามี)
 *  - รหัสใบรับรองต้องไม่ซ้ำกัน
 *  - เฉพาะผู้ได้รับสิทธิ์ (Issuer) เท่านั้นที่ออก/เพิกถอนใบรับรองได้
 *  - การเพิกถอนไม่ลบข้อมูล — ประวัติการออกยังคงอยู่
 */
contract SkillTrustCertificates {
    // ------------------------------------------------------------------
    // Data structures
    // ------------------------------------------------------------------
    struct Course {
        string code;
        string name;
        string category;
        string description;
        uint256 durationHours;
        bool active;
        uint256 createdAt;
    }

    struct Certificate {
        string certId;
        string courseCode;
        address recipient;
        bytes32 dataHash;
        bytes32 fileHash;
        address issuer;
        uint256 issuedAt;
        bool revoked;
        uint256 revokedAt;
        string revokeReason;
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------
    address public owner; // ผู้ดูแลระบบ (Admin)

    mapping(address => bool) public isIssuer;
    mapping(address => bool) private knownIssuer;
    address[] private issuerList;

    mapping(bytes32 => Course) private courses;
    mapping(bytes32 => bool) private courseExists;
    string[] private courseCodes;

    mapping(bytes32 => Certificate) private certificates;
    mapping(bytes32 => bool) private certExists;
    string[] private certIds;
    mapping(address => string[]) private certsOfRecipient;
    mapping(bytes32 => string) private certIdByFileHash;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event IssuerUpdated(address indexed account, bool allowed);
    event CourseCreated(string code, string name, address indexed by);
    event CourseStatusChanged(string code, bool active);
    event CertificateIssued(
        string certId,
        string courseCode,
        address indexed recipient,
        address indexed issuer,
        bytes32 dataHash
    );
    event CertificateRevoked(string certId, address indexed by, string reason);

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------
    modifier onlyOwner() {
        require(msg.sender == owner, "Only admin");
        _;
    }

    modifier onlyIssuer() {
        require(isIssuer[msg.sender], "Not an authorized issuer");
        _;
    }

    constructor() {
        owner = msg.sender;
        _setIssuer(msg.sender, true);
    }

    // ------------------------------------------------------------------
    // Admin & roles
    // ------------------------------------------------------------------
    function setIssuer(address account, bool allowed) external onlyOwner {
        require(account != address(0), "Invalid address");
        if (!allowed) {
            require(account != owner, "Cannot remove admin");
        }
        _setIssuer(account, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
        _setIssuer(newOwner, true);
    }

    function _setIssuer(address account, bool allowed) private {
        if (!knownIssuer[account]) {
            knownIssuer[account] = true;
            issuerList.push(account);
        }
        isIssuer[account] = allowed;
        emit IssuerUpdated(account, allowed);
    }

    // ------------------------------------------------------------------
    // 1) Create Training Course
    // ------------------------------------------------------------------
    function createCourse(
        string calldata code,
        string calldata name,
        string calldata category,
        string calldata description,
        uint256 durationHours
    ) external onlyOwner {
        require(bytes(code).length > 0 && bytes(code).length <= 32, "Invalid course code");
        require(bytes(name).length > 0, "Course name required");
        bytes32 k = _key(code);
        require(!courseExists[k], "Course code already exists");

        Course storage c = courses[k];
        c.code = code;
        c.name = name;
        c.category = category;
        c.description = description;
        c.durationHours = durationHours;
        c.active = true;
        c.createdAt = block.timestamp;

        courseExists[k] = true;
        courseCodes.push(code);
        emit CourseCreated(code, name, msg.sender);
    }

    function setCourseActive(string calldata code, bool active) external onlyOwner {
        bytes32 k = _key(code);
        require(courseExists[k], "Course not found");
        courses[k].active = active;
        emit CourseStatusChanged(code, active);
    }

    // ------------------------------------------------------------------
    // 2) Issue Certificate  +  3) Store Certificate Hash
    // ------------------------------------------------------------------
    function issueCertificate(
        string calldata certId,
        string calldata courseCode,
        address recipient,
        bytes32 dataHash,
        bytes32 fileHash
    ) external onlyIssuer {
        require(bytes(certId).length > 0 && bytes(certId).length <= 64, "Invalid certificate ID");
        bytes32 ck = _key(certId);
        require(!certExists[ck], "Certificate ID already exists");

        bytes32 courseKey = _key(courseCode);
        require(courseExists[courseKey], "Course not found");
        require(courses[courseKey].active, "Course is inactive");
        require(recipient != address(0), "Invalid recipient");
        require(dataHash != bytes32(0), "Data hash required");

        if (fileHash != bytes32(0)) {
            require(bytes(certIdByFileHash[fileHash]).length == 0, "File hash already used");
            certIdByFileHash[fileHash] = certId;
        }

        Certificate storage c = certificates[ck];
        c.certId = certId;
        c.courseCode = courseCode;
        c.recipient = recipient;
        c.dataHash = dataHash;
        c.fileHash = fileHash;
        c.issuer = msg.sender;
        c.issuedAt = block.timestamp;

        certExists[ck] = true;
        certIds.push(certId);
        certsOfRecipient[recipient].push(certId);

        emit CertificateIssued(certId, courseCode, recipient, msg.sender, dataHash);
    }

    // ------------------------------------------------------------------
    // 5) Revoke Certificate (ประวัติยังคงอยู่)
    // ------------------------------------------------------------------
    function revokeCertificate(string calldata certId, string calldata reason) external onlyIssuer {
        bytes32 ck = _key(certId);
        require(certExists[ck], "Certificate not found");
        require(bytes(reason).length > 0, "Reason required");
        Certificate storage c = certificates[ck];
        require(!c.revoked, "Already revoked");

        c.revoked = true;
        c.revokedAt = block.timestamp;
        c.revokeReason = reason;
        emit CertificateRevoked(certId, msg.sender, reason);
    }

    // ------------------------------------------------------------------
    // 4) Verify Certificate
    // ------------------------------------------------------------------
    function certificateExists(string calldata certId) external view returns (bool) {
        return certExists[_key(certId)];
    }

    /// @return status 0 = ไม่พบ, 1 = ใช้งานได้ (Valid), 2 = ถูกเพิกถอน (Revoked)
    function verifyCertificate(string calldata certId) external view returns (uint8 status) {
        bytes32 ck = _key(certId);
        if (!certExists[ck]) return 0;
        return certificates[ck].revoked ? 2 : 1;
    }

    function getCertificate(string calldata certId) external view returns (Certificate memory) {
        bytes32 ck = _key(certId);
        require(certExists[ck], "Certificate not found");
        return certificates[ck];
    }

    function checkDataHash(string calldata certId, bytes32 dataHash) external view returns (bool) {
        bytes32 ck = _key(certId);
        return certExists[ck] && certificates[ck].dataHash == dataHash;
    }

    function findByFileHash(bytes32 fileHash) external view returns (string memory) {
        return certIdByFileHash[fileHash];
    }

    // ------------------------------------------------------------------
    // 6) Certificate Dashboard
    // ------------------------------------------------------------------
    function getCertificatesOf(address recipient) external view returns (string[] memory) {
        return certsOfRecipient[recipient];
    }

    // ------------------------------------------------------------------
    // Other views
    // ------------------------------------------------------------------
    function getCourse(string calldata code) external view returns (Course memory) {
        bytes32 k = _key(code);
        require(courseExists[k], "Course not found");
        return courses[k];
    }

    function getCourseCodes() external view returns (string[] memory) {
        return courseCodes;
    }

    function getAllCertificateIds() external view returns (string[] memory) {
        return certIds;
    }

    function getIssuers() external view returns (address[] memory) {
        return issuerList;
    }

    function totalCertificates() external view returns (uint256) {
        return certIds.length;
    }

    function _key(string memory s) private pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
