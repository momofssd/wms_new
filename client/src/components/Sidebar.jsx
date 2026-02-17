import {
  ArrowRightLeft,
  Box,
  ChevronLeft,
  ChevronRight,
  Database,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  Truck,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import api from "../api";
import { useAuth } from "../context/AuthContext";

const Sidebar = ({
  isCollapsed,
  setIsCollapsed,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
}) => {
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
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState({ text: "", type: "" });

  const isCustomer = user?.role?.toLowerCase() === "customer";
  const isAdmin = user?.role?.toLowerCase() === "admin";

  useEffect(() => {
    if (!isCustomer) {
      fetchLocations();
    }
  }, [isCustomer]);

  const fetchLocations = async () => {
    try {
      const res = await api.get("/master-data/locations");
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

  const closeMobileMenu = () => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  };

  const handleBackup = async () => {
    setBackupMessage({ text: "", type: "" });
    setIsBackingUp(true);
    try {
      const res = await api.post("/backup", {
        source: "warehouse_db",
        target: "warehouse_db_copy",
      });
      setBackupMessage({
        text: res.data.message || "Backup successful!",
        type: "success",
      });
      // Clear message after 5 seconds
      setTimeout(() => setBackupMessage({ text: "", type: "" }), 5000);
    } catch (err) {
      console.error("Backup failed", err);
      setBackupMessage({
        text: err.response?.data?.message || "Backup failed!",
        type: "error",
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <>
      {/* Overlay Backdrop for Mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={closeMobileMenu}
        />
      )}

      <div
        className={`fixed md:relative flex flex-col ${
          isCollapsed ? "md:w-20" : "md:w-64"
        } w-64 bg-gray-100 border-r min-h-screen transition-all duration-300 overflow-x-hidden z-50 
        ${
          isMobileMenuOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div
          className={`p-4 flex flex-col ${isCollapsed ? "md:items-center" : ""}`}
        >
          <div className="flex items-center justify-between w-full">
            {(!isCollapsed || isMobileMenuOpen) && (
              <h1 className="text-xl font-bold">Inv WMS</h1>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:block p-1 hover:bg-gray-200 rounded-full transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="h-6 w-6" />
              ) : (
                <ChevronLeft className="h-6 w-6" />
              )}
            </button>
            <button
              onClick={closeMobileMenu}
              className="md:hidden p-1 hover:bg-gray-200 rounded-full transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {(!isCollapsed || isMobileMenuOpen) && (
            <div className="mt-4">
              <p className="text-sm text-gray-600">Welcome, {user?.username}</p>
              <p className="text-xs text-gray-400 uppercase">
                Role: {user?.role}
              </p>
            </div>
          )}
        </div>

        {!isCustomer && (!isCollapsed || isMobileMenuOpen) && (
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

        <nav
          className={`flex-1 ${
            isCollapsed && !isMobileMenuOpen ? "md:px-2" : "px-4"
          } space-y-1 overflow-y-auto`}
        >
          {navigation
            .filter((item) => !item.hide)
            .map((item) => {
              const isActive = location.pathname === item.href;
              const collapsedMode = isCollapsed && !isMobileMenuOpen;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={closeMobileMenu}
                  title={collapsedMode ? item.name : ""}
                  className={`flex items-center ${
                    collapsedMode ? "md:justify-center" : "px-2"
                  } py-2 text-sm font-medium rounded-md ${
                    isActive
                      ? "bg-gray-200 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <item.icon
                    className={`${
                      collapsedMode ? "" : "mr-3"
                    } h-5 w-5 flex-shrink-0`}
                  />
                  {!collapsedMode && <span>{item.name}</span>}
                </Link>
              );
            })}
        </nav>

        <div
          className={`p-4 border-t ${
            isCollapsed && !isMobileMenuOpen
              ? "md:flex md:flex-col md:items-center"
              : ""
          }`}
        >
          {isAdmin &&
            backupMessage.text &&
            (!isCollapsed || isMobileMenuOpen) && (
              <div
                className={`mb-2 p-2 text-xs rounded border ${
                  backupMessage.type === "success"
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                {backupMessage.text}
              </div>
            )}
          {isAdmin && (
            <button
              onClick={handleBackup}
              disabled={isBackingUp}
              title={isCollapsed && !isMobileMenuOpen ? "Backup Database" : ""}
              className={`w-full flex items-center ${
                isCollapsed && !isMobileMenuOpen ? "md:justify-center" : "px-2"
              } py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-50 hover:text-gray-900 mb-2 disabled:opacity-50`}
            >
              <Box
                className={`${
                  isCollapsed && !isMobileMenuOpen ? "" : "mr-3"
                } h-5 w-5 flex-shrink-0 ${isBackingUp ? "animate-spin" : ""}`}
              />
              {(!isCollapsed || isMobileMenuOpen) && (
                <span>{isBackingUp ? "Backing up..." : "Backup Database"}</span>
              )}
            </button>
          )}
          <button
            onClick={() => {
              logout();
              closeMobileMenu();
            }}
            title={isCollapsed && !isMobileMenuOpen ? "Logout" : ""}
            className={`w-full flex items-center ${
              isCollapsed && !isMobileMenuOpen ? "md:justify-center" : "px-2"
            } py-2 text-sm font-medium text-red-600 rounded-md hover:bg-red-50`}
          >
            <LogOut
              className={`${
                isCollapsed && !isMobileMenuOpen ? "" : "mr-3"
              } h-5 w-5 flex-shrink-0`}
            />
            {(!isCollapsed || isMobileMenuOpen) && <span>Logout</span>}
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
