(async () => {

const force_fetch_json = async (...args) => {
    while (true) {
        try {
            return await (await fetch(args)).json();
        } catch(err) {
            console.log(err);
        }
    }
}

const API_URL = "https://content.luanti.org/api";

const fs = require("fs");

const db = require("better-sqlite3")("scores.sqlite");
const record = db.prepare("SELECT user FROM scores").all();
const users = {}

const MAX_DATE = new Date("2024-11-22T00:00:00"); // Last date reviews count (working time end)
const WEIGHTED_RANKS = ["editor", "moderator", "admin"];

process.stdout.write("Fetching user reviews ");

// Count helpfuls on each review; 10 or more means higher weight for that user
for (const row of record) {
    if (WEIGHTED_RANKS.includes((await force_fetch_json(`${API_URL}/users/${row.user}/`)).rank)) {
        users[row.user] = true;
    } else {
        let helpfuls = 0;
        let reviews;

        do {
            reviews = await force_fetch_json(`${API_URL}/reviews?author=${row.user}`);
    
            for (const review of reviews.items) {
                if (new Date(review.created_at) < MAX_DATE) {
                    helpfuls += review.votes.helpful;
                }
            }
        } while (reviews.page < reviews.page_count && helpfuls < 10);

        users[row.user] = helpfuls >= 10;
    }

    process.stdout.write(".");
}

fs.writeFile("./users.json", JSON.stringify(users), () => {});
process.stdout.write("\n");

})();
