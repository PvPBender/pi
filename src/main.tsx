import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { loadState } from "./lib/storage";
import { applyTheme } from "./lib/themes";
import { setTTSEnabled, setTTSSpeed } from "./lib/tts";

// Apply theme from saved settings before first render
const initialState = loadState();
applyTheme(initialState.settings.theme || "dark");
setTTSEnabled(initialState.settings.ttsEnabled || false);
setTTSSpeed(initialState.settings.ttsSpeed || 1.0);

createRoot(document.getElementById("root")!).render(<App />);
