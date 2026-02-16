import axios from "axios";
import {
  ArrowRightLeft,
  Box,
  Database,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  Truck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Sidebar = () => {
  const {
    user,
    logout,
    defaultLocation,
    updateDefaultLocation,
    audioEnabled,
    toggleAudio,
  } = useAuth();
  const location = useLocation();
  const [locations, setLocations] = useState([]);

  const isCustomer = user?.role?.toLowerCase() === "customer";
  const isAdmin = user?.role?.toLowerCase() === "admin";

  useEffect(() => {
    if (!isCustomer) {
      fetchLocations();
    }
  }, [isCustomer]);

  const fetchLocations = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/master-data/locations",
      );
      setLocations(res.data.filter((l) => l.active).map((l) => l.location));
    } catch (err) {
      console.error("Error fetching locations", err);
    }
  };

  const navigation = [
    { name: "Inventory Dashboard", href: "/", icon: LayoutDashboard },
    {
      name: "Master Data",
      href: "/master-data",
      icon: Database,
      hide: isCustomer,
    },
    { name: "Inbound Entry", href: "/inbound", icon: LogIn, hide: isCustomer },
    {
      name: "Outbound Processing",
      href: "/outbound",
      icon: LogOut,
      hide: isCustomer,
    },
    { name: "STO", href: "/sto", icon: ArrowRightLeft, hide: isCustomer },
    { name: "Transactions", href: "/transactions", icon: History },
    { name: "Movements", href: "/movements", icon: MapPin },
    { name: "Shipment Tracking", href: "/shipment-tracking", icon: Truck },
  ];

  return (
    <div className="flex flex-col w-64 bg-gray-100 border-r min-h-screen">
      <div className="p-6">
        <h1 className="text-xl font-bold">Inv WMS</h1>
        <div className="mt-4">
          <p className="text-sm text-gray-600">Welcome, {user?.username}</p>
          <p className="text-xs text-gray-400 uppercase">Role: {user?.role}</p>
        </div>
      </div>

      {!isCustomer && (
        <div className="px-4 mb-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
              Default Location
            </label>
            <select
              value={defaultLocation}
              onChange={(e) => updateDefaultLocation(e.target.value)}
              className="w-full text-sm border rounded px-2 py-1 bg-white"
            >
              <option value="">Select Location</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={toggleAudio}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
              audioEnabled
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "bg-white border-gray-200 text-gray-600"
            }`}
          >
            <div className="flex items-center">
              {audioEnabled ? (
                <Volume2 className="mr-2 h-4 w-4" />
              ) : (
                <VolumeX className="mr-2 h-4 w-4" />
              )}
              Audio Feedback
            </div>
            <div
              className={`w-8 h-4 rounded-full relative transition-colors ${
                audioEnabled ? "bg-indigo-600" : "bg-gray-300"
              }`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                  audioEnabled ? "translate-x-4.5" : "translate-x-0.5"
                }`}
              ></div>
            </div>
          </button>
        </div>
      )}

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {navigation
          .filter((item) => !item.hide)
          .map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                  isActive
                    ? "bg-gray-200 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
      </nav>

      <div className="p-4 border-t">
        {isAdmin && (
          <button className="w-full flex items-center px-2 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-50 hover:text-gray-900 mb-2">
            <Box className="mr-3 h-5 w-5" />
            Clone Database
          </button>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center px-2 py-2 text-sm font-medium text-red-600 rounded-md hover:bg-red-50"
        >
          <LogOut className="mr-3 h-5 w-5" />
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
