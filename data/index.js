const fs = require('fs');

const data = require('./data.min.json');
const final = data.final.results;

let csv = 'Time,Thameslink,DLR\n';

final.forEach(set => {
  csv += `${set.timestamp},${set.votes.one},${set.votes.two}\n`;
});

fs.writeFileSync('./final.csv', csv);
