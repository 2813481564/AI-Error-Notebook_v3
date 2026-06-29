const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'questions.db');
const db = new Database(dbPath);

const notebooks = db.prepare("SELECT * FROM notebooks WHERE name = '公共题库'").all();
console.log("Notebooks:", notebooks);

for (const nb of notebooks) {
  const qs = db.prepare("SELECT id, notebookId FROM questions WHERE notebookId = ?").all(nb.id);
  console.log(`Questions in notebook ${nb.id}:`, qs.length);
  console.log(qs);
}

db.close();
