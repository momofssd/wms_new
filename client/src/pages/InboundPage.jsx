import { useEffect, useRef, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import { playLast4Digits } from "../utils/audio";
import { useScannerInput } from "../utils/scannerInput";

const InboundPage = () => {
  const { user, defaultLocation, audioEnabled } = useAuth();
  const [activeTab, setActiveTab] = useState("multi");
  const [locations, setLocations] = useState([]);
  const [skus, setSkus] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // Multi Entry State
  const [multiStep, setMultiStep] = useState(1);
  const [multiScanInput, setMultiScanInput] = useState("");
  const [multiScannedSku, setMultiScannedSku] = useState("");
  const [multiQty, setMultiQty] = useState(1);
  const [multiLoc, setMultiLoc] = useState("");

  const {
    isDisabled: isMultiDisabled,
    handleInputChange: handleMultiInputChange,
  } = useScannerInput(setMultiScanInput);

  // Single Entry State
  const [singleSessionActive, setSingleSessionActive] = useState(false);
  const [singleLoc, setSingleLoc] = useState("");
  const [singleScanInput, setSingleScanInput] = useState("");

  const {
    isDisabled: isSingleDisabled,
    handleInputChange: handleSingleInputChange,
  } = useScannerInput(setSingleScanInput);

  const [singleSessionLog, setSingleSessionLog] = useState([]);
  const [skuMap, setSkuMap] = useState({});

  // Manual Entry State
  const [manualSku, setManualSku] = useState("");
  const [manualQty, setManualQty] = useState(1);
  const [manualLoc, setManualLoc] = useState("");

  const multiScanRef = useRef(null);
  const singleScanRef = useRef(null);

  useEffect(() => {
    fetchLocations();
    fetchSkus();
    fetchTransactions();
  }, []);

  useEffect(() => {
    if (defaultLocation) {
      setMultiLoc(defaultLocation);
      setSingleLoc(defaultLocation);
      setManualLoc(defaultLocation);
    }
  }, [defaultLocation]);

  // Force Focus Helper
  const forceFocus = (ref) => {
    if (ref.current) {
      ref.current.focus();
    }
  };

  // Keep focus locked
  useEffect(() => {
    const handleGlobalClick = () => {
      if (activeTab === "multi" && multiStep === 1) forceFocus(multiScanRef);
      if (activeTab === "single" && singleSessionActive && singleLoc)
        forceFocus(singleScanRef);
    };

    window.addEventListener("click", handleGlobalClick);

    const interval = setInterval(() => {
      if (activeTab === "multi" && multiStep === 1) forceFocus(multiScanRef);
      if (activeTab === "single" && singleSessionActive && singleLoc)
        forceFocus(singleScanRef);
    }, 500); // Aggressive refocus every 500ms

    return () => {
      window.removeEventListener("click", handleGlobalClick);
      clearInterval(interval);
    };
  }, [activeTab, multiStep, singleSessionActive, singleLoc]);

  const fetchLocations = async () => {
    try {
      const res = await api.get("/master-data/locations");
      const activeLocs = res.data
        .filter((l) => l.active)
        .map((l) => l.location);
      setLocations(activeLocs);
    } catch (err) {
      console.error("Error fetching locations", err);
    }
  };

  const fetchSkus = async () => {
    try {
      const res = await api.get("/master-data/materials");
      const activeSkusData = res.data.filter((m) => m.active);
      setSkus(activeSkusData.map((m) => m.sku));

      const map = {};
      activeSkusData.forEach((m) => {
        map[m.sku] = m.product_name;
      });
      setSkuMap(map);
    } catch (err) {
      console.error("Error fetching skus", err);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await api.get("/transactions");
      // Filter for type 'inbound' and location NOT 'amazon'
      const filtered = res.data.filter(
        (t) =>
          String(t.type).toLowerCase() === "inbound" &&
          String(t.location || "").toLowerCase() !== "amazon",
      );
      setTransactions(filtered);
    } catch (err) {
      console.error("Error fetching transactions", err);
    }
  };

  // Multi Entry Handlers
  const handleMultiScanSubmit = (e) => {
    if (e) e.preventDefault();
    const cleaned = multiScanInput.trim().toUpperCase();
    if (!cleaned) return;
    setMultiScannedSku(cleaned);
    setMultiStep(2);
    setMultiScanInput("");
    playLast4Digits(cleaned, audioEnabled);
  };

  const handleMultiSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/inbound/submit", {
        items: [{ sku: multiScannedSku, qty: multiQty }],
        location: multiLoc,
      });
      setMessage({
        type: "success",
        text: `Inbound Successful: SKU ${multiScannedSku}, QTY ${multiQty}, LOC ${multiLoc} (Movement Num: ${res.data.message.split(": ")[1] || ""})`,
      });
      setMultiStep(1);
      setMultiScannedSku("");
      setMultiQty(1);
      fetchTransactions();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Inbound failed",
      });
    }
  };

  // Single Entry Handlers
  const handleSingleScan = (e) => {
    e.preventDefault();
    const cleaned = singleScanInput.trim().toUpperCase();
    if (!cleaned) return;

    if (skuMap[cleaned]) {
      setSingleSessionLog([
        {
          timestamp: new Date(),
          sku: cleaned,
          product_name: skuMap[cleaned],
          qty: 1,
        },
        ...singleSessionLog,
      ]);
      setMessage({ type: "success", text: `Scanned: ${cleaned}` });
      playLast4Digits(cleaned, audioEnabled);
    } else {
      setMessage({
        type: "error",
        text: `SKU ${cleaned} is not registered or deactivated.`,
      });
    }
    setSingleScanInput("");
  };

  const handleSingleSubmit = async () => {
    if (singleSessionLog.length === 0 || !singleLoc) return;

    // Aggregate by SKU for the API call
    const aggregates = {};
    singleSessionLog.forEach((item) => {
      if (!aggregates[item.sku]) {
        aggregates[item.sku] = { sku: item.sku, qty: 0 };
      }
      aggregates[item.sku].qty += item.qty;
    });

    const itemsArray = Object.values(aggregates);

    try {
      const res = await api.post("/inbound/submit", {
        items: itemsArray,
        location: singleLoc,
      });

      // Construct detailed success message for single entry
      const summary = itemsArray
        .map((i) => `SKU ${i.sku} (QTY ${i.qty})`)
        .join(", ");
      setMessage({
        type: "success",
        text: `Inbound Successful: ${summary} @ LOC ${singleLoc} (Movement Num: ${res.data.message.split(": ")[1] || ""})`,
      });

      setSingleSessionLog([]);
      setSingleSessionActive(false);
      fetchTransactions();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Inbound failed",
      });
    }
  };

  // Manual Entry Handlers
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualSku || !manualLoc || manualQty < 1) {
      setMessage({ type: "error", text: "Please select SKU and Location" });
      return;
    }
    try {
      const res = await api.post("/inbound/submit", {
        items: [{ sku: manualSku, qty: manualQty }],
        location: manualLoc,
      });
      setMessage({
        type: "success",
        text: `Inbound Successful: SKU ${manualSku}, QTY ${manualQty}, LOC ${manualLoc} (Movement Num: ${res.data.message.split(": ")[1] || ""})`,
      });
      setManualSku("");
      setManualQty(1);
      // setManualLoc(""); // Keep location
      fetchTransactions();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Inbound failed",
      });
    }
  };

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = transactions
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(transactions.length / itemsPerPage);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Inbound Entry</h1>

      <div className="flex space-x-4 mb-6 border-b">
        <button
          className={`pb-2 px-4 ${activeTab === "multi" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("multi");
            setMessage({ type: "", text: "" });
          }}
        >
          Inbound Multi Entry
        </button>
        <button
          className={`pb-2 px-4 ${activeTab === "single" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("single");
            setMessage({ type: "", text: "" });
          }}
        >
          Inbound Single Entry
        </button>
        <button
          className={`pb-2 px-4 ${activeTab === "manual" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("manual");
            setMessage({ type: "", text: "" });
          }}
        >
          Manual Inbound Entry
        </button>
      </div>

      {message.text && (
        <div
          className={`mb-4 p-4 rounded ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}
        >
          {message.text}
        </div>
      )}

      {activeTab === "multi" && (
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold mb-4">Scan SKU Inbound</h2>
          {multiStep === 1 ? (
            <div className="bg-white p-6 rounded shadow border">
              <p className="text-sm text-gray-500 mb-4">
                Step 1: Scan SKU label
              </p>
              <form onSubmit={handleMultiScanSubmit} className="flex space-x-4">
                <input
                  ref={multiScanRef}
                  type="text"
                  placeholder="SCAN SKU"
                  value={multiScanInput}
                  onChange={handleMultiInputChange}
                  disabled={isMultiDisabled}
                  className={`flex-1 border rounded px-4 py-2 ${isMultiDisabled ? "bg-red-100 border-red-500 cursor-not-allowed" : ""}`}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 text-white rounded px-6 py-2 font-medium hover:bg-indigo-700"
                >
                  Next
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white p-6 rounded shadow border">
              <p className="text-sm text-gray-500 mb-2">
                Step 2: Enter details and submit
              </p>
              <div className="bg-blue-50 p-3 rounded text-blue-800 font-medium mb-6 flex justify-between items-center">
                <span>Scanned SKU: {multiScannedSku}</span>
                <button
                  onClick={() => setMultiStep(1)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Back
                </button>
              </div>
              <form onSubmit={handleMultiSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={multiQty}
                      onChange={(e) => setMultiQty(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <select
                      value={multiLoc}
                      onChange={(e) => setMultiLoc(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      required
                    >
                      <option value="">Select Location</option>
                      {locations.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-indigo-600 text-white rounded py-2 font-medium hover:bg-indigo-700"
                >
                  Submit Scanned Inbound
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {activeTab === "single" && (
        <div className="grid grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded shadow border h-fit">
            <h2 className="text-xl font-semibold mb-4">Scan Terminal</h2>
            <button
              onClick={() => {
                setSingleSessionActive(true);
                setSingleSessionLog([]);
              }}
              className="w-full bg-indigo-600 text-white rounded py-2 font-medium hover:bg-indigo-700 mb-4"
            >
              New Session
            </button>
            {singleSessionActive && (
              <button
                onClick={() => setSingleSessionActive(false)}
                className="w-full bg-gray-200 text-gray-700 rounded py-2 font-medium hover:bg-gray-300 mb-6"
              >
                Reset
              </button>
            )}

            {!singleSessionActive ? (
              <div className="bg-blue-50 p-4 rounded text-blue-700 text-sm text-center">
                Click <strong>New Session</strong> to begin scanning.
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Location
                  </label>
                  <select
                    value={singleLoc}
                    onChange={(e) => setSingleLoc(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    required
                  >
                    <option value="">Select Location</option>
                    {locations.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                {singleLoc && (
                  <>
                    <hr />
                    <form onSubmit={handleSingleScan}>
                      <input
                        ref={singleScanRef}
                        type="text"
                        placeholder="SCAN SKU"
                        value={singleScanInput}
                        onChange={handleSingleInputChange}
                        disabled={isSingleDisabled}
                        className={`w-full border rounded px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none ${isSingleDisabled ? "bg-red-100 border-red-500 cursor-not-allowed" : ""}`}
                        autoComplete="off"
                      />
                    </form>
                    <p className="text-xs text-gray-500 text-center">
                      Scan SKU barcode to add to session...
                    </p>
                    <hr />
                    <button
                      onClick={handleSingleSubmit}
                      disabled={singleSessionLog.length === 0}
                      className="w-full bg-indigo-600 text-white rounded py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Confirm Submit
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded shadow border min-h-[400px]">
            <h2 className="text-xl font-semibold mb-2">Session Log</h2>
            {singleSessionLog.length > 0 ? (
              <div>
                <p className="text-sm text-gray-500 mb-4">
                  Items scanned: <strong>{singleSessionLog.length}</strong> |
                  Total Qty:{" "}
                  <strong>
                    {singleSessionLog.reduce((acc, curr) => acc + curr.qty, 0)}
                  </strong>
                </p>
                <div className="border rounded overflow-hidden max-h-[500px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Timestamp
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          SKU
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Qty
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {singleSessionLog.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                            {item.timestamp.toLocaleTimeString()}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                            {item.sku}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                            {item.qty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No scans in this session.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "manual" && (
        <div className="max-w-2xl bg-white p-6 rounded shadow border">
          <h2 className="text-xl font-semibold mb-6">Manual Inbound Entry</h2>
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU
                </label>
                <select
                  value={manualSku}
                  onChange={(e) => setManualSku(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  required
                >
                  <option value="">Select SKU</option>
                  {skus.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={manualQty}
                  onChange={(e) => setManualQty(parseInt(e.target.value))}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <select
                  value={manualLoc}
                  onChange={(e) => setManualLoc(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  required
                >
                  <option value="">Select Location</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white rounded py-2 font-medium hover:bg-indigo-700"
            >
              Submit Stock Entry
            </button>
          </form>
        </div>
      )}

      {/* Transactions Table */}
      <div className="mt-12">
        <h2 className="text-xl font-bold mb-4">Inbound History</h2>

        {/* Pagination Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 border-x border-t rounded-t shadow-sm gap-4">
          <div className="flex items-center space-x-2 text-sm text-gray-700">
            <span>Show</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border rounded px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {[10, 15, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>entries</span>
            <span className="ml-4 text-gray-500">
              Showing {transactions.length > 0 ? indexOfFirstItem + 1 : 0} to{" "}
              {Math.min(indexOfLastItem, transactions.length)} of{" "}
              {transactions.length} entries
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <div className="px-4 py-1 text-sm font-medium">
              Page {currentPage} of {totalPages || 1}
            </div>
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Last
            </button>
          </div>
        </div>

        <div className="bg-white rounded-b shadow border overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Movement #
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentItems.length > 0 ? (
                  currentItems.map((tx, idx) => (
                    <tr key={tx._id || idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(tx.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {tx.sku}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {tx.inbound_qty || tx.qty}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {tx.location}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {tx.movement_transaction_num || "N/A"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-6 py-10 text-center text-sm text-gray-400"
                    >
                      No inbound transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InboundPage;
