import {config} from "./config.js";

const SERVER_ADDR = config.server_address;
const CDB_URL = "https://content.luanti.org";
const RATING_URL = `${location.protocol}//${location.host}/rating/`;
const OAUTH_CLIENT_ID = config.oauth_client_id;
const OAUTH_URL = `${CDB_URL}/oauth/authorize/?response_type=code&client_id=${OAUTH_CLIENT_ID}&redirect_uri=${encodeURIComponent(RATING_URL)}`;
const JAM_TAG = "jam_game_2021"; // Testing

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

// Modify elements if logged in
const jam_auth_token = localStorage.getItem("jam_auth_token");
const cdb_username = localStorage.getItem("cdb_username");
let query_sorted;

if (jam_auth_token) {
    const el_logout = document.getElementById("logout");

    document.getElementById("login").classList.add("hidden");
    el_logout.classList.remove("hidden");

    document.getElementById("logout").innerText = `Log Out (${localStorage.getItem("cdb_username")})`;

    if (!config.disabled) {
        document.getElementById("clear").addEventListener("click", () => {
            if (confirm("Would you like to delete your ranking list from the server?")) {
                fetch(`${SERVER_ADDR}/clear`, {
                    method: "POST",
                    headers: {
                        "Authorization": localStorage.getItem("jam_auth_token") || "",
                    },
                }).then(async res => {
                    if (res.ok) {
                        document.getElementById("clear").classList.add("hidden");

                        const now = new Date();
                        const hours = now.getHours();
                        const minutes = now.getMinutes().toString().padStart(2, "0");
                        const seconds = now.getSeconds().toString().padStart(2, "0");

                        setInfo("success", `List cleared ${hours}:${minutes}:${seconds}`);
                        setStatus("none", "");
                    } else {
                        serverError(res.status, await res.text());
                    }
                }).catch(err => {
                    clientError("err05", err.toString());
                });
            }
        });
    } else {
        document.getElementById("clear").classList.add("disabled");
    }

    document.getElementById("info").innerText = "Changes are saved automatically.";

    el_logout.addEventListener("click", () => {
        localStorage.removeItem("jam_auth_token");
        localStorage.removeItem("cdb_username");
    });

    document.getElementById("header-most").innerHTML = "&#x1F44D;&#xFE0F; Most Favorite";
    document.getElementById("header-least").classList.remove("hidden");

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

// Populate packages
let package_elements = {};

const randomize_elements = (parent) => {
    let list = Object.values(package_elements);

    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * i);
        const k = list[i];
        list[i] = list[j];
        list[j] = k;
    }

    parent.append(...list);
}

