import { useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Debate from "./pages/Debate";
import { forgetToken } from "./accounts";
import "./App.css";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") ?? "");
  // Expired or logged out: this token is forgotten, recent accounts included.
  function handleTokenExpired() {
    forgetToken(token);
    setToken("");
  }
  const chatOrLogin = token ? (
    <Chat token={token} onTokenExpired={handleTokenExpired} onSwitch={setToken} />
  ) : (
    <Navigate to="/login" replace />
  );

  return (
    <>
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/" replace /> : <Login onLogin={setToken} />}
      />
      <Route path="/" element={chatOrLogin} />
      <Route path="/channel/:channelId" element={chatOrLogin} />
      <Route
        path="/debate/:channelId"
        element={
          token ? (
            <Debate token={token} onTokenExpired={handleTokenExpired} onSwitch={setToken} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
    </>
  );}

export default App;