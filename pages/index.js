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
  <div className="flex flex-col p-3 bg-white rounded-xl border border-blue-100 shadow-sm">
    <span className="text-sm font-medium text-gray-500">{label}</span>
    <span className={`text-base font-semibold ${isAddress ? 'font-mono text-xs' : 'break-words'} ${isPaid === true ? 'text-green-600' : isPaid === false ? 'text-red-600' : 'text-gray-900'}`}>
      {value}
    </span>
  </div>
);

const Modal = ({ message, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full border-t-4 border-blue-600 transition duration-300 transform scale-100 opacity-100">
      <p className="text-gray-800 text-lg mb-4 font-semibold">{message}</p>
      <button
        onClick={onClose}
        className="w-full px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition duration-300 shadow-lg shadow-blue-500/50 transform hover:scale-[1.01] active:scale-95"
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
    <div className="min-h-screen bg-blue-50 p-4 sm:p-8 font-sans transition-colors duration-300">
      
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-extrabold mb-10 text-center text-blue-800 tracking-tight">
          PayArc Invoice System 🧾
        </h1>
        
        {/* Wallet Connection & Owner Info */}
        <div className="bg-white p-5 rounded-2xl shadow-xl mb-8 flex flex-col sm:flex-row justify-between items-center border border-blue-200">
          {!connectedAddress ? (
            <button
                onClick={connectWallet}
                className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-blue-500/50 hover:bg-blue-700 transition duration-300 active:scale-95 transform tracking-wide text-lg"
            >
                Connect Wallet
            </button>
          ) : (
            <div className="text-gray-700 font-medium w-full sm:w-auto mb-2 sm:mb-0 text-sm">
                Connected: <span className="font-mono bg-blue-100 text-blue-800 p-2 rounded-lg break-all inline-block mt-1">{connectedAddress}</span>
            </div>
          )}
          <div className="text-gray-500 text-sm mt-4 sm:mt-0 sm:text-right">
              Owner: <span className="font-mono break-all text-gray-600 bg-gray-100 p-1 rounded-md">{ownerAddress || "Loading..."}</span>
          </div>
        </div>

        {/* Owner Operations */}
        {isOwner && (
          <div className="bg-white p-6 rounded-2xl shadow-xl mb-8 border border-green-400/50">
            <h2 className="text-2xl font-bold mb-4 text-green-700 border-b pb-3 border-green-100 flex items-center">
              👑 Contract Owner Operations
            </h2>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <input
                className="border border-gray-300 p-3 rounded-xl flex-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                placeholder="Invoice ID (Unique)"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                disabled={loading}
              />
              <input
                className="border border-gray-300 p-3 rounded-xl w-full md:w-40 focus:ring-green-500 focus:border-green-500 transition-colors"
                placeholder="Amount (USDC)"
                value={amountToCreate}
                onChange={(e) => setAmountToCreate(e.target.value)}
                disabled={loading}
                type="number"
              />
              <button
                onClick={createInvoice}
                disabled={loading || !invoiceId || !amountToCreate}
                className={`w-full md:w-auto px-6 py-3 font-bold rounded-xl transition duration-300 shadow-lg transform hover:scale-[1.01] active:scale-95 ${
                  loading || !invoiceId || !amountToCreate ? 'bg-gray-400 text-gray-700' : 'bg-green-600 text-white hover:bg-green-700 shadow-green-500/50'
                }`}
              >
                {loading ? 'Processing...' : 'Create Invoice'}
              </button>
            </div>
            <button
              onClick={withdrawAll}
              disabled={loading}
              className={`w-full px-6 py-3 font-bold rounded-xl transition duration-300 shadow-lg transform hover:scale-[1.01] active:scale-95 mt-4 ${
                loading ? 'bg-gray-400 text-gray-700' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-500/50'
              }`}
            >
              {loading ? 'Processing...' : 'Withdraw All Funds (Owner)'}
            </button>
          </div>
        )}

        {/* Invoice Query & Payment */}
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-blue-400/50">
          <h2 className="text-2xl font-bold mb-4 text-blue-700 border-b pb-3 border-blue-100 flex items-center">
            🔍 Invoice Query & Payment
          </h2>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <input
              className="border border-gray-300 p-3 rounded-xl flex-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="Invoice ID to Query / Pay"
              value={queryId}
              onChange={(e) => setQueryId(e.target.value)}
              disabled={loading}
            />
            <button
              onClick={() => queryInvoice(queryId)}
              disabled={loading || !queryId}
              className={`w-full md:w-auto px-6 py-3 font-bold rounded-xl transition duration-300 shadow-lg transform hover:scale-[1.01] active:scale-95 ${
                loading || !queryId ? 'bg-gray-400 text-gray-700' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/50'
              }`}
            >
              {loading ? 'Querying...' : 'Query'}
            </button>
            <button
              onClick={payInvoice}
              disabled={loading || !queryId || !connectedAddress}
              className={`w-full md:w-auto px-6 py-3 font-bold rounded-xl transition duration-300 shadow-lg transform hover:scale-[1.01] active:scale-95 ${
                loading || !queryId || !connectedAddress ? 'bg-gray-400 text-gray-700' : 'bg-yellow-600 text-white hover:bg-yellow-700 shadow-yellow-500/50'
              }`}
            >
              {loading ? 'Payment Processing...' : 'Pay'}
            </button>
          </div>

          {/* Invoice Details Display */}
          {invoiceData && (
            <div className="mt-6 bg-blue-50 p-6 rounded-2xl border border-blue-200 shadow-inner">
              <h3 className="text-lg font-bold mb-4 text-blue-800 border-b pb-2 border-blue-100">Invoice Details (ID: {queryId})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-gray-700">
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
