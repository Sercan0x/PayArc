import { useEffect, useState } from "react";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = 0x5356eC996950f361791d8c6354C7dafd5dE62863;
const ARC_RPC = process.env.NEXT_PUBLIC_ARC_RPC;
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"; // Arc testnet USDC

const CONTRACT_ABI = [
  "function owner() view returns (address)",
  "function createInvoice(string id, uint256 amount)",
  "function getInvoice(string id) view returns (uint256 amount, address issuer, bool paid)",
  "function payInvoice(string id)",
  "function withdraw()"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

export default function Home() {
  const [connectedAddress, setConnectedAddress] = useState(null);
  const [ownerAddress, setOwnerAddress] = useState(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [queryId, setQueryId] = useState("");
  const [invoiceData, setInvoiceData] = useState(null);
  const [amountToCreate, setAmountToCreate] = useState("");
  const [loading, setLoading] = useState(false);

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
    if (!window.ethereum) return alert("MetaMask required");
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    setConnectedAddress(await signer.getAddress());
  }

  const isOwner = connectedAddress && ownerAddress && connectedAddress.toLowerCase() === ownerAddress.toLowerCase();

  async function createInvoice() {
    if (!invoiceId || !amountToCreate) return alert("Provide id and amount");
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const amountUSDC = ethers.parseUnits(amountToCreate, 6); // USDC = 6 decimals
      const tx = await contract.createInvoice(invoiceId, amountUSDC);
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
    if (!queryId) return alert("Provide invoice id");
    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const res = await contract.getInvoice(queryId);

      setInvoiceData({
        amount: res[0],
        issuer: res[1],
        paid: res[2],
        payer: "-",
        paidAt: "-"
      });
    } catch (err) {
      console.error(err);
      alert("Error: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function payInvoice() {
    if (!queryId) return alert("Provide invoice id");
    if (!window.ethereum) return alert("MetaMask required");
    setLoading(true);

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

      const invoice = await contract.getInvoice(queryId);
      const amount = invoice[0];

      // Approve if allowance < amount
      const allowance = await usdc.allowance(connectedAddress, CONTRACT_ADDRESS);
      if (allowance < amount) {
        const approveTx = await usdc.approve(CONTRACT_ADDRESS, amount);
        await approveTx.wait();
      }

      const tx = await contract.payInvoice(queryId);
      await tx.wait();
      alert("Invoice paid!");
      queryInvoice();
    } catch (err) {
      console.error(err);
      alert("Error: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function withdrawAll() {
    if (!window.ethereum) return alert("MetaMask required");
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
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

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Invoice Registry (Arc Testnet)</h1>

        <div className="mb-6 flex justify-between items-center">
          {!connectedAddress ? (
            <button onClick={connectWallet} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Connect Wallet</button>
          ) : (
            <div className="text-gray-700">Connected: {connectedAddress}</div>
          )}
          <div className="text-gray-500">Owner: {ownerAddress || "loading..."}</div>
        </div>

        {isOwner && (
          <div className="bg-white p-6 rounded shadow mb-6">
            <h2 className="text-xl font-semibold mb-4">Create Invoice</h2>
            <div className="flex gap-2 mb-4">
              <input className="border p-2 rounded flex-1" placeholder="Invoice ID" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
              <input className="border p-2 rounded w-32" placeholder="Amount (USDC)" value={amountToCreate} onChange={(e) => setAmountToCreate(e.target.value)} />
              <button onClick={createInvoice} disabled={loading || !invoiceId || !amountToCreate} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Create</button>
            </div>
            <button onClick={withdrawAll} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Withdraw All</button>
          </div>
        )}

        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-xl font-semibold mb-4">Query / Pay Invoice</h2>
          <div className="flex gap-2 mb-4">
            <input className="border p-2 rounded flex-1" placeholder="Invoice ID" value={queryId} onChange={(e) => setQueryId(e.target.value)} />
            <button onClick={queryInvoice} disabled={loading || !queryId} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Query</button>
            <button onClick={payInvoice} disabled={loading || !queryId} className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700">Pay</button>
          </div>

          {invoiceData && (
            <div className="mt-4 bg-gray-50 p-4 rounded border">
              <div>Amount (USDC): {ethers.formatUnits(invoiceData.amount, 6)}</div>
              <div>Issuer: {invoiceData.issuer}</div>
              <div>Paid: {invoiceData.paid ? "Yes" : "No"}</div>
              <div>Payer: {invoiceData.paid ? invoiceData.payer : "-"}</div>
              <div>Paid At: {invoiceData.paid ? new Date(invoiceData.paidAt * 1000).toLocaleString() : "-"}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
