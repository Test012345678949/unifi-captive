/* ---------- Config --- ---------- */

const UNIFI_HOST = 'localhost';
const UNIFI_PORT = 8443;
const USER = 'captive';
const PASS = 'captive1234';
const REAL_URL = 'wlan.testdomain.com';

const LISTLOG = "/var/log/unifi-captive-list.log";


/* ---------- TLS Config ---------- */
const fs    = require('fs');
const tlsOptions = {
    key:  fs.readFileSync("/opt/certificate/key.pem"),
    cert: fs.readFileSync("/opt/certificate/fullchain.pem"),
    ca:   fs.readFileSync("/opt/certificate/ca.pem")
};

/* --------------------- ---------- */

const http  = require('http');
const https = require('https');

let cookie = '';

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

/* ---------- Logging ---------- */

function log(msg) {
    console.log(new Date().toISOString(), msg);
}

/* ---------------- UniFi Login ---------------- */

function unifiLogin(cb) {
    const data = JSON.stringify({ username: USER, password: PASS, remember: true });

    const options = {
        hostname: UNIFI_HOST,
        port: UNIFI_PORT,
        path: "/api/login",
        method: "POST",
        rejectUnauthorized: false,
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data)
        }
    };

    log("🔐 UniFi Login...");

    const req = https.request(options, res => {
        if (!res.headers["set-cookie"]) {
            log("❌ Login fehlgeschlagen: " + res.statusCode);
            return;
        }

        cookie = res.headers["set-cookie"]
            .map(c => c.split(";")[0])
            .join("; ");

        log("✅ Login OK – Cookie erneuert");
        cb();
    });

    req.on("error", e => log("❌ Login Fehler: " + e.message));
    req.write(data);
    req.end();
}

/* -------- UniFi Request mit Auto-Relogin ------- */

function unifiRequest(path, retry = true) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: UNIFI_HOST,
            port: UNIFI_PORT,
            path,
            method: "GET",
            rejectUnauthorized: false,
            headers: { "Cookie": cookie }
        };

        let raw = "";

        const req = https.request(options, res => {
            res.on("data", d => raw += d);
            res.on("end", async () => {
                if (res.statusCode === 401 && retry) {
                    log("🔁 Re-Login");
                    return unifiLogin(() =>
                        unifiRequest(path, false).then(resolve).catch(reject)
                    );
                }

                try { resolve(JSON.parse(raw)); }
                catch { reject(new Error("Ungültige UniFi Antwort")); }
            });
        });

        req.on("error", reject);
        req.end();
    });
}

/* -------- Client autorisiert? ---------- */

async function unifiClientAuthorized(ip) {

    const json = await unifiRequest("/api/s/default/stat/sta");

    const total = json.data.length;
    const authorizedCount = json.data.filter(c => c.authorized === true).length;

    log(`📊 Abfrage erfolgreich – ${total} Clients aktiv, ${authorizedCount} authorisiert`);

    let out = "Datum Abruf: " + new Date().toISOString() + "\n\n";
    out += `Clients gesamt: ${total}\nAuthorisiert: ${authorizedCount}\n\n`;

    json.data.forEach(c => {
       out += `${c.ip || "-"} : ${c.hostname || "-"} : ${c.mac || "-"} : ${c.authorized}\n`;
    });


    fs.writeFileSync(LISTLOG, out);

    const client = json.data.find(c => c.ip === ip);
    return client ? client.authorized === true : false;
}

/* -------- HTTPS Captive API ---------- */

const apiHandler = async (req, res) => {
    let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");

    try {
        const authorized = await unifiClientAuthorized(ip);

        const body = JSON.stringify({
            captive: !authorized,
            "user-portal-url": `https://${REAL_URL}:8843/guest/s/default/#/`
        });

        res.writeHead(200, {
            "Content-Type": "application/captive+json",
            "Cache-Control": "private"
        });
        res.end(body);

        log(`📤 ${ip} → captive=${!authorized}`);
    }
    catch (e) {
        res.writeHead(503);
        res.end();
        log("❌ Fehler: " + e.message);
    }
};

/* -------- HTTPS 443 ---------- */

https.createServer(tlsOptions, apiHandler)
     .listen(443, () => log("🔐 Captive API läuft auf Port 443"));

/* -------- HTTP 80 → Redirect ---------- */

http.createServer((req, res) => {
    const host = req.headers.host.split(":")[0];
    res.writeHead(301, { "Location": `https://${REAL_URL}${req.url}` });
    res.end();
}).listen(80, () => log("➡ HTTP Redirect auf HTTPS aktiv (Port 80)"));

unifiLogin(() => log("🟢 System bereit"));
