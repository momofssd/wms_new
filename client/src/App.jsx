import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./Layout";
import HomePage from "./pages/HomePage";
import InboundPage from "./pages/InboundPage";
import LoginPage from "./pages/LoginPage";
import MasterDataPage from "./pages/MasterDataPage";
import MovementsPage from "./pages/MovementsPage";
import OutboundPage from "./pages/OutboundPage";
import ShipmentTrackingPage from "./pages/ShipmentTrackingPage";
import STOPage from "./pages/STOPage";
import TransactionsPage from "./pages/TransactionsPage";

function App() {
  // Prevent scanners from sending F7/F12 (and other function keys) that open devtools.
  // If you want this only in prod, wrap with: if (import.meta.env.PROD) ...

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="master-data" element={<MasterDataPage />} />
            <Route path="inbound" element={<InboundPage />} />
            <Route path="movements" element={<MovementsPage />} />
            <Route path="outbound" element={<OutboundPage />} />
            <Route path="sto" element={<STOPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route
              path="shipment-tracking"
              element={<ShipmentTrackingPage />}
            />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
