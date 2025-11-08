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
    <div style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.3)",
      backdropFilter: "blur(5px)",
      zIndex: 50,
      padding: "1rem"
    }}>
      <div style={{
        backgroundColor: "rgba(255,255,255,0.2)",
        backdropFilter: "blur(10px)",
        padding: "2rem",
        borderRadius: "2rem",
        boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
        maxWidth: "400px",
        width: "100%",
        textAlign: "center",
        border: "1px solid rgba(255,255,255,0.3)"
      }}>
        <p style={{ color: "#333", fontSize: "1.2rem", marginBottom: "1rem" }}>{message}</p>
        <button onClick={onClose} style={{
          width: "100%",
          padding: "0.5rem 1rem",
          fontWeight: "600",
          borderRadius: "1rem",
          backgroundColor: "rgba(255,255,255,0.3)",
          backdropFilter: "blur(5px)",
          border: "none",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseOver={(e)=>e.currentTarget.style.transform="scale(1.05)"}
        onMouseOut={(e)=>e.currentTarget.style.transform="scale(1)"}
        >
          Close
        </button>
      </div>
    </div>
  );

  const containerStyle = {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)",
    padding: "2rem",
    fontFamily: "sans-serif",
    flexDirection: "column",
  };

  const cardStyle = {
    width: "100%",
    maxWidth: "800px",
    backgroundColor: "rgba(255,255,255,0.2)",
    backdropFilter: "blur(10px)",
    padding: "2rem",
    borderRadius: "2rem",
    boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.3)",
    marginBottom: "2rem",
  };

  const buttonStyle = {
    padding: "0.75rem 1.5rem",
    borderRadius: "1rem",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
    backgroundColor: "rgba(255,255,255,0.3)",
    backdropFilter: "blur(5px)",
    margin: "0.5rem",
    transition: "all 0.2s ease",
  };

  const inputStyle = {
    padding: "0.75rem 1rem",
    borderRadius: "1rem",
    border: "1px solid #ccc",
    margin: "0.5rem",
    flex: 1,
    fontSize: "1rem",
  };

  return (
    <div style={containerStyle}>
      <h1 style={{ fontSize: "3rem", fontWeight: "800", marginBottom: "2rem", textAlign: "center" }}>
        PayArc Invoice Dashboard
      </h1>

      <div style={{...cardStyle, display:"flex", flexDirection:"column", alignItems:"center"}}>
        {!connectedAddress ? (
          <button onClick={connectWallet} style={buttonStyle}
            onMouseOver={(e)=>e.currentTarget.style.transform="scale(1.05)"}
            onMouseOut={(e)=>e.currentTarget.style.transform="scale(1)"}
          >Connect Wallet</button>
        ) : (
          <div style={{ color: "#333", marginBottom: "1rem", textAlign:"center" }}>
            Connected: <span style={{ fontFamily: "monospace", backgroundColor:"rgba(255,255,255,0.3)", padding:"0.25rem 0.5rem", borderRadius:"0.5rem", wordBreak:"break-all" }}>{connectedAddress}</span>
          </div>
        )}
        <div style={{ color:"#555", fontSize:"0.9rem", textAlign:"center" }}>
          Owner: {ownerAddress || "Loading..."}
        </div>
      </div>

      {/* Diğer kartlar ve butonlar da benzer şekilde cardStyle, buttonStyle ve inputStyle kullanılarak modernleştirilebilir */}

      {modalMessage && <Modal message={modalMessage} onClose={hideModal} />}
    </div>
  );
}
