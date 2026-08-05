const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// 1. Create CSV content
const csvHeaders = 'Roll No,Enrollment No,Name,Course,Semester,Division,Mobile\n';
const csvRows = [
  '101,888800000001,CSV Student One,B.E.,5,A,9876543210',
  '102,888800000002,CSV Student Two,B.E.,5,B,9876543211'
].join('\n');

fs.writeFileSync(path.join(__dirname, 'mock_students.csv'), csvHeaders + csvRows);
console.log('Generated mock_students.csv');

// 2. Create XLSX workbook
const wb = XLSX.utils.book_new();
const wsData = [
  ['Roll No', 'Enrollment No', 'Name', 'Course', 'Semester', 'Division', 'Mobile'],
  ['201', '999900000001', 'Excel Student One', 'B.E.', '5', 'A', '9876543212'],
  ['202', '999900000002', 'Excel Student Two', 'B.E.', '5', 'B', '9876543213']
];
const ws = XLSX.utils.aoa_to_sheet(wsData);
XLSX.utils.book_append_sheet(wb, ws, 'Students');
XLSX.writeFile(wb, path.join(__dirname, 'mock_students.xlsx'));
console.log('Generated mock_students.xlsx');
