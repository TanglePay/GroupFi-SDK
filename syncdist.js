const fs = require('fs');
const path = require('path');

// Assuming your script is in the root directory of your project
const currentDir = __dirname;

const copyFiles = (relativeSrc,relativeDst) => {
    const source = path.join(currentDir, relativeSrc);
    const destination = path.join(currentDir, relativeDst);

    fs.copyFileSync(source, destination);
    console.log(`Copied ${source} to ${destination}`);
};

copyFiles('packages/walletembed/dist/iife/index.js', '../TanglePay-Extension/public/js/groupfi/walletembed.js');
copyFiles('packages/core/dist/iife/index.js', '../TanglePay-Extension/public/js/groupfi/core.js');