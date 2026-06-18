const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'run.log');

function appendLog(entry) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(LOG_FILE, line);
}

module.exports = { appendLog };
