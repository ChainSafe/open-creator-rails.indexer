import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Reads Foundry build output from the open-creator-rails submodule
const contractsOutDir = resolve(__dirname, '../open-creator-rails/out');
const destDir = resolve(__dirname, '../config');

// Ensure the destination directory exists
if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

// Define which contracts to extract
const targets = [
  { file: 'Asset.sol/Asset.json', name: 'AssetABI' },
  { file: 'AssetRegistry.sol/AssetRegistry.json', name: 'AssetRegistryABI' }
];

let indexExports = "";

targets.forEach(target => {
  const sourcePath = join(contractsOutDir, target.file);

  if (existsSync(sourcePath)) {
    const json = JSON.parse(readFileSync(sourcePath, 'utf8'));
    const tsContent = `export const ${target.name} = ${JSON.stringify(json.abi, null, 2)} as const;\n`;

    writeFileSync(join(destDir, `${target.name}.ts`), tsContent);
    indexExports += `export * from './${target.name}';\n`;

    console.log(`✅ Synced: ${target.name}`);
  } else {
    console.warn(`⚠️  Not found: ${sourcePath}. Did you run 'forge build' inside open-creator-rails?`);
  }
});

// Update config/index.ts: only replace the auto-generated ABI section, preserve the rest
const indexPath = join(destDir, 'index.ts');
const START_MARKER = '// --- AUTO-GENERATED ABI EXPORTS (do not edit) ---';
const END_MARKER = '// --- END AUTO-GENERATED ABI EXPORTS ---';
const generatedBlock = `${START_MARKER}\n${indexExports}${END_MARKER}`;

if (existsSync(indexPath)) {
  const existing = readFileSync(indexPath, 'utf8');
  const startIdx = existing.indexOf(START_MARKER);
  const endIdx = existing.indexOf(END_MARKER);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.substring(0, startIdx);
    const after = existing.substring(endIdx + END_MARKER.length);
    writeFileSync(indexPath, before + generatedBlock + after);
  } else {
    writeFileSync(indexPath, generatedBlock + '\n' + existing);
  }
} else {
  writeFileSync(indexPath, generatedBlock + '\n');
}
