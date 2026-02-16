import axios from "axios";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

const MovementsPage = () => {
  const { user } = useAuth();
  const [movements, setMovements] = useState([]);
  const [filteredMovements, setFilteredMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [selectedSkus, setSelectedSkus] = useState([]);

  // Available filter options
  const [types, setTypes] = useState([]);
  const [skus, setSkus] = useState([]);

  const [selectedTxn, setSelectedTxn] = useState("");
  const [selectedMvDetails, setSelectedMvDetails] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // If txn search is active, we avoid filtering client-side and instead fetch exact match
  // from the API. This prevents partial matches.
  const [txnSearchResults, setTxnSearchResults] = useState(null);
  const [txnSearchLoading, setTxnSearchLoading] = useState(false);

  const isAdmin = user?.role?.toLowerCase() === "admin";

  useEffect(() => {
    fetchMovements();
  }, []);

  const fetchMovements = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/movements");
      const data = res.data;
      setMovements(data);

      // Reset any txn search view when full list is fetched
      setTxnSearchResults(null);

      // Extract filter options
      const allTypes = [...new Set(data.map((m) => m.movement_type))].sort();
      setTypes(allTypes);
      setSelectedTypes(allTypes);

      const allSkus = new Set();
      data.forEach((m) => {
        const details = m.details || [];
        details.forEach((d) => {
          if (d.sku) allSkus.add(String(d.sku).toUpperCase());
        });
      });
      setSkus([...allSkus].sort());

      if (data.length > 0) {
        const minTs = new Date(
          Math.min(...data.map((m) => new Date(m.timestamp))),
        );
        setStartDate(minTs.toISOString().split("T")[0]);
        // Set end date to tomorrow to include all of today
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setEndDate(tomorrow.toISOString().split("T")[0]);
      }

      setLoading(false);
    } catch (err) {
      console.error("Error fetching movements", err);
      setLoading(false);
    }
  };

  // Fetch exact txn result when selectedTxn changes.
  // Note: we trigger only when the field is non-empty; clearing it returns to normal filter mode.
  useEffect(() => {
    const txn = String(selectedTxn || "").trim();
    if (!txn) {
      setTxnSearchResults(null);
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        setTxnSearchLoading(true);
        const res = await axios.get("http://localhost:5000/api/movements", {
          params: { txnNum: txn },
          signal: controller.signal,
        });
        setTxnSearchResults(res.data);
      } catch (err) {
        // Ignore aborts; log other errors
        if (!axios.isCancel?.(err) && err.name !== "CanceledError") {
          console.error("Error searching movement by txn", err);
        }
        setTxnSearchResults([]);
      } finally {
        setTxnSearchLoading(false);
      }
    }, 250); // small debounce while typing

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [selectedTxn]);

  useEffect(() => {
    // When txn search is active, we display API results only (exact match).
    // We don't run the normal client-side filtering because it would create partial matches.
    if (txnSearchResults !== null) {
      const sorted = [...txnSearchResults].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
      );
      setFilteredMovements(sorted);
      return;
    }

    let filtered = [...movements].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((m) => {
        const ts = new Date(m.timestamp);
        return ts >= start && ts <= end;
      });
    }

    if (selectedTypes.length > 0) {
      filtered = filtered.filter((m) =>
        selectedTypes.includes(m.movement_type),
      );
    }

    if (selectedSkus.length > 0) {
      filtered = filtered.filter((m) => {
        const mvSkus = (m.details || []).map((d) =>
          String(d.sku || "").toUpperCase(),
        );
        // OR filter (any selected SKU)
        return selectedSkus.some((sku) => mvSkus.includes(sku));
      });
    }

    setFilteredMovements(filtered);
  }, [
    startDate,
    endDate,
    selectedTypes,
    selectedSkus,
    movements,
    txnSearchResults,
  ]);

  const handleDelete = async (txnNum) => {
    try {
      await axios.delete(`http://localhost:5000/api/movements/${txnNum}`);
      setConfirmDelete(null);
      fetchMovements();
    } catch (err) {
      alert(
        "Error deleting movement: " +
          (err.response?.data?.message || err.message),
      );
    }
  };

  if (loading) return <div>Loading movements...</div>;

  const activeMv = movements.find(
    (m) => String(m.transaction_num) === String(selectedTxn || "").trim(),
  );

  const activeMvFromSearch = Array.isArray(txnSearchResults)
    ? txnSearchResults.find(
        (m) => String(m.transaction_num) === String(selectedTxn || "").trim(),
      )
    : null;

  const displayedActiveMv =
    txnSearchResults !== null ? activeMvFromSearch : activeMv;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Movements</h1>
      <p className="text-sm text-gray-500 mb-6">
        Session-level movement documents (inbound/outbound/void)
      </p>

      <div className="bg-white p-4 rounded shadow border mb-8">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-4">
          Filters
        </p>
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-4">
            <div>
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
            <div>
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

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Movement Type
            </label>
            <div className="max-h-32 overflow-y-auto border rounded p-2">
              {types.map((t) => (
                <label key={t} className="flex items-center space-x-2 mb-1">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(t)}
                    onChange={(e) =>
                      e.target.checked
                        ? setSelectedTypes([...selectedTypes, t])
                        : setSelectedTypes(
                            selectedTypes.filter((type) => type !== t),
                          )
                    }
                    className="rounded text-indigo-600 h-3 w-3"
                  />
                  <span className="text-xs">{t}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              SKU Filter
            </label>
            <div className="max-h-32 overflow-y-auto border rounded p-2">
              {skus.map((s) => (
                <label key={s} className="flex items-center space-x-2 mb-1">
                  <input
                    type="checkbox"
                    checked={selectedSkus.includes(s)}
                    onChange={(e) =>
                      e.target.checked
                        ? setSelectedSkus([...selectedSkus, s])
                        : setSelectedSkus(
                            selectedSkus.filter((sku) => sku !== s),
                          )
                    }
                    className="rounded text-indigo-600 h-3 w-3"
                  />
                  <span className="text-xs">{s}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          transaction_num (type to view details)
        </label>
        <input
          type="text"
          placeholder="e.g. 100001 or 20000001 or 3001"
          value={selectedTxn}
          onChange={(e) => setSelectedTxn(e.target.value)}
          className="w-full max-w-xs border rounded px-3 py-2 text-sm"
        />
        {txnSearchResults !== null && (
          <p className="mt-2 text-xs text-gray-500">
            {txnSearchLoading
              ? "Searching exact transaction_num..."
              : `Exact search mode: ${filteredMovements.length} result(s)`}
          </p>
        )}
      </div>

      <div className="bg-white shadow border rounded overflow-hidden mb-8">
        <div className="max-h-[600px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Txn Num
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Qty
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMovements.map((m) => (
                <tr
                  key={m.transaction_num}
                  className={`cursor-pointer hover:bg-gray-50 ${selectedTxn === String(m.transaction_num) ? "bg-indigo-50" : ""}`}
                  onClick={() => setSelectedTxn(String(m.transaction_num))}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(m.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                    {m.movement_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {m.transaction_num}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {m.qty}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {m.location || "Multiple"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    {(m.details || []).length} row(s)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <hr className="mb-8" />

      <h2 className="text-xl font-bold mb-4">Details</h2>
      {displayedActiveMv ? (
        <div className="space-y-6">
          {isAdmin && (
            <div className="bg-orange-50 border border-orange-200 p-4 rounded">
              <p className="text-sm text-orange-800 font-medium mb-4">
                ⚠️ **Admin Action**: Deleting this movement will reverse all
                inventory changes and remove related transactions.
              </p>
              {confirmDelete !== displayedActiveMv.transaction_num ? (
                <button
                  onClick={() =>
                    setConfirmDelete(displayedActiveMv.transaction_num)
                  }
                  className="flex items-center bg-white border border-red-300 text-red-600 px-4 py-2 rounded text-sm hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Movement
                </button>
              ) : (
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-bold text-red-700">
                    Confirm deletion?
                  </span>
                  <button
                    onClick={() =>
                      handleDelete(displayedActiveMv.transaction_num)
                    }
                    className="bg-red-600 text-white px-4 py-1 rounded text-sm hover:bg-red-700"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="bg-gray-200 text-gray-700 px-4 py-1 rounded text-sm hover:bg-gray-300"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="bg-white shadow border rounded overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    From
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    To
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(displayedActiveMv.details || []).map((d, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {d.sku}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {d.product_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {d.qty || d.inbound_qty || d.outbound_qty}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {d.location_from || d.location || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {d.location_to || d.location || "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">
          Type a transaction_num above or click a row to view its details.
        </p>
      )}
    </div>
  );
};

export default MovementsPage;
