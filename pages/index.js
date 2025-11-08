import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers"; 

// Environment variables (Çevresel değişkenler)
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const ARC_RPC = process.env.NEXT_PUBLIC_ARC_RPC;
// Arc Testnet USDC Address (6 decimals)
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"; 

// PayArc Contract ABI
const CONTRACT_ABI = [
  "function owner() view returns (address)",
  "function createInvoice(string id, uint256 amount)",
  "function getInvoice(string id) view returns (uint256 amount, address issuer, bool paid, address payer, uint256 paidAt)",
  "function payInvoice(string id)",
  "function withdraw()"
];

// Basic ERC20 ABI (for Allowance and Approve)
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

// Custom Modal Hook (to replace alert())
const useModal = () => {
  const [modalMessage, setModalMessage] = useState(null);
  const showModal = (message) => setModalMessage(message);
  const hideModal = () => setModalMessage(null);
  return { modalMessage, showModal, hideModal };
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
    if (!window.ethereum) return showModal("MetaMask required.");
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
  
  // Function to query invoice details
  const queryInvoice = useCallback(async (idToQuery) => {
    if (!idToQuery) return;
    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const res = await contract.getInvoice(idToQuery);

      // Check if invoice exists (issuer is not zero address)
      if (res.issuer === '0x0000000000000000000000000000000000000000') {
          setInvoiceData(null);
          showModal("Invoice not found.");
          return;
      }

      setInvoiceData({
        amount: res[0], // BigInt amount in USDC decimals (6)
        issuer: res[1],
        paid: res[2],
        payer: res[3],
        paidAt: res[4] // BigInt timestamp
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
    if (!invoiceId || !amountToCreate) return showModal("Provide ID and amount.");
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      // Parse amount as 6 decimals (USDC standard)
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

  // --- Core Pay Invoice Function (Uses ERC20 Approve/TransferFrom) ---
  async function payInvoice() {
    if (!queryId) return showModal("Provide invoice id.");
    if (!connectedAddress) return showModal("Please connect your wallet first.");
    setLoading(true);

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();

      // PayArc Contract instance
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      // USDC Contract instance
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

      // Ethers v6: Use .target to get the contract address
      const contractTarget = contract.target; 
      
      // Fetch invoice amount
      const invoice = await contract.getInvoice(queryId);
      const amount = invoice.amount; // BigInt amount in USDC decimals (6)

      if (invoice.issuer === '0x0000000000000000000000000000000000000000') {
          showModal("Invoice not found.");
          return;
      }

      if (invoice.paid) {
          showModal("Invoice is already paid.");
          return;
      }
      
      showModal(`Checking allowance for ${ethers.formatUnits(amount, 6)} USDC...`);

      // 1. Check Allowance: How much the PayArc contract can spend on behalf of the user
      const allowance = await usdc.allowance(signerAddress, contractTarget);
      
      // 2. Approve if necessary
      if (allowance < amount) {
        showModal("Approving USDC. Please confirm transaction 1/2 in MetaMask.");
        // Approve the PayArc contract to spend the required amount
        const approveTx = await usdc.approve(contractTarget, amount);
        await approveTx.wait();
        showModal("USDC approved. Proceeding to payment (Transaction 2/2)...");
      }

      // 3. Pay Invoice: This triggers the transferFrom logic inside the PayArc contract
      const tx = await contract.payInvoice(queryId); 
      showModal("Paying invoice. Please confirm transaction 2/2 in MetaMask.");
      await tx.wait();
      
      showModal("Invoice paid successfully!");
      queryInvoice(queryId); // Update status
    } catch (err) {
      console.error("payInvoice error:", err);
      // Provide better error feedback
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

  // Modal Component for custom alerts
  const Modal = ({ message, onClose }) => (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full border-t-4 border-blue-600">
              <p className="text-gray-800 text-lg mb-4 font-medium">{message}</p>
              <button
                  onClick={onClose}
                  className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition duration-150 shadow-md"
              >
                  Kapat
              </button>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 font-sans">
        
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-extrabold mb-8 text-center text-gray-800 tracking-tight">
            PayArc Fatura Kayıt Sistemi
        </h1>
        
        {/* Bağlantı ve Durum Bölümü */}
        <div className="bg-white p-4 rounded-xl shadow-lg mb-6 flex flex-col sm:flex-row justify-between items-center border border-gray-200">
          {!connectedAddress ? (
            <button 
                onClick={connectWallet} 
                className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-700 transition duration-150 active:scale-95 transform"
            >
                Cüzdanı Bağla
            </button>
          ) : (
            <div className="text-gray-700 font-medium w-full sm:w-auto mb-2 sm:mb-0">
                Bağlı: <span className="text-sm font-mono bg-gray-100 p-1 rounded break-all">{connectedAddress}</span>
            </div>
          )}
          <div className="text-gray-500 text-sm mt-2 sm:mt-0">
              Sahip: <span className="font-mono break-all">{ownerAddress || "Yükleniyor..."}</span>
          </div>
        </div>

        {/* Owner Fonksiyonları Bölümü */}
        {isOwner && (
          <div className="bg-white p-6 rounded-xl shadow-lg mb-6 border border-yellow-400/50">
            <h2 className="text-xl font-bold mb-4 text-yellow-700 border-b pb-2 border-yellow-100">Kontrat Sahibi İşlemleri</h2>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input 
                  className="border border-gray-300 p-3 rounded-lg flex-1 focus:ring-green-500 focus:border-green-500" 
                  placeholder="Fatura ID'si" 
                  value={invoiceId} 
                  onChange={(e) => setInvoiceId(e.target.value)} 
                  disabled={loading}
              />
              <input 
                  className="border border-gray-300 p-3 rounded-lg w-full sm:w-32 focus:ring-green-500 focus:border-green-500" 
                  placeholder="Miktar (USDC)" 
                  value={amountToCreate} 
                  onChange={(e) => setAmountToCreate(e.target.value)} 
                  disabled={loading}
                  type="number"
              />
              <button 
                  onClick={createInvoice} 
                  disabled={loading || !invoiceId || !amountToCreate} 
                  className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-lg transition duration-150 shadow-md ${
                      loading || !invoiceId || !amountToCreate ? 'bg-gray-400 text-gray-700' : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
              >
                  {loading ? 'İşleniyor...' : 'Fatura Oluştur'}
              </button>
            </div>
            <button 
                onClick={withdrawAll} 
                disabled={loading} 
                className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-lg transition duration-150 shadow-md ${
                    loading ? 'bg-gray-400 text-gray-700' : 'bg-red-600 text-white hover:bg-red-700'
                }`}
            >
                {loading ? 'İşleniyor...' : 'Tüm Fonları Çek (Owner)'}
            </button>
          </div>
        )}

        {/* Sorgulama / Ödeme Bölümü */}
        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-400/50">
          <h2 className="text-xl font-bold mb-4 text-blue-700 border-b pb-2 border-blue-100">Fatura Sorgulama ve Ödeme</h2>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <input 
                className="border border-gray-300 p-3 rounded-lg flex-1 focus:ring-blue-500 focus:border-blue-500" 
                placeholder="Sorgulanacak / Ödenecek Fatura ID'si" 
                value={queryId} 
                onChange={(e) => setQueryId(e.target.value)} 
                disabled={loading}
            />
            <button 
                onClick={() => queryInvoice(queryId)} 
                disabled={loading || !queryId} 
                className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-lg transition duration-150 shadow-md ${
                    loading || !queryId ? 'bg-gray-400 text-gray-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
            >
                {loading ? 'Sorgulanıyor...' : 'Sorgula'}
            </button>
            <button 
                onClick={payInvoice} 
                disabled={loading || !queryId || !connectedAddress} 
                className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-lg transition duration-150 shadow-md ${
                    loading || !queryId || !connectedAddress ? 'bg-gray-400 text-gray-700' : 'bg-yellow-600 text-white hover:bg-yellow-700'
                }`}
            >
                {loading ? 'Ödeme İşleniyor...' : 'Öde'}
            </button>
          </div>

          {/* Fatura Bilgileri Görüntüleme */}
          {invoiceData && (
            <div className="mt-6 bg-blue-50 p-6 rounded-xl border border-blue-200 shadow-inner">
              <h3 className="text-lg font-bold mb-3 text-blue-800">Fatura Detayları (ID: {queryId})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700">
                <DetailItem label="Miktar (USDC)" value={ethers.formatUnits(invoiceData.amount, 6)} />
                <DetailItem label="Fatura Keseni" value={invoiceData.issuer} isAddress={true} />
                <DetailItem 
                    label="Ödeme Durumu" 
                    value={invoiceData.paid ? "Ödendi" : "Bekliyor"} 
                    isPaid={invoiceData.paid}
                />
                <DetailItem label="Ödeyen" value={invoiceData.paid ? invoiceData.payer : "-"} isAddress={true} />
                <DetailItem 
                    label="Ödeme Tarihi" 
                    value={invoiceData.paid ? new Date(Number(invoiceData.paidAt) * 1000).toLocaleString() : "-"} 
                />
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Modal Ekranı */}
      {modalMessage && <Modal message={modalMessage} onClose={hideModal} />}

    </div>
  );
}

// Helper Component for Displaying Detail Items
const DetailItem = ({ label, value, isAddress = false, isPaid = null }) => (
    <div className="flex flex-col">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span className={`text-base font-semibold ${isAddress ? 'font-mono text-xs' : 'break-words'} ${isPaid === true ? 'text-green-600' : isPaid === false ? 'text-red-600' : 'text-gray-800'}`}>
            {value}
        </span>
    </div>
);
