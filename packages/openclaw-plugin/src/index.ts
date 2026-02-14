import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { arinovaChatPlugin } from "./channel.js";
import { setArinovaChatRuntime } from "./runtime.js";

const plugin: {
  id: string;
  name: string;
  description: string;
  configSchema: ReturnType<typeof emptyPluginConfigSchema>;
  register: (api: OpenClawPluginApi) => void;
} = {
  id: "arinova-chat",
  name: "Arinova Chat",
  description: "Arinova Chat channel plugin (A2A protocol with native streaming)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setArinovaChatRuntime(api.runtime);
    api.registerChannel({ plugin: arinovaChatPlugin });
  },
};

export default plugin;
