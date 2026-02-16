import axios from "axios";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

const TransactionsPage = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [skuFilter, setSkuFilter] = useState([]);
  const [nameFilter, setNameFilter] = useState("");
  const [shipmentFilter, setShipmentFilter] = useState("");
  const [locFilter, setLocFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFBA, setShowFBA] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Shipment Record states
  const [showShipmentRecord, setShowShipmentRecord] = useState(false);
  const [shipmentPage, setShipmentPage] = useState(0);
  const [shipmentData, setShipmentData] = useState([]);

  // Options
  const [skuOptions, setSkuOptions] = useState([]);
  const [locOptions, setLocOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);

  const isAdmin = user?.role?.toLowerCase() === "admin";

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/transactions");
      const data = res.data;
      setTransactions(data);

      setSkuOptions([...new Set(data.map((t) => t.sku))].sort());
      setLocOptions([...new Set(data.map((t) => t.location))].sort());
      const types = [...new Set(data.map((t) => t.type))].sort();
      setTypeOptions(types);
      setTypeFilter(types);

      if (data.length > 0) {
        const minTs = new Date(
          Math.min(...data.map((t) => new Date(t.timestamp))),
        );
        setStartDate(minTs.toISOString().split("T")[0]);
        // Set end date to tomorrow to include all of today
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setEndDate(tomorrow.toISOString().split("T")[0]);
      }

      setLoading(false);
    } catch (err) {
      console.error("Error fetching transactions", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = [...transactions].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );

    if (skuFilter.length > 0) {
      filtered = filtered.filter((t) => skuFilter.includes(t.sku));
    }

    if (nameFilter) {
      filtered = filtered.filter((t) =>
        (t.product_name || "").toUpperCase().includes(nameFilter.toUpperCase()),
      );
    }

    if (shipmentFilter) {
      filtered = filtered.filter((t) =>
        (t.shipment_id || "")
          .toUpperCase()
          .includes(shipmentFilter.toUpperCase()),
      );
    }

    if (locFilter.length > 0) {
      filtered = filtered.filter((t) => locFilter.includes(t.location));
    }

    if (typeFilter.length > 0) {
      filtered = filtered.filter((t) => typeFilter.includes(t.type));
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((t) => {
        const ts = new Date(t.timestamp);
        return ts >= start && ts <= end;
      });
    }

    if (showFBA) {
      filtered = filtered.filter(
        (t) =>
          t.location === "AMAZON" ||
          t.location_from === "AMAZON" ||
          t.location_to === "AMAZON",
      );
    }

    setFilteredTransactions(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [
    transactions,
    skuFilter,
    nameFilter,
    shipmentFilter,
    locFilter,
    typeFilter,
    startDate,
    endDate,
    showFBA,
  ]);

  const handleExtractShipments = async () => {
    try {
      console.log(
        "Extracting shipments from",
        filteredTransactions.length,
        "transactions",
      );
      const res = await axios.post(
        "http://localhost:5000/api/transactions/extract-shipments",
        {
          transactions: filteredTransactions,
        },
      );
      console.log("Extracted:", res.data);
      setShipmentData(res.data);
      setShipmentPage(0);
      setShowShipmentRecord(true);
    } catch (err) {
      console.error("Error extracting shipments", err);
    }
  };

  // Get current page's items
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredTransactions.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  const calculateCharges = () => {
    let total = 0;
    let fulfillmentQty = 0;
    let fbaQty = 0;

    filteredTransactions.forEach((t) => {
      const qty = Math.abs(t.qty || t.inbound_qty || t.outbound_qty || 0);

      // Fulfillment Charge ($2.00)
      if (
        t.type === "outbound" &&
        (!t.location_to || t.location_to === "None")
      ) {
        fulfillmentQty += qty;
      }

      // FBA Charge ($0.50)
      const isAmazon =
        t.location === "AMAZON" ||
        t.location_from === "AMAZON" ||
        t.location_to === "AMAZON";
      if (isAmazon) {
        const reason = (t.reason || "").toUpperCase();
        if (
          (reason === "STO TRANSFER IN" && t.location_from !== "AMAZON") ||
          (reason === "STO TRANSFER OUT" && t.location_from === "AMAZON")
        ) {
          fbaQty += qty;
        }
      }
    });

    return {
      total: fulfillmentQty * 2 + fbaQty * 0.5,
      fulfillmentQty,
      fbaQty,
    };
  };

  if (loading) return <div>Loading transactions...</div>;

  const charges = calculateCharges();

  // Shipment record pagination
  const shipmentItemsPerPage = 25;
  const totalShipmentPages = Math.ceil(
    shipmentData.length / shipmentItemsPerPage,
  );
  const startIdx = shipmentPage * shipmentItemsPerPage;
  const currentShipmentBatch = shipmentData.slice(
    startIdx,
    startIdx + shipmentItemsPerPage,
  );

  let dateRangeStr = "N/A";
  if (currentShipmentBatch.length > 0) {
    const tsList = currentShipmentBatch
      .map((item) => new Date(item.timestamp))
      .filter((d) => !isNaN(d.getTime()));
    if (tsList.length > 0) {
      const minTs = new Date(Math.min(...tsList));
      const maxTs = new Date(Math.max(...tsList));
      dateRangeStr = `${minTs.toISOString().split("T")[0]} to ${maxTs.toISOString().split("T")[0]}`;
    }
  }

  const trackingNumbers = currentShipmentBatch.map((item) => item.tracking);
  let wrappedTracking = "";
  if (trackingNumbers.length > 0) {
    let currentLine = [];
    let lines = [];
    let currentLen = 0;
    trackingNumbers.forEach((t) => {
      let itemLen = t.length + (currentLine.length > 0 ? 2 : 0);
      if (currentLen + itemLen > 90 && currentLine.length > 0) {
        lines.push(currentLine.join(", ") + ",");
        currentLine = [t];
        currentLen = t.length;
      } else {
        currentLine.push(t);
        currentLen += itemLen;
      }
    });
    if (currentLine.length > 0) lines.push(currentLine.join(", "));
    wrappedTracking = lines.join("\n");
  }

  const uspsTrackingUrl =
    trackingNumbers.length > 0
      ? `https://tools.usps.com/go/TrackConfirmAction?tRef=fullpage&tLc=19&text28777=&tLabels=${trackingNumbers.join("%2C")}&tABt=false`
      : "";

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <div className="flex space-x-2">
          <button
            onClick={handleExtractShipments}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50 flex items-center shadow-sm"
          >
            📋 Shipment ID Record
          </button>
          <button
            onClick={fetchTransactions}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700 shadow-sm"
          >
            Refresh Data
          </button>
        </div>
      </div>

      {showShipmentRecord && (
        <div className="bg-white border border-indigo-200 rounded shadow-md p-4 mb-8">
          <div className="flex justify-between items-center mb-4 pb-2 border-b">
            <h3 className="text-sm font-bold text-indigo-900">
              USPS Tracking Numbers (Page {shipmentPage + 1}/
              {totalShipmentPages || 1}) | Date Range: {dateRangeStr}
            </h3>
            <button
              onClick={() => setShowShipmentRecord(false)}
              className="text-gray-400 hover:text-gray-600 text-xl font-bold"
            >
              &times;
            </button>
          </div>

          {shipmentData.length > 0 ? (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 border rounded font-mono text-xs text-gray-700 leading-relaxed shadow-inner">
                <pre className="whitespace-pre-wrap break-all">
                  {wrappedTracking}
                </pre>
              </div>

              {trackingNumbers.length > 0 && (
                <a
                  href={uspsTrackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center bg-indigo-600 text-white py-2 rounded text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  USPS Web Tracking (Batch {shipmentPage + 1})
                </a>
              )}

              {totalShipmentPages > 1 && (
                <div className="flex justify-center items-center space-x-4 pt-2">
                  <button
                    disabled={shipmentPage === 0}
                    onClick={() => setShipmentPage((p) => p - 1)}
                    className="px-3 py-1 border rounded text-xs bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    ⬅️ Previous
                  </button>
                  <span className="text-xs font-medium text-gray-600">
                    Page {shipmentPage + 1} of {totalShipmentPages}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">Go to:</span>
                    <input
                      type="number"
                      min="1"
                      max={totalShipmentPages}
                      value={shipmentPage + 1}
                      onChange={(e) => {
                        const p = parseInt(e.target.value) - 1;
                        if (!isNaN(p) && p >= 0 && p < totalShipmentPages)
                          setShipmentPage(p);
                      }}
                      className="w-16 border rounded px-2 py-1 text-xs text-center"
                    />
                  </div>
                  <button
                    disabled={shipmentPage === totalShipmentPages - 1}
                    onClick={() => setShipmentPage((p) => p + 1)}
                    className="px-3 py-1 border rounded text-xs bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    Next ➡️
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500 italic">
              No valid USPS tracking numbers found in the current filtered
              results.
            </div>
          )}
        </div>
      )}

      <div className="bg-white p-4 rounded shadow border mb-8">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-4">
          Filters
        </p>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              SKU
            </label>
            <div className="max-h-32 overflow-y-auto border rounded p-2 text-xs">
              {skuOptions.map((s) => (
                <label key={s} className="flex items-center space-x-2 mb-1">
                  <input
                    type="checkbox"
                    checked={skuFilter.includes(s)}
                    onChange={(e) =>
                      e.target.checked
                        ? setSkuFilter([...skuFilter, s])
                        : setSkuFilter(skuFilter.filter((x) => x !== s))
                    }
                    className="rounded text-indigo-600 h-3 w-3"
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Product Name
            </label>
            <input
              type="text"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
              placeholder="Contains..."
            />
            <label className="block text-xs font-medium text-gray-700 mt-2 mb-1">
              Shipment ID
            </label>
            <input
              type="text"
              value={shipmentFilter}
              onChange={(e) => setShipmentFilter(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
              placeholder="Contains..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Locations
            </label>
            <div className="max-h-32 overflow-y-auto border rounded p-2 text-xs">
              {locOptions.map((l) => (
                <label key={l} className="flex items-center space-x-2 mb-1">
                  <input
                    type="checkbox"
                    checked={locFilter.includes(l)}
                    onChange={(e) =>
                      e.target.checked
                        ? setLocFilter([...locFilter, l])
                        : setLocFilter(locFilter.filter((x) => x !== l))
                    }
                    className="rounded text-indigo-600 h-3 w-3"
                  />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                Type
              </label>
              <div className="flex flex-wrap gap-2">
                {typeOptions.map((t) => (
                  <label key={t} className="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      checked={typeFilter.includes(t)}
                      onChange={(e) =>
                        e.target.checked
                          ? setTypeFilter([...typeFilter, t])
                          : setTypeFilter(typeFilter.filter((x) => x !== t))
                      }
                      className="rounded text-indigo-600"
                    />
                    <span className="capitalize">{t}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={showFBA}
                  onChange={(e) => setShowFBA(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span className="font-medium">FBA (Amazon) Only</span>
              </label>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="col-span-2 flex space-x-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {isAdmin && (
          <div className="bg-white p-4 rounded shadow border text-center">
            <p className="text-xs text-gray-500 uppercase font-semibold">
              Total Charge
            </p>
            <p className="text-2xl font-bold text-green-600">
              $
              {charges.total.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              Fulfillment: {charges.fulfillmentQty} x $2.00 | FBA:{" "}
              {charges.fbaQty} x $0.50
            </p>
          </div>
        )}
        <div className="bg-white p-4 rounded shadow border text-center">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            Net Quantity
          </p>
          <p className="text-2xl font-bold text-indigo-600">
            {filteredTransactions
              .reduce((acc, curr) => {
                const q =
                  curr.qty ||
                  (curr.type === "inbound"
                    ? curr.inbound_qty
                    : -curr.outbound_qty) ||
                  0;
                return acc + q;
              }, 0)
              .toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-4 rounded shadow border text-center">
          <p className="text-xs text-gray-500 uppercase font-semibold">Count</p>
          <p className="text-2xl font-bold text-gray-800">
            {filteredTransactions.length.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Pagination Controls (Top) */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 border rounded shadow gap-4 mb-4">
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
            {[10, 25, 50, 100, 250, 500].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>entries</span>
          <span className="ml-4 text-gray-500">
            Showing {filteredTransactions.length > 0 ? indexOfFirstItem + 1 : 0}{" "}
            to {Math.min(indexOfLastItem, filteredTransactions.length)} of{" "}
            {filteredTransactions.length} entries
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

      <div className="bg-white shadow border rounded overflow-hidden mb-4">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 text-[10px]">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Timestamp
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                SKU
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Product Name
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Shipment ID
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Loc
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Type
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Qty
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Reason
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 text-xs text-gray-600">
            {currentItems.map((t, idx) => (
              <tr key={idx}>
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(t.timestamp).toLocaleString()}
                </td>
                <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                  {t.sku}
                </td>
                <td className="px-3 py-2 max-w-[200px] truncate">
                  {t.product_name}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{t.shipment_id}</td>
                <td className="px-3 py-2 whitespace-nowrap">{t.location}</td>
                <td
                  className={`px-3 py-2 whitespace-nowrap capitalize font-medium ${t.type === "inbound" ? "text-green-600" : "text-orange-600"}`}
                >
                  {t.type}
                </td>
                <td className="px-3 py-2 whitespace-nowrap font-bold">
                  {t.qty ||
                    (t.type === "inbound" ? t.inbound_qty : -t.outbound_qty)}
                </td>
                <td className="px-3 py-2 italic">{t.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionsPage;
