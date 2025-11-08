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
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white/20 backdrop-blur-md p-6 rounded-2xl shadow-2xl max-w-sm w-full border border-white/30 text-center">
              <p className="text-gray-800 text-lg mb-4 font-medium">{message}</p>
              <button
                  onClick={onClose}
                  className="w-full px-4 py-2 bg-white/30 backdrop-blur-sm text-gray-800 font-semibold rounded-xl shadow hover:scale-105 transition-all duration-200 active:scale-95"
              >
                  Close
              </button>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50/20 via-white/30 to-purple-50/20 backdrop-blur-md p-4 sm:p-6 font-sans">
      <div className="w-full max-w-3xl flex flex-col items-center">

        <h1 className="text-4xl font-extrabold mb-8 text-center text-gray-800 tracking-tight">
            PayArc Invoice Registration System
        </h1>

        <div className="w-full flex flex-col sm:flex-row justify-between items-center mb-6 bg-white/20 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/30 p-4">
          {!connectedAddress ? (
            <button 
                onClick={connectWallet} 
                className="w-full sm:w-auto px-6 py-3 bg-white/20 backdrop-blur-sm text-blue-600 font-semibold rounded-2xl shadow hover:shadow-2xl hover:scale-105 transition-all duration-200 active:scale-95 mb-2 sm:mb-0"
            >
                Connect Wallet
            </button>
          ) : (
            <div className="text-gray-700 font-medium w-full sm:w-auto mb-2 sm:mb-0 text-center">
                Connected: <span className="text-sm font-mono bg-white/30 backdrop-blur-sm p-1 rounded break-all">{connectedAddress}</span>
            </div>
          )}
          <div className="text-gray-500 text-sm mt-2 sm:mt-0 text-center">
              Owner: <span className="font-mono break-all">{ownerAddress || "Loading..."}</span>
          </div>
        </div>

        {isOwner && (
          <div className="w-full bg-white/20 backdrop-blur-sm p-6 rounded-2xl shadow-2xl mb-6 border border-white/30">
            <h2 className="text-xl font-bold mb-4 text-yellow-700 border-b pb-2 border-white/30 text-center">Contract Owner Operations</h2>
            <div className="flex flex-col sm:flex-row gap-3 mb-4 justify-center">
              <input 
                  className="border border-gray-300 p-3 rounded-xl flex-1 focus:ring-green-500 focus:border-green-500" 
                  placeholder="Invoice ID" 
                  value={invoiceId} 
                  onChange={(e) => setInvoiceId(e.target.value)} 
                  disabled={loading}
              />
              <input 
                  className="border border-gray-300 p-3 rounded-xl w-full sm:w-32 focus:ring-green-500 focus:border-green-500" 
                  placeholder="Amount (USDC)" 
                  value={amountToCreate} 
                  onChange={(e) => setAmountToCreate(e.target.value)} 
                  disabled={loading}
                  type="number"
              />
              <button 
                  onClick={createInvoice} 
                  disabled={loading || !invoiceId || !amountToCreate} 
                  className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-2xl transition-all duration-200 shadow ${
                      loading || !invoiceId || !amountToCreate ? 'bg-gray-400 text-gray-700' : 'bg-white/20 backdrop-blur-sm text-green-600 hover:scale-105 hover:shadow-2xl'
                  }`}
              >
                  {loading ? 'Processing...' : 'Create Invoice'}
              </button>
            </div>
            <button 
                onClick={withdrawAll} 
                disabled={loading} 
                className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-2xl transition-all duration-200 shadow ${
                    loading ? 'bg-gray-400 text-gray-700' : 'bg-white/20 backdrop-blur-sm text-red-600 hover:scale-105 hover:shadow-2xl'
                }`}
            >
                {loading ? 'Processing...' : 'Withdraw All Funds (Owner)'}
            </button>
          </div>
        )}

        <div className="w-full bg-white/20 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-white/30">
          <h2 className="text-xl font-bold mb-4 text-blue-700 border-b pb-2 border-white/30 text-center">Invoice Query & Payment</h2>
          <div className="flex flex-col sm:flex-row gap-3 mb-6 justify-center">
            <input 
                className="border border-gray-300 p-3 rounded-xl flex-1 focus:ring-blue-500 focus:border-blue-500" 
                placeholder="Invoice ID to Query / Pay" 
                value={queryId} 
                onChange={(e) => setQueryId(e.target.value)} 
                disabled={loading}
            />
            <button 
                onClick={() => queryInvoice(queryId)} 
                disabled={loading || !queryId} 
                className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-2xl transition-all duration-200 shadow ${
                    loading || !queryId ? 'bg-gray-400 text-gray-700' : 'bg-white/20 backdrop-blur-sm text-blue-600 hover:scale-105 hover:shadow-2xl'
                }`}
            >
                {loading ? 'Querying...' : 'Query'}
            </button>
            <button 
                onClick={payInvoice} 
                disabled={loading || !queryId || !connectedAddress} 
                className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-2xl transition-all duration-200 shadow ${
                    loading || !queryId || !connectedAddress ? 'bg-gray-400 text-gray-700' : 'bg-white/20 backdrop-blur-sm text-yellow-600 hover:scale-105 hover:shadow-2xl'
                }`}
            >
                {loading ? 'Payment Processing...' : 'Pay'}
            </button>
          </div>

          {invoiceData && (
            <div className="mt-6 bg-white/10 backdrop-blur-sm p-6 rounded-2xl border border-white/30 shadow-inner">
              <h3 className="text-lg font-bold mb-3 text-blue-800 text-center">Invoice Details (ID: {queryId})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700">
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

const DetailItem = ({ label, value, isAddress = false, isPaid = null }) => (
    <div className="flex flex-col items-center">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span className={`text-base font-semibold ${isAddress ? 'font-mono text-xs break-all' : 'break-words'} ${isPaid === true ? 'text-green-600' : isPaid === false ? 'text-red-600' : 'text-gray-800'}`}>
            {value}
        </span>
    </div>
);
