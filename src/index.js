const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');

function extractSenderAndDistance(text) {
  const [, sender, timeString] = text.match(/^(.+?) sent, ((?:\d+[a-z, ]+)+) ago$/);
  const distance = {
    years: 0,
    months: 0,
    weeks: 0,
    days: 0,
    hours: 0,
    minutes: 0,
  };

  const timeUnits = timeString.split(', ');
  timeUnits.forEach(unit => {
    const [, value, unitKey] = unit.match(/(\d+)([a-z]+)/);
    if (unitKey.includes('y')) distance.years = parseInt(value);
    else if (unitKey.includes('mo')) distance.months = parseInt(value);
    else if (unitKey.includes('w')) distance.weeks = parseInt(value);
    else if (unitKey.includes('d')) distance.days = parseInt(value);
    else if (unitKey.includes('h')) distance.hours = parseInt(value);
    else if (unitKey.includes('m')) distance.minutes = parseInt(value);
  });
  return { sender, distance };
}
function decrementDate(date, distance) {
  const newDate = new Date(date);
  newDate.setFullYear(newDate.getFullYear() - distance.years);
  newDate.setMonth(newDate.getMonth() - distance.months);
  newDate.setDate(newDate.getDate() - distance.weeks * 7 - distance.days);
  newDate.setHours(newDate.getHours() - distance.hours);
  newDate.setMinutes(newDate.getMinutes() - distance.minutes);
  return newDate;
}
function processHTMLFile(rpgPath) {
	const stats = fs.statSync(rpgPath);
	const fileDate = stats.mtime;
	const htmlfile = "" + fs.readFileSync(require.resolve(rpgPath)) + "";
	const $ = cheerio.load(htmlfile, { xmlMode: false});

	let posts = [];
	function isLastElementDuplicate(element) {
	if (posts.length > 0) {
		const lastPost = posts[posts.length - 1];
		const isDuplicate =
		lastPost.longerText === element.longerText ||
		lastPost.longerText.substring(0, 32) === element.relativeDate.substring(0, 32) ||
		lastPost.longerText.substring(lastPost.longerText.length - 1, lastPost.longerText.length - 32) === element.longerText.substring(element.longerText.length - 1, element.longerText.length - 32);

		return isDuplicate;
	}
	return false;
	}

	$(".FormattedBlock").each(function(idx,elem) {
		//console.log($(elem).html());
		const inputString = $(elem).text();
		const colonIndex = inputString.indexOf(":");
		//const relativeDate = inputString.substring(0, colonIndex).trim();
		//const longerText = inputString.substring(colonIndex + 1).trim();
		const newElement = {
			relativeDate: inputString.substring(0, colonIndex).trim(),
			longerText: inputString.substring(colonIndex + 1).trim()
		};

		if (isLastElementDuplicate(newElement)) {
			//console.log("Duplicate alert!")
		} else {
			posts.push(newElement);
		}
		
	});
	const finalOutput = {
		path: rpgPath,
		stats: stats,
		epoch: fileDate,
		posts: posts
	};
	finalOutput.posts.forEach(obj => {
		if(obj.relativeDate != null) {
			const { sender, distance } = extractSenderAndDistance(obj.relativeDate);
			const decrementedDate = decrementDate(finalOutput.epoch, distance);
			obj.sender = sender;
			obj.date = decrementedDate;
			delete obj.relativeDate;
		}
	});
	const json = JSON.stringify(finalOutput);
	const jsonFileName = path.basename(rpgPath, path.extname(rpgPath)) + '.json';
    const jsonFilePath = path.join(path.dirname(rpgPath), jsonFileName);
	fs.writeFileSync(jsonFilePath,json);
}
const rpgPath = process.argv[2];
console.log(rpgPath);
processHTMLFile(rpgPath);
