import { useEffect, useState, useCallback } from "react";

// Environment variables and constants remain the same
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
  if (typeof window !== 'undefined' && window.ethers) {
    return window.ethers;
  }
  console.error("Ethers library is not loaded.");
  return null;
};

// --- Helper Components for Styling ---

const DetailItem = ({ label, value, isAddress = false, isPaid = null }) => (
  // Updated styles using simple CSS classes and inline styles where necessary
  <div style={{ flex: '1 1 0px', display: 'flex', flexDirection: 'column' }} className="p-3 bg-white rounded-xl border border-blue-100 shadow-sm">
    <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#6B7280' }}>{label}</span>
    <span style={{ fontSize: '1rem', fontWeight: '600' }} className={`${isAddress ? 'font-mono' : 'break-words'} ${isPaid === true ? 'text-success' : isPaid === false ? 'text-danger' : 'text-default'}`}>
      {value}
    </span>
  </div>
);

const Modal = ({ message, onClose }) => (
  <div className="fixed inset-0 flex items-center justify-center z-50 p-4 modal-overlay">
    <div className="bg-white p-6 max-w-sm w-full shadow-2xl modal-content">
      <p style={{ color: '#1F2937', fontSize: '1.125rem', marginBottom: '1rem', fontWeight: '600' }}>{message}</p>
      <button
        onClick={onClose}
        className="w-full btn-base btn-primary"
      >
        Close
      </button>
    </div>
  </div>
);
// ------------------------------------


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
    if (typeof window !== 'undefined' && !document.getElementById('ethers-script')) {
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

  return (
    <div className="min-h-screen p-4 sm:p-8 font-sans bg-modern-light">
      
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-extrabold mb-10 text-center text-primary">
          PayArc Invoice System 🧾
        </h1>
        
        {/* Wallet Connection & Owner Info */}
        <div className="p-5 mb-8 flex flex-col sm:flex-row justify-between items-center card-modern">
          {!connectedAddress ? (
            <button
                onClick={connectWallet}
                className="w-full sm:w-auto btn-base btn-primary text-lg"
            >
                Connect Wallet
            </button>
          ) : (
            <div className="text-default font-medium w-full sm:w-auto mb-2 sm:mb-0" style={{ fontSize: '0.875rem' }}>
                Connected: <span className="font-mono p-2 rounded-lg break-all inline-block mt-1" style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', fontSize: '0.75rem' }}>{connectedAddress}</span>
            </div>
          )}
          <div className="text-default" style={{ fontSize: '0.875rem', marginTop: '1rem', textAlign: 'right' }}>
              Owner: <span className="font-mono break-all text-default p-1 rounded-md" style={{ backgroundColor: '#F3F4F6', fontSize: '0.75rem' }}>{ownerAddress || "Loading..."}</span>
          </div>
        </div>

        {/* Owner Operations */}
        {isOwner && (
          <div className="p-6 mb-8 card-modern" style={{ border: '1px solid #D9F99D' }}>
            <h2 className="text-2xl font-bold mb-4 text-success border-b pb-3" style={{ borderBottomColor: '#F0FDF4' }}>
              👑 Contract Owner Operations
            </h2>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <input
                className="input-modern flex-1"
                placeholder="Invoice ID (Unique)"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                disabled={loading}
              />
              <input
                className="input-modern w-full md:w-40"
                placeholder="Amount (USDC)"
                value={amountToCreate}
                onChange={(e) => setAmountToCreate(e.target.value)}
                disabled={loading}
                type="number"
              />
              <button
                onClick={createInvoice}
                disabled={loading || !invoiceId || !amountToCreate}
                className="w-full md:w-auto btn-base btn-success"
              >
                {loading ? 'Processing...' : 'Create Invoice'}
              </button>
            </div>
            <button
              onClick={withdrawAll}
              disabled={loading}
              className="w-full btn-base btn-danger mt-4"
            >
              {loading ? 'Processing...' : 'Withdraw All Funds (Owner)'}
            </button>
          </div>
        )}

        {/* Invoice Query & Payment */}
        <div className="p-6 card-modern" style={{ border: '1px solid #BFDBFE' }}>
          <h2 className="text-2xl font-bold mb-4 text-primary border-b pb-3" style={{ borderBottomColor: '#EFF6FF' }}>
            🔍 Invoice Query & Payment
          </h2>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <input
              className="input-modern flex-1"
              placeholder="Invoice ID to Query / Pay"
              value={queryId}
              onChange={(e) => setQueryId(e.target.value)}
              disabled={loading}
            />
            <button
              onClick={() => queryInvoice(queryId)}
              disabled={loading || !queryId}
              className="w-full md:w-auto btn-base btn-primary"
            >
              {loading ? 'Querying...' : 'Query'}
            </button>
            <button
              onClick={payInvoice}
              disabled={loading || !queryId || !connectedAddress}
              className="w-full md:w-auto btn-base btn-warning"
            >
              {loading ? 'Payment Processing...' : 'Pay'}
            </button>
          </div>

          {/* Invoice Details Display */}
          {invoiceData && (
            <div className="mt-6 p-6 rounded-2xl shadow-inner" style={{ backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE' }}>
              <h3 className="text-lg font-bold mb-4 text-primary border-b pb-2" style={{ borderBottomColor: '#E0F2F1' }}>Invoice Details (ID: {queryId})</h3>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <DetailItem label="Amount (USDC)" value={getEthers().formatUnits(invoiceData.amount, 6)} />
                <DetailItem label="Issuer" value={invoiceData.issuer} isAddress={true} />
                <DetailItem
                    label="Payment Status"
                    value={invoiceData.paid ? "Paid" : "Pending"}
                    isPaid={invoiceData.paid}
                />
                <DetailItem label="Payer" value={invoiceData.paid ? invoiceData.payer : "-"} isAddress={true} />
                <DetailItem
                    label="Payment Date"
                    value={invoiceData.paid ? new Date(Number(invoiceData.paidAt) * 1000).toLocaleString() : "-"}
                />
              </div>
            </div>
          )}
        </div>
      </div>
        
      {modalMessage && <Modal message={modalMessage} onClose={hideModal} />}

    </div>
  );
}
