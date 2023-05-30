import fs from 'fs';
import cheerio from 'cheerio';
import path from 'path';

interface Distance {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
}

interface Post {
  relativeDate?: string;
  longerText: string;
  sender?: string;
  date?: Date;
}

interface FinalOutput {
  path: string;
  stats: fs.Stats;
  epoch: Date;
  posts: Post[];
}

function extractSenderAndDistance(text: string): { sender: string; distance: Distance } {
  const [, sender, timeString] = text.match(/^(.+?) sent, ((?:\d+[a-z, ]+)+) ago$/) || [];
  const distance: Distance = {
    years: 0,
    months: 0,
    weeks: 0,
    days: 0,
    hours: 0,
    minutes: 0,
  };

  const timeUnits = timeString.split(', ');
  timeUnits.forEach((unit) => {
    const [, value, unitKey] = (unit.match(/(\d+)([a-z]+)/) || []) as [unknown, string, string];
    if (unitKey.includes('y')) distance.years = parseInt(value, 10);
    else if (unitKey.includes('mo')) distance.months = parseInt(value, 10);
    else if (unitKey.includes('w')) distance.weeks = parseInt(value, 10);
    else if (unitKey.includes('d')) distance.days = parseInt(value, 10);
    else if (unitKey.includes('h')) distance.hours = parseInt(value, 10);
    else if (unitKey.includes('m')) distance.minutes = parseInt(value, 10);
  });

  return { sender, distance };
}

function decrementDate(date: Date, distance: Distance): Date {
  const newDate = new Date(date);
  newDate.setFullYear(newDate.getFullYear() - distance.years);
  newDate.setMonth(newDate.getMonth() - distance.months);
  newDate.setDate(newDate.getDate() - distance.weeks * 7 - distance.days);
  newDate.setHours(newDate.getHours() - distance.hours);
  newDate.setMinutes(newDate.getMinutes() - distance.minutes);
  return newDate;
}

function bbcodeUrlToHtml(text: string): string {
  const urlPattern = /\[url=([^[\]]+)\]([^[\]]+)\[\/url\]/g;
  const urlReplacement = '<a href="$1">$2</a>';

  return text.replace(urlPattern, urlReplacement);
}

function bbcodeToHtml(bbcode: string): string {
  const tags = [
    { bbcode: /\[b\]/g, html: '<strong>' },
    { bbcode: /\[\/b\]/g, html: '</strong>' },
    { bbcode: /\[i\]/g, html: '<em>' },
    { bbcode: /\[\/i\]/g, html: '</em>' },
    { bbcode: /\[u\]/g, html: '<u>' },
    { bbcode: /\[\/u\]/g, html: '</u>' },
  ];

  let html = bbcode;

  tags.forEach((tag) => {
    html = html.replace(tag.bbcode, tag.html);
  });
  html = bbcodeUrlToHtml(html);
  html = html.replace(/\r?\n/g, "<br>");

  return html;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function isLastElementDuplicate(posts: Post[], element: Post): boolean {
  if (posts.length > 0) {
    const lastPost = posts[posts.length - 1];
    const isDuplicate =
      lastPost.longerText === element.longerText ||
      (element.relativeDate != null && lastPost.longerText.substring(0, 32) === element.relativeDate.substring(0, 32)) ||
      lastPost.longerText.substring(lastPost.longerText.length - 1, lastPost.longerText.length - 32) === element.longerText.substring(element.longerText.length - 1, element.longerText.length - 32);

    return isDuplicate;
  }
  return false;
}

function extractPostsFromHTML($: cheerio.Root): Post[] {
  const posts: Post[] = [];
// cheerio.Elem
  $(".FormattedBlock").each(function (idx :number, elem : cheerio.Element) {
    const inputString = $(elem).text();
    const colonIndex = inputString.indexOf(":");
    const newElement: Post = {
      relativeDate: inputString.substring(0, colonIndex).trim(),
      longerText: inputString.substring(colonIndex + 1).trim(),
    };

    if (!isLastElementDuplicate(posts, newElement)) {
      posts.push(newElement);
    }
  });

  return posts;
}

function processExtractedPosts(posts: Post[], finalOutput: FinalOutput): void {
  posts.forEach((obj) => {
    if (obj.relativeDate != null) {
      const { sender, distance } = extractSenderAndDistance(obj.relativeDate);
      const decrementedDate = decrementDate(finalOutput.epoch, distance);
      obj.sender = sender;
      obj.date = decrementedDate;
      delete obj.relativeDate;
    }
  });

  posts.forEach(function (currentValue, index) {
    if (currentValue.date != null) {
      currentValue.date.setSeconds(currentValue.date.getSeconds() + index);
    }
  });
}

function writeJSONFile(finalOutput: FinalOutput): void {
  const json = JSON.stringify(finalOutput);
  const jsonFileName = path.basename(finalOutput.path, path.extname(finalOutput.path)) + '.json';
  const jsonFilePath = path.join(path.dirname(finalOutput.path), jsonFileName);
  fs.writeFileSync(jsonFilePath, json);
}

function writeTextFile(finalOutput: FinalOutput): void {
  const textFileName = path.basename(finalOutput.path, path.extname(finalOutput.path)) + '.txt';
  const textFilePath = path.join(path.dirname(finalOutput.path), textFileName);
  fs.writeFileSync(
    textFilePath,
    finalOutput.posts
      .map(({ sender, date, longerText }) => {
        return `{{RPG Post/${sender}
|date=${date != null ? formatDate(date) : "unknown"}
|post=${bbcodeToHtml(longerText)}
}}`;
      })
      .join("\n")
  );
}

function processHTMLFile(rpgPath: string): void {
  const stats = fs.statSync(rpgPath);
  const fileDate = stats.mtime;
  const htmlfile = "" + fs.readFileSync(require.resolve(rpgPath)) + "";
  const $ = cheerio.load(htmlfile, { xmlMode: false });

  const posts = extractPostsFromHTML($);

  const finalOutput: FinalOutput = {
    path: rpgPath,
    stats: stats,
    epoch: fileDate,
    posts: posts,
  };

  processExtractedPosts(posts, finalOutput);
  writeJSONFile(finalOutput);
  writeTextFile(finalOutput);
}

const rpgPath = process.argv[2];
console.log(rpgPath);
processHTMLFile(rpgPath);