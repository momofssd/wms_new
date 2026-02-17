import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";

const MasterDataPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("materials");
  const [materials, setMaterials] = useState([]);
  const [locations, setLocations] = useState([]);
  const [newMaterial, setNewMaterial] = useState({
    sku: "",
    product_name: "",
    active: true,
  });
  const [newLocation, setNewLocation] = useState({
    location: "",
    active: true,
  });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [editedMaterials, setEditedMaterials] = useState({});
  const [editedLocations, setEditedLocations] = useState({});

  const isAdmin = user?.role?.toLowerCase() === "admin";
  const isCustomer = user?.role?.toLowerCase() === "customer";

  useEffect(() => {
    fetchMaterials();
    fetchLocations();
  }, []);

  const fetchMaterials = async () => {
    try {
      const res = await api.get("/master-data/materials");
      setMaterials(res.data);
    } catch (err) {
      console.error("Error fetching materials", err);
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await api.get("/master-data/locations");
      setLocations(res.data);
    } catch (err) {
      console.error("Error fetching locations", err);
    }
  };

  const handleCreateMaterial = async (e) => {
    if (e) e.preventDefault();
    if (!newMaterial.sku || !newMaterial.product_name) {
      setMessage({ type: "error", text: "SKU and Product Name are required" });
      return;
    }
    try {
      const res = await api.post("/master-data/materials", newMaterial);
      setMessage({ type: "success", text: res.data.message });
      setNewMaterial({ sku: "", product_name: "", active: true });
      fetchMaterials();
    } catch (err) {
      setMessage({ type: "error", text: "Error creating material" });
    }
  };

  const handleCreateLocation = async (e) => {
    if (e) e.preventDefault();
    if (!newLocation.location) {
      setMessage({ type: "error", text: "Location is required" });
      return;
    }
    try {
      const res = await api.post("/master-data/locations", newLocation);
      setMessage({ type: "success", text: res.data.message });
      setNewLocation({ location: "", active: true });
      fetchLocations();
    } catch (err) {
      setMessage({ type: "error", text: "Error creating location" });
    }
  };

  const handleMaterialActiveToggle = (sku, currentActive) => {
    setEditedMaterials({
      ...editedMaterials,
      [sku]: !currentActive,
    });
    setMaterials(
      materials.map((m) =>
        m.sku === sku ? { ...m, active: !currentActive } : m,
      ),
    );
  };

  const handleLocationActiveToggle = (loc, currentActive) => {
    setEditedLocations({
      ...editedLocations,
      [loc]: !currentActive,
    });
    setLocations(
      locations.map((l) =>
        l.location === loc ? { ...l, active: !currentActive } : l,
      ),
    );
  };

  const saveMaterialChanges = async () => {
    const changes = Object.keys(editedMaterials).map((sku) => ({
      sku,
      active: editedMaterials[sku],
    }));
    if (changes.length === 0) return;
    try {
      await api.put("/master-data/materials", {
        changes,
      });
      setMessage({
        type: "success",
        text: `Saved ${changes.length} material changes`,
      });
      setEditedMaterials({});
      fetchMaterials();
    } catch (err) {
      setMessage({ type: "error", text: "Error saving material changes" });
    }
  };

  const saveLocationChanges = async () => {
    const changes = Object.keys(editedLocations).map((location) => ({
      location,
      active: editedLocations[location],
    }));
    if (changes.length === 0) return;
    try {
      await api.put("/master-data/locations", {
        changes,
      });
      setMessage({
        type: "success",
        text: `Saved ${changes.length} location changes`,
      });
      setEditedLocations({});
      fetchLocations();
    } catch (err) {
      setMessage({ type: "error", text: "Error saving location changes" });
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Master Data</h1>

      <div className="flex space-x-4 mb-6 border-b">
        <button
          className={`pb-2 px-4 ${activeTab === "materials" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("materials");
            setMessage({ type: "", text: "" });
          }}
        >
          Materials
        </button>
        <button
          className={`pb-2 px-4 ${activeTab === "locations" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("locations");
            setMessage({ type: "", text: "" });
          }}
        >
          Locations
        </button>
      </div>

      {message.text && (
        <div
          className={`mb-4 p-4 rounded ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}
        >
          {message.text}
        </div>
      )}

      {activeTab === "materials" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Materials (MM)</h2>
          <p className="text-sm text-gray-500 mb-6">
            Inbound requires SKU to exist here.
          </p>

          {!isCustomer && (
            <div className="grid grid-cols-4 gap-4 mb-8 bg-gray-50 p-4 rounded border">
              <input
                type="text"
                placeholder="SKU"
                value={newMaterial.sku}
                onChange={(e) =>
                  setNewMaterial({ ...newMaterial, sku: e.target.value })
                }
                className="border rounded px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Product Name"
                value={newMaterial.product_name}
                onChange={(e) =>
                  setNewMaterial({
                    ...newMaterial,
                    product_name: e.target.value,
                  })
                }
                className="border rounded px-3 py-2 text-sm"
              />
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={newMaterial.active}
                  onChange={(e) =>
                    setNewMaterial({ ...newMaterial, active: e.target.checked })
                  }
                  className="rounded text-indigo-600"
                />
                <span className="text-sm font-medium text-gray-700">
                  Active
                </span>
              </label>
              <button
                onClick={handleCreateMaterial}
                className="bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700"
              >
                Create Material
              </button>
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
                    Active
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {materials.map((m) => (
                  <tr key={m.sku}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {m.sku}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {m.product_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="checkbox"
                        checked={m.active}
                        disabled={!isAdmin}
                        onChange={() =>
                          handleMaterialActiveToggle(m.sku, m.active)
                        }
                        className="rounded text-indigo-600"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {m.created_at
                        ? new Date(m.created_at).toLocaleString()
                        : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isAdmin && (
            <button
              onClick={saveMaterialChanges}
              className="mt-4 bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700"
            >
              Save Material Changes
            </button>
          )}
        </div>
      )}

      {activeTab === "locations" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Locations</h2>
          <p className="text-sm text-gray-500 mb-6">
            Used for inbound/outbound location selection.
          </p>

          {!isCustomer && (
            <div className="grid grid-cols-3 gap-4 mb-8 bg-gray-50 p-4 rounded border">
              <input
                type="text"
                placeholder="Location"
                value={newLocation.location}
                onChange={(e) =>
                  setNewLocation({ ...newLocation, location: e.target.value })
                }
                className="border rounded px-3 py-2 text-sm"
              />
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={newLocation.active}
                  onChange={(e) =>
                    setNewLocation({ ...newLocation, active: e.target.checked })
                  }
                  className="rounded text-indigo-600"
                />
                <span className="text-sm font-medium text-gray-700">
                  Active
                </span>
              </label>
              <button
                onClick={handleCreateLocation}
                className="bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700"
              >
                Create Location
              </button>
            </div>
          )}

          <div className="bg-white shadow border rounded overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Active
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {locations.map((l) => (
                  <tr key={l.location}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {l.location}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="checkbox"
                        checked={l.active}
                        disabled={!isAdmin}
                        onChange={() =>
                          handleLocationActiveToggle(l.location, l.active)
                        }
                        className="rounded text-indigo-600"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {l.created_at
                        ? new Date(l.created_at).toLocaleString()
                        : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isAdmin && (
            <button
              onClick={saveLocationChanges}
              className="mt-4 bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700"
            >
              Save Location Changes
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MasterDataPage;
