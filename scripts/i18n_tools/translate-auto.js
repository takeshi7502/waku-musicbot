const fs = require('fs');
const translate = require('@iamtraction/google-translate');

async function doTranslate() {
    const sourcePath = 'locales/en.json';
    const targetPath = 'locales/ja.json';
    
    // Read English as the source for cleaner translations
    const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    let targetData = {};
    if (fs.existsSync(targetPath)) {
        targetData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    }

    let changed = false;

    const traverseAndTranslate = async (srcObj, tgtObj) => {
        for (const key of Object.keys(srcObj)) {
            if (typeof srcObj[key] === 'object' && srcObj[key] !== null) {
                if (!tgtObj[key]) tgtObj[key] = {};
                await traverseAndTranslate(srcObj[key], tgtObj[key]);
            } else {
                // We want to translate EVERYTHING for ja.json
                if (!tgtObj[key] || tgtObj[key] === srcObj[key]) {
                    try {
                        const original = srcObj[key];
                        // Protect variables e.g. {var1} -> __var1__
                        let textToTranslate = original.replace(/\{([^}]+)\}/g, '__$1__');
                        
                        const result = await translate(textToTranslate, { to: 'ja' });
                        let translated = result.text;
                        
                        // Restore variables
                        translated = translated.replace(/__([^_]+)__/g, '{$1}');
                        
                        tgtObj[key] = translated;
                        console.log(`Translated [${key}]: ${translated}`);
                        changed = true;
                        
                        // moderate sleep to avoid rate limits
                        await new Promise(r => setTimeout(r, 600));
                    } catch (e) {
                        console.error(`Failed to translate ${key}: ${e.message}`);
                        tgtObj[key] = srcObj[key]; // fallback temporarily
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
            }
        }
    };

    console.log("Starting Japanese translation...");
    await traverseAndTranslate(sourceData, targetData);
    if (changed) {
        fs.writeFileSync(targetPath, JSON.stringify(targetData, null, 2));
    }
    console.log("Japanese Translation complete!");
}

doTranslate();
