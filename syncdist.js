const fs = require('fs-extra');
const path = require('path');

// Assuming your script is in the root directory of your project
const currentDir = __dirname;

const copyFiles = (relativeSrc,relativeDst) => {
    const source = path.join(currentDir, relativeSrc);
    const destination = path.join(currentDir, relativeDst);

    fs.copySync(source, destination);
    console.log(`Copied ${source} to ${destination}`);
};

// copyFolder 
const copyFolder = (relativeSrc,relativeDst) => {
    const source = path.join(currentDir, relativeSrc);
    const destination = path.join(currentDir, relativeDst);

    fs.copy(source, destination, { dereference: true }, function (err) {
        if (err) {
            console.error('An error occurred while copying the folder.', err);
            return;
        }
        console.log('Copy completed!');
    });
    console.log(`Copied ${source} to ${destination}`);
}
copyFiles('packages/walletembed/dist/iife/index.js', '../TanglePay-Extension/public/js/groupfi/walletembed.js');
copyFiles('packages/core/dist/iife/index.js', '../TanglePay-Extension/public/js/groupfi/core.js');