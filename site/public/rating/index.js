import {config} from "./config.js";

const SERVER_ADDR = config.server_address;
const CDB_URL = "https://content.luanti.org";
const RATING_URL = `${location.protocol}//${location.host}/rating/`;
const OAUTH_CLIENT_ID = config.oauth_client_id;
const OAUTH_URL = `${CDB_URL}/oauth/authorize/?response_type=code&client_id=${OAUTH_CLIENT_ID}&redirect_uri=${encodeURIComponent(RATING_URL)}`;
const JAM_TAG = config.jam_tag;

const status_types = {
    wait: "&#x1F504;",
    error: "&#x26D4;",
    warning: "&#x26A0;",
    success: "&#x2705;",
    info: "&#x1f4a1;",
    none: "",
}

const setInfo = (type, message) => {
    document.getElementById("info").innerHTML = `${status_types[type]}&#xFE0F; ${message}`;
}

const setStatus = (type, message) => {
    document.getElementById("status-msg").innerHTML = `${status_types[type]}&#xFE0F; ${message}`;
};

const postError = (code, message, status) => {
    console.error(`Error ${code}: ${message}`);
    setStatus("error", status);
}

const clientError = (code, message) => {
    postError(code, message, `Network error (${code}). Check console.`);
}

const serverError = (code, message) => {
    postError(code, message, `Server error (${code}). Check console.`);
}

const shuffleList = (list) => {
    let shuffled = [...list]

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const k = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = k;
    }

    return shuffled;
}

// Check for authentication request
const params = new URLSearchParams(window.location.search);
if (params.has("code")) {
    fetch(`${SERVER_ADDR}/auth?code=${params.get("code")}`).then(async res => {
        if (res.ok) {
            res.json().then(auth => {
                if (auth.ok) {
                    localStorage.setItem("jam_auth_token", auth.token);
                    localStorage.setItem("cdb_username", auth.username);
                    window.location = RATING_URL;
                }
            });
        } else {
            serverError(res.status, await res.text());
        }
    }).catch(err => {
        clientError("err01", err.toString());
    });
}

