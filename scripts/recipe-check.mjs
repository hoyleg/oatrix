/** Offline schema validation only; does not publish a recipe or execute contributed code. */
import { readFile } from 'node:fs/promises';
import { validateRecipe } from '../src/industry.mjs';
import { canonical, hash, demand } from '../src/canonical.mjs';
try {
  if (process.argv.length !== 3) throw new Error('Usage: npm run recipe:check -- examples/recipes/plaque.v1.json');
  const bytes = await readFile(process.argv[2]); demand(bytes.length <= 16_384, 'RECIPE_TOO_LARGE');
  const recipe = JSON.parse(bytes.toString('utf8')); canonical(recipe); validateRecipe(recipe);
  console.log(`Valid declarative recipe: ${recipe.label}\nDigest: ${hash(recipe)}\nNo state changed; admission does not prove usefulness or content availability.`);
} catch (e) { console.error(e.message); process.exitCode = 1; }
