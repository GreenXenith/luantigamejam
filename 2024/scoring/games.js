(async () => {

const force_fetch_json = async (...args) => {
    while (true) {
        try {
            console.log(...args);
            return await (await fetch(args)).json();
        } catch {}
    }
}

const fs = require("fs");
const CDB_API_URL = "https://content.luanti.org/api";

const db = require("better-sqlite3")("scores.sqlite");
const record = db.prepare("SELECT user, pkg_order, bestof FROM scores").all();

const users = require("./users.json");
const games = {};

// Fetch metadata for all submissions
const entries = await force_fetch_json(`${CDB_API_URL}/packages/?tag=jam_game_2024`);
for (const entry of entries) {
    const metadata = await force_fetch_json(`${CDB_API_URL}/packages/${entry.author}/${entry.name}`);
    const data = {
        metadata: {
            maintainers: metadata.maintainers,
            name: metadata.name,
            no_repo: !metadata.repo ? 1 : 0,
            non_free: (metadata.license.match("NC") || metadata.media_license.match("NC")) ? 1 : 0,
            complex: metadata.tags.includes("complex_installation") ? 1 : 0,
        },
        scores: [],
        bestof: {
            "inov": 0,
            "mood": 0,
            "media": 0,
            "fun": 0,
        },
    };

    games[entry.name] = data;
}

for (const row of record) {
    const order = row.pkg_order.split(",");
    const weighted = users[row.user] ? 1 : 0; // 0: Regular 1: Weighted

    let r = 1;
    for (const gname of order) {
        const game = games[gname];

        if (!game.metadata.maintainers.includes(row.user)) {
            game.scores.push([r++, weighted]);
        } else {
            game.scores.push([-1, -2]); // -2: Own package
        }
    }

    // Mark unrated games
    for (const name in games) {
        if (!order.includes(name) && !games[name].metadata.maintainers.includes(row.user)) {      
            console.log(`${name} was somehow unrated by ${row.user}`);      
            games[name].scores.push([++r, -1]); // -1: Unrated (missed)
        }
    }

    const bestof = JSON.parse(row.bestof);
    for (const cat in bestof) {
        if (!games[bestof[cat]].metadata.maintainers.includes(row.user)) {
            games[bestof[cat]].bestof[cat]++;
        }
    }
}

// Naive shuffle (for kicks)
for (const i in games) {
    games[i].scores.sort(() => 0.5 - Math.random());    
}

fs.writeFile("./games.json", JSON.stringify(games), () => {});

})();
