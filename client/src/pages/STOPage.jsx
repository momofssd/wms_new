import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";

const getQueueSku = (item) =>
  typeof item === "string" ? item : item?.sku || "";

const STOPage = () => {
  const { defaultLocation } = useAuth();
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

  // Amazon FBA Specific States
  const [fbaFiles, setFbaFiles] = useState([]);
  const [fbaSessionLog, setFbaSessionLog] = useState([]);
  const [fbaTotalTokens, setFbaTotalTokens] = useState(0);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [fbaSkuQueue, setFbaSkuQueue] = useState([]);
  const [queueSku, setQueueSku] = useState("");
  const [fbaRawBoxes, setFbaRawBoxes] = useState([]);
  const [queueError, setQueueError] = useState("");

  // Pagination states
  const [stoCurrentPage, setStoCurrentPage] = useState(1);
  const [stoItemsPerPage, setStoItemsPerPage] = useState(25);
  const [fbaCurrentPage, setFbaCurrentPage] = useState(1);
  const [fbaItemsPerPage, setFbaItemsPerPage] = useState(25);

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
  }, [selectedSku, fromLoc, inventory, qty]);

  const totalBoxQty = useMemo(
    () => fbaRawBoxes.reduce((acc, curr) => acc + (curr.quantity || 0), 0),
    [fbaRawBoxes],
  );

  const getAvailableQty = useCallback((sku) => {
    if (!sku || !fromLoc) return 0;
    const item = inventory.find((i) => i.sku === sku && i.location === fromLoc);
    return item ? item.quantity || 0 : 0;
  }, [fromLoc, inventory]);

  const getQueueQuantity = useCallback((item) => {
    const sku = getQueueSku(item);
    if (typeof item === "string") return getAvailableQty(sku);
    return Number(item?.quantity || 0);
  }, [getAvailableQty]);

  const clampQueueQuantity = (value, maxQty) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(parsed, maxQty);
  };

  const totalQueueQty = useMemo(
    () =>
      fbaSkuQueue.reduce((acc, item) => acc + getQueueQuantity(item), 0),
    [fbaSkuQueue, getQueueQuantity],
  );

  const assignQueueToBoxes = useCallback((queue, boxes) => {
    if (queue.length === 0) {
      return {
        error: "Add SKUs to the queue to assign PDF quantities.",
        assigned: [],
      };
    }

    let queueIdx = 0;
    const assigned = [];
    const queueRemaining = queue.map((item) => ({
      sku: getQueueSku(item),
      quantity: getQueueQuantity(item),
    }));

    for (const box of boxes) {
      let boxQtyToFulfill = Number(box.quantity) || 0;
      if (boxQtyToFulfill <= 0) continue;

      // Fulfill boxQtyToFulfill using the SKUs in the queue sequentially,
      // splitting the box quantity across multiple SKUs if necessary.
      while (boxQtyToFulfill > 0 && queueIdx < queue.length) {
        const currentQueueItem = queueRemaining[queueIdx];
        const currentSku = currentQueueItem.sku;
        const remaining = currentQueueItem.quantity || 0;

        if (remaining > 0) {
          // How much can we take from this SKU?
          const takeQty = Math.min(boxQtyToFulfill, remaining);

          assigned.push({
            ...box,
            sku: currentSku,
            quantity: takeQty,
          });

          currentQueueItem.quantity = remaining - takeQty;
          boxQtyToFulfill -= takeQty;

          // If this SKU is now exhausted, move to the next SKU in the queue
          if (currentQueueItem.quantity === 0) {
            queueIdx++;
          }
        } else {
          // This SKU is already exhausted
          queueIdx++;
        }
      }

      if (boxQtyToFulfill > 0) {
        return {
          error: `Not enough inventory in the queued SKUs to fulfill all boxes. Please add more SKUs or check inventory.`,
          assigned: [],
        };
      }
    }

    return { assigned, error: "" };
  }, [getQueueQuantity]);

  useEffect(() => {
    setFbaSkuQueue((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const sku = getQueueSku(item);
        const maxQty = getAvailableQty(sku);
        const currentQty = getQueueQuantity(item);
        const quantity = Math.min(currentQty, maxQty);

        if (typeof item === "string" || quantity !== currentQty) {
          changed = true;
          return { sku, quantity };
        }

        return item;
      });

      return changed ? next : prev;
    });
  }, [getAvailableQty, getQueueQuantity]);

  useEffect(() => {
    if (fbaRawBoxes.length === 0) {
      setFbaSessionLog([]);
      setQueueError("");
      return;
    }
    if (fbaSkuQueue.length === 0) {
      setFbaSessionLog([]);
      setQueueError("Add a SKU queue to assign PDF quantities.");
      return;
    }

    const { assigned, error } = assignQueueToBoxes(fbaSkuQueue, fbaRawBoxes);
    if (error) {
      setQueueError(error);
      setFbaSessionLog([]);
      return;
    }

    setQueueError("");
    setFbaSessionLog(assigned);
  }, [fbaRawBoxes, fbaSkuQueue, assignQueueToBoxes]);

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
      const [materialsRes, inventoryRes] = await Promise.all([
        api.get("/master-data/materials"),
        api.get("/inventory"),
      ]);

      const activeMaterials = materialsRes.data.filter((m) => m.active);
      const inventorySkus = inventoryRes.data.map((i) => ({
        sku: i.sku,
        product_name: i.product_name || "RETURN",
      }));
      const combined = [...activeMaterials, ...inventorySkus];
      const uniq = new Map();
      combined.forEach((item) => {
        const sku = String(item.sku || "")
          .trim()
          .toUpperCase();
        if (!sku) return;
        if (!uniq.has(sku)) {
          uniq.set(sku, {
            sku,
            product_name: String(item.product_name || "RETURN")
              .trim()
              .toUpperCase(),
          });
        }
      });
      setSkus([...uniq.values()].sort((a, b) => a.sku.localeCompare(b.sku)));
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
      // Filter only STO related transactions (including FBA which are STOs)
      const stoData = res.data.filter(
        (t) =>
          t.sto === true ||
          String(t.reason || "")
            .toUpperCase()
            .includes("STO") ||
          String(t.reason || "")
            .toUpperCase()
            .includes("FBA"),
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
      const res = await api.post("/sto/submit", {
        sku: preview.sku,
        fromLocation: preview.from_loc,
        toLocation: preview.to_loc,
        qty: preview.qty,
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
    setFbaFiles([]);
    setFbaSessionLog([]);
    setFbaRawBoxes([]);
    setFbaSkuQueue([]);
    setQueueSku("");
    setQueueError("");
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const validFiles = selectedFiles.filter(
      (file) => file.type === "application/pdf",
    );

    if (validFiles.length !== selectedFiles.length) {
      alert("Some selected files are not valid PDFs and will be ignored.");
    }

    setFbaFiles(validFiles);
  };

  const handleProcessPdf = async () => {
    if (fbaFiles.length === 0) {
      setMessage({
        type: "error",
        text: "Please upload at least one PDF file first.",
      });
      return;
    }
    if (!fromLoc) {
      setMessage({
        type: "error",
        text: "Please select a From Location first.",
      });
      return;
    }

    setIsProcessingPdf(true);
    setMessage({ type: "", text: "" });
    setFbaTotalTokens(0);

    let allResults = [];
    let boxOffset = 1;
    let accumulatedTokens = 0;

    try {
      for (const file of fbaFiles) {
        const formData = new FormData();
        formData.append("pdf", file); // Backend expects "pdf"
        const res = await api.post("/sto/process-fba-pdf", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        // Adjust box numbers and aggregate
        const extracted = res.data.data;
        accumulatedTokens += res.data.tokens || 0;
        extracted.forEach((box) => {
          box.boxNumber = `Box ${boxOffset}`;
          allResults.push(box);
          boxOffset++;
        });
      }

      setFbaRawBoxes(allResults);
      setFbaTotalTokens(accumulatedTokens);
      setMessage({
        type: "success",
        text: `Processed ${fbaFiles.length} file(s) successfully!`,
      });
    } catch (err) {
      console.error("Error processing PDFs sequentially", err);
      setMessage({
        type: "error",
        text:
          err.response?.data?.message || "Failed to process one or more PDFs",
      });
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleQtyChange = (index, newQty) => {
    const updatedLog = [...fbaSessionLog];
    updatedLog[index].quantity = parseInt(newQty) || 0;
    setFbaSessionLog(updatedLog);
  };

  const handleDeleteFbaRow = (index) => {
    const updatedLog = fbaSessionLog.filter((_, i) => i !== index);
    // Re-index box numbers
    const reindexedLog = updatedLog.map((box, i) => ({
      ...box,
      boxNumber: `Box ${i + 1}`,
    }));
    setFbaSessionLog(reindexedLog);
  };

  const handleAddQueueItem = () => {
    const sku = String(queueSku || "")
      .trim()
      .toUpperCase();
    if (!fromLoc) {
      setQueueError("Select a From Location before adding SKUs to the queue.");
      return;
    }
    if (!sku) {
      setQueueError("Select a SKU to add to the queue.");
      return;
    }
    if (fbaSkuQueue.some((item) => getQueueSku(item) === sku)) {
      setQueueError(`${sku} is already in the queue.`);
      return;
    }
    const availableQty = getAvailableQty(sku);
    if (availableQty <= 0) {
      setQueueError(`No available inventory for ${sku} at ${fromLoc}.`);
      return;
    }
    setQueueError("");
    setFbaSkuQueue((prev) => [...prev, { sku, quantity: availableQty }]);
    setQueueSku("");
  };

  const handleQueueQtyChange = (index, newQty) => {
    setFbaSkuQueue((prev) =>
      prev.map((item, i) => {
        const sku = getQueueSku(item);
        if (i !== index) {
          return typeof item === "string"
            ? { sku, quantity: getAvailableQty(sku) }
            : item;
        }

        return {
          sku,
          quantity: clampQueueQuantity(newQty, getAvailableQty(sku)),
        };
      }),
    );
  };

  const handleRemoveQueueItem = (index) => {
    setFbaSkuQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const handleResetFba = () => {
    setFromLoc("");
    setFbaFiles([]);
    setFbaSessionLog([]);
    setFbaRawBoxes([]);
    setFbaSkuQueue([]);
    setQueueSku("");
    setFbaTotalTokens(0);
    setQueueError("");
    setMessage({ type: "", text: "" });
  };

  const handleConfirmShipment = async () => {
    if (!fromLoc) {
      setMessage({
        type: "error",
        text: "Please select a From Location first.",
      });
      return;
    }
    if (fbaSessionLog.length === 0) return;
    if (queueError) {
      setMessage({ type: "error", text: queueError });
      return;
    }

    // Check for duplicate tracking in the current session log (space-insensitive)
    // but ONLY if they are from different raw boxes (actual duplicates, not splits)
    const hasErrorDuplicateInLog = fbaSessionLog.some((row) => {
      const trackingNormalized = String(row.trackingNumber || "").replace(
        /\s+/g,
        "",
      );
      if (!trackingNormalized) return false;
      const matchingBoxes = fbaSessionLog.filter(
        (s) =>
          String(s.trackingNumber || "").replace(/\s+/g, "") ===
          trackingNormalized,
      );
      const uniqueBoxNumbers = new Set(matchingBoxes.map((s) => s.boxNumber));
      return uniqueBoxNumbers.size > 1; // It's an error duplicate if they have different box numbers
    });

    if (hasErrorDuplicateInLog) {
      setMessage({
        type: "error",
        text: "Duplicate tracking number found in the current session log. Please check and remove duplicates.",
      });
      return;
    }

    // Check if any tracking already exists in transaction history (space-insensitive)
    // (This is also checked on the backend, but we check here for better UX)
    for (const ship of fbaSessionLog) {
      const trackingNormalized = String(ship.trackingNumber || "").replace(
        /\s+/g,
        "",
      );
      if (!trackingNormalized) continue;

      const exists = transactions.some(
        (t) =>
          String(t.shipment_id || "").replace(/\s+/g, "") ===
          trackingNormalized,
      );
      if (exists) {
        setMessage({
          type: "error",
          text: `Tracking number ${ship.trackingNumber} has already been processed in a previous shipment.`,
        });
        return;
      }
    }

    // Check inventory availability for each SKU in session log
    const skuTotals = new Map();
    fbaSessionLog.forEach((row) => {
      const current = skuTotals.get(row.sku) || 0;
      skuTotals.set(row.sku, current + Number(row.quantity || 0));
    });

    for (const [sku, totalQty] of skuTotals) {
      const available = getAvailableQty(sku);
      if (totalQty > available) {
        setMessage({
          type: "error",
          text: `Insufficient inventory for ${sku}. Required ${totalQty}, available ${available} at ${fromLoc}.`,
        });
        return;
      }
    }

    setIsProcessingPdf(true);
    try {
      const res = await api.post("/sto/submit-bulk-fba", {
        shipments: fbaSessionLog,
        fromLocation: fromLoc,
      });
      setMessage({ type: "success", text: res.data.message });
      setFbaSessionLog([]);
      setFbaFiles([]);
      setFbaRawBoxes([]);
      setFbaSkuQueue([]);
      setQueueSku("");
      setQueueError("");
      fetchInventory();
      fetchTransactions();
    } catch (err) {
      console.error("Error submitting bulk FBA", err);
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Failed to submit shipments",
      });
    } finally {
      setIsProcessingPdf(false);
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
                        {locations
                          .filter((l) => l !== "AMAZON")
                          .map((l) => (
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
                    Transfer Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={available}
                    value={qty}
                    onChange={(e) => setQty(parseInt(e.target.value) || 0)}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={available <= 0}
                  className="w-full bg-indigo-600 text-white rounded py-3 font-bold hover:bg-indigo-700 disabled:opacity-50"
                >
                  Submit STO
                </button>

                {message.text && message.type === "error" && (
                  <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200 text-sm">
                    {message.text}
                  </div>
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

            {/* Pagination Controls (Top) */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 border rounded shadow gap-4 mb-4">
              <div className="flex items-center space-x-2 text-sm text-gray-700">
                <span>Show</span>
                <select
                  value={stoItemsPerPage}
                  onChange={(e) => {
                    setStoItemsPerPage(Number(e.target.value));
                    setStoCurrentPage(1);
                  }}
                  className="border rounded px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {[10, 25, 50, 100, 250].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span>items per page</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setStoCurrentPage(1)}
                  disabled={stoCurrentPage === 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  First
                </button>
                <button
                  onClick={() =>
                    setStoCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={stoCurrentPage === 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="text-sm font-medium text-gray-600 px-2">
                  Page {stoCurrentPage} of{" "}
                  {Math.ceil(transactions.length / stoItemsPerPage) || 1}
                </span>
                <button
                  onClick={() =>
                    setStoCurrentPage((prev) =>
                      Math.min(
                        prev + 1,
                        Math.ceil(transactions.length / stoItemsPerPage),
                      ),
                    )
                  }
                  disabled={
                    stoCurrentPage ===
                      Math.ceil(transactions.length / stoItemsPerPage) ||
                    transactions.length === 0
                  }
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
                <button
                  onClick={() =>
                    setStoCurrentPage(
                      Math.ceil(transactions.length / stoItemsPerPage),
                    )
                  }
                  disabled={
                    stoCurrentPage ===
                      Math.ceil(transactions.length / stoItemsPerPage) ||
                    transactions.length === 0
                  }
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Last
                </button>
              </div>
            </div>

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
                    .slice(
                      (stoCurrentPage - 1) * stoItemsPerPage,
                      stoCurrentPage * stoItemsPerPage,
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
            Process Amazon FBA Shipment labels and track inventory movements to
            AMAZON location.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Side: Upload & Action */}
            <div className="bg-white p-6 rounded shadow border h-fit">
              <div className="space-y-4 mb-6">
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
                    {locations
                      .filter((l) => l !== "AMAZON")
                      .map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="border rounded p-4 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    SKU Queue (FIFO Order)
                  </h3>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        SKU
                      </label>
                      <select
                        value={queueSku}
                        onChange={(e) => setQueueSku(e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm"
                      >
                        <option value="">Select SKU</option>
                        {skus.map((s) => (
                          <option key={s.sku} value={s.sku}>
                            {s.sku} - {s.product_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddQueueItem}
                      className="bg-indigo-600 text-white rounded px-4 py-2 text-sm font-semibold hover:bg-indigo-700"
                    >
                      Add to Queue
                    </button>
                  </div>

                  {queueError && (
                    <div className="mt-3 text-xs text-red-600 font-medium">
                      {queueError}
                    </div>
                  )}

                  {fbaSkuQueue.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs font-medium text-gray-600 mb-2">
                        Queue Order (boxes will use SKUs in this order):
                      </div>
                      {fbaSkuQueue.map((item, idx) => {
                        const sku = getQueueSku(item);
                        const availableQty = getAvailableQty(sku);
                        const queueQty = getQueueQuantity(item);

                        return (
                        <div
                          key={`${sku}-${idx}`}
                          className="flex items-center justify-between gap-3 bg-white border rounded px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <div className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs">
                              {idx + 1}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-800">
                                {sku}
                              </div>
                              <div className="text-gray-500">
                                Available: {availableQty}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <label
                              className="text-gray-500"
                              htmlFor={`queue-qty-${idx}`}
                            >
                              Qty
                            </label>
                            <input
                              id={`queue-qty-${idx}`}
                              type="number"
                              min="0"
                              max={availableQty}
                              value={queueQty}
                              onChange={(e) =>
                                handleQueueQtyChange(idx, e.target.value)
                              }
                              className="w-20 border rounded px-2 py-1 text-right text-xs"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveQueueItem(idx)}
                            className="text-red-500 hover:text-red-700 font-bold"
                          >
                            ✕
                          </button>
                        </div>
                        );
                      })}
                      {totalBoxQty > 0 && (
                        <div className="text-xs text-gray-600 pt-2 border-t">
                          Queue total: <strong>{totalQueueQty}</strong> units
                          | PDF total: <strong>{totalBoxQty}</strong> units
                          from <strong>{fbaRawBoxes.length}</strong> boxes
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-gray-500 italic">
                      Add SKUs to define the FIFO order. PDF quantities will be
                      assigned to SKUs in this order.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Upload Shipment PDF</h2>
                <button
                  onClick={handleResetFba}
                  className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded transition-colors"
                >
                  Reset Form
                </button>
              </div>
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  fbaFiles.length > 0
                    ? "border-green-400 bg-green-50"
                    : "border-gray-300 hover:border-indigo-400"
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const files = Array.from(e.dataTransfer.files).filter(
                    (file) => file.type === "application/pdf",
                  );
                  if (files.length > 0) {
                    setFbaFiles(files);
                  }
                }}
              >
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  id="fba-pdf-upload"
                />
                <label
                  htmlFor="fba-pdf-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <span className="text-4xl mb-2">📄</span>
                  <span className="text-gray-600 font-medium">
                    {fbaFiles.length > 0
                      ? `${fbaFiles.length} file(s) selected`
                      : "Drag and drop or click to upload PDF(s)"}
                  </span>
                  {fbaFiles.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500 max-h-24 overflow-y-auto">
                      {fbaFiles.map((f, i) => (
                        <div key={i}>{f.name}</div>
                      ))}
                    </div>
                  )}
                  <span className="text-xs text-gray-400 mt-1">
                    FBA Label & UPS Label Pairs
                  </span>
                </label>
              </div>

              <button
                onClick={handleProcessPdf}
                disabled={fbaFiles.length === 0 || isProcessingPdf}
                className="w-full mt-6 bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 flex justify-center items-center"
              >
                {isProcessingPdf ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Processing PDF...
                  </>
                ) : (
                  "Create Amazon Shipment"
                )}
              </button>

              {message.text && (
                <div
                  className={`mt-4 p-3 rounded text-sm border ${
                    message.type === "error"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-green-50 text-green-700 border-green-200"
                  }`}
                >
                  {message.text}
                </div>
              )}
            </div>

            {/* Right Side: Session Log */}
            <div className="bg-white p-6 rounded shadow border">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">
                  Session Log (Extracted Data)
                </h2>
                {fbaTotalTokens > 0 && (
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full border border-indigo-100">
                    Total Tokens: {fbaTotalTokens.toLocaleString()}
                  </span>
                )}
              </div>
              {fbaSessionLog.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Box #
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          SKU
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Qty
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          FBA ID
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Tracking
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                      {fbaSessionLog.map((row, idx) => {
                        const rowTrackingNormalized = String(
                          row.trackingNumber || "",
                        ).replace(/\s+/g, "");

                        const matchingBoxes = fbaSessionLog.filter(
                          (s) =>
                            String(s.trackingNumber || "").replace(
                              /\s+/g,
                              "",
                            ) === rowTrackingNormalized,
                        );

                        // If multiple rows share the same tracking number but originated from the same raw box number, it's a split.
                        // If they originated from different raw box numbers (or the same PDF was uploaded twice), it's a duplicate.
                        const uniqueBoxNumbers = new Set(
                          matchingBoxes.map((s) => s.boxNumber),
                        );

                        const isDuplicateInLog =
                          rowTrackingNormalized && uniqueBoxNumbers.size > 1;
                        const isSplitInLog =
                          rowTrackingNormalized &&
                          matchingBoxes.length > 1 &&
                          uniqueBoxNumbers.size === 1;

                        const isDuplicateInHistory = transactions.some(
                          (t) =>
                            String(t.shipment_id || "").replace(/\s+/g, "") ===
                            rowTrackingNormalized,
                        );

                        const isErrorDuplicate =
                          isDuplicateInLog || isDuplicateInHistory;

                        return (
                          <tr
                            key={idx}
                            className={
                              isErrorDuplicate
                                ? "bg-red-50"
                                : isSplitInLog
                                  ? "bg-yellow-50"
                                  : ""
                            }
                          >
                            <td className="px-3 py-2 whitespace-nowrap">
                              {row.boxNumber}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap font-medium">
                              {row.sku}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <input
                                type="number"
                                min="1"
                                className="border rounded px-2 py-1 w-16 text-sm"
                                value={row.quantity}
                                onChange={(e) =>
                                  handleQtyChange(idx, e.target.value)
                                }
                              />
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                              {row.fbaShipmentId}
                            </td>
                            <td
                              className={`px-3 py-2 whitespace-nowrap text-xs ${isDuplicateInHistory ? "text-red-600 font-bold" : isDuplicateInLog ? "text-red-600 font-bold" : isSplitInLog ? "text-yellow-600 font-bold" : "text-gray-500"}`}
                            >
                              {row.trackingNumber}
                              {isSplitInLog &&
                                !isDuplicateInLog &&
                                !isDuplicateInHistory && (
                                  <div className="text-[10px] font-normal">
                                    (Shipment split)
                                  </div>
                                )}
                              {isDuplicateInLog && !isDuplicateInHistory && (
                                <div className="text-[10px] font-normal">
                                  (Duplicate in list)
                                </div>
                              )}
                              {isDuplicateInHistory && (
                                <div className="text-[10px] font-normal">
                                  (Already in transactions)
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <button
                                onClick={() => handleDeleteFbaRow(idx)}
                                className="text-red-500 hover:text-red-700 text-lg"
                                title="Delete row"
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="mt-6 flex justify-end">
                    <button
                      className="bg-orange-600 text-white px-6 py-2 rounded font-bold hover:bg-orange-700 disabled:opacity-50"
                      disabled={isProcessingPdf || !fromLoc || !!queueError}
                      onClick={handleConfirmShipment}
                    >
                      {isProcessingPdf ? "Processing..." : "Confirm Shipment"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 italic">
                  <span>No data extracted yet.</span>
                  <span className="text-xs mt-2">
                    Upload and process a PDF to see results.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Moved original manual FBA form below if needed or can be removed if PDF is the only way now */}
          <div className="mt-12 opacity-50 pointer-events-none">
            <h3 className="text-md font-bold mb-4">Manual Entry (Disabled)</h3>
            {/* The rest of the original form... */}
          </div>

          {!preview && !completion ? (
            <div className="hidden">
              {" "}
              {/* Hide original form logic but keep states if needed */}
              <form onSubmit={handleSubmit}></form>
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
                    <p>Quantity:</p>
                    <p>From Location:</p>
                    <p>To Warehouse:</p>
                  </div>
                  <div className="font-medium space-y-2 text-gray-900">
                    <p>{preview.sku}</p>
                    <p>{preview.product_name}</p>
                    <p>{preview.qty}</p>
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
                    <p>Quantity:</p>
                    <p>From Location:</p>
                    <p>To Warehouse:</p>
                  </div>
                  <div className="font-medium space-y-2 text-gray-900">
                    <p>{completion.sku}</p>
                    <p>{completion.product_name}</p>
                    <p>{completion.qty}</p>
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

            {/* Pagination Controls (Top) */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 border rounded shadow gap-4 mb-4">
              <div className="flex items-center space-x-2 text-sm text-gray-700">
                <span>Show</span>
                <select
                  value={fbaItemsPerPage}
                  onChange={(e) => {
                    setFbaItemsPerPage(Number(e.target.value));
                    setFbaCurrentPage(1);
                  }}
                  className="border rounded px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {[10, 25, 50, 100, 250].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span>items per page</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setFbaCurrentPage(1)}
                  disabled={fbaCurrentPage === 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  First
                </button>
                <button
                  onClick={() =>
                    setFbaCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={fbaCurrentPage === 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="text-sm font-medium text-gray-600 px-2">
                  Page {fbaCurrentPage} of{" "}
                  {Math.ceil(
                    transactions.filter(
                      (t) =>
                        t.location !== "AMAZON" &&
                        t.type === "outbound" &&
                        (t.sto === true ||
                          String(t.reason || "")
                            .toUpperCase()
                            .includes("FBA")),
                    ).length / fbaItemsPerPage,
                  ) || 1}
                </span>
                <button
                  onClick={() =>
                    setFbaCurrentPage((prev) =>
                      Math.min(
                        prev + 1,
                        Math.ceil(
                          transactions.filter(
                            (t) =>
                              t.location !== "AMAZON" &&
                              t.type === "outbound" &&
                              (t.sto === true ||
                                String(t.reason || "")
                                  .toUpperCase()
                                  .includes("FBA")),
                          ).length / fbaItemsPerPage,
                        ),
                      ),
                    )
                  }
                  disabled={
                    fbaCurrentPage ===
                      Math.ceil(
                        transactions.filter(
                          (t) =>
                            t.location !== "AMAZON" &&
                            t.type === "outbound" &&
                            (t.sto === true ||
                              String(t.reason || "")
                                .toUpperCase()
                                .includes("FBA")),
                        ).length / fbaItemsPerPage,
                      ) ||
                    transactions.filter(
                      (t) =>
                        t.location !== "AMAZON" &&
                        t.type === "outbound" &&
                        (t.sto === true ||
                          String(t.reason || "")
                            .toUpperCase()
                            .includes("FBA")),
                    ).length === 0
                  }
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
                <button
                  onClick={() =>
                    setFbaCurrentPage(
                      Math.ceil(
                        transactions.filter(
                          (t) =>
                            t.location !== "AMAZON" &&
                            t.type === "outbound" &&
                            (t.sto === true ||
                              String(t.reason || "")
                                .toUpperCase()
                                .includes("FBA")),
                        ).length / fbaItemsPerPage,
                      ),
                    )
                  }
                  disabled={
                    fbaCurrentPage ===
                      Math.ceil(
                        transactions.filter(
                          (t) =>
                            t.location !== "AMAZON" &&
                            t.type === "outbound" &&
                            (t.sto === true ||
                              String(t.reason || "")
                                .toUpperCase()
                                .includes("FBA")),
                        ).length / fbaItemsPerPage,
                      ) ||
                    transactions.filter(
                      (t) =>
                        t.location !== "AMAZON" &&
                        t.type === "outbound" &&
                        (t.sto === true ||
                          String(t.reason || "")
                            .toUpperCase()
                            .includes("FBA")),
                    ).length === 0
                  }
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Last
                </button>
              </div>
            </div>

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
                      Qty
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      FBA ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Tracking (Shipment ID)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      From Loc
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {[...transactions]
                    .filter(
                      (t) =>
                        t.location !== "AMAZON" &&
                        t.type === "outbound" &&
                        (t.sto === true ||
                          String(t.reason || "")
                            .toUpperCase()
                            .includes("FBA")),
                    ) // FBA History from perspective of warehouse
                    .sort(
                      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
                    )
                    .slice(
                      (fbaCurrentPage - 1) * fbaItemsPerPage,
                      fbaCurrentPage * fbaItemsPerPage,
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
                        <td className="px-4 py-4 whitespace-nowrap font-bold text-gray-900">
                          {t.outbound_qty || t.qty}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-500">
                          {t["FBA ID"]}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-500">
                          {t.shipment_id}
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
