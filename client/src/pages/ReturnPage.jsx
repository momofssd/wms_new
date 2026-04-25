import { useEffect, useRef, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import { playLast4Digits } from "../utils/audio";
import { useScannerInput } from "../utils/scannerInput";

const ReturnPage = () => {
  const { defaultLocation, audioEnabled } = useAuth();
  const [activeTab, setActiveTab] = useState("manual");
  const [locations, setLocations] = useState([]);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Manual Entry State
  const [manualSku, setManualSku] = useState("");
  const [manualQty, setManualQty] = useState(1);
  const [manualLoc, setManualLoc] = useState("");

  // Scan Entry State
  const [scanSessionActive, setScanSessionActive] = useState(false);
  const [scanLoc, setScanLoc] = useState("");
  const [scanInput, setScanInput] = useState("");
  const {
    isDisabled: isScanDisabled,
    handleInputChange: handleScanInputChange,
  } = useScannerInput(setScanInput);
  const [scanSessionLog, setScanSessionLog] = useState([]);
  const scanRef = useRef(null);

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (defaultLocation) {
      setManualLoc(defaultLocation);
      setScanLoc(defaultLocation);
    }
  }, [defaultLocation]);

  // Refocus for scanning
  useEffect(() => {
    const handleGlobalClick = () => {
      if (activeTab === "scan" && scanSessionActive && scanLoc) {
        scanRef.current?.focus();
      }
    };
    window.addEventListener("click", handleGlobalClick);
    const interval = setInterval(() => {
      if (activeTab === "scan" && scanSessionActive && scanLoc) {
        scanRef.current?.focus();
      }
    }, 500);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      clearInterval(interval);
    };
  }, [activeTab, scanSessionActive, scanLoc]);

  const fetchLocations = async () => {
    try {
      const res = await api.get("/master-data/locations");
      setLocations(
        res.data
          .filter((l) => l.active && l.location !== "AMAZON")
          .map((l) => l.location),
      );
    } catch (err) {
      console.error("Error fetching locations", err);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualSku || !manualLoc || manualQty < 1) {
      setMessage({
        type: "error",
        text: "Please enter SKU, quantity and location",
      });
      return;
    }
    try {
      await api.post("/inbound/return", {
        items: [{ sku: manualSku, qty: manualQty }],
        location: manualLoc,
      });
      setMessage({
        type: "success",
        text: `Return Successful: SKU ${manualSku}, QTY ${manualQty}, LOC ${manualLoc}`,
      });
      setManualSku("");
      setManualQty(1);
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Return failed",
      });
    }
  };

  const handleScanSubmit = (e) => {
    e.preventDefault();
    const cleaned = scanInput.trim().toUpperCase();
    if (!cleaned) return;

    setScanSessionLog([
      {
        timestamp: new Date(),
        sku: cleaned,
        qty: 1,
      },
      ...scanSessionLog,
    ]);
    setMessage({ type: "success", text: `Scanned: ${cleaned}` });
    playLast4Digits(cleaned, audioEnabled);
    setScanInput("");
  };

  const handleConfirmScan = async () => {
    if (scanSessionLog.length === 0 || !scanLoc) return;

    const aggregates = {};
    scanSessionLog.forEach((item) => {
      if (!aggregates[item.sku]) {
        aggregates[item.sku] = { sku: item.sku, qty: 0 };
      }
      aggregates[item.sku].qty += item.qty;
    });

    const itemsArray = Object.values(aggregates);

    try {
      await api.post("/inbound/return", {
        items: itemsArray,
        location: scanLoc,
      });

      setMessage({
        type: "success",
        text: `Return Successful for ${itemsArray.length} items at ${scanLoc}`,
      });
      setScanSessionLog([]);
      setScanSessionActive(false);
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Return failed",
      });
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Return Entry</h1>

      <div className="flex space-x-4 mb-6 border-b">
        <button
          className={`pb-2 px-4 ${activeTab === "manual" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("manual");
            setMessage({ type: "", text: "" });
          }}
        >
          Manual Return Entry
        </button>
        <button
          className={`pb-2 px-4 ${activeTab === "scan" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("scan");
            setMessage({ type: "", text: "" });
          }}
        >
          Scan Return Entry
        </button>
      </div>

      {message.text && (
        <div
          className={`mb-4 p-4 rounded ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}
        >
          {message.text}
        </div>
      )}

      {activeTab === "manual" && (
        <div className="max-w-md bg-white p-6 rounded shadow border">
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SKU
              </label>
              <input
                type="text"
                value={manualSku}
                onChange={(e) => setManualSku(e.target.value.toUpperCase())}
                className="w-full border rounded px-3 py-2"
                placeholder="Enter SKU"
                required
              />
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
                required
              />
            </div>
            <div>
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
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white rounded py-2 font-medium hover:bg-indigo-700"
            >
              Submit Return
            </button>
          </form>
        </div>
      )}

      {activeTab === "scan" && (
        <div className="grid grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded shadow border h-fit">
            <h2 className="text-xl font-semibold mb-4">Scan Terminal</h2>
            <button
              onClick={() => {
                setScanSessionActive(true);
                setScanSessionLog([]);
              }}
              className="w-full bg-indigo-600 text-white rounded py-2 font-medium hover:bg-indigo-700 mb-4"
            >
              New Session
            </button>
            {scanSessionActive && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Location
                  </label>
                  <select
                    value={scanLoc}
                    onChange={(e) => setScanLoc(e.target.value)}
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

                {scanLoc && (
                  <>
                    <hr />
                    <form onSubmit={handleScanSubmit}>
                      <input
                        ref={scanRef}
                        type="text"
                        placeholder="SCAN SKU"
                        value={scanInput}
                        onChange={handleScanInputChange}
                        disabled={isScanDisabled}
                        className={`w-full border rounded px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none ${isScanDisabled ? "bg-red-100 border-red-500 cursor-not-allowed" : ""}`}
                        autoComplete="off"
                      />
                    </form>
                    <p className="text-xs text-gray-500 text-center">
                      Scan SKU barcode to add to session...
                    </p>
                    <hr />
                    <button
                      onClick={handleConfirmScan}
                      disabled={scanSessionLog.length === 0}
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
            {scanSessionLog.length > 0 ? (
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
                    {scanSessionLog.map((item, idx) => (
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
            ) : (
              <p className="text-sm text-gray-400">No scans in this session.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnPage;
