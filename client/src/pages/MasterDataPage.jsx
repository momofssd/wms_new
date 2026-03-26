import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";

const MasterDataPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("materials");
  const [materials, setMaterials] = useState([]);
  const [locations, setLocations] = useState([]);
  const [priceConditions, setPriceConditions] = useState([]);
  const [newMaterial, setNewMaterial] = useState({
    sku: "",
    product_name: "",
    active: true,
  });
  const [newLocation, setNewLocation] = useState({
    location: "",
    active: true,
  });
  const [newPriceCondition, setNewPriceCondition] = useState({
    skus: [],
    service: "FBA",
    from_date: "",
    to_date: "",
    price: "",
  });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [editedMaterials, setEditedMaterials] = useState({});
  const [editedLocations, setEditedLocations] = useState({});
  const [editedPriceConditions, setEditedPriceConditions] = useState({});
  const [priceConditionFilters, setPriceConditionFilters] = useState({
    sku: "",
    product_name: "",
    service: "",
    from_date: "",
    to_date: "",
    price: "",
    active: "",
  });
  const [showInactiveMaterials, setShowInactiveMaterials] = useState(false);
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    id: null,
    sku: "",
    service: "",
    from_date: "",
    to_date: "",
  });

  const isAdmin = user?.role?.toLowerCase() === "admin";
  const isCustomer = user?.role?.toLowerCase() === "customer";

  useEffect(() => {
    fetchMaterials();
    fetchLocations();
    fetchPriceConditions();
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

  const fetchPriceConditions = async () => {
    try {
      const res = await api.get("/master-data/price-conditions");
      setPriceConditions(res.data);
    } catch (err) {
      console.error("Error fetching price conditions", err);
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

  const handleCreatePriceCondition = async (e) => {
    if (e) e.preventDefault();
    const { skus, service, from_date, to_date, price } = newPriceCondition;
    if (!skus.length || !service || !from_date || !to_date || !price) {
      setMessage({
        type: "error",
        text: "All price condition fields are required, including at least one SKU",
      });
      return;
    }
    try {
      const res = await api.post(
        "/master-data/price-conditions",
        newPriceCondition,
      );
      setMessage({ type: "success", text: res.data.message });
      setNewPriceCondition({
        skus: [],
        service: "FBA",
        from_date: "",
        to_date: "",
        price: "",
      });
      fetchPriceConditions();
    } catch (err) {
      setMessage({ type: "error", text: "Error creating price condition" });
    }
  };

  const handleSkuToggle = (sku) => {
    const currentSkus = [...newPriceCondition.skus];
    const index = currentSkus.indexOf(sku);
    if (index > -1) {
      currentSkus.splice(index, 1);
    } else {
      currentSkus.push(sku);
    }
    setNewPriceCondition({ ...newPriceCondition, skus: currentSkus });
  };

  const handleSelectAllSkus = (checked) => {
    if (checked) {
      const allActiveSkus = materials
        .filter((m) => m.active === true)
        .map((m) => m.sku);
      setNewPriceCondition({ ...newPriceCondition, skus: allActiveSkus });
    } else {
      setNewPriceCondition({ ...newPriceCondition, skus: [] });
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal.id) return;
    try {
      // Use data in body for smart delete
      await api.delete(`/master-data/price-conditions/${deleteModal.id}`, {
        data: {
          sku: deleteModal.sku,
          service: deleteModal.service,
          from_date: deleteModal.from_date,
          to_date: deleteModal.to_date,
        },
      });
      setMessage({ type: "success", text: "Price condition adjusted" });
      setDeleteModal({
        isOpen: false,
        id: null,
        sku: "",
        service: "",
        from_date: "",
        to_date: "",
      });
      fetchPriceConditions();
    } catch (err) {
      setMessage({ type: "error", text: "Error deleting price condition" });
      setDeleteModal({
        isOpen: false,
        id: null,
        sku: "",
        service: "",
        from_date: "",
        to_date: "",
      });
    }
  };

  const handleDeletePriceCondition = (pc) => {
    setDeleteModal({
      isOpen: true,
      id: pc._id,
      sku: pc.sku,
      service: pc.service,
      from_date: pc.from_date.split("T")[0],
      to_date: pc.to_date.split("T")[0],
    });
  };

  const handlePriceChange = (id, newPrice) => {
    setEditedPriceConditions({
      ...editedPriceConditions,
      [id]: newPrice,
    });
    setPriceConditions(
      priceConditions.map((pc) =>
        pc._id === id ? { ...pc, price: parseFloat(newPrice) } : pc,
      ),
    );
  };

  const savePriceChanges = async (id) => {
    const newPrice = editedPriceConditions[id];
    if (newPrice === undefined) return;
    try {
      await api.put(`/master-data/price-conditions/${id}`, {
        price: newPrice,
      });
      setMessage({ type: "success", text: "Price updated successfully" });
      const newEdited = { ...editedPriceConditions };
      delete newEdited[id];
      setEditedPriceConditions(newEdited);
      fetchPriceConditions();
    } catch (err) {
      setMessage({ type: "error", text: "Error updating price" });
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
      fetchPriceConditions(); // Refresh price conditions as active status might have changed
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

  const visibleMaterials = showInactiveMaterials
    ? materials
    : materials.filter((m) => m.active);

  const filteredPriceConditions = priceConditions.filter((pc) => {
    return Object.keys(priceConditionFilters).every((key) => {
      const filterValue = priceConditionFilters[key].toLowerCase();
      if (!filterValue) return true;

      if (key === "from_date" || key === "to_date") {
        const dateStr = new Date(pc[key]).toLocaleDateString().toLowerCase();
        return dateStr.includes(filterValue);
      }

      if (key === "price") {
        return pc.price?.toString().includes(filterValue);
      }

      if (key === "active") {
        const activeStr = pc.active ? "yes" : "no";
        return activeStr.includes(filterValue);
      }

      return pc[key]?.toString().toLowerCase().includes(filterValue);
    });
  });

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
        <button
          className={`pb-2 px-4 ${activeTab === "price-conditions" ? "border-b-2 border-indigo-600 text-indigo-600 font-semibold" : "text-gray-500"}`}
          onClick={() => {
            setActiveTab("price-conditions");
            setMessage({ type: "", text: "" });
          }}
        >
          Price Condition
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 bg-gray-50 p-4 rounded border">
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

          <div className="mb-4 flex justify-end">
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showInactiveMaterials}
                onChange={(e) => setShowInactiveMaterials(e.target.checked)}
                className="rounded text-indigo-600"
              />
              <span>Show inactive SKUs</span>
            </label>
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
                    Active
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {visibleMaterials.map((m) => (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 bg-gray-50 p-4 rounded border">
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

          <div className="bg-white shadow border rounded overflow-x-auto">
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

      {activeTab === "price-conditions" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Price Conditions</h2>
          <p className="text-sm text-gray-500 mb-6">
            Maintain active SKU prices for FBA and FBM services by date range.
          </p>

          {!isCustomer && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 bg-gray-50 p-6 rounded-lg border items-start shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-800">
                    Select SKUs ({newPriceCondition.skus.length} selected)
                  </label>
                  <label className="flex items-center space-x-2 text-xs font-bold text-indigo-600 cursor-pointer hover:text-indigo-800">
                    <input
                      type="checkbox"
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                      onChange={(e) => handleSelectAllSkus(e.target.checked)}
                      checked={
                        newPriceCondition.skus.length > 0 &&
                        newPriceCondition.skus.length ===
                          materials.filter((m) => m.active === true).length
                      }
                    />
                    <span>SELECT ALL</span>
                  </label>
                </div>
                <div className="border rounded-md px-3 py-2 h-64 overflow-y-auto bg-white shadow-inner">
                  {materials
                    .filter((m) => m.active === true)
                    .map((m) => (
                      <label
                        key={m.sku}
                        className="flex items-center space-x-3 py-2 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={newPriceCondition.skus.includes(m.sku)}
                          onChange={() => handleSkuToggle(m.sku)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">
                          <span className="font-mono font-bold mr-2">
                            {m.sku}
                          </span>
                          <span className="text-gray-500">
                            - {m.product_name}
                          </span>
                        </span>
                      </label>
                    ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Service
                  </label>
                  <select
                    value={newPriceCondition.service}
                    onChange={(e) =>
                      setNewPriceCondition({
                        ...newPriceCondition,
                        service: e.target.value,
                      })
                    }
                    className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="FBA">FBA</option>
                    <option value="FBM">FBM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={newPriceCondition.from_date}
                    onChange={(e) =>
                      setNewPriceCondition({
                        ...newPriceCondition,
                        from_date: e.target.value,
                      })
                    }
                    className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={newPriceCondition.to_date}
                    onChange={(e) =>
                      setNewPriceCondition({
                        ...newPriceCondition,
                        to_date: e.target.value,
                      })
                    }
                    className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newPriceCondition.price}
                      onChange={(e) =>
                        setNewPriceCondition({
                          ...newPriceCondition,
                          price: e.target.value,
                        })
                      }
                      className="w-full border rounded pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2 mt-2">
                  <button
                    onClick={handleCreatePriceCondition}
                    className="w-full bg-indigo-600 text-white rounded-md px-4 py-3 text-sm font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                  >
                    Create Conditions
                  </button>
                </div>
              </div>
            </div>
          )}

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
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    From
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Active
                  </th>
                  {!isCustomer && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="Filter SKU"
                      className="w-full border rounded px-2 py-1 text-xs font-normal"
                      value={priceConditionFilters.sku}
                      onChange={(e) =>
                        setPriceConditionFilters({
                          ...priceConditionFilters,
                          sku: e.target.value,
                        })
                      }
                    />
                  </th>
                  <th className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="Filter Name"
                      className="w-full border rounded px-2 py-1 text-xs font-normal"
                      value={priceConditionFilters.product_name}
                      onChange={(e) =>
                        setPriceConditionFilters({
                          ...priceConditionFilters,
                          product_name: e.target.value,
                        })
                      }
                    />
                  </th>
                  <th className="px-4 py-2">
                    <select
                      className="w-full border rounded px-2 py-1 text-xs font-normal"
                      value={priceConditionFilters.service}
                      onChange={(e) =>
                        setPriceConditionFilters({
                          ...priceConditionFilters,
                          service: e.target.value,
                        })
                      }
                    >
                      <option value="">All</option>
                      <option value="FBA">FBA</option>
                      <option value="FBM">FBM</option>
                    </select>
                  </th>
                  <th className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="Filter From"
                      className="w-full border rounded px-2 py-1 text-xs font-normal"
                      value={priceConditionFilters.from_date}
                      onChange={(e) =>
                        setPriceConditionFilters({
                          ...priceConditionFilters,
                          from_date: e.target.value,
                        })
                      }
                    />
                  </th>
                  <th className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="Filter To"
                      className="w-full border rounded px-2 py-1 text-xs font-normal"
                      value={priceConditionFilters.to_date}
                      onChange={(e) =>
                        setPriceConditionFilters({
                          ...priceConditionFilters,
                          to_date: e.target.value,
                        })
                      }
                    />
                  </th>
                  <th className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="Filter Price"
                      className="w-full border rounded px-2 py-1 text-xs font-normal"
                      value={priceConditionFilters.price}
                      onChange={(e) =>
                        setPriceConditionFilters({
                          ...priceConditionFilters,
                          price: e.target.value,
                        })
                      }
                    />
                  </th>
                  <th className="px-4 py-2">
                    <select
                      className="w-full border rounded px-2 py-1 text-xs font-normal"
                      value={priceConditionFilters.active}
                      onChange={(e) =>
                        setPriceConditionFilters({
                          ...priceConditionFilters,
                          active: e.target.value,
                        })
                      }
                    >
                      <option value="">All</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </th>
                  {!isCustomer && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPriceConditions.map((pc) => (
                  <tr key={pc._id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {pc.sku}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {pc.product_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {pc.service}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(pc.from_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(pc.to_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {isAdmin ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            step="0.01"
                            value={
                              editedPriceConditions[pc._id] !== undefined
                                ? editedPriceConditions[pc._id]
                                : pc.price
                            }
                            onChange={(e) =>
                              handlePriceChange(pc._id, e.target.value)
                            }
                            className="w-20 border rounded px-2 py-1 text-sm"
                          />
                          {editedPriceConditions[pc._id] !== undefined && (
                            <button
                              onClick={() => savePriceChanges(pc._id)}
                              className="text-indigo-600 hover:text-indigo-900 text-xs font-bold"
                            >
                              Save
                            </button>
                          )}
                        </div>
                      ) : (
                        `$${pc.price?.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${pc.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                      >
                        {pc.active ? "Yes" : "No"}
                      </span>
                    </td>
                    {!isCustomer && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={() => handleDeletePriceCondition(pc)}
                          className="text-red-600 hover:text-red-900"
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
      )}

      {/* Delete Confirmation Popup */}
      {deleteModal.isOpen && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md">
          <div className="bg-white rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-2 border-red-100 w-full p-6 ring-1 ring-black ring-opacity-5">
            <div className="flex items-center space-x-3 mb-4 text-red-600 font-bold">
              <span className="text-xl">⚠️</span>
              <h3 className="text-lg uppercase tracking-tight">
                Adjust Price Condition Range
              </h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Specify the date range to remove for SKU:{" "}
              <strong>{deleteModal.sku}</strong> ({deleteModal.service})
            </p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  From
                </label>
                <input
                  type="date"
                  value={deleteModal.from_date}
                  onChange={(e) =>
                    setDeleteModal({
                      ...deleteModal,
                      from_date: e.target.value,
                    })
                  }
                  className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  To
                </label>
                <input
                  type="date"
                  value={deleteModal.to_date}
                  onChange={(e) =>
                    setDeleteModal({ ...deleteModal, to_date: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>
            </div>

            <p className="text-xs text-red-500 mb-6 italic">
              Existing price condition records within or overlapping this range
              will be adjusted or deleted.
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() =>
                  setDeleteModal({
                    isOpen: false,
                    id: null,
                    sku: "",
                    service: "",
                    from_date: "",
                    to_date: "",
                  })
                }
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors uppercase tracking-wider border rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-6 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-md hover:shadow-lg transition-all active:scale-95 uppercase tracking-wider"
              >
                Apply Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterDataPage;
