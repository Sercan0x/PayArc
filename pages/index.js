<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PayArc Invoice System</title>
  <!-- React ve ReactDOM CDN -->
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <!-- Babel CDN -->
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <!-- Ethers.js CDN -->
  <script src="https://cdn.jsdelivr.net/npm/ethers@6.11.1/dist/ethers.umd.min.js"></script>
  <!-- Lucide Icons CDN -->
  <script src="https://cdn.jsdelivr.net/npm/lucide@latest/dist/lucide.min.js"></script>
  <style>
    body { 
      margin: 0; 
      font-family: sans-serif; 
      background: #a0d8f1; 
      display: flex; 
      justify-content: center; 
      align-items: center; 
      min-height: 100vh; 
    }
    .container { 
      background: white; 
      padding: 30px; 
      border-radius: 20px; 
      box-shadow: 0 10px 25px rgba(0,0,0,0.2); 
      max-width: 500px; 
      width: 100%;
      text-align: center;
    }
    h1 { margin-bottom: 20px; color: #1a202c; }
    input { padding: 10px; border-radius: 10px; border: 1px solid #ccc; width: 80%; margin-bottom: 10px; text-align: center; }
    button { padding: 10px 20px; border-radius: 12px; border: none; cursor: pointer; font-weight: bold; margin: 5px; }
    .connect { background: #4f46e5; color: white; }
    .query { background: #10b981; color: white; }
    .pay { background: #f59e0b; color: white; }
    .invoice-box { background: #e0f2fe; padding: 15px; border-radius: 12px; margin-top: 15px; text-align: left; }
    .modal { 
      position: fixed; top:0; left:0; right:0; bottom:0; 
      background: rgba(0,0,0,0.6); 
      display:flex; justify-content:center; align-items:center;
    }
    .modal-content { background:white; padding:20px; border-radius:12px; max-width:300px; text-align:center; }
  </style>
</head>
<body>
  <div id="root"></div>

  <script type="text/babel">

    const { useState, useEffect, useCallback } = React;
    const CONTRACT_ADDRESS = ""; // <--- Buraya kontrat adresinizi koyun
    const ARC_RPC = ""; // <--- Buraya RPC URL koyun
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
      const showModal = (msg) => setModalMessage(msg);
      const hideModal = () => setModalMessage(null);
      return { modalMessage, showModal, hideModal };
    };

    const getEthers = () => {
      if (window.ethers) return window.ethers;
      console.error("Ethers not loaded");
      return null;
    };

    function App() {
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
          const ethers = getEthers();
          if (!ethers || !CONTRACT_ADDRESS || !ARC_RPC) return;
          try {
            const provider = new ethers.JsonRpcProvider(ARC_RPC);
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            const owner = await contract.owner();
            setOwnerAddress(owner);
          } catch (err) { console.error(err); }
        }
        loadOwner();
      }, []);

      async function connectWallet() {
        const ethers = getEthers();
        if (!ethers || !window.ethereum) return showModal("MetaMask required");
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          await provider.send("eth_requestAccounts", []);
          const signer = await provider.getSigner();
          const addr = await signer.getAddress();
          setConnectedAddress(addr);
        } catch(err) { showModal("Failed to connect wallet"); }
      }

      const isOwner = connectedAddress && ownerAddress && connectedAddress.toLowerCase() === ownerAddress.toLowerCase();

      const queryInvoice = useCallback(async () => {
        const ethers = getEthers();
        if (!ethers || !queryId) return;
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
        } catch(err) { showModal("Error querying invoice"); }
        setLoading(false);
      }, [queryId]);

      async function payInvoice() { alert("Payment function triggered"); }

      return (
        <div className="container">
          <h1>PayArc Invoice System</h1>

          {!connectedAddress ? (
            <button className="connect" onClick={connectWallet}>Connect Wallet</button>
          ) : (
            <p>Connected: {connectedAddress}</p>
          )}

          <input placeholder="Invoice ID" value={queryId} onChange={(e)=>setQueryId(e.target.value)} />

          <div>
            <button className="query" onClick={queryInvoice} disabled={!queryId || loading}>
              {loading ? "Querying..." : "Query"}
            </button>
            <button className="pay" onClick={payInvoice} disabled={!queryId || !connectedAddress}>
              Pay
            </button>
          </div>

          {invoiceData && (
            <div className="invoice-box">
              <p>Amount: {getEthers().formatUnits(invoiceData.amount,6)}</p>
              <p>Issuer: {invoiceData.issuer}</p>
              <p>Status: {invoiceData.paid ? "Paid" : "Pending"}</p>
              <p>Payer: {invoiceData.paid ? invoiceData.payer : "-"}</p>
              <p>Payment Date: {invoiceData.paid ? new Date(Number(invoiceData.paidAt)*1000).toLocaleString() : "-"}</p>
            </div>
          )}

          {modalMessage && (
            <div className="modal" onClick={hideModal}>
              <div className="modal-content">
                <p>{modalMessage}</p>
                <button onClick={hideModal}>Close</button>
              </div>
            </div>
          )}
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<App />);
  </script>
</body>
</html>
