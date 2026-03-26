import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";

const STOPage = () => {
  const { user, defaultLocation } = useAuth();
  const [locations, setLocations] = useState([]);
  const [skus, setSkus] = useState([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [fromLoc, setFromLoc] = useState("");
  const [toLoc, setToLoc] = useState("");
  const [qty, setQty] = useState(1);
  const [available, setAvailable] = useState(0);
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [preview, setPreview] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [activeTab, setActiveTab] = useState("STOCK TRANSFER");
  const [fbaLabels, setFbaLabels] = useState([]);
  const [shippingLabels, setShippingLabels] = useState([]);
  const [isDraggingFBA, setIsDraggingFBA] = useState(false);
  const [isDraggingShipping, setIsDraggingShipping] = useState(false);

  // Re-fetch transactions whenever tab changes to ensure fresh data
  useEffect(() => {
    fetchTransactions();
  }, [activeTab]);

  useEffect(() => {
    fetchLocations();
    fetchSkus();
    fetchInventory();
    fetchTransactions();
  }, []);

  useEffect(() => {
    if (defaultLocation) {
      setFromLoc(defaultLocation);
    }
  }, [defaultLocation]);

  useEffect(() => {
    if (selectedSku && fromLoc) {
      const item = inventory.find(
        (i) => i.sku === selectedSku && i.location === fromLoc,
      );
      const avail = item ? item.quantity : 0;
      setAvailable(avail);
      if (qty > avail) setQty(avail > 0 ? avail : 1);
    } else {
      setAvailable(0);
    }
  }, [selectedSku, fromLoc, inventory]);

  const fetchLocations = async () => {
    try {
      const res = await api.get("/master-data/locations");
      setLocations(
        res.data
          .filter((l) => l.active)
          .map((l) => l.location)
          .sort(),
      );
    } catch (err) {
      console.error("Error fetching locations", err);
    }
  };

  const fetchSkus = async () => {
    try {
      const res = await api.get("/master-data/materials");
      setSkus(
        res.data
          .filter((m) => m.active)
          .sort((a, b) => a.sku.localeCompare(b.sku)),
      );
    } catch (err) {
      console.error("Error fetching skus", err);
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

  const fetchTransactions = async () => {
    try {
      const res = await api.get("/transactions");
      // Filter only STO related transactions
      const stoData = res.data.filter((t) =>
        String(t.reason || "")
          .toUpperCase()
          .includes("STO"),
      );
      setTransactions(stoData);
    } catch (err) {
      console.error("Error fetching transactions", err);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (fromLoc === toLoc) {
      setMessage({
        type: "error",
        text: "From and To locations must be different.",
      });
      return;
    }

    // Show preview/confirmation screen without submitting
    const mmItem = skus.find((s) => s.sku === selectedSku);
    setPreview({
      sku: selectedSku,
      product_name: mmItem ? mmItem.product_name : "",
      qty: qty,
      from_loc: fromLoc,
      to_loc: toLoc,
    });
    setMessage({ type: "", text: "" });
  };

  const handleConfirm = async () => {
    try {
      const formData = new FormData();
      formData.append("sku", preview.sku);
      formData.append("fromLocation", preview.from_loc);
      formData.append("toLocation", preview.to_loc);
      formData.append("qty", preview.qty);

      fbaLabels.forEach((file) => {
        formData.append("fbaLabels", file);
      });
      shippingLabels.forEach((file) => {
        formData.append("shippingLabels", file);
      });

      const res = await api.post("/sto/submit", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setCompletion({
        ...preview,
        transaction_num: res.data.txnNum,
        timestamp: new Date().toLocaleString(),
      });

      setMessage({ type: "success", text: res.data.message });
      setSelectedSku("");
      setQty(1);
      setToLoc("");
      setPreview(null);
      fetchInventory();
      fetchTransactions();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "STO failed",
      });
      setPreview(null);
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setMessage({ type: "", text: "" });
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Reset form states when switching tabs
    setSelectedSku("");
    setQty(1);
    setToLoc(tab === "AMAZON FBA" ? "AMAZON" : "");
    setPreview(null);
    setCompletion(null);
    setMessage({ type: "", text: "" });
    setFbaLabels([]);
    setShippingLabels([]);
    setIsDraggingFBA(false);
    setIsDraggingShipping(false);
  };

  const handleDragOver = (e, type) => {
    e.preventDefault();
    if (type === "fba") setIsDraggingFBA(true);
    else setIsDraggingShipping(true);
  };

  const handleDragLeave = (e, type) => {
    e.preventDefault();
    if (type === "fba") setIsDraggingFBA(false);
    else setIsDraggingShipping(false);
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    if (type === "fba") setIsDraggingFBA(false);
    else setIsDraggingShipping(false);

    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === "application/pdf",
    );
    if (files.length > 0) {
      if (type === "fba") setFbaLabels((prev) => [...prev, ...files]);
      else setShippingLabels((prev) => [...prev, ...files]);
    } else {
      setMessage({ type: "error", text: "Please upload PDF files only." });
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">STO - Stock Transfer Order</h1>
          <p className="text-sm text-gray-500">
            Manage stock transfers and FBA shipments.
          </p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => handleTabChange("STOCK TRANSFER")}
          className={`px-6 py-2 font-medium text-sm transition-colors duration-200 ${
            activeTab === "STOCK TRANSFER"
              ? "border-b-2 border-indigo-600 text-indigo-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          STOCK TRANSFER
        </button>
        <button
          onClick={() => handleTabChange("AMAZON FBA")}
          className={`px-6 py-2 font-medium text-sm transition-colors duration-200 ${
            activeTab === "AMAZON FBA"
              ? "border-b-2 border-indigo-600 text-indigo-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          AMAZON FBA
        </button>
      </div>

      {activeTab === "STOCK TRANSFER" && (
        <>
          <p className="text-sm text-gray-500 mb-8">
            Transfer stock between locations (creates outbound+inbound style
            transactions and a STO movement record).
          </p>

          {!preview && !completion ? (
            <div className="max-w-4xl bg-white p-8 rounded shadow border">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SKU
                    </label>
                    <select
                      value={selectedSku}
                      onChange={(e) => setSelectedSku(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      required
                    >
                      <option value="">Select SKU</option>
                      {skus.map((s) => (
                        <option key={s.sku} value={s.sku}>
                          {s.sku} - {s.product_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location From
                      </label>
                      <select
                        value={fromLoc}
                        onChange={(e) => setFromLoc(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                        required
                      >
                        <option value="">Select From</option>
                        {locations.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location To
                      </label>
                      <select
                        value={toLoc}
                        onChange={(e) => setToLoc(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                        required
                      >
                        <option value="">Select To</option>
                        {locations
                          .filter((l) => l !== fromLoc)
                          .map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

                {selectedSku && fromLoc && (
                  <div className="bg-blue-50 p-3 rounded text-blue-800 text-sm font-medium border border-blue-100">
                    Available at {fromLoc}: {available}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Upload Shipment Labels (PDF)
                  </label>
                  <div
                    onDragOver={(e) => handleDragOver(e, "fba")}
                    onDragLeave={(e) => handleDragLeave(e, "fba")}
                    onDrop={(e) => handleDrop(e, "fba")}
                    className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md cursor-pointer transition-colors ${
                      isDraggingFBA
                        ? "border-orange-500 bg-orange-50"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    onClick={() =>
                      document.getElementById("fbaLabelsInputST").click()
                    }
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
                      <div className="flex text-sm text-gray-600 justify-center">
                        <span className="font-medium text-orange-600 hover:text-orange-500">
                          Upload files
                        </span>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">PDF only</p>
                      <input
                        id="fbaLabelsInputST"
                        type="file"
                        multiple
                        accept="application/pdf"
                        className="sr-only"
                        onChange={(e) =>
                          setFbaLabels((prev) => [
                            ...prev,
                            ...Array.from(e.target.files),
                          ])
                        }
                      />
                    </div>
                  </div>
                  {fbaLabels.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {fbaLabels.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center text-xs bg-gray-50 p-1 rounded border"
                        >
                          <span className="truncate flex-1 font-medium text-gray-600">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFbaLabels((prev) =>
                                prev.filter((_, i) => i !== idx),
                              );
                            }}
                            className="text-red-500 hover:text-red-700 ml-2 font-bold"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={available <= 0}
                  className="w-full bg-indigo-600 text-white rounded py-3 font-bold hover:bg-indigo-700 disabled:opacity-50"
                >
                  Submit STO
                </button>

                {message.text && message.type === "error" && (
                  <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200 text-sm"></div>
                )}
              </form>
            </div>
          ) : preview ? (
            <div className="max-w-2xl bg-white p-8 rounded shadow border border-blue-200">
              <h2 className="text-xl font-bold text-blue-700 mb-6 flex items-center">
                <span className="mr-2">📋</span> Review STO Transaction Details
              </h2>

              <div className="space-y-4 mb-8">
                <h3 className="text-lg font-semibold border-b pb-2">
                  Please confirm the following details
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-gray-500 space-y-2">
                    <p>SKU:</p>
                    <p>Product Name:</p>
                    <p>Quantity:</p>
                    <p>From Location:</p>
                    <p>To Location:</p>
                  </div>
                  <div className="font-medium space-y-2 text-gray-900">
                    <p>{preview.sku}</p>
                    <p>{preview.product_name}</p>
                    <p>{preview.qty}</p>
                    <p>{preview.from_loc}</p>
                    <p>{preview.to_loc}</p>
                  </div>
                </div>
              </div>

              {message.text && message.type === "error" && (
                <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200 text-sm mb-4">
                  {message.text}
                </div>
              )}

              <div className="flex justify-center gap-4">
                <button
                  onClick={handleCancel}
                  className="bg-gray-500 text-white px-12 py-2 rounded font-medium hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="bg-indigo-600 text-white px-12 py-2 rounded font-medium hover:bg-indigo-700"
                >
                  Confirm
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl bg-white p-8 rounded shadow border border-green-200">
              <h2 className="text-xl font-bold text-green-700 mb-6 flex items-center">
                <span className="mr-2">✅</span> STO Transaction Completed
                Successfully!
              </h2>

              <div className="space-y-4 mb-8">
                <h3 className="text-lg font-semibold border-b pb-2">
                  Transaction Details
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-gray-500 space-y-2">
                    <p>SKU:</p>
                    <p>Product Name:</p>
                    <p>Quantity:</p>
                    <p>From Location:</p>
                    <p>To Location:</p>
                  </div>
                  <div className="font-medium space-y-2 text-gray-900">
                    <p>{completion.sku}</p>
                    <p>{completion.product_name}</p>
                    <p>{completion.qty}</p>
                    <p>{completion.from_loc}</p>
                    <p>{completion.to_loc}</p>
                  </div>
                </div>
                <div className="mt-6 p-3 bg-blue-50 text-blue-800 rounded border border-blue-100 flex justify-between">
                  <span>📋 STO Transaction Number:</span>
                  <span className="font-bold">
                    {completion.transaction_num}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  🕒 Timestamp: {completion.timestamp}
                </p>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => {
                    setCompletion(null);
                    setMessage({ type: "", text: "" });
                  }}
                  className="bg-indigo-600 text-white px-12 py-2 rounded font-medium hover:bg-indigo-700"
                >
                  OK
                </button>
              </div>
            </div>
          )}

          <div className="mt-12">
            <h2 className="text-xl font-bold mb-4">STO Transaction History</h2>
            <div className="bg-white shadow border rounded overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      SKU
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Product Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Trans Num
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Loc
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Qty
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Reason
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {[...transactions]
                    .sort(
                      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
                    )
                    .map((t, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-4 whitespace-nowrap text-gray-500">
                          {new Date(t.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap font-medium text-gray-900">
                          {t.sku}
                        </td>
                        <td className="px-4 py-4 max-w-xs truncate text-gray-500">
                          {t.product_name}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-gray-500">
                          {t.movement_transaction_num}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-gray-500">
                          {t.location}
                        </td>
                        <td
                          className={`px-4 py-4 whitespace-nowrap capitalize font-medium ${t.type === "inbound" ? "text-green-600" : "text-orange-600"}`}
                        >
                          {t.type}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap font-bold text-gray-900">
                          {t.qty ||
                            (t.type === "inbound"
                              ? t.inbound_qty
                              : -t.outbound_qty)}
                        </td>
                        <td className="px-4 py-4 italic text-gray-500 text-xs">
                          {t.reason}
                        </td>
                      </tr>
                    ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td
                        colSpan="8"
                        className="px-4 py-8 text-center text-gray-500 italic"
                      >
                        No STO transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === "AMAZON FBA" && (
        <>
          <p className="text-sm text-gray-500 mb-8">
            Ship products to Amazon FBA warehouse (Location To is fixed as
            AMAZON).
          </p>

          {!preview && !completion ? (
            <div className="max-w-4xl bg-white p-8 rounded shadow border">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SKU
                    </label>
                    <select
                      value={selectedSku}
                      onChange={(e) => setSelectedSku(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      required
                    >
                      <option value="">Select SKU</option>
                      {skus.map((s) => (
                        <option key={s.sku} value={s.sku}>
                          {s.sku} - {s.product_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location From
                      </label>
                      <select
                        value={fromLoc}
                        onChange={(e) => setFromLoc(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                        required
                      >
                        <option value="">Select From</option>
                        {locations.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location To
                      </label>
                      <input
                        type="text"
                        value="AMAZON"
                        readOnly
                        className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-500 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                {selectedSku && fromLoc && (
                  <div className="bg-blue-50 p-3 rounded text-blue-800 text-sm font-medium border border-blue-100">
                    Available at {fromLoc}: {available}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Upload Shipment Labels (PDF)
                  </label>
                  <div
                    onDragOver={(e) => handleDragOver(e, "fba")}
                    onDragLeave={(e) => handleDragLeave(e, "fba")}
                    onDrop={(e) => handleDrop(e, "fba")}
                    className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md cursor-pointer transition-colors ${
                      isDraggingFBA
                        ? "border-orange-500 bg-orange-50"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    onClick={() =>
                      document.getElementById("fbaLabelsInputFBA").click()
                    }
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
                      <div className="flex text-sm text-gray-600 justify-center">
                        <span className="font-medium text-orange-600 hover:text-orange-500">
                          Upload files
                        </span>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">PDF only</p>
                      <input
                        id="fbaLabelsInputFBA"
                        type="file"
                        multiple
                        accept="application/pdf"
                        className="sr-only"
                        onChange={(e) =>
                          setFbaLabels((prev) => [
                            ...prev,
                            ...Array.from(e.target.files),
                          ])
                        }
                      />
                    </div>
                  </div>
                  {fbaLabels.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {fbaLabels.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center text-xs bg-gray-50 p-1 rounded border"
                        >
                          <span className="truncate flex-1 font-medium text-gray-600">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFbaLabels((prev) =>
                                prev.filter((_, i) => i !== idx),
                              );
                            }}
                            className="text-red-500 hover:text-red-700 ml-2 font-bold"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={available <= 0}
                  className="w-full bg-orange-600 text-white rounded py-3 font-bold hover:bg-orange-700 disabled:opacity-50"
                >
                  Create Amazon FBA Shipment
                </button>

                {message.text && message.type === "error" && (
                  <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200 text-sm">
                    {message.text}
                  </div>
                )}
              </form>
            </div>
          ) : preview ? (
            <div className="max-w-2xl bg-white p-8 rounded shadow border border-orange-200">
              <h2 className="text-xl font-bold text-orange-700 mb-6 flex items-center">
                <span className="mr-2">📦</span> Review FBA Shipment Details
              </h2>

              <div className="space-y-4 mb-8">
                <h3 className="text-lg font-semibold border-b pb-2">
                  Please confirm the following details
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-gray-500 space-y-2">
                    <p>SKU:</p>
                    <p>Product Name:</p>
                    <p>From Location:</p>
                    <p>To Warehouse:</p>
                  </div>
                  <div className="font-medium space-y-2 text-gray-900">
                    <p>{preview.sku}</p>
                    <p>{preview.product_name}</p>
                    <p>{preview.from_loc}</p>
                    <p>AMAZON</p>
                  </div>
                </div>
              </div>

              {message.text && message.type === "error" && (
                <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200 text-sm mb-4">
                  {message.text}
                </div>
              )}

              <div className="flex justify-center gap-4">
                <button
                  onClick={handleCancel}
                  className="bg-gray-500 text-white px-12 py-2 rounded font-medium hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="bg-orange-600 text-white px-12 py-2 rounded font-medium hover:bg-orange-700"
                >
                  Confirm Shipment
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl bg-white p-8 rounded shadow border border-green-200">
              <h2 className="text-xl font-bold text-green-700 mb-6 flex items-center">
                <span className="mr-2">✅</span> Amazon FBA Shipment Created
                Successfully!
              </h2>

              <div className="space-y-4 mb-8">
                <h3 className="text-lg font-semibold border-b pb-2">
                  Transaction Details
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-gray-500 space-y-2">
                    <p>SKU:</p>
                    <p>Product Name:</p>
                    <p>From Location:</p>
                    <p>To Warehouse:</p>
                  </div>
                  <div className="font-medium space-y-2 text-gray-900">
                    <p>{completion.sku}</p>
                    <p>{completion.product_name}</p>
                    <p>{completion.from_loc}</p>
                    <p>AMAZON</p>
                  </div>
                </div>
                <div className="mt-6 p-3 bg-blue-50 text-blue-800 rounded border border-blue-100 flex justify-between">
                  <span>📋 Shipment Number:</span>
                  <span className="font-bold">
                    {completion.transaction_num}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  🕒 Timestamp: {completion.timestamp}
                </p>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => {
                    setCompletion(null);
                    setMessage({ type: "", text: "" });
                  }}
                  className="bg-indigo-600 text-white px-12 py-2 rounded font-medium hover:bg-indigo-700"
                >
                  OK
                </button>
              </div>
            </div>
          )}

          <div className="mt-12">
            <h2 className="text-xl font-bold mb-4 text-orange-700">
              Amazon FBA Shipments History
            </h2>
            <div className="bg-white shadow border rounded overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      SKU
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Product Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Trans Num
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      From Loc
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {[...transactions]
                    .filter(
                      (t) => t.location !== "AMAZON" && t.type === "outbound",
                    ) // FBA History from perspective of warehouse
                    .sort(
                      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
                    )
                    .map((t, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-4 whitespace-nowrap text-gray-500">
                          {new Date(t.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap font-medium text-gray-900">
                          {t.sku}
                        </td>
                        <td className="px-4 py-4 max-w-xs truncate text-gray-500">
                          {t.product_name}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-gray-500">
                          {t.movement_transaction_num}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-gray-500">
                          {t.location}
                        </td>
                      </tr>
                    ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td
                        colSpan="6"
                        className="px-4 py-8 text-center text-gray-500 italic"
                      >
                        No FBA shipments found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default STOPage;
