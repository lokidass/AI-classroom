// Import polyfills first before any other code
import "./lib/polyfills";
import "./lib/simple-peer-polyfill";

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
