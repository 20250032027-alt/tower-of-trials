// Usage:  npm run connect -- <github-username> <repo-name>
// Example: npm run connect -- coolperson tower-demo
//
// Sets up git + the "origin" remote and writes the Pages URL into package.json.
// Safe to run again if you change your mind about the repo name.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [user, repo] = process.argv.slice(2);
if (!user || !repo) {
  console.log('\nUsage: npm run connect -- <github-username> <repo-name>\n');
  process.exit(1);
}

const run = (cmd, quiet = false) => {
  try {
    return execSync(cmd, { stdio: quiet ? 'pipe' : 'inherit' }).toString();
  } catch (e) {
    if (!quiet) console.log('  (command failed: ' + cmd + ')');
    return null;
  }
};

if (!existsSync('.git')) {
  console.log('> git init');
  run('git init');
  run('git checkout -b main', true) ?? run('git branch -M main', true);
}

const url = `https://github.com/${user}/${repo}.git`;
const hasOrigin = run('git remote get-url origin', true);
if (hasOrigin) {
  console.log('> updating remote "origin" ->', url);
  run(`git remote set-url origin ${url}`);
} else {
  console.log('> adding remote "origin" ->', url);
  run(`git remote add origin ${url}`);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.homepage = `https://${user}.github.io/${repo}/`;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

console.log(`
Done. Next steps:

  1. Create an EMPTY public repo called "${repo}" on GitHub (no README, no .gitignore):
       https://github.com/new
  2. Turn publishing on, BEFORE the first upload:
       repo Settings > Pages > Source: "GitHub Actions"
  3. Upload the code - this also builds and publishes the site:
       git add -A
       git commit -m "Tower demo"
       git push -u origin main
     (a browser window pops up the first time to sign in to GitHub)
  4. Watch it build under the repo's "Actions" tab (about a minute). Then it is live at:
       ${pkg.homepage}

  Update later:  git add -A  /  git commit -m "update"  /  git push
  (If step 3 ran before step 2 and the Action failed: Actions tab > the failed run > Re-run jobs.)
  No Actions? Use "npm run deploy" instead and pick Settings > Pages > Source: gh-pages branch.
`);
