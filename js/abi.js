// ABI ของ contracts/SkillTrustCertificates.sol (human-readable format ของ ethers v6)
window.CERT_ABI = [
  "function owner() view returns (address)",
  "function isIssuer(address) view returns (bool)",
  "function setIssuer(address account, bool allowed)",
  "function transferOwnership(address newOwner)",

  "function createCourse(string code, string name, string category, string description, uint256 durationHours)",
  "function setCourseActive(string code, bool active)",
  "function getCourse(string code) view returns (tuple(string code, string name, string category, string description, uint256 durationHours, bool active, uint256 createdAt))",
  "function getCourseCodes() view returns (string[])",

  "function issueCertificate(string certId, string courseCode, address recipient, bytes32 dataHash, bytes32 fileHash)",
  "function revokeCertificate(string certId, string reason)",
  "function certificateExists(string certId) view returns (bool)",
  "function verifyCertificate(string certId) view returns (uint8 status)",
  "function getCertificate(string certId) view returns (tuple(string certId, string courseCode, address recipient, bytes32 dataHash, bytes32 fileHash, address issuer, uint256 issuedAt, bool revoked, uint256 revokedAt, string revokeReason))",
  "function checkDataHash(string certId, bytes32 dataHash) view returns (bool)",
  "function findByFileHash(bytes32 fileHash) view returns (string)",
  "function getCertificatesOf(address recipient) view returns (string[])",
  "function getAllCertificateIds() view returns (string[])",
  "function getIssuers() view returns (address[])",
  "function totalCertificates() view returns (uint256)",

  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event IssuerUpdated(address indexed account, bool allowed)",
  "event CourseCreated(string code, string name, address indexed by)",
  "event CourseStatusChanged(string code, bool active)",
  "event CertificateIssued(string certId, string courseCode, address indexed recipient, address indexed issuer, bytes32 dataHash)",
  "event CertificateRevoked(string certId, address indexed by, string reason)"
];
