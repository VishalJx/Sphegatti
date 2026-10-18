module.exports = {
  appId: 'sphegatti',
  runtimeVersion: '1',

  server: {
    port: 4000,
  },

  storage: {
    type: 'local',
    localDir: './ota-storage',
    requireConnector: false,
  },
};
