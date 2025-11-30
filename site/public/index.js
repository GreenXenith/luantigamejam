document.addEventListener("mousemove", event => {
    const x = (event.clientX / document.body.clientWidth - 0.5) * 2, y = (event.clientY / document.body.clientHeight - 0.5) * 2;
    const logo = document.getElementById("hero");

    logo.style.transform = `translateX(${x * 1}%) translateY(${y * 1}%)`;
});

// Dates
const dates = [
    ["til theme announcement + jam start", new Date("2025-11-08T00:00Z")],
    ["to work on your games", new Date("2025-11-29T00:00Z")],
    ["to finish and get your game approved", new Date("2025-11-30T00:00Z")],
    [`to rank submissions`, new Date("2025-12-08T00:00Z")],
    ["Results soon"],
];

function updateTimer(timer, remaining) {
    const parts = [
        Math.floor((remaining % 86400) / 3600),
        Math.floor(((remaining % 86400) % 3600) / 60),
        Math.floor(((remaining % 86400) % 3600) % 60),
        Math.floor(remaining / 86400),
    ];

    timer.innerHTML = (parts[3] > 0 ? `${parts[3]}.` : "") + parts.slice(0, 3).map(v => v.toString().padStart(2, "0")).join(":");

    const theme = document.getElementById("theme");
    if (dates[0][1] > Date.now()) {
        theme.style = "display: none";
    } else {
        theme.style = "";
    }
}

const CDB_URL = "https://content.luanti.org";

document.addEventListener("DOMContentLoaded", async () => {
    [...document.getElementsByClassName("date")].forEach(e => {
        const when = e.getAttribute("data-date");
        e.innerHTML = !Date.parse(when) ? "DATE PARSE ERROR" : new Date(when).toLocaleString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            hour12: true,
            minute: "2-digit",
            timeZoneName: "short"
        });
    });

    // Closest date
    let i = 0;
    let next = dates[0];
    while (next[1] && next[1] <= Date.now()) {
        next = dates[++i];
    }

    let el_next = document.getElementById("next-event");
    el_next.innerHTML = next[0];

    // Countdown
    const timer = document.getElementById("clock");
    setInterval(() => {
        if (Date.parse(next[1])) {
            const diff = Math.max(0, (next[1] - Date.now()) / 1000);
            updateTimer(timer, diff);

            // Update closest date
            if (diff < 1) {
                next = dates[++i];
                el_next.innerHTML = next[0];
            }
        } else {
            timer.innerHTML = next[0];
            el_next.innerHTML = "";
        }
    }, 1000);

    if (Date.parse(next[1])) {
        updateTimer(timer, Math.max(0, (next[1] - Date.now()) / 1000));
    } else {
        timer.innerHTML = next[0];
        el_next.innerHTML = "";
    }
});
