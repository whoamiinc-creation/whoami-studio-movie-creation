const { ensureBrowser } = require('./node_modules/@remotion/renderer');

ensureBrowser({ logLevel: 'verbose' })
  .then((result) => {
    console.log('Browser ready:', JSON.stringify(result));
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
