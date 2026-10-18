module.exports = {
  appId: 'sphegatti',
  runtimeVersion: '1',

  server: {
    port: 4000,
  },

  storage: process.env.S3_BUCKET
    ? {
        type: 's3',
        bucket: process.env.S3_BUCKET,
        region: process.env.S3_REGION || 'us-east-1',
        keyPrefix: process.env.S3_KEY_PREFIX || 'sphegatti/',
        cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN || undefined,
        requireConnector: true,
      }
    : {
        type: 'local',
        localDir: './ota-storage',
        requireConnector: false,
      },
};
