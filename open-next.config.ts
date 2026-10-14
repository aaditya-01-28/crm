import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig({
    routePreloadingBehavior: "none",
  }),
  buildCommand: "next build",
};
