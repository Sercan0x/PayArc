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

const getButtonStyle = (color, isDisabled, isWide = false) => ({
  width: isWide ? '100%' : 'auto',
  padding: '12px 24px',
  fontWeight: '700',
  borderRadius: '12px',
  transition: 'background-color 0.2s, transform 0.2s, box-shadow 0.2s',
  boxShadow: isDisabled ? 'none' : '0 4px 6px rgba(0, 0, 0, 0.1)',
  cursor: isDisabled ? 'not-allowed' : 'pointer',
  backgroundColor: isDisabled ? '#D1D5DB' : color,
  color: isDisabled ? '#6B7280' : 'white',
});

const getHoverStyle = (baseColor) => {
    switch(baseColor) {
        case '#3B82F6': return {backgroundColor: '#2563EB'}; // Blue hover
        case '#10B981': return {backgroundColor: '#059669'}; // Green hover
        case '#F59E0B': return {backgroundColor: '#D97706'}; // Yellow hover
        case '#EF4444': return {backgroundColor: '#DC2626'}; // Red hover
        default: return {};
    }
};

const DetailItem = ({ label, value, isAddress = false, isPaid = null }) => {
    const textColor = isPaid === true ? '#059669' : isPaid === false ? '#B91C1C' : '#1F2937';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', padding: '16px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #DBEAFE', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#6B7280' }}>{label}</span>
        <span style={{ fontSize: '1rem', fontWeight: '600', color: textColor, marginTop: '4px', wordBreak: 'break-word', fontFamily: isAddress ? 'monospace' : 'inherit' }}>
          {value}
        </span>
      </div>
    );
};

const Modal = ({ message, onClose }) => (
  <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
    <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 20px 25px rgba(0, 0, 0, 0.25)', maxWidth: '400px', width: '100%', borderTop: '5px solid #3B82F6' }}>
      <p style={{ color: '#1F2937', fontSize: '1.125rem', marginBottom: '16px', fontWeight: '600' }}>{message}</p>
      <button
        onClick={onClose}
        style={getButtonStyle('#3B82F6', false, true)}
      >
        Close
      </button>
    </div>
  </div>
);


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


  const baseContainerStyle = {
    minHeight: '100vh', 
    backgroundColor: '#F5F9FF',
    padding: '32px', 
    fontFamily: 'system-ui, sans-serif'
  };

  const cardStyle = {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '16px', 
    boxShadow: '0 10px 15px rgba(0, 0, 0, 0.1)', 
    marginBottom: '24px',
  };

  const inputStyle = {
    border: '1px solid #D1D5DB',
    padding: '12px',
    borderRadius: '12px',
    flex: '1',
    transition: 'border-color 0.2s',
  };

  return (
    <div style={baseContainerStyle}>
      
      <div style={{ maxWidth: '896px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: '800', marginBottom: '40px', textAlign: 'center', color: '#1E40AF' }}>
          PayArc Invoice System 🧾
        </h1>
        
        {/* Wallet Connection & Owner Info */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', border: '1px solid #BFDBFE' }}>
          {!connectedAddress ? (
            <button
                onClick={connectWallet}
                style={getButtonStyle('#3B82F6', false)}
            >
                Connect Wallet
            </button>
          ) : (
            <div style={{ color: '#374151', fontWeight: '500', display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem' }}>Connected:</span>
                <span style={{ fontFamily: 'monospace', backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '8px', borderRadius: '8px', wordBreak: 'break-all', fontSize: '0.75rem', marginTop: '4px', width: '100%', textAlign: 'center' }}>{connectedAddress}</span>
            </div>
          )}
          <div style={{ color: '#6B7280', fontSize: '0.875rem', marginTop: '8px', width: '100%', textAlign: 'center' }}>
              Owner: <span style={{ fontFamily: 'monospace', wordBreak: 'break-all', color: '#374151', backgroundColor: '#F3F4F6', padding: '4px', borderRadius: '4px', fontSize: '0.75rem' }}>{ownerAddress || "Loading..."}</span>
          </div>
        </div>

        {/* Owner Operations */}
        {isOwner && (
          <div style={{ ...cardStyle, border: '1px solid #D9F99D' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#059669', borderBottom: '1px solid #F0FDF4', paddingBottom: '12px' }}>
              👑 Contract Owner Operations
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
              <input
                style={inputStyle}
                placeholder="Invoice ID (Unique)"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                disabled={loading}
              />
              <input
                style={{ ...inputStyle, width: '100%' }}
                placeholder="Amount (USDC)"
                value={amountToCreate}
                onChange={(e) => setAmountToCreate(e.target.value)}
                disabled={loading}
                type="number"
              />
              <button
                onClick={createInvoice}
                disabled={loading || !invoiceId || !amountToCreate}
                style={getButtonStyle('#10B981', loading || !invoiceId || !amountToCreate, true)}
              >
                {loading ? 'Processing...' : 'Create Invoice'}
              </button>
            </div>
            <button
              onClick={withdrawAll}
              disabled={loading}
              style={getButtonStyle('#EF4444', loading, true)}
            >
              {loading ? 'Processing...' : 'Withdraw All Funds (Owner)'}
            </button>
          </div>
        )}

        {/* Invoice Query & Payment */}
        <div style={{ ...cardStyle, border: '1px solid #BFDBFE' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#1E40AF', borderBottom: '1px solid #EFF6FF', paddingBottom: '12px' }}>
            🔍 Invoice Query & Payment
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            <input
              style={inputStyle}
              placeholder="Invoice ID to Query / Pay"
              value={queryId}
              onChange={(e) => setQueryId(e.target.value)}
              disabled={loading}
            />
            <div style={{ display: 'flex', gap: '16px' }}>
                <button
                onClick={() => queryInvoice(queryId)}
                disabled={loading || !queryId}
                style={getButtonStyle('#3B82F6', loading || !queryId, true)}
                >
                {loading ? 'Querying...' : 'Query'}
                </button>
                <button
                onClick={payInvoice}
                disabled={loading || !queryId || !connectedAddress}
                style={getButtonStyle('#F59E0B', loading || !queryId || !connectedAddress, true)}
                >
                {loading ? 'Payment Processing...' : 'Pay'}
                </button>
            </div>
          </div>

          {/* Invoice Details Display */}
          {invoiceData && (
            <div style={{ marginTop: '24px', padding: '24px', borderRadius: '16px', backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE', boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.05)' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '16px', color: '#1E40AF', borderBottom: '1px solid #E0F2F1', paddingBottom: '8px' }}>Invoice Details (ID: {queryId})</h3>
              <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <DetailItem label="Amount (USDC)" value={getEthers().formatUnits(invoiceData.amount, 6)} />
                <DetailItem label="Issuer" value={invoiceData.issuer} isAddress={true} />
                <DetailItem
                    label="Payment Status"
                    value={invoiceData.paid ? "Paid" : "Not Paid"}
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

      {/* Basic Media Query for responsiveness */}
      <style jsx global>{`
          @media (min-width: 640px) {
              /* Dikey hizalamaları yatay yapar */
              .responsive-flex-row {
                  flex-direction: row;
              }
              .responsive-align-end {
                  text-align: right;
              }
              .responsive-full-width-sm {
                  width: auto;
              }
          }
      `}</style>

    </div>
  );
}
