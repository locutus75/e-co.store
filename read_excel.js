const xlsx = require('xlsx');
const fs = require('fs');

try {
  const workbook = xlsx.readFile('Product_Info.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  let headers = {};
  
  for (let cell in worksheet) {
    if (cell[0] === '!') continue;
    
    // We want row 3, which appears to be the main column headers
    const match = cell.match(/^([A-Z]+)(\d+)$/);
    if (!match) continue;
    
    const col = match[1];
    const row = parseInt(match[2]);
    
    if (row >= 1 && row <= 4) {
      if (!headers[col]) headers[col] = {};
      let cellObj = worksheet[cell];
      
      let commentStr = '';
      if (cellObj.c && cellObj.c.length > 0) {
        commentStr = cellObj.c.map(c => c.t).join('; ');
      }
      
      headers[col][`row${row}`] = {
        val: cellObj.v,
        note: commentStr
      };
    }
  }
  
  fs.writeFileSync('excel_headers.json', JSON.stringify(headers, null, 2));
  console.log("Wrote headers to excel_headers.json");
} catch (err) {
  console.error("Error reading file:", err);
}
