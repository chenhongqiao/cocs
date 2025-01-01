import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, 'src/app.html');
const buildDir = join(__dirname, 'build');
const srcDir = join(__dirname, 'src');
const pagesDir = join(__dirname, 'src/pages');

console.log('template: ', templatePath)
console.log('build dir: ', buildDir)
console.log('source dir: ', srcDir)

console.log('building...')

// make & clear build
try {
  await fs.stat(buildDir) 

  console.log('deleting existing build')
  await fs.rm(buildDir, { recursive: true })

} catch (err) {
  console.log(err)
}
await fs.mkdir(buildDir)
console.log('build directory good')

// get template
let app;
try {
  app = await fs.readFile(templatePath, {encoding: 'utf8'});
} catch (err) {
  console.log(`could not read ${templatePath}: `, err)
  process.exit(1);
}

// find template location
const keywords = [...app.matchAll(/<\s*content\s*\/\s*>/g)].length;
if (keywords !== 1) {
  console.log(keywords == 0 ? 'no <content/> found' : 'found multiple <content/> tags');
  process.exit(1);
}

// insert page into template at <content/>
function template(page) {

  return app.replace(/<\s*content\s*\/\s*>/g, page);
}

// get pages async
const files = await fs.readdir(pagesDir);
console.log('detected files ', files);

const promises = files.map(path => 
  fs.readFile(join(pagesDir, path), {encoding: 'utf8'})
    .then(async file => 
    {
      console.log('templating ', path);
      const page = template(file)
      
      // insert file to directory
      console.log('adding ', path)
      await fs.appendFile(join(buildDir, path), page)
    })
  )

Promise.all(promises)

console.log('built.')
