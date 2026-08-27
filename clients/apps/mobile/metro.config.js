const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Configure path aliases for monorepo
config.resolver.resolveRequest = (context, moduleName, platform) => {
	// Resolve @/* aliases to src/*
	if (moduleName.startsWith("@/")) {
		const absolutePath = path.join(projectRoot, "src", moduleName.slice(2));
		return context.resolveRequest(context, absolutePath, platform);
	}

	return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
