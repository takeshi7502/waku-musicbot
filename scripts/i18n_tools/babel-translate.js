const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const tAst = require('@babel/types');

const dirs = ['commands/slash', 'commands/context', 'events', 'util', 'lib', 'deploy'];

let viLocale = JSON.parse(fs.readFileSync('locales/vi.json', 'utf8'));
if (!viLocale.deploy) viLocale.deploy = {};

const isVietnamese = (str) => /[\u00C0-\u024F\u1E00-\u1EFF]/.test(str);

let counter = 1;

dirs.forEach(dir => {
    const fullDir = path.join(__dirname, dir);
    if (!fs.existsSync(fullDir)) return;
    
    fs.readdirSync(fullDir).filter(f => f.endsWith('.js')).forEach(f => {
        const filePath = path.join(fullDir, f);
        const originalContent = fs.readFileSync(filePath, 'utf8');
        
        let ast;
        try {
            ast = parser.parse(originalContent, {
                sourceType: 'module',
                plugins: ['jsx', 'classProperties']
            });
        } catch (e) {
            console.error('Babel Parse Error on ' + filePath + ': ' + e.message);
            return;
        }

        let modified = false;
        let requiresI18n = false;

        const basename = f.split('.')[0];
        if (!viLocale[basename]) viLocale[basename] = {};

        traverse(ast, {
            Program(path) {
                // Check if t is already imported
                path.traverse({
                    VariableDeclarator(vPath) {
                        if (vPath.node.id.type === 'ObjectPattern' && vPath.node.id.properties.some(p => p.key && p.key.name === 't')) {
                            requiresI18n = true;
                        } else if (vPath.node.id.type === 'Identifier' && vPath.node.id.name === 't') {
                            requiresI18n = true;
                        }
                    }
                });
            },
            StringLiteral(path) {
                // Don't translate require/import strings
                if (path.parent.type === 'CallExpression' && path.parent.callee.name === 'require') return;
                
                if (isVietnamese(path.node.value)) {
                    const str = path.node.value;
                    const keyName = `auto_${counter++}`;
                    let category = dir === 'deploy' ? 'deploy' : basename;
                    if (!viLocale[category]) viLocale[category] = {};
                    viLocale[category][keyName] = str;

                    // Thay thế bằng t("category.keyName")
                    const tCall = tAst.callExpression(tAst.identifier('t'), [
                        tAst.stringLiteral(`${category}.${keyName}`)
                    ]);
                    path.replaceWith(tCall);
                    path.skip();
                    modified = true;
                }
            },
            TemplateLiteral(path) {
                const quasis = path.node.quasis.map(q => q.value.raw);
                const hasVietnamese = quasis.some(q => isVietnamese(q));
                if (hasVietnamese) {
                    const keyName = `auto_${counter++}`;
                    let category = dir === 'deploy' ? 'deploy' : basename;
                    if (!viLocale[category]) viLocale[category] = {};

                    let templateStr = '';
                    let varProps = [];
                    path.node.quasis.forEach((element, index) => {
                        templateStr += element.value.cooked;
                        if (index < path.node.expressions.length) {
                            const varName = `var${index + 1}`;
                            templateStr += `{${varName}}`;
                            varProps.push(tAst.objectProperty(tAst.identifier(varName), path.node.expressions[index]));
                        }
                    });

                    viLocale[category][keyName] = templateStr;

                    let args = [tAst.stringLiteral(`${category}.${keyName}`)];
                    if (varProps.length > 0) {
                        args.push(tAst.objectExpression(varProps));
                    }

                    const tCall = tAst.callExpression(tAst.identifier('t'), args);
                    path.replaceWith(tCall);
                    path.skip();
                    modified = true;
                }
            }
        });

        if (modified) {
            fs.writeFileSync('locales/vi.json', JSON.stringify(viLocale, null, 2));

            const output = generate(ast, { retainLines: false, compact: false }, originalContent);
            let finalCode = output.code;

            if (!requiresI18n) {
                let requirePath = '';
                if (dir.startsWith('commands/')) requirePath = '../../util/i18n';
                else if (dir === 'events') requirePath = '../util/i18n';
                else if (dir === 'util') requirePath = './i18n';
                else if (dir === 'lib') requirePath = '../util/i18n';
                else if (dir === 'deploy') requirePath = '../util/i18n';
                
                finalCode = `const { t } = require("${requirePath}");\n` + finalCode;
            }
            fs.writeFileSync(filePath, finalCode);
            console.log(`Babel Translated: ${filePath}`);
        }
    });
});
console.log('Babel translation complete.');
