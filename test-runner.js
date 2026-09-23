const { execSync } = require('child_process');
try {
  execSync('npx jest src/test/marketplaceCheckoutRoutes.spec.ts -t "3. Product checkout reserves stock"', { stdio: 'inherit' });
} catch (e) {
  process.exit(1);
}
