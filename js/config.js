// ===============================================================
//  การตั้งค่าระบบ — แก้ CONTRACT_ADDRESS หลัง deploy Smart Contract
//  (หรือกรอกในแท็บ "ตั้งค่า" บนเว็บก็ได้ ระบบจะจำไว้ในเบราว์เซอร์)
// ===============================================================
window.APP_CONFIG = {
  CONTRACT_ADDRESS: "0x8D0ea6aD0877D48560a36f07F0dBAB14E8ceF920",

  // Ethereum Hoodi Testnet
  CHAIN_ID: 560048,
  CHAIN_ID_HEX: "0x88bb0",
  CHAIN_NAME: "Ethereum Hoodi Testnet",
  RPC_URLS: [
    "https://ethereum-hoodi-rpc.publicnode.com",
    "https://rpc.hoodi.ethpandaops.io"
  ],
  EXPLORER: "https://hoodi.etherscan.io",
  NATIVE_CURRENCY: { name: "Hoodi Ether", symbol: "ETH", decimals: 18 },

  ORG_NAME: "SkillTrust Academy"
};
