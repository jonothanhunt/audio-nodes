import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    webpack: (config, { isServer }) => {
        // Handle WASM files
        config.experiments = {
            ...config.experiments,
            asyncWebAssembly: true,
            layers: true,
        };

        config.module.rules.push({
            test: /\.wasm$/,
            type: "webassembly/async",
        });

        // Don't parse WASM modules on the server
        if (isServer) {
            config.output.webassemblyModuleFilename =
                "static/wasm/[modulehash].wasm";
        }

        return config;
    },
};

export default nextConfig;
