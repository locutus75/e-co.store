import * as XLSX from 'xlsx';

const workbook = XLSX.readFile('Product_Info.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { range: 2 }); // Row 3 as header

console.log(`Found ${data.length} rows`);
console.log(data[0]);
console.log(data[1]);
console.log(data[2]);
