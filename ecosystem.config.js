module.exports = {
  apps: [
    {
      name: 'WCOTL API',
      script: 'index.js',
      watch: true,
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'data'],
      args: ['--color'],
    },
  ],
};
