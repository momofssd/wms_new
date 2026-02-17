import { createContext, useContext, useEffect, useRef, useState } from "react";
import api from "../api";

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
  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const inactivityTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // Inactivity timeout - 1 hour (3600000 ms)
  const INACTIVITY_TIMEOUT = 60 * 60 * 1000;
  const WARNING_COUNTDOWN = 10; // 10 seconds countdown

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (token && storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      if (parsedUser.default_location) {
        setDefaultLocation(parsedUser.default_location);
      }
    }
    setLoading(false);
  }, []);

  // Countdown effect for modal
  useEffect(() => {
    if (!showInactivityModal) {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      return;
    }

    // Reset countdown when modal shows
    setCountdown(WARNING_COUNTDOWN);

    // Start countdown
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          logout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [showInactivityModal]);

  // Inactivity timeout effect
  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      // Don't reset if modal is showing - user must click the button
      if (showInactivityModal) return;

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      inactivityTimerRef.current = setTimeout(() => {
        setShowInactivityModal(true);
      }, INACTIVITY_TIMEOUT);
    };

    // Events that indicate user activity
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    // Add event listeners
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Initialize the timer
    resetTimer();

    // Cleanup
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user, showInactivityModal]);

  const login = async (username, password) => {
    try {
      const res = await api.post("/auth/login", {
        username,
        password,
      });
      const { token, user } = res.data;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
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
    // Clear all timers
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("defaultLocation");
    localStorage.removeItem("audioEnabled");
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
    setDefaultLocation("");
    setAudioEnabled(false);
    setShowInactivityModal(false);
  };

  const handleContinueSession = () => {
    setShowInactivityModal(false);
    setCountdown(WARNING_COUNTDOWN);

    // Restart the inactivity timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      setShowInactivityModal(true);
    }, INACTIVITY_TIMEOUT);
  };

  const toggleAudio = () => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    localStorage.setItem("audioEnabled", newState);
  };

  const updateDefaultLocation = async (loc) => {
    setDefaultLocation(loc);
    try {
      await api.put("/auth/default-location", {
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

      {/* Inactivity Warning Modal */}
      {showInactivityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="mb-4">
                <svg
                  className="mx-auto h-12 w-12 text-yellow-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Session Timeout Warning
              </h3>
              <p className="text-gray-600 mb-6">
                You will be logged out due to inactivity in{" "}
                <span className="font-bold text-red-600 text-2xl">
                  {countdown}
                </span>{" "}
                seconds.
              </p>
              <button
                onClick={handleContinueSession}
                className="w-full bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Continue Session
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
