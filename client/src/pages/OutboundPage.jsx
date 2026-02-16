import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { playLast4Digits } from "../utils/audio";

const OutboundPage = () => {
  const { user, defaultLocation, audioEnabled } = useAuth();
  const [activeTab, setActiveTab] = useState("scan");
  const [locations, setLocations] = useState([]);
  const [skus, setSkus] = useState([]);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Scan Outbound State
  const [sessionActive, setSessionActive] = useState(false);
  const [currentLoc, setCurrentLoc] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [scanPair, setScanPair] = useState([]);
  const [sessionLog, setSessionLog] = useState([]);
  const [confirmed, setConfirmed] = useState(false);

  // Batch/PDF Load State
  const [batchLoc, setBatchLoc] = useState("");
  const [batchSku, setBatchSku] = useState("");
  const [batchQtyPerLabel, setBatchQtyPerLabel] = useState(1);
  const [pdfFile, setPdfFile] = useState(null);
  const [isConsolidated, setIsConsolidated] = useState(false);
  const [processingPdf, setProcessingPdf] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const scannerRef = useRef(null);

  useEffect(() => {
    fetchLocations();
    fetchSkus();
  }, []);

  useEffect(() => {
    if (defaultLocation) {
      setCurrentLoc(defaultLocation);
      setBatchLoc(defaultLocation);
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
      if (activeTab === "scan" && sessionActive && currentLoc) {
        forceFocus(scannerRef);
      }
    };

    window.addEventListener("click", handleGlobalClick);

    const interval = setInterval(() => {
      if (activeTab === "scan" && sessionActive && currentLoc) {
        forceFocus(scannerRef);
      }
    }, 500); // Aggressive refocus every 500ms

    return () => {
      window.removeEventListener("click", handleGlobalClick);
      clearInterval(interval);
    };
  }, [activeTab, sessionActive, currentLoc]);

  const fetchLocations = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/outbound/locations",
      );
      setLocations(res.data);
    } catch (err) {
      console.error("Error fetching locations", err);
    }
  };

  const fetchSkus = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/master-data/materials",
      );
      setSkus(res.data.filter((m) => m.active));
    } catch (err) {
      console.error("Error fetching skus", err);
    }
  };

  const handleNewSession = (tab) => {
    setSessionLog([]);
    setScanPair([]);
    setConfirmed(false);
    setSessionActive(true);
    setMessage({ type: "", text: "" });
    // setCurrentLoc(""); // Keep default if active
    // setBatchLoc("");
    setBatchSku("");
    setBatchQtyPerLabel(1);
    setPdfFile(null);
    setActiveTab(tab);
  };

  const handleReset = () => {
    setSessionLog([]);
    setScanPair([]);
    setConfirmed(false);
    setSessionActive(false);
    setMessage({ type: "", text: "" });
  };

  const handleScan = async (e) => {
    e.preventDefault();
    const val = scanInput.trim().toUpperCase();
    if (!val) return;

    const newPair = [...scanPair, val];
    setScanInput("");

    if (newPair.length === 1) {
      setScanPair(newPair);
      playLast4Digits(val, audioEnabled);
    } else if (newPair.length === 2) {
      const sku = newPair[0];
      const tracking = newPair[1];

      try {
        const res = await axios.post(
          "http://localhost:5000/api/outbound/validate-scan",
          {
            sku,
            location: currentLoc,
          },
        );

        const entry = {
          timestamp: new Date().toISOString(),
          sku,
          product_name: res.data.product_name,
          shipment_id: tracking,
          location: currentLoc,
          outbound_qty: 1,
        };

        setSessionLog([entry, ...sessionLog]);
        setMessage({ type: "success", text: `Queued: ${sku}` });
      } catch (err) {
        setMessage({
          type: "error",
          text: err.response?.data?.message || "Scan validation failed",
        });
      }
      setScanPair([]);
    }
  };

  const handleProcessPdf = async () => {
    if (!pdfFile || !batchLoc || !batchSku) {
      setMessage({
        type: "error",
        text: "Please provide Location, SKU, and PDF file",
      });
      return;
    }

    setProcessingPdf(true);
    const formData = new FormData();
    formData.append("pdf", pdfFile);

    try {
      const pdfRes = await axios.post(
        "http://localhost:5000/api/outbound/process-pdf",
        formData,
      );
      const trackingNumbers = pdfRes.data.trackingNumbers;

      const valRes = await axios.post(
        "http://localhost:5000/api/outbound/validate-scan",
        {
          sku: batchSku,
          location: batchLoc,
        },
      );

      const newEntries = trackingNumbers.map((tracking) => ({
        timestamp: new Date().toISOString(),
        sku: batchSku,
        product_name: valRes.data.product_name,
        shipment_id: tracking,
        location: batchLoc,
        outbound_qty: batchQtyPerLabel,
      }));

      setSessionLog([...newEntries, ...sessionLog]);
      setMessage({
        type: "success",
        text: `Processed PDF: ${newEntries.length} labels found.`,
      });
      setPdfFile(null);
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "PDF processing failed",
      });
    } finally {
      setProcessingPdf(false);
    }
  };

  const handleConfirmSession = async () => {
    if (sessionLog.length === 0 || confirmed) return;

    try {
      const res = await axios.post(
        "http://localhost:5000/api/outbound/confirm-session",
        {
          pending: sessionLog,
        },
      );
      setMessage({ type: "success", text: res.data.message });
      setConfirmed(true);
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Confirmation failed",
      });
    }
  };

  const handleDeleteRow = (index) => {
    if (confirmed) return;
    const newLog = [...sessionLog];
    newLog.splice(index, 1);
    setSessionLog(newLog);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf") {
        setPdfFile(file);
      } else {
        setMessage({ type: "error", text: "Please upload a PDF file." });
      }
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Outbound Processing</h1>

      <div className="flex space-x-4 mb-6 border-b">
        <button
          className={`pb-2 px-4 ${activeTab === "scan" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("scan");
            setIsConsolidated(false);
          }}
        >
          📦 Scan Outbound
        </button>
        <button
          className={`pb-2 px-4 ${activeTab === "load" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("load");
            setIsConsolidated(false);
          }}
        >
          📄 Outbound Load (PDF)
        </button>
        <button
          className={`pb-2 px-4 ${activeTab === "consolidated" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("consolidated");
            setIsConsolidated(true);
          }}
        >
          📦 Outbound Consolidated (PDF)
        </button>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="flex space-x-4">
            <button
              onClick={() => handleNewSession(activeTab)}
              className="flex-1 bg-indigo-600 text-white rounded py-2 font-medium hover:bg-indigo-700"
            >
              New Session
            </button>
            {sessionActive && (
              <button
                onClick={handleReset}
                className="flex-1 bg-gray-200 text-gray-700 rounded py-2 font-medium hover:bg-gray-300"
              >
                Reset
              </button>
            )}
          </div>

          <div className="bg-white p-6 rounded shadow border">
            {!sessionActive ? (
              <div className="bg-blue-50 p-4 rounded text-blue-700 text-sm text-center">
                Click <strong>New Session</strong> to begin.
              </div>
            ) : (
              <div className="space-y-6">
                {activeTab === "scan" ? (
                  <>
                    <h2 className="text-xl font-semibold mb-4">
                      Scan Terminal
                    </h2>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select Station Location
                      </label>
                      <select
                        value={currentLoc}
                        onChange={(e) => setCurrentLoc(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                        disabled={confirmed}
                      >
                        <option value="">Select Location</option>
                        {locations.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>

                    {currentLoc && (
                      <>
                        <hr />
                        {message.text && (
                          <div
                            className={`p-3 rounded text-sm ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}
                          >
                            {message.text}
                          </div>
                        )}

                        <form onSubmit={handleScan}>
                          <input
                            ref={scannerRef}
                            type="text"
                            placeholder="SCAN SKU / SHIPMENT ID"
                            value={scanInput}
                            onChange={(e) => setScanInput(e.target.value)}
                            className="w-full border rounded px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                            disabled={confirmed}
                          />
                        </form>

                        {scanPair.length === 0 ? (
                          <div className="bg-blue-50 p-3 rounded text-blue-700 text-sm">
                            Awaiting SKU scan...
                          </div>
                        ) : (
                          <div className="bg-yellow-50 p-3 rounded text-yellow-800 text-sm border border-yellow-200 font-medium">
                            SKU {scanPair[0]} captured. Scan Shipment ID now.
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold mb-4">
                      {isConsolidated
                        ? "Consolidated Batch Upload"
                        : "Batch Upload Terminal"}
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Select Station Location
                        </label>
                        <select
                          value={batchLoc}
                          onChange={(e) => setBatchLoc(e.target.value)}
                          className="w-full border rounded px-3 py-2"
                          disabled={confirmed}
                        >
                          <option value="">Select Location</option>
                          {locations.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Select SKU
                        </label>
                        <select
                          value={batchSku}
                          onChange={(e) => setBatchSku(e.target.value)}
                          className="w-full border rounded px-3 py-2"
                          disabled={confirmed}
                        >
                          <option value="">Select SKU</option>
                          {skus.map((s) => (
                            <option key={s.sku} value={s.sku}>
                              {s.sku} - {s.product_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {isConsolidated && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Quantity per Label
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={batchQtyPerLabel}
                            onChange={(e) =>
                              setBatchQtyPerLabel(parseInt(e.target.value))
                            }
                            className="w-full border rounded px-3 py-2"
                            disabled={confirmed}
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Upload Shipment Labels (PDF)
                        </label>
                        <div
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md cursor-pointer transition-colors ${
                            isDragging
                              ? "border-indigo-500 bg-indigo-50"
                              : "border-gray-300 hover:border-gray-400"
                          }`}
                        >
                          <div className="space-y-1 text-center">
                            <svg
                              className="mx-auto h-12 w-12 text-gray-400"
                              stroke="currentColor"
                              fill="none"
                              viewBox="0 0 48 48"
                              aria-hidden="true"
                            >
                              <path
                                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <div className="flex text-sm text-gray-600">
                              <label className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none">
                                <span>Upload a file</span>
                                <input
                                  type="file"
                                  className="sr-only"
                                  accept=".pdf"
                                  onChange={(e) =>
                                    setPdfFile(e.target.files[0])
                                  }
                                  disabled={confirmed || processingPdf}
                                />
                              </label>
                              <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-gray-500">
                              PDF labels only
                            </p>
                            {pdfFile && (
                              <p className="text-sm font-bold text-indigo-600 mt-2">
                                Selected: {pdfFile.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleProcessPdf}
                        className="w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
                        disabled={confirmed || !pdfFile || processingPdf}
                      >
                        {processingPdf ? "Processing PDF..." : "Process PDF"}
                      </button>
                    </div>
                  </>
                )}

                <hr />
                {activeTab !== "scan" && message.text && (
                  <div
                    className={`p-3 rounded text-sm mb-4 ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}
                  >
                    {message.text}
                  </div>
                )}
                <button
                  onClick={handleConfirmSession}
                  disabled={confirmed || sessionLog.length === 0}
                  className="w-full bg-indigo-600 text-white rounded py-3 font-bold hover:bg-indigo-700 disabled:opacity-50"
                >
                  Confirm Session Complete
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow border text-sm">
          <h2 className="text-xl font-semibold mb-2">Live Session Log</h2>
          {sessionLog.length > 0 ? (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                Items scanned this session: <strong>{sessionLog.length}</strong>{" "}
                | Total Qty:{" "}
                <strong>
                  {sessionLog.reduce(
                    (acc, curr) => acc + (parseInt(curr.outbound_qty) || 1),
                    0,
                  )}
                </strong>
              </p>
              <div className="border rounded overflow-hidden max-h-[600px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Timestamp
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        SKU
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Shipment ID
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Qty
                      </th>
                      {!confirmed && <th className="px-3 py-2"></th>}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sessionLog.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 font-medium">
                          {item.sku}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                          {item.shipment_id}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                          {item.outbound_qty}
                        </td>
                        {!confirmed && (
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => handleDeleteRow(idx)}
                              className="text-red-600 hover:text-red-900 text-xs"
                            >
                              Delete
                            </button>
                          </td>
                        )}
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
    </div>
  );
};

export default OutboundPage;
