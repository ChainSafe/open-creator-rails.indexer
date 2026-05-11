import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const srcDir = resolve(__dirname, '../open-creator-rails/deployments');
const destDir = resolve(__dirname, '../config/deployments');

if (!existsSync(srcDir)) {
  console.warn(`⚠️  Source not found: ${srcDir}. Is the open-creator-rails submodule initialised?`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });

const files = readdirSync(srcDir).filter(f => f.endsWith('.json'));

if (files.length === 0) {
  console.warn('⚠️  No deployment JSON files found. Run the seed script first.');
  process.exit(1);
}

for (const file of files) {
  const content = readFileSync(join(srcDir, file), 'utf8');
  writeFileSync(join(destDir, file), content);
  console.log(`✅ Synced: ${file}`);
}
