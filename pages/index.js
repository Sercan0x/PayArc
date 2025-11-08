import { useEffect, useState, useCallback } from "react";

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

const useModal = () => {
  const [modalMessage, setModalMessage] = useState(null);
  const showModal = (message) => setModalMessage(message);
  const hideModal = () => setModalMessage(null);
  return { modalMessage, showModal, hideModal };
};

const getEthers = () => {
  if (typeof window !== 'undefined' && window.ethers) return window.ethers;
  console.error("Ethers library is not loaded.");
  return null;
};

const Icon = ({ name, className }) => {
  const [IconComponent, setIconComponent] = useState(null);
  useEffect(() => {
    if (window.lucide && window.lucide.icons[name]) {
      setIconComponent(() => window.lucide.icons[name]);
    }
  }, [name]);
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
};

export default function App() {
  const [connectedAddress, setConnectedAddress] = useState(null);
  const [ownerAddress, setOwnerAddress] = useState(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [queryId, setQueryId] = useState("");
  const [invoiceData, setInvoiceData] = useState(null);
  const [amountToCreate, setAmountToCreate] = useState("");
  const [loading, setLoading] = useState(false);
  const { modalMessage, showModal, hideModal } = useModal();

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
    async function loadOwner() {
      const ethers = getEthers();
      if (!ethers || !CONTRACT_ADDRESS || !ARC_RPC) return;
      try {
        const provider = new ethers.JsonRpcProvider(ARC_RPC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const owner = await contract.owner();
        setOwnerAddress(owner);
      } catch (err) {
        console.error("loadOwner error", err);
      }
    }
    const timer = setTimeout(loadOwner, 500);
    return () => clearTimeout(timer);
  }, [ARC_RPC, CONTRACT_ADDRESS]);

  async function connectWallet() {
    const ethers = getEthers();
    if (!ethers || !window.ethereum) return showModal("MetaMask required.");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      setConnectedAddress(signerAddress);
    } catch (error) {
      console.error("Connection error:", error);
      showModal("Failed to connect wallet.");
    }
  }

  const isOwner = connectedAddress && ownerAddress && connectedAddress.toLowerCase() === ownerAddress.toLowerCase();

  const queryInvoice = useCallback(async (idToQuery) => {
    const ethers = getEthers();
    if (!ethers || !idToQuery) return;
    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const res = await contract.getInvoice(idToQuery);

      if (res.issuer === '0x0000000000000000000000000000000000000000') {
        setInvoiceData(null);
        showModal("Invoice not found.");
        return;
      }

      setInvoiceData({
        amount: res[0],
        issuer: res[1],
        paid: res[2],
        payer: res[3],
        paidAt: res[4]
      });
      setQueryId(idToQuery);
    } catch (err) {
      console.error(err);
      showModal("Error querying invoice: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }, [ARC_RPC, CONTRACT_ADDRESS, showModal]);

  async function createInvoice() {
    const ethers = getEthers();
    if (!ethers || !invoiceId || !amountToCreate) return showModal("Please provide ID and amount.");
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const amountUSDC = ethers.parseUnits(amountToCreate, 6);
      const tx = await contract.createInvoice(invoiceId, amountUSDC);
      showModal("Creating Invoice...");
      await tx.wait();
      showModal("Invoice created successfully!");
      setInvoiceId("");
      setAmountToCreate("");
    } catch (err) {
      console.error(err);
      showModal("Error creating invoice: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function payInvoice() {
    const ethers = getEthers();
    if (!ethers || !queryId) return showModal("Please provide invoice ID.");
    if (!connectedAddress) return showModal("Please connect your wallet first.");
    setLoading(true);

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

      const contractTarget = contract.target;
      const invoice = await contract.getInvoice(queryId);
      const amount = invoice.amount;

      if (invoice.issuer === '0x0000000000000000000000000000000000000000') {
        showModal("Invoice not found.");
        return;
      }

      if (invoice.paid) {
        showModal("Invoice is already paid.");
        return;
      }

      showModal(`Checking allowance for ${ethers.formatUnits(amount, 6)} USDC...`);
      const allowance = await usdc.allowance(signerAddress, contractTarget);

      if (allowance < amount) {
        showModal("Approving USDC. Please confirm transaction 1/2 in MetaMask.");
        const approveTx = await usdc.approve(contractTarget, amount);
        await approveTx.wait();
        showModal("USDC approved. Proceeding to payment (Transaction 2/2)...");
      }

      const tx = await contract.payInvoice(queryId);
      showModal("Paying invoice. Please confirm transaction 2/2 in MetaMask.");
      await tx.wait();

      showModal("Invoice paid successfully!");
      queryInvoice(queryId);
    } catch (err) {
      console.error("payInvoice error:", err);
      showModal("Error paying invoice: " + (err.shortMessage || err.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function withdrawAll() {
    const ethers = getEthers();
    if (!ethers || !window.ethereum) return showModal("MetaMask required.");
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      showModal("Withdrawing funds...");
      const tx = await contract.withdraw();
      await tx.wait();
      showModal("Funds withdrawn successfully!");
    } catch (err) {
      console.error(err);
      showModal("Error withdrawing funds: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  const Modal = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center z-50 p-4 backdrop-blur-md">
      <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center">
        <h3 className="text-xl font-bold mb-4">{message}</h3>
        <button
          onClick={onClose}
          className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition duration-150"
        >
          Close
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#a0d8f1", padding: "2rem", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "3rem", textAlign: "center", marginBottom: "2rem", background: "linear-gradient(90deg,#4f46e5,#ec4899)", WebkitBackgroundClip: "text", color: "transparent" }}>
          PayArc Invoice System
        </h1>

        <div style={{ background: "#1f1f2e", borderRadius: "20px", padding: "20px", marginBottom: "20px", color: "white" }}>
          {!connectedAddress ? (
            <button onClick={connectWallet} style={{ padding: "10px 20px", borderRadius: "12px", background: "#4f46e5", color: "white", fontWeight: "bold" }}>
              Connect Wallet
            </button>
          ) : (
            <p>Connected: {connectedAddress}</p>
          )}
          <p>Owner: {ownerAddress || "Loading..."}</p>
        </div>

        {isOwner && (
          <div style={{ background: "#1f1f2e", borderRadius: "20px", padding: "20px", marginBottom: "20px", color: "white" }}>
            <h2 style={{ marginBottom: "15px" }}>Owner Operations</h2>
            <input placeholder="Invoice ID" value={invoiceId} onChange={e => setInvoiceId(e.target.value)} />
            <input placeholder="Amount (USDC)" value={amountToCreate} onChange={e => setAmountToCreate(e.target.value)} type="number" />
            <button onClick={createInvoice}>Create Invoice</button>
            <button onClick={withdrawAll}>Withdraw All</button>
          </div>
        )}

        <div style={{ background: "#1f1f2e", borderRadius: "20px", padding: "20px", color: "white" }}>
          <h2>Invoice Query & Payment</h2>
          <input placeholder="Invoice ID to Query / Pay" value={queryId} onChange={e => setQueryId(e.target.value)} />
          <button onClick={() => queryInvoice(queryId)}>Query</button>
          <button onClick={payInvoice}>Pay</button>

          {invoiceData && (
            <div style={{ marginTop: "20px", background: "#2a2a3a", padding: "15px", borderRadius: "15px" }}>
              <p>Amount: {getEthers().formatUnits(invoiceData.amount, 6)}</p>
              <p>Issuer: {invoiceData.issuer}</p>
              <p>Status: {invoiceData.paid ? "Paid" : "Not Paid"}</p>
              <p>Payer: {invoiceData.paid ? invoiceData.payer : "-"}</p>
              <p>Payment Date: {invoiceData.paid ? new Date(Number(invoiceData.paidAt) * 1000).toLocaleString() : "-"}</p>
            </div>
          )}
        </div>
      </div>

      {modalMessage && <Modal message={modalMessage} onClose={hideModal} />}
    </div>
  );
}
