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
const record = db.prepare("SELECT user, pkg_order FROM scores").all();

const users = require("./users.json");
const games = {};

// Fetch metadata for all submissions
const entries = await force_fetch_json(`${CDB_API_URL}/packages/?tag=jam_game_2025`);
for (const entry of entries) {
    const metadata = await force_fetch_json(`${CDB_API_URL}/packages/${entry.author}/${entry.name}`);
    const data = {
        metadata: {
            maintainers: metadata.maintainers,
            name: metadata.name,
            // WE ARE NOT APPLYING PENALTIES THIS YEAR; INCLUDED FOR PROOF OF USELESSNESS
            no_repo: !metadata.repo ? 1 : 0,
            non_free: (metadata.license.match("NC") || metadata.media_license.match("NC")) ? 1 : 0,
            complex: metadata.tags.includes("complex_installation") ? 1 : 0,
        },
        scores: [],
    };

    games[entry.name] = data;
}

const flatten_order = (pkg_order) => {
    const order = JSON.parse(pkg_order);
    let flat = [];

    for (const tier of ["s", "a", "b", "c", "d", "e", "f"]) {
        flat.push(...order[`tier-${tier}`]);
    }

    return flat;
}

for (const row of record) {
    const order = flatten_order(row.pkg_order);
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
}

// Naive shuffle (for kicks)
for (const i in games) {
    games[i].scores.sort(() => 0.5 - Math.random());    
}

fs.writeFile("./games.json", JSON.stringify(games), () => {});

})();
