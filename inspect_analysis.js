import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'questions.db');
const db = new Database(dbPath);

try {
  const rows = db.prepare("SELECT id, errorAnalysis FROM questions WHERE errorAnalysis IS NOT NULL AND errorAnalysis != ''").all();
  console.log(`Found ${rows.length} rows with errorAnalysis:`);
  rows.forEach(row => {
    console.log(`Question ID: ${row.id}`);
    console.log(`Raw text: ${row.errorAnalysis}`);
    // Print char codes
    const chars = [];
    for (let i = 0; i < row.errorAnalysis.length; i++) {
      const char = row.errorAnalysis[i];
      const code = row.errorAnalysis.charCodeAt(i);
      if (code > 127) {
        chars.push(`${char}(U+${code.toString(16)})`);
      } else {
        chars.push(char);
      }
    }
    console.log(`Char codes: ${chars.join('')}`);
    console.log('---');
  });
} catch (e) {
  console.error(e);
}
db.close();
