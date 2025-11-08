import { useEffect, useState, useCallback } from "react";

// Script for loading Lucide Icons.
// This script provides the 'Icon' function usable within the component.
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
  if (typeof window !== 'undefined' && window.ethers) {
    return window.ethers;
  }
  console.error("Ethers library is not loaded.");
  return null;
};

// Helper component for using Lucide Icons
const Icon = ({ name, className }) => {
    const [IconComponent, setIconComponent] = useState(null);
    useEffect(() => {
        // Dynamically load the icon component after the Lucide library is loaded
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
      <div className="fixed inset-0 bg-gray-900 bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full border border-indigo-500/50 transform transition-all duration-300 scale-100">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <Icon name="alert-triangle" className="w-5 h-5 text-indigo-400 mr-2" />
                Transaction Status
              </h3>
              <p className="text-gray-300 text-lg mb-6 font-medium">{message}</p>
              <button
                  onClick={onClose}
                  className="w-full px-4 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition duration-150 shadow-lg shadow-indigo-500/30"
              >
                  Close
              </button>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-8 font-sans">
        
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-extrabold mb-10 text-center tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-pink-400">
                PayArc 
            </span> 
            Invoice Registration System
        </h1>
        
        {/* Wallet Connection / General Info Card */}
        <div className="bg-gray-800 p-5 rounded-2xl shadow-xl shadow-gray-950/50 mb-8 flex flex-col sm:flex-row justify-between items-center border border-gray-700">
          {!connectedAddress ? (
            <button 
                onClick={connectWallet} 
                className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition duration-200 active:scale-95 transform flex items-center justify-center"
            >
                <Icon name="wallet" className="w-5 h-5 mr-2" />
                Connect Wallet
            </button>
          ) : (
            <div className="text-gray-300 font-medium w-full sm:w-auto mb-2 sm:mb-0 flex items-center">
                <Icon name="plug-zap" className="w-5 h-5 text-green-500 mr-2" />
                Connected Address: <span className="text-sm font-mono bg-gray-700 p-2 ml-2 rounded-lg break-all text-indigo-300">{connectedAddress}</span>
            </div>
          )}
          <div className="text-gray-500 text-sm mt-3 sm:mt-0 flex items-center">
              <Icon name="lock" className="w-4 h-4 mr-1" />
              Contract Owner: <span className="font-mono break-all ml-1 text-gray-400">{ownerAddress || "Loading..."}</span>
          </div>
        </div>

        {/* Owner Operations Card */}
        {isOwner && (
          <div className="bg-gray-800 p-6 rounded-2xl shadow-xl shadow-gray-950/50 mb-8 border border-yellow-500/40">
            <h2 className="text-2xl font-bold mb-4 text-yellow-500 border-b pb-2 border-gray-700 flex items-center">
                <Icon name="crown" className="w-6 h-6 mr-2" />
                Contract Owner Operations
            </h2>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <input 
                  className="border border-gray-600 p-3 bg-gray-700 text-white rounded-xl flex-1 focus:ring-green-500 focus:border-green-500 transition" 
                  placeholder="Invoice ID (New)" 
                  value={invoiceId} 
                  onChange={(e) => setInvoiceId(e.target.value)} 
                  disabled={loading}
              />
              <input 
                  className="border border-gray-600 p-3 bg-gray-700 text-white rounded-xl w-full md:w-36 focus:ring-green-500 focus:border-green-500 transition" 
                  placeholder="Amount (USDC)" 
                  value={amountToCreate} 
                  onChange={(e) => setAmountToCreate(e.target.value)} 
                  disabled={loading}
                  type="number"
              />
              <button 
                  onClick={createInvoice} 
                  disabled={loading || !invoiceId || !amountToCreate} 
                  className={`w-full md:w-auto px-6 py-3 font-bold rounded-xl transition duration-150 shadow-md flex items-center justify-center ${
                      loading || !invoiceId || !amountToCreate ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700 shadow-green-600/30'
                  }`}
              >
                  <Icon name="plus" className="w-5 h-5 mr-2" />
                  {loading ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
            <button 
                onClick={withdrawAll} 
                disabled={loading} 
                className={`w-full px-6 py-3 font-bold rounded-xl transition duration-150 shadow-md mt-2 flex items-center justify-center ${
                    loading ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-600/30'
                }`}
            >
                <Icon name="banknote" className="w-5 h-5 mr-2" />
                {loading ? 'Processing...' : 'Withdraw All Funds (Owner)'}
            </button>
          </div>
        )}

        {/* Invoice Query and Payment Card */}
        <div className="bg-gray-800 p-6 rounded-2xl shadow-xl shadow-gray-950/50 border border-indigo-500/40">
          <h2 className="text-2xl font-bold mb-4 text-indigo-400 border-b pb-2 border-gray-700 flex items-center">
            <Icon name="search" className="w-6 h-6 mr-2" />
            Invoice Query & Payment
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <input 
                className="border border-gray-600 p-3 bg-gray-700 text-white rounded-xl flex-1 focus:ring-indigo-500 focus:border-indigo-500 transition" 
                placeholder="Invoice ID to Query / Pay" 
                value={queryId} 
                onChange={(e) => setQueryId(e.target.value)} 
                disabled={loading}
            />
            <button 
                onClick={() => queryInvoice(queryId)} 
                disabled={loading || !queryId} 
                className={`w-full sm:w-auto px-6 py-3 font-bold rounded-xl transition duration-150 shadow-md flex items-center justify-center ${
                    loading || !queryId ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30'
                }`}
            >
                <Icon name="eye" className="w-5 h-5 mr-2" />
                {loading ? 'Querying...' : 'Query'}
            </button>
            <button 
                onClick={payInvoice} 
                disabled={loading || !queryId || !connectedAddress} 
                className={`w-full sm:w-auto px-6 py-3 font-bold rounded-xl transition duration-150 shadow-md flex items-center justify-center ${
                    loading || !queryId || !connectedAddress ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-yellow-500 text-gray-900 hover:bg-yellow-600 shadow-yellow-500/30'
                }`}
            >
                <Icon name="credit-card" className="w-5 h-5 mr-2" />
                {loading ? 'Payment Processing...' : 'Pay'}
            </button>
          </div>

          {invoiceData && (
            <div className="mt-8 bg-gray-700 p-6 rounded-xl border border-indigo-500/30 shadow-inner">
              <h3 className="text-xl font-bold mb-4 text-white flex items-center">
                  <Icon name="file-text" className="w-5 h-5 mr-2 text-indigo-300" />
                  Invoice Details (ID: {queryId})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-300">
                <DetailItem label="Amount (USDC)" value={getEthers().formatUnits(invoiceData.amount, 6)} icon="dollar-sign" />
                <DetailItem label="Issuer" value={invoiceData.issuer} isAddress={true} icon="user" />
                <DetailItem 
                    label="Payment Status" 
                    value={invoiceData.paid ? "Paid" : "Pending"} 
                    isPaid={invoiceData.paid}
                    icon="check-circle"
                />
                <DetailItem label="Payer" value={invoiceData.paid ? invoiceData.payer : "-"} isAddress={true} icon="send" />
                <DetailItem 
                    label="Payment Date" 
                    value={invoiceData.paid ? new Date(Number(invoiceData.paidAt) * 1000).toLocaleString() : "-"} 
                    icon="calendar"
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

const DetailItem = ({ label, value, isAddress = false, isPaid = null, icon }) => {
    let statusIcon = null;
    let statusIconColor = "text-gray-400";
    if (isPaid !== null) {
        statusIcon = isPaid ? "check-circle" : "alert-triangle";
        statusIconColor = isPaid ? "text-green-500" : "text-red-500";
    }

    return (
        <div className="flex flex-col bg-gray-700 p-3 rounded-lg border border-gray-600">
            <span className="text-xs font-medium text-gray-400 mb-1 flex items-center">
                <Icon name={statusIcon || icon} className={`w-3 h-3 mr-1 ${statusIconColor}`} />
                {label}: 
            </span> 
            <span className={`text-sm font-semibold break-words ${isAddress ? 'font-mono text-sm text-indigo-300' : 'text-white'} ${isPaid === true ? 'text-green-400' : isPaid === false ? 'text-red-400' : ''}`}>
                {value}
            </span>
        </div>
    );
};
