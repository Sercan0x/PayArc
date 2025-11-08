import { useEffect, useState, useCallback } from "react";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const ARC_RPC = process.env.NEXT_PUBLIC_ARC_RPC;
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

const CONTRACT_ABI = [
  "function owner() view returns (address)",
  "function createInvoice(string id, uint256 amount)",
  "function getInvoice(string id) view returns (uint256 amount, address issuer, bool paid, address payer, uint256 paidAt)",
  "function payInvoice(string id)",
  "function withdraw()"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

export default function App() {
  const [connectedAddress, setConnectedAddress] = useState(null);
  const [ownerAddress, setOwnerAddress] = useState(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [queryId, setQueryId] = useState("");
  const [invoiceData, setInvoiceData] = useState(null);
  const [amountToCreate, setAmountToCreate] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalMessage, setModalMessage] = useState(null);

  // Load Ethers.js and Lucide from CDN
  useEffect(() => {
    if (!document.getElementById("ethers-script")) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/ethers@6.11.1/dist/ethers.umd.min.js";
      script.id = "ethers-script";
      document.head.appendChild(script);
    }
    if (!document.getElementById("lucide-script")) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/lucide@latest";
      script.id = "lucide-script";
      document.head.appendChild(script);
    }
  }, []);

  const getEthers = () => {
    if (typeof window !== "undefined" && window.ethers) return window.ethers;
    return null;
  };

  const showModal = (msg) => setModalMessage(msg);
  const hideModal = () => setModalMessage(null);

  // Wallet connect
  async function connectWallet() {
    const ethers = getEthers();
    if (!ethers || !window.ethereum) return showModal("MetaMask required.");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      setConnectedAddress(await signer.getAddress());
    } catch {
      showModal("Failed to connect wallet.");
    }
  }

  // Fetch owner
  useEffect(() => {
    async function loadOwner() {
      const ethers = getEthers();
      if (!ethers || !CONTRACT_ADDRESS || !ARC_RPC) return;
      const provider = new ethers.JsonRpcProvider(ARC_RPC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      try {
        const owner = await contract.owner();
        setOwnerAddress(owner);
      } catch {}
    }
    const t = setTimeout(loadOwner, 500);
    return () => clearTimeout(t);
  }, []);

  // Minimal CSS
  const cardStyle = {
    background: "#1f1f2e",
    borderRadius: "20px",
    padding: "20px",
    marginBottom: "20px",
    color: "white",
  };

  return (
    <div style={{ fontFamily: "sans-serif", minHeight: "100vh", background: "#111", padding: "20px" }}>
      <h1 style={{ textAlign: "center", fontSize: "2.5rem", marginBottom: "40px", background: "linear-gradient(90deg,#4f46e5,#ec4899)", WebkitBackgroundClip: "text", color: "transparent" }}>
        PayArc Invoice System
      </h1>

      <div style={cardStyle}>
        {!connectedAddress ? (
          <button onClick={connectWallet} style={{ padding: "10px 20px", borderRadius: "12px", background: "#4f46e5", color: "white", fontWeight: "bold" }}>
            Connect Wallet
          </button>
        ) : (
          <p>Connected: {connectedAddress}</p>
        )}
        <p>Owner: {ownerAddress || "Loading..."}</p>
      </div>

      {modalMessage && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ background: "#222", padding: "30px", borderRadius: "20px", maxWidth: "400px", textAlign: "center" }}>
            <p>{modalMessage}</p>
            <button onClick={hideModal} style={{ marginTop: "20px", padding: "10px 20px", borderRadius: "12px", background: "#4f46e5", color: "white" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
