const fs = require('fs');
const path = require('path');

function updateCategories(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const frontMatterEnd = content.indexOf('---', 3); // Find the end of the front matter
    if (frontMatterEnd === -1) return; // No front matter found

    const frontMatter = content.substring(0, frontMatterEnd + 3);
    const body = content.substring(frontMatterEnd + 4);

    const relativePath = path.relative('source/_posts', filePath).replace(/\.md$/, '');
    const categories = relativePath.split(path.sep).filter(Boolean); // Split by '/' or '\'

    const newFrontMatter = frontMatter.replace(
        /^categories:\s*\n/m,
        `categories:\n${categories.map(cat => `  - ${cat}`).join('\n')}\n`
    );

    fs.writeFileSync(filePath, `${newFrontMatter}\n${body}`);
}

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (file.endsWith('.md')) {
            updateCategories(fullPath);
        }
    }
}

processDirectory('source/_posts');