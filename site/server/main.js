const config = require("./config.json");
const CDB_URL = "https://content.luanti.org";
const JAM_TAG = "jam_game_2025";

// Logging
const fs = require("fs");

const log_msg = (message) => {
    const stamped_msg = `[${(new Date()).toISOString()}]: ${message}\n\n`;
    fs.appendFile("log.txt", stamped_msg, () => {});

    return stamped_msg;
}

const log_error = (message) => {
    const eid = "0x" + (new Date().getTime()).toString(16);
    const stamped = log_msg(`Error ${eid}: ${message}`);

    fs.appendFile("error_log.txt", stamped, () => {});

    return eid;
}

const server_error = (res, message, error) => {
    console.error(error);
    const err_id = log_error(error.toString());
    res.status(500).send(`${message} (${err_id})`);
}

// Set up database
const db = require("better-sqlite3")("scores.sqlite");
db.pragma("journal_mode = WAL");

db.exec("CREATE TABLE IF NOT EXISTS scores (user TEXT UNIQUE PRIMARY KEY NOT NULL, pkg_order TEXT)");

const db_add_order = db.prepare("INSERT INTO scores (user, pkg_order) VALUES (@user, @pkg_order)");
const db_set_order = db.prepare("UPDATE scores SET pkg_order = @pkg_order WHERE user = @user");
const db_get_order = db.prepare("SELECT pkg_order FROM scores WHERE user = @user");

const getOrder = (username) => {
    const result = db_get_order.get({user: username});
    if (!result) return null;

    return result.pkg_order;
}

const setOrder = (username, order) => {
    if (!getOrder(username)) {
        return db_add_order.run({
            user: username,
            pkg_order: order,
        }).changes > 0;
    } else {
        return db_set_order.run({
            user: username,
            pkg_order: order,
        }).changes > 0;
    }
}

// Set up express server
const jwt = require("jwt-simple");
const jwt_secret = Buffer.from(config.server_secret, "hex");

const express = require("express");
const app = express();

app.set("trust proxy", config.trust_proxy || false);
app.use(require("cors")({exposedHeaders: ["Authorization"], origin: ["http://localhost:8000", "https://jam.luanti.org"]}));
app.use(require("express-rate-limit").rateLimit({
    limit: config.rate.limit,
    windowMs: config.rate.window * 60 * 1000,
    handler: (req, res, _next, options) => {
        log_msg(`Ratelimit exceeded by ${req.ip}`);
        res.status(options.statusCode).send(options.message);
    },
}));
app.use((req, res, next) => {
    if (req.path != "/auth") {
        if (!req.headers.authorization) return res.status(401).send("missing token");

        try {
            const decoded = jwt.decode(req.headers.authorization, jwt_secret);
            req.username = decoded.name;

            return next();
        } catch(err) {
            log_msg(`Bad token from ${req.ip}`);
            res.status(401).send("bad token");
        }
    }

    next();
});
app.use(express.json());

const try_fetch = (url, options, tries = 5) => new Promise((resolve, reject) => {
    return fetch(url, options).then(resolve).catch(err => {
        if (tries > 0) {
            return try_fetch.bind(null, url, options, --tries)().then(resolve).catch(reject);
        }

        return reject(err);
    });
});

let maintainers = {};

const check_keys = ["tier-s", "tier-a", "tier-b", "tier-c", "tier-d", "tier-e", "tier-f"];
const check_values = [];

try_fetch(`${CDB_URL}/api/packages/?tag=${JAM_TAG}`).then(async res => {
    const list = await res.json();

    process.stdout.write("Populating package list ... ");

    for (const pkg of list) {
        await try_fetch(`${CDB_URL}/api/packages/${pkg.author}/${pkg.name}`).then(async pkg_res => {
            const info = await pkg_res.json();
            for (const user of info.maintainers) {
                if (!(user in maintainers)) maintainers[user] = [];
                maintainers[user].push(pkg.name);
            }
            check_values.push(pkg.name);
        });
    }

    process.stdout.write("Done.\n");    
});

// Route: Authenticate user with ContentDB OAuth2 token
app.get("/auth", (req, res) => {
    const data = new URLSearchParams();

    data.append("grant_type", "authorization_code");
    data.append("client_id", config.client_id);
    data.append("client_secret", config.client_secret);
    data.append("code", req.query.code);

    // Fetch ContentDB OAuth2 token
    try_fetch(`${CDB_URL}/oauth/token/`, {
        method: "POST",
        body: data,
    }).then(async oauth_res => {
        const body = await oauth_res.json();

        if (body.success) {
            // Fetch authenticated username
            fetch(`${CDB_URL}/api/whoami/`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${body.access_token}`,
                },
            }).then(async who_res => {
                const body = await who_res.json();

                if (body.is_authenticated) {
                    // Return JWT token
                    const token = jwt.encode({name: body.username}, jwt_secret);
                    res.status(200).json({ok: true, token: token, username: body.username});
                } else {
                    log_msg(`OAuth validation failed from ${req.ip}`);
                    res.status(502).send(`oauth validation failed`);
                }
            }).catch(err => {
                server_error(res, "whoami fetch failed", err)
            });
        } else {
            log_msg(`OAuth failed from ${req.ip} (${body.error})`);
            res.status(502).send(`oauth failed (${body.error})`);
        }
    }).catch(err => {
        server_error(res, "oauth fetch failed", err);
    });
});

// Route: Fetch package order for user
app.get("/list", (req, res) => {
    const order = JSON.parse(getOrder(req.username));
    res.status(200).json({order: order, maintains: req.username in maintainers ? maintainers[req.username] : []});
});

// This is overkill and slow but whatever
const check_order = (order) => {
    if (Object.keys(order).length != check_keys.length) return false;
    
    let total_values = 0;
    for (const key in order) {
        if (!check_keys.includes(key)) return false;
        if (!(order[key].every(value => {
            total_values++;
            return check_values.includes(value)
        }))) return false;
    }

    if (total_values != check_values.length) return false;

    return true;
}

// Route: Update package order for user
if (!config.disabled) app.post("/list", (req, res) => {
    const list = req.body.order;
    
    if (!check_order(list)) {
        log_msg(`Bad list length from ${req.ip} ([${list.toString()}])`);
        return res.status(409).send("bad length");
    }

    try {
        const success = setOrder(req.username, JSON.stringify(list));

        if (success) {
            res.status(200).send("ok");
        } else {
            res.status(500).send("no changes made");
        }
    } catch(err) {
        server_error(res, "database update failed", err);
    }
});

app.listen(config.port, () => {
    log_msg(`Server started on ${config.port}`);
    console.log(`Server listening on port ${config.port}`)
});
