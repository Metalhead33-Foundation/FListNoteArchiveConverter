const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');

function processHTMLFile(rpgPath) {
	const stats = fs.statSync(rpgPath);
	const fileDate = stats.mtime;
	const htmlfile = "" + fs.readFileSync(require.resolve(rpgPath)) + "";
	const $ = cheerio.load(htmlfile, { xmlMode: false});

	let posts = [];
	function isLastElementDuplicate(element) {
	if (posts.length > 0 && posts[posts.length - 1].longerText === element.longerText) {
		return true;
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
			console.log("Duplicate alert!")
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
	const json = JSON.stringify(finalOutput);
	const jsonFileName = path.basename(rpgPath, path.extname(rpgPath)) + '.json';
    const jsonFilePath = path.join(path.dirname(rpgPath), jsonFileName);
	fs.writeFileSync(jsonFilePath,json);
}
const rpgPath = process.argv[2];
processHTMLFile(rpgPath);
