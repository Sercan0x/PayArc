import { useEffect, useState } from "react";

const loadIcons = () => {
  if (!document.getElementById('lucide-script')) {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/lucide@latest";
    script.id = 'lucide-script';
    document.head.appendChild(script);
  }
};

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const ARC_RPC = process.env.NEXT_PUBLIC_ARC_RPC;

const CONTRACT_ABI = [
  "function owner() view returns (address)",
  "function getInvoice(string id) view returns (uint256 amount, address issuer, bool paid, address payer, uint256 paidAt)"
];

const getEthers = () => {
  if (typeof window !== 'undefined' && window.ethers) return window.ethers;
  console.error("Ethers library is not loaded.");
  return null;
};

export default function App() {
  const [connectedAddress, setConnectedAddress] = useState(null);
  const [ownerAddress, setOwnerAddress] = useState(null);
  const [queryId, setQueryId] = useState("");
  const [invoiceData, setInvoiceData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadIcons();
    if (!document.getElementById('ethers-script')) {
      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/npm/ethers@6.11.1/dist/ethers.umd.min.js";
      script.id = 'ethers-script';
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const loadOwner = async () => {
      const ethers = getEthers();
      if (!ethers || !CONTRACT_ADDRESS || !ARC_RPC) return;
      try {
        const provider = new ethers.JsonRpcProvider(ARC_RPC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const owner = await contract.owner();
        setOwnerAddress(owner);
      } catch (err) {
        console.error("Error loading owner:", err);
      }
    };
    loadOwner();
  }, []);

  async function connectWallet() {
    const ethers = getEthers();
    if (!ethers || !window.ethereum) return alert("MetaMask required.");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      setConnectedAddress(signerAddress);
    } catch (error) {
      console.error("Connection error:", error);
      alert("Failed to connect wallet.");
    }
  }

  const queryInvoice = async () => {
    const ethers = getEthers();
    if (!ethers || !queryId) return alert("Please provide invoice ID.");
    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const res = await contract.getInvoice(queryId);
      setInvoiceData({
        amount: res[0],
        issuer: res[1],
        paid: res[2],
        payer: res[3],
        paidAt: res[4]
      });
    } catch (err) {
      console.error(err);
      alert("Error querying invoice: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#a0d8f1", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: "sans-serif", gap: "20px", padding: "20px" }}>
      <h1 style={{ fontSize: "2.5rem", color: "#1a202c", marginBottom: "20px" }}>PayArc</h1>

      <p style={{ color: "#1a202c" }}>Owner: {ownerAddress || "Loading..."}</p>

      {!connectedAddress ? (
        <button onClick={connectWallet} style={{ padding: "10px 20px", borderRadius: "12px", background: "#4f46e5", color: "white", fontWeight: "bold" }}>
          Connect Wallet
        </button>
      ) : (
        <p style={{ color: "#1a202c" }}>Connected: {connectedAddress}</p>
      )}

      <input
        placeholder="Invoice ID"
        value={queryId}
        onChange={(e) => setQueryId(e.target.value)}
        style={{ padding: "10px", borderRadius: "8px", border: "1px solid #333", width: "200px", textAlign: "center" }}
      />

      <div style={{ display: "flex", gap: "10px" }}>
        <button onClick={queryInvoice} disabled={loading || !queryId} style={{ padding: "10px 20px", borderRadius: "12px", background: "#10b981", color: "white", fontWeight: "bold" }}>
          {loading ? "Querying..." : "Query"}
        </button>
        <button disabled style={{ padding: "10px 20px", borderRadius: "12px", background: "#f59e0b", color: "white", fontWeight: "bold" }}>
          Pay
        </button>
      </div>

      {invoiceData && (
        <div style={{ marginTop: "20px", background: "#ffffffaa", padding: "15px", borderRadius: "12px", minWidth: "250px", textAlign: "center" }}>
          <p>Amount: {invoiceData.amount}</p>
          <p>Issuer: {invoiceData.issuer}</p>
          <p>Payer: {invoiceData.payer || "-"}</p>
          <p>Status: {invoiceData.paid ? "Paid" : "Not Paid"}</p>
          <p>Payment Date: {invoiceData.paidAt ? new Date(Number(invoiceData.paidAt) * 1000).toLocaleString() : "-"}</p>
        </div>
      )}
    </div>
  );
}
