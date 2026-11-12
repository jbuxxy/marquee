const fs = require('fs');
const path = require('path');

// Write JSON to disk without ever leaving a half-written file behind: write to
// a temp file in the same directory, then rename (atomic on the same filesystem).
function atomicWriteJson(filePath, data, mode = 0o600) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(filePath);
    const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
    const json = JSON.stringify(data, null, 2);
    fs.mkdir(dir, { recursive: true, mode: 0o700 }, (mkdirErr) => {
      if (mkdirErr && mkdirErr.code !== 'EEXIST') return reject(mkdirErr);
      fs.writeFile(tmpPath, json, { mode }, (writeErr) => {
        if (writeErr) return reject(writeErr);
        fs.rename(tmpPath, filePath, (renameErr) => {
          if (renameErr) return reject(renameErr);
          resolve();
        });
      });
    });
  });
}

module.exports = { atomicWriteJson };
