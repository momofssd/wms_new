import axios from "axios";
import { useEffect, useState } from "react";
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
  const [message, setMessage] = useState({ type: "", text: "" });
  const [preview, setPreview] = useState(null);
  const [completion, setCompletion] = useState(null);

  useEffect(() => {
    fetchLocations();
    fetchSkus();
    fetchInventory();
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
      const res = await axios.get(
        "http://localhost:5000/api/master-data/locations",
      );
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
      const res = await axios.get(
        "http://localhost:5000/api/master-data/materials",
      );
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
      const res = await axios.get("http://localhost:5000/api/inventory");
      setInventory(res.data);
    } catch (err) {
      console.error("Error fetching inventory", err);
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
      const res = await axios.post("http://localhost:5000/api/sto/submit", {
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">STO - Stock Transfer Order</h1>
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

            <div className="w-1/2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                max={available > 0 ? available : 1}
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value))}
                className="w-full border rounded px-3 py-2"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                Cannot be more than available qty at Location From.
              </p>
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
              <span className="font-bold">{completion.transaction_num}</span>
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
        <h2 className="text-xl font-bold mb-4">Current Inventory</h2>
        <div className="bg-white shadow border rounded overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  SKU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Product Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Quantity
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {inventory
                .filter((i) => i.quantity > 0)
                .map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.sku}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.product_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.location}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">
                      {item.quantity}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default STOPage;
