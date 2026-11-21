// Where live building happens. Served from the build server itself, the site calls itself; served as static
// files from another host, it calls the build server.
export const BUILD_SERVER = 'https://livelab.38-49-216-59.sslip.io';
const sameServer = location.origin === BUILD_SERVER || ['127.0.0.1', 'localhost'].includes(location.hostname);
export const LIVE = sameServer ? '' : BUILD_SERVER;
