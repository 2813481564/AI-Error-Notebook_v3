const fs=require('fs');
let c=fs.readFileSync('src/server/controllers/aiController.ts','utf8');
const idx = c.indexOf('export const processAllStream');
if (idx !== -1) {
  const head = c.substring(0, idx);
  let tail = c.substring(idx);
  tail = tail.split('\\`').join('`');
  tail = tail.split('\\$').join('$');
  fs.writeFileSync('src/server/controllers/aiController.ts', head + tail);
  console.log('Fixed syntax escapes in processAllStream');
}
