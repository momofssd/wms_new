import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [defaultLocation, setDefaultLocation] = useState(
    localStorage.getItem("defaultLocation") || "",
  );
  const [audioEnabled, setAudioEnabled] = useState(
    localStorage.getItem("audioEnabled") === "true",
  );

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (token && storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      if (parsedUser.default_location) {
        setDefaultLocation(parsedUser.default_location);
      }
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    try {
      const res = await axios.post("http://localhost:5000/api/auth/login", {
        username,
        password,
      });
      const { token, user } = res.data;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      setUser(user);
      if (user.default_location) {
        setDefaultLocation(user.default_location);
      }
      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || "Login failed",
      };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("defaultLocation");
    localStorage.removeItem("audioEnabled");
    delete axios.defaults.headers.common["Authorization"];
    setUser(null);
    setDefaultLocation("");
    setAudioEnabled(false);
  };

  const toggleAudio = () => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    localStorage.setItem("audioEnabled", newState);
  };

  const updateDefaultLocation = async (loc) => {
    setDefaultLocation(loc);
    try {
      await axios.put("http://localhost:5000/api/auth/default-location", {
        location: loc,
      });
      // Update local user object too
      const storedUser = JSON.parse(localStorage.getItem("user"));
      const updatedUser = { ...storedUser, default_location: loc };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (err) {
      console.error("Error updating default location in DB", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        loading,
        defaultLocation,
        updateDefaultLocation,
        audioEnabled,
        toggleAudio,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
