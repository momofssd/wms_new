import axios from "axios";
import { useEffect, useState } from "react";
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

  const isAdmin = user?.role?.toLowerCase() === "admin";

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/inventory");
      setInventory(res.data);

      const locs = [...new Set(res.data.map((item) => item.location))].sort();
      const items = [...new Set(res.data.map((item) => item.sku))].sort();

      setLocations(locs);
      setSkus(items);
      setSelectedLocations(locs);
      setSelectedSkus(items);
      setFilteredInventory(res.data);
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
      await axios.put("http://localhost:5000/api/inventory/update-quantity", {
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

  if (loading) return <div>Loading inventory...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Inventory Management</h1>

      <div className="grid grid-cols-2 gap-6 mb-8">
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by SKU
          </label>
          <div className="max-h-32 overflow-y-auto border rounded p-2">
            {skus.map((sku) => (
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

      <div className="mb-6">
        <div className="bg-white p-4 rounded shadow border w-48 text-center">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            Total Quantity
          </p>
          <p className="text-2xl font-bold text-indigo-600">
            {filteredInventory
              .reduce((acc, curr) => acc + (curr.quantity || 0), 0)
              .toLocaleString()}
          </p>
        </div>
      </div>

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
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quantity
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredInventory.map((item) => (
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {isAdmin ? (
                    <input
                      type="number"
                      value={item.quantity}
                      min="0"
                      onChange={(e) =>
                        handleQuantityChange(item, parseInt(e.target.value))
                      }
                      className="w-20 border rounded px-2 py-1"
                    />
                  ) : (
                    item.quantity
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HomePage;
