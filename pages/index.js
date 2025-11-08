import { useEffect, useState } from "react";
import { ethers } from "ethers"; 

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const ARC_RPC = process.env.NEXT_PUBLIC_ARC_RPC;
// Arc testnet USDC
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

export default function Home() {
  const [connectedAddress, setConnectedAddress] = useState(null);
  const [ownerAddress, setOwnerAddress] = useState(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [queryId, setQueryId] = useState("");
  const [invoiceData, setInvoiceData] = useState(null);
  const [amountToCreate, setAmountToCreate] = useState("");
  const [loading, setLoading] = useState(false);
  const { modalMessage, showModal, hideModal } = useModal();


  useEffect(() => {
    async function loadOwner() {
      if (!CONTRACT_ADDRESS || !ARC_RPC) return;
      try {
        const provider = new ethers.JsonRpcProvider(ARC_RPC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const owner = await contract.owner();
        setOwnerAddress(owner);
      } catch (err) {
        console.error("loadOwner error", err);
      }
    }
    loadOwner();
  }, []);

  async function connectWallet() {
    if (!window.ethereum) return showModal("MetaMask required");
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

  async function createInvoice() {
    if (!invoiceId || !amountToCreate) return showModal("Provide ID and amount.");
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

  async function queryInvoice() {
    if (!queryId) return showModal("Provide invoice ID.");
    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const res = await contract.getInvoice(queryId);

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
    } catch (err) {
      console.error(err);
      showModal("Error querying invoice: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function payInvoice() {
    if (!queryId) return showModal("Provide invoice id.");
    if (!window.ethereum) return showModal("MetaMask required.");
    setLoading(true);

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

      const contractTarget = contract.target; 

      if (!signerAddress || !contractTarget || !USDC_ADDRESS) {
        throw new Error("Signer or contract target is null/undefined");
      }
      
      const invoice = await contract.getInvoice(queryId);
      const amount = invoice.amount;

      if (invoice.paid) {
          showModal("Invoice is already paid.");
          return;
      }

      const allowance = await usdc.allowance(signerAddress, contractTarget);
      
      showModal("Checking allowance and approving tokens if necessary...");

      if (allowance < amount) {
        const approveTx = await usdc.approve(contractTarget, amount);
        await approveTx.wait();
      }

      showModal("Paying invoice...");
      const tx = await contract.payInvoice(queryId);
      await tx.wait();
      
      showModal("Invoice paid successfully!");
      queryInvoice(); 
    } catch (err) {
      console.error("payInvoice error:", err);
      showModal("Error paying invoice: " + (err.shortMessage || err.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function withdrawAll() {
    if (!window.ethereum) return showModal("MetaMask required.");
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
      <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
              <p className="text-gray-800 text-lg mb-4">{message}</p>
              <button
                  onClick={onClose}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition duration-150"
              >
                  Close
              </button>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-extrabold mb-8 text-center text-gray-800">
            PayArc Invoice Registry (Arc Testnet)
        </h1>
        
        {/* Connection & Status Section */}
        <div className="bg-white p-4 rounded-xl shadow-lg mb-6 flex flex-col sm:flex-row justify-between items-center border border-gray-200">
          {!connectedAddress ? (
            <button 
                onClick={connectWallet} 
                className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition duration-150"
            >
                Connect Wallet
            </button>
          ) : (
            <div className="text-gray-700 font-medium truncate w-full sm:w-auto mb-2 sm:mb-0">
                Connected: <span className="text-sm font-mono bg-gray-100 p-1 rounded">{connectedAddress}</span>
            </div>
          )}
          <div className="text-gray-500 text-sm mt-2 sm:mt-0">
              Owner: <span className="font-mono">{ownerAddress || "loading..."}</span>
          </div>
        </div>

        {/* Owner Functions Section */}
        {isOwner && (
          <div className="bg-white p-6 rounded-xl shadow-lg mb-6 border border-yellow-300">
            <h2 className="text-xl font-bold mb-4 text-yellow-700">Owner Functions</h2>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input 
                  className="border border-gray-300 p-3 rounded-lg flex-1 focus:ring-green-500 focus:border-green-500" 
                  placeholder="Invoice ID" 
                  value={invoiceId} 
                  onChange={(e) => setInvoiceId(e.target.value)} 
                  disabled={loading}
              />
              <input 
                  className="border border-gray-300 p-3 rounded-lg w-full sm:w-32 focus:ring-green-500 focus:border-green-500" 
                  placeholder="Amount (USDC)" 
                  value={amountToCreate} 
                  onChange={(e) => setAmountToCreate(e.target.value)} 
                  disabled={loading}
              />
              <button 
                  onClick={createInvoice} 
                  disabled={loading || !invoiceId || !amountToCreate} 
                  className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-lg transition duration-150 ${
                      loading || !invoiceId || !amountToCreate ? 'bg-gray-400' : 'bg-green-600 text-white hover:bg-green-700 shadow-md'
                  }`}
              >
                  {loading ? 'Processing...' : 'Create Invoice'}
              </button>
            </div>
            <button 
                onClick={withdrawAll} 
                disabled={loading} 
                className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-lg transition duration-150 ${
                    loading ? 'bg-gray-400' : 'bg-red-600 text-white hover:bg-red-700 shadow-md'
                }`}
            >
                {loading ? 'Processing...' : 'Withdraw All'}
            </button>
          </div>
        )}

        {/* Query / Pay Section */}
        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-300">
          <h2 className="text-xl font-bold mb-4 text-blue-700">Query / Pay Invoice</h2>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input 
                className="border border-gray-300 p-3 rounded-lg flex-1 focus:ring-blue-500 focus:border-blue-500" 
                placeholder="Invoice ID to Query/Pay" 
                value={queryId} 
                onChange={(e) => setQueryId(e.target.value)} 
                disabled={loading}
            />
            <button 
                onClick={queryInvoice} 
                disabled={loading || !queryId} 
                className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-lg transition duration-150 ${
                    loading || !queryId ? 'bg-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                }`}
            >
                {loading ? 'Querying...' : 'Query'}
            </button>
            <button 
                onClick={payInvoice} 
                disabled={loading || !queryId || !connectedAddress} 
                className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-lg transition duration-150 ${
                    loading || !queryId || !connectedAddress ? 'bg-gray-400' : 'bg-yellow-600 text-white hover:bg-yellow-700 shadow-md'
                }`}
            >
                {loading ? 'Processing...' : 'Pay'}
            </button>
          </div>

          {/* Invoice Data Display */}
          {invoiceData && (
            <div className="mt-6 bg-blue-50 p-6 rounded-lg border border-blue-200 shadow-inner">
              <h3 className="text-lg font-bold mb-3 text-blue-800">Invoice Details (ID: {queryId})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700">
                <DetailItem label="Amount (USDC)" value={ethers.formatUnits(invoiceData.amount, 6)} />
                <DetailItem label="Issuer" value={invoiceData.issuer} isAddress={true} />
                <DetailItem 
                    label="Paid Status" 
                    value={invoiceData.paid ? "Yes" : "No"} 
                    isPaid={invoiceData.paid}
                />
                <DetailItem label="Payer" value={invoiceData.paid ? invoiceData.payer : "-"} isAddress={true} />
                <DetailItem 
                    label="Paid At" 
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

// Helper Component for Display
const DetailItem = ({ label, value, isAddress = false, isPaid = null }) => (
    <div className="flex flex-col">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span className={`text-base font-semibold ${isAddress ? 'font-mono text-xs' : ''} ${isPaid === true ? 'text-green-600' : isPaid === false ? 'text-red-600' : 'text-gray-800'}`}>
            {value}
        </span>
    </div>
);
