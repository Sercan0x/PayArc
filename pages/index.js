import { useEffect, useState } from "react";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const ARC_RPC = process.env.NEXT_PUBLIC_ARC_RPC;

const ABI = [
  "function owner() view returns (address)",
  "function createInvoice(string id, uint256 amountWei)",
  "function getInvoice(string id) view returns (uint256 amountWei, address issuer, bool paid, address payer, uint256 paidAt)",
  "function payInvoice(string id) payable",
  "function withdraw()"
];

export default function Home() {
  const [connectedAddress, setConnectedAddress] = useState(null);
  const [ownerAddress, setOwnerAddress] = useState(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [queryId, setQueryId] = useState("");
  const [invoiceData, setInvoiceData] = useState(null);
  const [amountToCreate, setAmountToCreate] = useState(""); // in ETH for convenience
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadOwner() {
      try {
        const provider = new ethers.JsonRpcProvider(ARC_RPC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        const owner = await contract.owner();
        setOwnerAddress(owner);
      } catch (err) {
        console.error("loadOwner error", err);
      }
    }
    if (CONTRACT_ADDRESS && ARC_RPC) loadOwner();
  }, []);

  async function connectWallet() {
    if (!window.ethereum) return alert("MetaMask required");
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const addr = await signer.getAddress();
    setConnectedAddress(addr);
  }

  async function createInvoice() {
    try {
      if (!window.ethereum) return alert("MetaMask required");
      if (!invoiceId || !amountToCreate) return alert("Provide id and amount");
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      const amountWei = ethers.parseEther(amountToCreate); // user gives ETH amount
      const tx = await contract.createInvoice(invoiceId, amountWei);
      await tx.wait();
      alert("Invoice created");
      setInvoiceId("");
      setAmountToCreate("");
    } catch (err) {
      console.error(err);
      alert("Error: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function queryInvoice() {
    try {
      if (!queryId) return alert("Provide invoice id");
      setLoading(true);
      const provider = new ethers.JsonRpcProvider(ARC_RPC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      const res = await contract.getInvoice(queryId);
      // res: [amountWei, issuer, paid, payer, paidAt]
      setInvoiceData({
        amountWei: res[0].toString(),
        issuer: res[1],
        paid: res[2],
        payer: res[3],
        paidAt: res[4].toNumber ? res[4].toNumber() : Number(res[4])
      });
    } catch (err) {
      console.error(err);
      alert("Error: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function payInvoice() {
    try {
      if (!window.ethereum) return alert("MetaMask required");
      if (!queryId) return alert("Provide invoice id to pay");
      setLoading(true);

      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      // get invoice to know amount
      const res = await contract.getInvoice(queryId);
      const amountWei = res[0];
      if (amountWei === 0) return alert("Invoice not found or zero amount");
      const tx = await contract.payInvoice(queryId, { value: amountWei });
      await tx.wait();
      alert("Invoice paid");
      queryInvoice();
    } catch (err) {
      console.error(err);
      alert("Error: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function withdrawAll() {
    try {
      if (!window.ethereum) return alert("MetaMask required");
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.withdraw();
      await tx.wait();
      alert("Withdrawn");
    } catch (err) {
      console.error(err);
      alert("Error: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  const isOwner = connectedAddress && ownerAddress && connectedAddress.toLowerCase() === ownerAddress.toLowerCase();

  return (
    <div style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Invoice Registry (Testnet)</h1>

      <div style={{ marginBottom: 12 }}>
        {!connectedAddress ? (
          <button onClick={connectWallet}>Connect Wallet</button>
        ) : (
          <div>Connected: {connectedAddress}</div>
        )}
        <div>Contract owner: {ownerAddress || "loading..."}</div>
      </div>

      {isOwner && (
        <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 20 }}>
          <h3>Create Invoice (owner)</h3>
          <input placeholder="invoice id" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
          <input placeholder="amount (ETH)" value={amountToCreate} onChange={(e) => setAmountToCreate(e.target.value)} style={{ marginLeft: 8 }} />
          <button onClick={createInvoice} disabled={loading || !invoiceId || !amountToCreate} style={{ marginLeft: 8 }}>Create</button>
          <div style={{ marginTop: 8 }}>
            <button onClick={withdrawAll} disabled={loading}>Withdraw contract balance (owner)</button>
          </div>
        </div>
      )}

      <div style={{ border: "1px solid #ddd", padding: 12 }}>
        <h3>Query / Pay Invoice</h3>
        <input placeholder="invoice id" value={queryId} onChange={(e) => setQueryId(e.target.value)} />
        <button onClick={queryInvoice} disabled={loading || !queryId} style={{ marginLeft: 8 }}>Query</button>
        <button onClick={payInvoice} disabled={loading || !queryId} style={{ marginLeft: 8 }}>Pay</button>

        {invoiceData && (
          <div style={{ marginTop: 12, textAlign: "left" }}>
            <div>Amount (wei): {invoiceData.amountWei}</div>
            <div>Amount (ETH): {invoiceData.amountWei ? (Number(invoiceData.amountWei) / 1e18) : 0}</div>
            <div>Issuer: {invoiceData.issuer}</div>
            <div>Paid: {invoiceData.paid ? "Yes" : "No"}</div>
            <div>Payer: {invoiceData.payer}</div>
            <div>PaidAt (unix): {invoiceData.paidAt}</div>
          </div>
        )}
      </div>
    </div>
  );
}
