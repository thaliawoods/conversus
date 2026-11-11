import { useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router";
import Login from "./pages/Login";
import Workspace from "./pages/Workspace";
import "./App.css";

// Anciennes adresses (/channel/12, /debate/34) : on les ramène sur l'espace unique.
function LegacyRedirect({ kind }: { kind: "channel" | "debate" }) {
  const { channelId } = useParams();
  return <Navigate to={`/?${kind}=${channelId}`} replace />;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") ?? "");
  function handleTokenExpired() {
    localStorage.removeItem("token");
    setToken("");
  }

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login onLogin={setToken} />} />
      <Route
        path="/"
        element={
          token ? (
            <Workspace token={token} onTokenExpired={handleTokenExpired} onSwitch={setToken} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="/channel/:channelId" element={<LegacyRedirect kind="channel" />} />
      <Route path="/debate/:channelId" element={<LegacyRedirect kind="debate" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
