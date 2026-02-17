import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";

const HomePage = () => {
  const { user } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [filteredInventory, setFilteredInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [skus, setSkus] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [selectedSkus, setSelectedSkus] = useState([]);
  const [skuSearch, setSkuSearch] = useState("");
  const [itemsToShow, setItemsToShow] = useState(50);

  const isAdmin = user?.role?.toLowerCase() === "admin";

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const res = await api.get("/inventory");
      // Sort by SKU then by Location
      const sortedData = [...res.data].sort((a, b) => {
        if (a.sku < b.sku) return -1;
        if (a.sku > b.sku) return 1;
        if (a.location < b.location) return -1;
        if (a.location > b.location) return 1;
        return 0;
      });
      setInventory(sortedData);

      const locs = [...new Set(res.data.map((item) => item.location))].sort();
      const items = [...new Set(res.data.map((item) => item.sku))].sort();

      setLocations(locs);
      setSkus(items);
      setSelectedLocations(locs);
      setSelectedSkus(items);
      setFilteredInventory(sortedData);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching inventory", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    const filtered = inventory.filter(
      (item) =>
        selectedLocations.includes(item.location) &&
        selectedSkus.includes(item.sku),
    );
    setFilteredInventory(filtered);
  }, [selectedLocations, selectedSkus, inventory]);

  const handleQuantityChange = async (item, newQty) => {
    if (newQty > item.quantity) {
      alert("Increasing quantity is not allowed here. Use Inbound Entry.");
      return;
    }

    try {
      const reducedBy = item.quantity - newQty;
      await api.put("/inventory/update-quantity", {
        id: item._id,
        newQuantity: newQty,
        reducedBy,
        sku: item.sku,
        productName: item.product_name,
        location: item.location,
      });
      fetchInventory();
    } catch (err) {
      alert("Error updating quantity");
    }
  };

  const downloadCSV = () => {
    const headers = ["SKU", "Product Name", "Location", "Quantity"];
    const csvRows = [
      headers.join(","),
      ...filteredInventory.map((item) =>
        [
          `"${item.sku}"`,
          `"${item.product_name}"`,
          `"${item.location}"`,
          item.quantity,
        ].join(","),
      ),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("hidden", "");
    a.setAttribute("href", url);
    a.setAttribute("download", "inventory.csv");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) return <div>Loading inventory...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Inventory Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-4 rounded shadow border">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Location
          </label>
          <div className="max-h-32 overflow-y-auto border rounded p-2">
            {locations.map((loc) => (
              <label key={loc} className="flex items-center space-x-2 mb-1">
                <input
                  type="checkbox"
                  checked={selectedLocations.includes(loc)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedLocations([...selectedLocations, loc]);
                    } else {
                      setSelectedLocations(
                        selectedLocations.filter((l) => l !== loc),
                      );
                    }
                  }}
                  className="rounded text-indigo-600"
                />
                <span className="text-sm">{loc}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow border">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Filter by SKU
            </label>
            <div className="flex space-x-2">
              <button
                onClick={() => setSelectedSkus(skus)}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedSkus([])}
                className="text-xs text-red-600 hover:text-red-800"
              >
                Clear All
              </button>
            </div>
          </div>
          <input
            type="text"
            placeholder="Search SKU..."
            value={skuSearch}
            onChange={(e) => setSkuSearch(e.target.value)}
            className="w-full border rounded px-2 py-1 mb-2 text-sm"
          />
          <div className="max-h-32 overflow-y-auto border rounded p-2">
            {skus
              .filter((sku) =>
                sku.toLowerCase().includes(skuSearch.toLowerCase()),
              )
              .map((sku) => (
                <label key={sku} className="flex items-center space-x-2 mb-1">
                  <input
                    type="checkbox"
                    checked={selectedSkus.includes(sku)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSkus([...selectedSkus, sku]);
                      } else {
                        setSelectedSkus(selectedSkus.filter((s) => s !== sku));
                      }
                    }}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-sm">{sku}</span>
                </label>
              ))}
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div className="bg-white p-4 rounded shadow border w-full sm:w-48 text-center">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            Total Quantity
          </p>
          <p className="text-2xl font-bold text-indigo-600">
            {filteredInventory
              .reduce((acc, curr) => acc + (curr.quantity || 0), 0)
              .toLocaleString()}
          </p>
        </div>
        <button
          onClick={downloadCSV}
          className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 transition-colors"
        >
          Download CSV
        </button>
      </div>

      <div className="bg-white shadow border rounded overflow-x-auto">
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
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quantity
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredInventory.slice(0, itemsToShow).map((item) => (
              <tr key={item._id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {item.sku}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.product_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.location}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                  {isAdmin ? (
                    <input
                      type="number"
                      value={item.quantity}
                      min="0"
                      onChange={(e) =>
                        handleQuantityChange(item, parseInt(e.target.value))
                      }
                      className="w-20 border-2 border-gray-400 rounded px-2 py-1 font-bold text-gray-900"
                    />
                  ) : (
                    item.quantity
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredInventory.length > itemsToShow && (
          <div className="p-4 text-center bg-gray-50 border-t">
            <button
              onClick={() => setItemsToShow(itemsToShow + 100)}
              className="text-indigo-600 font-semibold hover:text-indigo-800"
            >
              Load More... ({filteredInventory.length - itemsToShow} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
