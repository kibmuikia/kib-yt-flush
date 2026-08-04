import { defineManifest } from "@crxjs/vite-plugin";
import packageJson from "../package.json";

const { version } = packageJson;
const [major, minor, patch] = version.replace("-beta", "").split(".");

export default defineManifest(async () => ({
  manifest_version: 3,
  name: "Kib-YT-Flush",
  description:
    "Locally persist and resume YouTube playback timestamps without watch history.",
  version: `${major}.${minor}.${patch}`,
  version_name: version,
  permissions: ["storage", "sidePanel"],
  host_permissions: ["https://www.youtube.com/*"],
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://www.youtube.com/*"],
      js: ["src/content/content.ts"],
      run_at: "document_start",
    },
  ],
  side_panel: {
    default_path: "src/sidepanel/sidepanel.html",
  },
  icons: {
    16: "icons/icon16.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },
  action: {
    default_title: "Kib-YT-Flush",
  },
}));
