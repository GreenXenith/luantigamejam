const PRINT_HISTOGRAM = false;
const GENERATE_CSV = false;
const APPLY_PENALTIES = false;

const games = require("./games.json");
const WEIGHTS = [
    1, // Normal user
    1.1, // Helpful user
];
const PENALTY_WEIGHT = 0.2;
const ENTRIES = Object.keys(games).length;

/*
 * Simple Weighted Average
 */
const results = Object.entries(games).map(([title, data]) => {
    // Filter out unrated games
    const scores = data.scores.filter(([, weighted]) => weighted >= 0);
    const tsc = scores.length;
    const meta = data.metadata;

    // Divide by total weight rather than number of votes, to make the average correct.
    const totalWeight = scores.reduce((acc, [, weighted]) => acc + WEIGHTS[weighted], 0);

    // Calculate the mean
    const sum = scores.reduce((acc, [rank, weighted]) => acc + WEIGHTS[weighted] * ((ENTRIES + 1) - rank), 0)
    const mean = sum / totalWeight;

    // WE ARE NOT APPLYING PENALTIES THIS YEAR; INCLUDED FOR PROOF OF USELESSNESS
    // Penalty is a multiplier (1 - 0.2 for every failed criteria)
    const penalty = 1 - (meta.no_repo * PENALTY_WEIGHT) - (meta.non_free * PENALTY_WEIGHT) - (meta.complex * PENALTY_WEIGHT);
    const penalized = mean * (APPLY_PENALTIES ? penalty : 1);
    const place = (ENTRIES - penalized).toFixed(2); // Average place

    let penalties = [];
    if (meta.no_repo == 1) penalties.push("no_repo");
    if (meta.non_free == 1) penalties.push("non_free");
    if (meta.complex == 1) penalties.push("complex");

    return [title, parseFloat(place), tsc, penalties];
}).sort((a, b) => a[1] - b[1]);

console.log(results);

/*
 * Histogram
 */

// Build data
const histograms = Object.fromEntries(Object.entries(games).map(([title, data]) => {
    const ret = Array(Object.keys(games).length).fill(0);
    data.scores.filter(([, weighted]) => weighted > -1).forEach(([x,]) => { ret[x - 1]++ });
    return [title, ret];
}));

if (PRINT_HISTOGRAM) {
// Print out in RMS order
results.map(([title]) => [title, histograms[title]]).forEach(([title, histo]) => {
    console.log(`\n\n${title}`);
    for (let i = 0; i < ENTRIES; i++) {
        console.log(`${i + 1}: ${"#".repeat(histo[i])}`);
    }
});
}

if (GENERATE_CSV) {
    let data = Object.entries(games).map(([title, data]) => {
        return [title, ...data.scores.map(([score]) => score)];
    });

    const sortby = results.map(([name]) => name);
    data.sort((a, b) => sortby.indexOf(a[0]) - sortby.indexOf(b[0]));

    let transposed = data[0].map((_, idx) => data.map(row => row[idx] != -1 ? row[idx] : "").join(","));
    const csv = transposed.join(",\n");

    require("fs").writeFile("./scores.csv", csv, () => {});
}