const updateList = () => {
    if (!jam_auth_token) return;

    const tiers = Array.from(document.getElementById("tiers").children);
    const list = {};

    for (const tier of tiers) {
        list[tier.id] = [];
        const items = Array.from(tier.querySelector(".items").children);

        for (const item of items) {
            list[tier.id].push(item.getAttribute("data-name"));
        }
    }

    setStatus("wait", "Saving list...");
    fetch(`${SERVER_ADDR}/list`, {
        method: "POST",
        headers: {
            "Authorization": localStorage.getItem("jam_auth_token") || "",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({order: list}),
    }).then(async res => {
        if (res.ok) {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes().toString().padStart(2, "0");
            const seconds = now.getSeconds().toString().padStart(2, "0");

            setInfo("success", `List saved ${hours}:${minutes}:${seconds}`);
            setStatus("none", "");
        } else if (res.status == 409) {
            setStatus("error", "Server error (409) - Package list may be outdated (refresh)");
            console.error(`Error 409: ${await res.text()}`);
        } else {
            serverError(res.status, await res.text());
        }
    }).catch(err => {
        clientError("err03", err.toString());
    });
}

let update_wait = false, update_needed = false;

const queueUpdate = () => {
    if (config.disabled) return;

    if (update_wait) {
        update_needed = true;
        return;
    }

    updateList();
    update_needed = false;

    setTimeout(() => {
        update_wait = false;

        if (update_needed) {
            queueUpdate();
        }
    }, config.queue_window * 1000);
};

const jam_auth_token = localStorage.getItem("jam_auth_token");
let query_sorted;

if (jam_auth_token) {
    const el_logout = document.getElementById("logout");

    document.getElementById("login").classList.add("hidden");
    el_logout.classList.remove("hidden");

    document.getElementById("logout").innerText = `Log Out (${localStorage.getItem("cdb_username")})`;

    el_logout.addEventListener("click", () => {
        localStorage.removeItem("jam_auth_token");
        localStorage.removeItem("cdb_username");
    });

    setInfo("wait", "Fetching saved list...")
    query_sorted = fetch(`${SERVER_ADDR}/list`, {
        headers: {
            "Authorization": jam_auth_token,
        }
    }).catch(err => {
        clientError("err02", err.toString());
    });
} else {
    document.getElementById("login").setAttribute("href", OAUTH_URL);
}

const newItem = (title, image, url, name) => {
    const el_item = document.createElement("div");
    el_item.classList.add("item");
    el_item.setAttribute("data-name", name);

    el_item.addEventListener("dragstart", () => el_item.classList.add("dragging"));
    el_item.addEventListener("dragend", () => {
        el_item.classList.remove("dragging");
        queueUpdate();
    });

    const el_label = document.createElement("span");
    el_label.innerText = title + " ";

    const el_url = document.createElement("a");
    el_url.setAttribute("href", url);
    el_url.setAttribute("target", "_blank")
    el_url.innerHTML = "&#x1F855;&#xFE0E";

    el_label.appendChild(el_url);
    
    const el_image = document.createElement("img");
    el_image.src = image;
    el_image.alt = name;
    el_image.draggable = false;

    el_item.appendChild(el_label);
    el_item.appendChild(el_image);

    return el_item;
}

fetch(`${CDB_URL}/api/packages/?tag=${JAM_TAG}`, {cache: "reload"}).then(res => {
    res.text().then(text => {
        const json = JSON.parse(text);
        const tier_c = document.getElementById("tier-c").querySelector(".items")
        let packages = {};

        for (const idx in json) {
            const pkg = json[idx];
            const item = newItem(pkg.title, pkg.thumbnail, `${CDB_URL}/packages/${pkg.author}/${pkg.name}/`, pkg.name);

            if (!jam_auth_token || config.disabled) {
                item.classList.add("disabled");
            }

            packages[pkg.name] = item;
        }

        if (jam_auth_token) {
            query_sorted.then(async query_res => {
                if (query_res.ok) {
                    const list = await query_res.json();

                    for (const name in packages) {
                        if (!config.disabled) {
                            packages[name].draggable = true;
                        }

                        if (list.maintains.includes(name)) {
                            packages[name].classList.add("disabled");
                            packages[name].setAttribute("title", "Your package will not count towards your own list.");
                        }
                    }

                    if (list.order) {
                        let err = false;
                        for (const id in list.order) {
                            const tier = document.getElementById(id);

                            if (tier) {
                                const items = tier.querySelector(".items");
                                for (const name of list.order[id]) {
                                    items.appendChild(packages[name]);
                                }
                            } else {
                                err = true;
                            }
                        }

                        if (!err) {
                            setInfo("success", "Loaded saved list.");
                        } else {
                            setInfo("error", "Malformed list received from server.")
                        }

                        return;
                    } else {
                        setInfo("info", "Drag items to sort.");
                    }
                } else {
                    serverError(query_res.status, await query_res.text());
                }

                tier_c.append(...shuffleList(Object.values(packages)));
            });
        }

        tier_c.append(...shuffleList(Object.values(packages)));
    });
}).catch(err => {
    clientError("err04", err.toString());
});

document.querySelectorAll(".tier").forEach((tier) => {
    let items = tier.querySelector(".items");

    items.addEventListener("dragover", (event) => {
        event.preventDefault();

        const item = document.querySelector(".dragging");
        const target = event.target;
        const targetItem = target.closest(".item");

        if (target.classList.contains("items")) {
            target.appendChild(item);
        } else if (targetItem && targetItem !== item) {
            const rect = targetItem.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;

            if (event.clientX < centerX) {
                targetItem.before(item);
            } else {
                targetItem.after(item);
            }
        }
    });

    items.addEventListener("drop", (event) => {
        event.preventDefault();            
    });
});