const updateList = () => {
    if (!jam_auth_token) return;

    const children = Array.from(document.getElementById("packages").children)
    let list = [];
    let bestof = {};

    for (const el of children) {
        list.push(el._pkg_name);

        for (const opt of el.querySelector("#bestof").options) {
            if (opt.value != "" && opt.selected) bestof[opt.value] = el._pkg_name;
        };
    }

    setStatus("wait", "Saving list...");
    fetch(`${SERVER_ADDR}/list`, {
        method: "POST",
        headers: {
            "Authorization": localStorage.getItem("jam_auth_token") || "",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({order: list, bestof: bestof}),
    }).then(async res => {
        if (res.ok) {
            document.getElementById("clear").classList.remove("hidden");

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

let queue = 0;

const queueUpdate = () => {
    if (config.disabled) return;

    if (queue++ == 0) { // Increment queue
        updateList(); // Immediately update if nothing pending

        setTimeout(() => {
            // If more added, update again
            if (queue > 1) {
                updateList();
            }

            queue = 0; // Clear queue
        }, config.queue_window * 1000);
    }
};

const moveUp = (e) => {
    if (jam_auth_token) {
        const el_pkg = e.target.parentNode.parentNode;
        if (el_pkg.previousSibling) {
            el_pkg.previousSibling.before(el_pkg);
            queueUpdate();
        }
    };

    e.preventDefault();
};

const moveDown = (e) => {
    if (jam_auth_token) {
        const el_pkg = e.target.parentNode.parentNode;
        if (el_pkg.nextSibling) {
            el_pkg.nextSibling.after(el_pkg);
            queueUpdate();
        }
    }

    e.preventDefault();
};

const CATEGORIES = {
    fun: "🎮 Most Fun",
    inov: "💡 Most Innovative",
    mood: "🌧️ Best Mood",
    media: "🎨 Best Art/Media",
}

const bestof_change_callback = (ev) => {
    if (ev.target.value != "") {
        for (const el of document.getElementsByTagName("option")) {
            if (el.parentElement != ev.target && el.selected && el.value == ev.target.value) {
                el.selected = false;
                for (const opt of el.parentElement.options) {
                    if (opt.value == "") opt.selected = true;
                };
            }
        }
    };

    updateList();
}

fetch(`${CDB_URL}/api/packages/?tag=${JAM_TAG}`, {cache: "reload"}).then(res => {
    res.text().then(text => {
        // Add package tiles
        const pkg_list = document.getElementById("packages");
        const json = JSON.parse(text);

        for (const idx in json) {
            const pkg = json[idx];

            const el_pkg = document.createElement("div");
            el_pkg.classList.add("package");
            el_pkg._pkg_name = pkg.name;

            const el_img = document.createElement("img");
            el_img.src = pkg.thumbnail;
            el_pkg.appendChild(el_img);

            const el_info = document.createElement("div");
            el_info.id = "pkg-info";
            el_pkg.appendChild(el_info);

            const el_title = document.createElement("h1");
            el_title.innerText = pkg.title;
            el_info.appendChild(el_title);

            const el_link = document.createElement("a");
            el_link.setAttribute("href", `${CDB_URL}/packages/${pkg.author}/${pkg.name}/`);
            el_link.setAttribute("target", "_blank");
            el_link.innerHTML = "&#x1F855;&#xFE0E";
            el_title.appendChild(el_link);

            const el_bestof = document.createElement("select");
            el_bestof.id = "bestof";
            el_bestof.addEventListener("change", bestof_change_callback);

            const el_best_placeholder = document.createElement("option");
            el_best_placeholder.selected = true;
            el_best_placeholder.innerHTML = "&#x1F3C5"
            el_best_placeholder.value = "";
            el_bestof.appendChild(el_best_placeholder);

            for (const cat in CATEGORIES) {
                const title = CATEGORIES[cat];
                const el_best_option = document.createElement("option");
                el_best_option.innerHTML = title;
                el_best_option.value = cat;
                el_bestof.appendChild(el_best_option);
            }

            el_title.appendChild(el_bestof);

            const el_desc = document.createElement("p");
            el_desc.innerText = pkg.short_description;
            el_info.appendChild(el_desc);

            const own_package = pkg.author == cdb_username;
            if (!jam_auth_token || own_package || config.disabled) {
                el_pkg.classList.add("disabled");
            }

            if (jam_auth_token) {
                // Only add controls if logged in
                const el_up = document.createElement("div");
                el_up.innerHTML = "&#x1F53C;&#xFE0F;";
                el_up.addEventListener("click", moveUp);

                const el_down = document.createElement("div");
                el_down.innerHTML = "&#x1F53D;&#xFE0F;";
                el_down.addEventListener("click", moveDown);

                const el_ctrl = document.createElement("div");
                el_ctrl.id = "pkg-ctrls";
                el_ctrl.appendChild(el_up);
                el_ctrl.appendChild(el_down);
                el_pkg.appendChild(el_ctrl);

                if (own_package) {
                    el_pkg.setAttribute("title", "Your package will not count towards your own list.");
                }

                // Only allow movement if logged in and enabled
                if (!config.disabled) {
                    el_pkg.classList.add("movable");
                    el_pkg.addEventListener("mousedown", e => {
                        if (e.target.classList.contains("movable")) {
                            move_target = e.target;
                            move_target.origin = e.clientY;
                            move_target.classList.add("moving");
                        }
                    });
                }
            }

            package_elements[pkg.name] = el_pkg;
        }

        // Sort package tiles if logged in
        if (jam_auth_token) {
            query_sorted.then(async query_res => {
                if (query_res.ok) {
                    const list = await query_res.json();

                    for (const name in package_elements) {
                        if (list.maintains.includes(name)) {
                            package_elements[name].classList.add("disabled");
                            package_elements[name].setAttribute("title", "Your package will not count towards your own list.");
                        }

                        const idx = Object.keys(list.bestof).find(key => list.bestof[key] === name);
                        if (idx) {
                            package_elements[name].querySelector("#bestof").value = idx;
                        }
                    }

                    if (list.order) {
                        document.getElementById("clear").classList.remove("hidden");

                        // Load known list
                        let complete = [];
                        for (const name of list.order) {
                            pkg_list.appendChild(package_elements[name]);
                            complete.push(name);
                        }

                        // Append remaining
                        for (const name in package_elements) {
                            if (!complete.includes(name)) {
                                pkg_list.appendChild(package_elements[name]);
                            }
                        }

                        if (list.order.join(",").length == Object.keys(package_elements).join(",").length) {
                            setInfo("success", "Loaded saved list.");
                        } else {
                            setInfo("warning", "Saved list is outdated. Please sort again.");
                        }

                        return;
                    } else {
                        setInfo("info", "Drag or use arrows to move items.");
                    }
                } else {
                    serverError(query_res.status, await query_res.text());
                }

                // If query failed, no order returned, or outdated list: randomize
                randomize_elements(pkg_list);
            });
        } else {
            randomize_elements(pkg_list);
        }
    });
}).catch(err => {
    clientError("err04", err.toString());
});

// Tile movement handlers
let move_target;
let mouseY = 0;
let moved = false;
const MOVE_SPEED = 0.15;
const TRANSITION = `transition: top ${MOVE_SPEED}s ease-out;`;

const moveElement = () => {
    if (move_target) {
        const children = Array.from(move_target.parentNode.children);
        const idx = children.indexOf(move_target);

        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        let distance = mouseY - move_target.origin;

        // Swap elements when moved by one tile
        if (move_target.nextSibling && distance > move_target.nextSibling.clientHeight) {
            const sibling = children[idx + 1];
            const height = sibling.clientHeight;

            sibling.style = `top: calc(${height}px + 1rem);`;
            setTimeout(() => sibling.style = `top: 0; ${TRANSITION};`, 0); // Start transition on next frame

            sibling.after(children[idx]);
            move_target.origin += height + rem; // Offset origin by sibling element height

            moved = true;
            setTimeout(() => {sibling.removeAttribute("style");}, MOVE_SPEED * 1000);
        } else if (move_target.previousSibling && distance < -move_target.previousSibling.clientHeight) {
            const sibling = children[idx - 1];
            const height = sibling.clientHeight;

            sibling.style = `top: calc(-${height}px - 1rem);`;
            setTimeout(() => sibling.style = `top: 0; ${TRANSITION};`, 0);

            sibling.before(children[idx]);
            move_target.origin -= height + rem;

            moved = true;
            setTimeout(() => {sibling.removeAttribute("style");}, MOVE_SPEED * 1000);
        }

        move_target.style = `top: ${mouseY - move_target.origin}px;`;
    }
}

document.body.addEventListener("mousemove", e => {
    if (jam_auth_token) {
        mouseY = e.clientY;
        moveElement();
    }
});

const drop_handler = () => {
    if (move_target && jam_auth_token) {
        move_target.classList.remove("moving");
        move_target.removeAttribute("style");
        move_target = null;

        if (moved) {
            queueUpdate();
            moved = false;
        }
    }
}

document.body.addEventListener("mouseup", drop_handler);
document.body.addEventListener("mouseleave", drop_handler);

// const doScroll = () => {
//     const zone = mouseY / window.innerHeight;
//     if (move_target && zone > 0.9) {
//         const rate = 20 * ((zone - 0.9) * 10);
//         window.scrollBy({top: rate, behavior: "instant"});
//         move_target.origin -= rate / 2;
//         moveElement();
//     }

//     setTimeout(doScroll, 10);
// }

// doScroll();
