// craco.config.js
const path = require('path');

// Environment variable overrides
const config = {
  disableHotReload: process.env.DISABLE_HOT_RELOAD === 'true',
};

module.exports = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig, { env }) => {
      
      // 1. DÉSACTIVATION DE TERSER (CORRECTION DE L'ERREUR 'ajv/codegen')
      // Cette correction est appliquée uniquement en mode production (build)
      if (env === 'production') {
        const terserPluginIndex = webpackConfig.optimization.minimizer.findIndex(
          (minimizer) => minimizer.options && minimizer.options.terserOptions
        );

        if (terserPluginIndex !== -1) {
          console.log('Disabling TerserPlugin to bypass known ajv/codegen build error.');
          // Remplace le minimizer par une fonction vide pour désactiver la minification problématique
          webpackConfig.optimization.minimizer[terserPluginIndex] = (compiler) => {}; 
        }
      }

      // 2. LOGIQUE DE HOT RELOAD EXISTANTE
      // (Conserve votre logique pour disableHotReload)
      if (config.disableHotReload) {
        // Remove hot reload related plugins
        webpackConfig.plugins = webpackConfig.plugins.filter(plugin => {
          return !(plugin.constructor.name === 'HotModuleReplacementPlugin');
        });
        
        // Disable watch mode
        webpackConfig.watch = false;
        webpackConfig.watchOptions = {
          ignored: /.*/, // Ignore all files
        };
      } else {
        // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
          ],
        };
      }
      
      return webpackConfig;
    },
  },
};
