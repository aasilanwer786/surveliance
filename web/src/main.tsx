import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { WsProvider } from "./lib/ws";
import { ToastProvider } from "./components/ui";
import { primeVoices } from "./lib/voice";
import App from "./App";
import "./styles/global.css";

primeVoices();

function Root() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AuthedShell />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function AuthedShell() {
  return (
    <WsGate>
      <App />
    </WsGate>
  );
}

function WsGate({ children }: { children: React.ReactNode }) {
  const authed = !!localStorage.getItem("sr.refresh");
  return <WsProvider enabled={authed}>{children}</WsProvider>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
