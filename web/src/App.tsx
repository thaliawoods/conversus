import { useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import Login from "./pages/Login";
import Workspace from "./pages/Workspace";
import { forgetToken } from "./accounts";
import "./App.css";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") ?? "");
  function handleTokenExpired() {
    forgetToken(token);
    setToken("");
  }
  const workspaceOrLogin = token ? (
    <Workspace token={token} onTokenExpired={handleTokenExpired} onSwitch={setToken} />
  ) : (
    <Navigate to="/login" replace />
  );

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/" replace /> : <Login onLogin={setToken} />}
      />
      <Route path="/" element={workspaceOrLogin} />
      <Route path="/channel/:channelId" element={workspaceOrLogin} />
      <Route path="/channel/:channelId/debate/:debateId" element={workspaceOrLogin} />
      <Route path="/debate/:debateId" element={workspaceOrLogin} />
      {/* Unknown address: back to the start (or to the login page if logged out). */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;