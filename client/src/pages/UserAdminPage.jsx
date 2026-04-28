import { Save, Search, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../api";

const UserAdminPage = () => {
  const [users, setUsers] = useState([]);
  const [masterSkus, setMasterSkus] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [skuSearch, setSkuSearch] = useState("");
  const [userAllowedSkus, setUserAllowedSkus] = useState([]);
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "",
  });

  // Create user state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "user",
  });
  const [creating, setCreating] = useState(false);

  // Change password state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Delete user state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [usersRes, skuRes] = await Promise.all([
        api.get("/auth/users"),
        api.get("/master-data/materials"),
      ]);
      setUsers(usersRes.data);
      setMasterSkus(skuRes.data);
    } catch (err) {
      console.error("Error fetching data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setUserAllowedSkus(user.allowed_skus || []);
  };

  const handleToggleSku = (sku) => {
    setUserAllowedSkus((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku],
    );
  };

  const handleSaveSkus = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await api.put("/auth/user-skus", {
        userId: selectedUser._id,
        skus: userAllowedSkus,
      });
      // Update local users list
      setUsers(
        users.map((u) =>
          u._id === selectedUser._id
            ? { ...u, allowed_skus: userAllowedSkus }
            : u,
        ),
      );
      setNotification({
        show: true,
        message: "User SKUs updated successfully",
        type: "success",
      });
      setTimeout(
        () => setNotification({ show: false, message: "", type: "" }),
        3000,
      );
    } catch (err) {
      console.error("Error saving user SKUs", err);
      setNotification({
        show: true,
        message: "Failed to save user SKUs",
        type: "error",
      });
      setTimeout(
        () => setNotification({ show: false, message: "", type: "" }),
        3000,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post("/auth/users", newUser);
      setUsers([...users, res.data]);
      setShowCreateModal(false);
      setNewUser({ username: "", password: "", role: "user" });
      setNotification({
        show: true,
        message: "User created successfully",
        type: "success",
      });
      setTimeout(
        () => setNotification({ show: false, message: "", type: "" }),
        3000,
      );
    } catch (err) {
      console.error("Error creating user", err);
      setNotification({
        show: true,
        message: err.response?.data?.message || "Failed to create user",
        type: "error",
      });
      setTimeout(
        () => setNotification({ show: false, message: "", type: "" }),
        3000,
      );
    } finally {
      setCreating(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    setChangingPassword(true);
    try {
      await api.put(`/auth/users/${selectedUser._id}/password`, {
        password: newPassword,
      });
      setShowPasswordModal(false);
      setNewPassword("");
      setNotification({
        show: true,
        message: "Password updated successfully",
        type: "success",
      });
      setTimeout(
        () => setNotification({ show: false, message: "", type: "" }),
        3000,
      );
    } catch (err) {
      console.error("Error changing password", err);
      setNotification({
        show: true,
        message: err.response?.data?.message || "Failed to change password",
        type: "error",
      });
      setTimeout(
        () => setNotification({ show: false, message: "", type: "" }),
        3000,
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setDeletingUser(true);
    try {
      await api.delete(`/auth/users/${selectedUser._id}`);
      setUsers(users.filter((u) => u._id !== selectedUser._id));
      setSelectedUser(null);
      setUserAllowedSkus([]);
      setShowDeleteModal(false);
      setNotification({
        show: true,
        message: "User deleted successfully",
        type: "success",
      });
      setTimeout(
        () => setNotification({ show: false, message: "", type: "" }),
        3000,
      );
    } catch (err) {
      console.error("Error deleting user", err);
      setNotification({
        show: true,
        message: err.response?.data?.message || "Failed to delete user",
        type: "error",
      });
      setTimeout(
        () => setNotification({ show: false, message: "", type: "" }),
        3000,
      );
    } finally {
      setDeletingUser(false);
    }
  };

  const filteredSkus = masterSkus.filter(
    (sku) =>
      sku.sku.toLowerCase().includes(skuSearch.toLowerCase()) ||
      sku.description?.toLowerCase().includes(skuSearch.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 relative">
      {notification.show && (
        <div
          className={`absolute top-4 right-4 z-50 px-4 py-2 rounded shadow-md text-white transition-opacity duration-300 ${notification.type === "success" ? "bg-green-500" : "bg-red-500"}`}
        >
          {notification.message}
        </div>
      )}
      <div className="flex items-center mb-6">
        <Users className="h-8 w-8 text-indigo-600 mr-3" />
        <h1 className="text-2xl font-bold text-gray-800">
          User Administration
        </h1>
        <div className="ml-auto">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
          >
            Create User
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* User List */}
        <div className="md:col-span-4 lg:col-span-3 bg-white rounded-lg shadow overflow-hidden h-[700px] overflow-y-auto">
          <div className="p-4 bg-gray-50 border-b">
            <h2 className="font-semibold text-gray-700">Users</h2>
          </div>
          <ul className="divide-y divide-gray-200">
            {users.map((user) => (
              <li
                key={user._id}
                className={`p-4 cursor-pointer hover:bg-indigo-50 transition-colors ${
                  selectedUser?._id === user._id
                    ? "bg-indigo-50 border-l-4 border-indigo-500"
                    : ""
                }`}
                onClick={() => handleSelectUser(user)}
              >
                <div className="font-medium text-gray-900">{user.username}</div>
                <div className="text-sm text-gray-500 capitalize">
                  {user.role}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {user.allowed_skus?.length || 0} SKUs assigned
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* SKU Selection */}
        <div className="md:col-span-8 lg:col-span-9 bg-white rounded-lg shadow overflow-hidden flex flex-col h-[700px]">
          {selectedUser ? (
            <>
              <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                <div>
                  <h2 className="font-semibold text-gray-700">
                    Assign SKUs for {selectedUser.username}
                  </h2>
                  <p className="text-xs text-gray-500">
                    Select the SKUs this user is allowed to see and manage
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                  >
                    Delete User
                  </button>
                  {selectedUser.role === "user" && (
                    <button
                      onClick={() => setShowPasswordModal(true)}
                      className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                    >
                      Change Password
                    </button>
                  )}
                  <button
                    onClick={handleSaveSkus}
                    disabled={saving}
                    className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>

              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search SKUs by code or description..."
                    value={skuSearch}
                    onChange={(e) => setSkuSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredSkus.map((sku) => (
                    <div
                      key={sku.sku}
                      onClick={() => handleToggleSku(sku.sku)}
                      className={`p-3 border rounded-lg cursor-pointer flex items-center transition-all ${
                        userAllowedSkus.includes(sku.sku)
                          ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500"
                          : "bg-white border-gray-200 hover:border-indigo-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={userAllowedSkus.includes(sku.sku)}
                        readOnly
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-3"
                      />
                      <div className="overflow-hidden">
                        <div className="font-medium text-gray-900 truncate">
                          {sku.sku}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {sku.description}
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredSkus.length === 0 && (
                    <div className="col-span-full py-10 text-center text-gray-500">
                      No SKUs found matching your search.
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t flex justify-between items-center text-sm">
                <span className="text-gray-600">
                  {userAllowedSkus.length} SKUs selected
                </span>
                <div className="space-x-4">
                  <button
                    onClick={() =>
                      setUserAllowedSkus(masterSkus.map((s) => s.sku))
                    }
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setUserAllowedSkus([])}
                    className="text-red-600 hover:text-red-800"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8">
              <Users className="h-16 w-16 mb-4 opacity-20" />
              <p>Select a user from the list to manage their available SKUs</p>
            </div>
          )}
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full shadow-2xl border border-gray-200 pointer-events-auto">
            <h2 className="text-xl font-bold mb-4">Create New User</h2>
            <form onSubmit={handleCreateUser}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={newUser.username}
                  onChange={(e) =>
                    setNewUser({ ...newUser, username: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser({ ...newUser, role: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full shadow-2xl border border-gray-200 pointer-events-auto">
            <h2 className="text-xl font-bold mb-4">Change Password</h2>
            <p className="text-sm text-gray-600 mb-4">
              Updating password for user:{" "}
              <span className="font-semibold">{selectedUser.username}</span>
            </p>
            <form onSubmit={handleChangePassword}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border rounded px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                >
                  {changingPassword ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full shadow-2xl border border-gray-200 pointer-events-auto">
            <h2 className="text-xl font-bold mb-4 text-red-600">Delete User</h2>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete{" "}
              <span className="font-semibold">{selectedUser.username}</span>?
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deletingUser}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deletingUser ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAdminPage;
