const DATE_START = '2000-01-01';
function getSafeEndDate() {
	return (new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000)).toISOString().slice(0,10);
}

function getWords(line) {
	const words = [];
	let nextWord = '';
	let isEscaping = false;
	let isInString = false;
	for(const char of line.split('')) {
		if(char === '"') {
			if(!isEscaping) {
				isInString = !isInString;
			}
			continue;
		}

		if(char === '\\' && !isEscaping) {
			isEscaping = true;
			continue;
		} else {
			isEscaping = false;
		}

		if(char === ',') {
			words.push(nextWord);
			nextWord = '';
			continue;
		}

		nextWord += char;
	}
	words.push(nextWord);

	return words;
}

async function FetchData(url, cookie) {
	const res = await fetch(
		url,
		{
			method: 'GET',
			headers: {
				cookie
			}
		}
	);

	const history = await res.text();

	if(history.startsWith('<')) { // HTML
		throw new Error('User was disconnected from Steam, please update cookie');
	}

	const lines = history.split('\n').filter((elt) => elt.trim() !== '');

	lines.shift();
	lines.shift();

	const headers = getWords(lines[0]).map((elt) => elt.trim());

	lines.shift();

	const records = [];
	for(const line of lines) {
		const splittedLine = getWords(line).map((elt) => elt.trim());
		const record = {};

		for(const i in headers) {
			const header = headers[i];
			record[header] = splittedLine[i];
		}

		records.push(record);
	}

	return records;
}

export async function QueryPackageSalesForCSV({ dateStart = DATE_START, dateEnd = getSafeEndDate(), id, name, cookie }) {
	return await FetchData(
		`https://partner.steampowered.com/report_csv.php?file=${name}&params=query=QueryPackageSalesForCSV^pkgID=${id}^dateStart=${dateStart}^dateEnd=${dateEnd}^HasDivisions=0^interpreter=PartnerSalesReportInterpreter`,
		cookie
	);
}

export async function QueryWishlistActionsForCSV({ dateStart = DATE_START, dateEnd = getSafeEndDate(), id, name, cookie })  {
	return await FetchData(
		`https://partner.steampowered.com/report_csv.php?file=${name}&params=query=QueryWishlistActionsForCSV^appID=${id}^dateStart=${dateStart}^dateEnd=${dateEnd}^interpreter=WishlistReportInterpreter`,
		cookie
	);
}

export async function QueryFollowers({ id }) {
	const res = await fetch(`https://steamcommunity.com/games/${id}/memberslistxml/?xml=1`);
	const textBody = await res.text();

	// We can't parse XML in NodeJS without modules ? Okay, let's do it manually !

	// 1. Take groupDetails
	const relevantPart = textBody.split('<groupDetails>')[1].split('</groupDetails>')[0];

	// 2. Check Invalid format
	if(!relevantPart.includes('<memberCount>')) {
		throw new Error('Invalid XML !');
	}

	// 3. Extract data
	return parseInt( 
		relevantPart.split('<memberCount>')[1].split('</memberCount>')[0],
		10
	);
}