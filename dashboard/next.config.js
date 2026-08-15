/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	webpack: (config, options) => {
		const path = require('path');
		config.resolve.alias['@swc/helpers/_'] = path.resolve(__dirname, 'node_modules/@swc/helpers/lib');
		return config;
	},
}

module.exports = nextConfig
