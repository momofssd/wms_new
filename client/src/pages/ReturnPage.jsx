import { useEffect, useRef, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import { playLast4Digits } from "../utils/audio";
import { useScannerInput } from "../utils/scannerInput";

const ReturnPage = () => {
  const { defaultLocation, audioEnabled } = useAuth();
  const [activeTab, setActiveTab] = useState("manual");
  const [locations, setLocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [movements, setMovements] = useState([]);
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

  // Return Convert State
  const [convertReturnSku, setConvertReturnSku] = useState("");
  const [convertTargetSku, setConvertTargetSku] = useState("");
  const [convertLoc, setConvertLoc] = useState("");
  const [convertQty, setConvertQty] = useState(1);
  const [convertReturnSearch, setConvertReturnSearch] = useState("");
  const [convertTargetSearch, setConvertTargetSearch] = useState("");

  useEffect(() => {
    fetchLocations();
    fetchInventory();
    fetchMaterials();
    fetchMovements();
  }, []);

  useEffect(() => {
    if (defaultLocation) {
      setManualLoc(defaultLocation);
      setScanLoc(defaultLocation);
      setConvertLoc(defaultLocation);
    }
  }, [defaultLocation]);

  const activeSkuSet = new Set(
    materials.filter((m) => m.active).map((m) => String(m.sku).toUpperCase()),
  );

  const returnInventory = inventory
    .filter((item) => {
      const sku = String(item.sku || "").toUpperCase();
      const productName = String(item.product_name || "").toUpperCase();
      const location = String(item.location || "").toUpperCase();
      return (
        location !== "AMAZON" &&
        Number(item.quantity || 0) > 0 &&
        (productName === "RETURN" || !activeSkuSet.has(sku))
      );
    })
    .sort((a, b) =>
      `${a.sku}-${a.location}`.localeCompare(`${b.sku}-${b.location}`),
    );

  const activeMaterials = materials
    .filter((m) => m.active)
    .sort((a, b) => String(a.sku).localeCompare(String(b.sku)));

  const filteredReturnInventory = returnInventory.filter((item) => {
    const search = convertReturnSearch.trim().toUpperCase();
    if (String(item.location).toUpperCase() !== convertLoc) return false;
    if (!search) return true;
    return (
      String(item.sku || "")
        .toUpperCase()
        .includes(search) ||
      String(item.product_name || "")
        .toUpperCase()
        .includes(search)
    );
  }).slice(0, 20);

  const filteredActiveMaterials = activeMaterials.filter((item) => {
    const search = convertTargetSearch.trim().toUpperCase();
    if (!search) return true;
    return (
      String(item.sku || "")
        .toUpperCase()
        .includes(search) ||
      String(item.product_name || "")
        .toUpperCase()
        .includes(search)
    );
  }).slice(0, 20);

  const handleConvertReturnSearchChange = (e) => {
    const nextValue = e.target.value.toUpperCase();
    setConvertReturnSearch(nextValue);
    if (nextValue !== convertReturnSku) {
      setConvertReturnSku("");
      setConvertQty(1);
    }
  };

  const handleConvertReturnSelect = (item) => {
    setConvertLoc(item.location);
    setConvertReturnSku(item.sku);
    setConvertReturnSearch(item.sku);
    setConvertQty(1);
  };

  const handleConvertTargetSearchChange = (e) => {
    const nextValue = e.target.value.toUpperCase();
    setConvertTargetSearch(nextValue);
    if (nextValue !== convertTargetSku) {
      setConvertTargetSku("");
    }
  };

  const handleConvertTargetSelect = (item) => {
    setConvertTargetSku(item.sku);
    setConvertTargetSearch(item.sku);
  };

  const selectedReturnItem = returnInventory.find(
    (item) =>
      String(item.sku).toUpperCase() === convertReturnSku &&
      String(item.location).toUpperCase() === convertLoc,
  );
  const convertAvailable = selectedReturnItem
    ? Number(selectedReturnItem.quantity || 0)
    : 0;

  const returnConvertRecords = movements
    .filter((m) => String(m.movement_type || "").toLowerCase() === "return_convert")
    .map((m) => {
      const details = Array.isArray(m.details) ? m.details : [];
      const returnDetail = details.find((d) => d.converted_to_sku);
      const targetDetail =
        details.find((d) => d.converted_from_sku && d.location) ||
        details.find((d) => d.converted_from_sku);

      return {
        transaction_num: m.transaction_num,
        timestamp: m.timestamp,
        return_sku: returnDetail?.sku || m.convert?.from_sku || "",
        target_sku: targetDetail?.sku || m.convert?.to_sku || "",
        qty: Math.abs(Number(m.qty || returnDetail?.qty || targetDetail?.qty || 0)),
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

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

  const fetchInventory = async () => {
    try {
      const res = await api.get("/inventory");
      setInventory(res.data);
    } catch (err) {
      console.error("Error fetching inventory", err);
    }
  };

  const fetchMaterials = async () => {
    try {
      const res = await api.get("/master-data/materials");
      setMaterials(res.data);
    } catch (err) {
      console.error("Error fetching materials", err);
    }
  };

  const fetchMovements = async () => {
    try {
      const res = await api.get("/movements");
      setMovements(res.data);
    } catch (err) {
      console.error("Error fetching movements", err);
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
      fetchInventory();
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
      fetchInventory();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Return failed",
      });
    }
  };

  const handleConvertSubmit = async (e) => {
    e.preventDefault();
    if (!convertReturnSku || !convertTargetSku || !convertLoc || convertQty < 1) {
      setMessage({
        type: "error",
        text: "Please select return SKU, convert SKU, quantity and location",
      });
      return;
    }
    if (convertReturnSku === convertTargetSku) {
      setMessage({
        type: "error",
        text: "Return SKU and convert SKU must be different",
      });
      return;
    }
    if (convertQty > convertAvailable) {
      setMessage({
        type: "error",
        text: `Only ${convertAvailable} available for ${convertReturnSku} at ${convertLoc}`,
      });
      return;
    }

    try {
      const res = await api.post("/inbound/return-convert", {
        returnSku: convertReturnSku,
        targetSku: convertTargetSku,
        location: convertLoc,
        qty: convertQty,
      });
      setMessage({
        type: "success",
        text: res.data.message,
      });
      setConvertReturnSku("");
      setConvertTargetSku("");
      setConvertQty(1);
      setConvertReturnSearch("");
      setConvertTargetSearch("");
      fetchInventory();
      fetchMovements();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Return Convert failed",
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
        <button
          className={`pb-2 px-4 ${activeTab === "convert" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("convert");
            setMessage({ type: "", text: "" });
          }}
        >
          Return Convert
        </button>
        <button
          className={`pb-2 px-4 ${activeTab === "record" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("record");
            setMessage({ type: "", text: "" });
            fetchMovements();
          }}
        >
          Return Record
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

      {activeTab === "convert" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded shadow border h-fit">
            <form onSubmit={handleConvertSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <select
                  value={convertLoc}
                  onChange={(e) => {
                    setConvertLoc(e.target.value);
                    setConvertReturnSku("");
                    setConvertReturnSearch("");
                    setConvertQty(1);
                  }}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Returned SKU
                </label>
                <input
                  type="text"
                  value={convertReturnSearch}
                  onChange={handleConvertReturnSearchChange}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Type returned SKU to search"
                  autoComplete="off"
                />
                <div className="mt-2 max-h-48 overflow-y-auto rounded border">
                  {filteredReturnInventory.length > 0 ? (
                    filteredReturnInventory.map((item) => (
                      <button
                        key={`${item.sku}-${item.location}`}
                        type="button"
                        onClick={() => handleConvertReturnSelect(item)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                          convertReturnSku === item.sku &&
                          convertLoc === item.location
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-gray-700"
                        }`}
                      >
                        <span className="font-medium">{item.sku}</span>
                        <span className="ml-3 text-xs text-gray-500">
                          {item.product_name || "RETURN"} | Qty {item.quantity}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      {convertLoc
                        ? "No matching returned SKU found."
                        : "Select location first."}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Selected Returned SKU:{" "}
                  <span className="font-medium text-gray-900">
                    {convertReturnSku || "None"}
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Convert To SKU
                </label>
                <input
                  type="text"
                  value={convertTargetSearch}
                  onChange={handleConvertTargetSearchChange}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Type SKU to search"
                  autoComplete="off"
                />
                <div className="mt-2 max-h-48 overflow-y-auto rounded border">
                  {filteredActiveMaterials.length > 0 ? (
                    filteredActiveMaterials.map((m) => (
                      <button
                        key={m.sku}
                        type="button"
                        onClick={() => handleConvertTargetSelect(m)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                          convertTargetSku === m.sku
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-gray-700"
                        }`}
                      >
                        <span className="font-medium">{m.sku}</span>
                        <span className="ml-3 text-xs text-gray-500">
                          {m.product_name || ""}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      No matching SKU found.
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Selected Convert To SKU:{" "}
                  <span className="font-medium text-gray-900">
                    {convertTargetSku || "None"}
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max={convertAvailable || undefined}
                  value={convertQty}
                  onChange={(e) => setConvertQty(parseInt(e.target.value) || 1)}
                  className="w-full border rounded px-3 py-2"
                  required
                />
                {convertReturnSku && (
                  <p className="text-xs text-gray-500 mt-1">
                    Available: {convertAvailable}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 text-white rounded py-2 font-medium hover:bg-indigo-700"
              >
                Convert Return
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded shadow border">
            <h2 className="text-xl font-semibold mb-4">Available Returns</h2>
            <div className="border rounded overflow-hidden max-h-[500px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      SKU
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Product Name
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Location
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Qty
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {returnInventory.map((item) => (
                    <tr
                      key={`${item.sku}-${item.location}`}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => {
                        setConvertLoc(item.location);
                        setConvertReturnSku(item.sku);
                        setConvertReturnSearch(item.sku);
                        setConvertQty(1);
                      }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                        {item.sku}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                        {item.product_name || "RETURN"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                        {item.location}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900 font-semibold">
                        {item.quantity}
                      </td>
                    </tr>
                  ))}
                  {returnInventory.length === 0 && (
                    <tr>
                      <td
                        colSpan="4"
                        className="px-3 py-8 text-center text-gray-400 italic"
                      >
                        No return inventory available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "record" && (
        <div className="bg-white shadow border rounded overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Return SKU
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Target SKU
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Qty
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Movement #
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {returnConvertRecords.map((record) => (
                <tr key={record.transaction_num} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                    {new Date(record.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                    {record.return_sku || "-"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                    {record.target_sku || "-"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700 font-semibold">
                    {record.qty}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-indigo-700 font-mono">
                    {record.transaction_num}
                  </td>
                </tr>
              ))}
              {returnConvertRecords.length === 0 && (
                <tr>
                  <td
                    colSpan="5"
                    className="px-4 py-10 text-center text-sm text-gray-400"
                  >
                    No return convert records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReturnPage;
