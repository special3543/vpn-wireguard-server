const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const https = require('https');
const { execSync, exec } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Mutex } = require('async-mutex');
const { Pool } = require('pg');

const app = express();
app.use(bodyParser.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 40,
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000,
});


const confMutex = new Mutex(); // Mutex nesnesi oluştur

let peerDataCache = {};
let ip_pubkey_classid_map = {};
let classIdPool = Array.from({ length: 65000 }, (_, i) => i + 1); // 1'den 65000'e kadar classid'leri hazırla
clear_all();

function sendErrorResponse(res, statusCode, message) {
    res.status(statusCode).json({ error: message });
}

function generateKeysAndConfig() {
    const privateKey = execSync('wg genkey').toString().trim();
    const publicKey = execSync(`echo "${privateKey}" | wg pubkey`).toString().trim();
    const preSharedKey = execSync('wg genpsk').toString().trim();
    return { privateKey, publicKey, preSharedKey };
}

function findAvailableIP(subnet) {
    try {
        const baseIP = subnet.split('/')[0];
        const baseParts = baseIP.split('.');
        const lastOctet = parseInt(baseParts[3], 10);
        const peerInfo = execSync('wg show wg0 allowed-ips').toString();
        const usedIPs = new Set();
        const regex = new RegExp(baseParts.slice(0, 3).join('.') + '.(\\d+)', 'g');
        let match;
        while ((match = regex.exec(peerInfo)) !== null) {
            usedIPs.add(parseInt(match[1], 10));
        }
        for (let i = lastOctet + 1; i <= 254; i++) {
            if (!usedIPs.has(i)) {
                return baseParts.slice(0, 3).join('.') + '.' + i;
            }
        }
        throw new Error("No available IPs");
    } catch (error) {
        console.error("Error finding available IP: ", error);
        throw error;
    }
}

const CLEANUP_INTERVAL = 6 * 60 * 1000; // 4 dakika, milisaniye cinsinden
const CLEAN_RUN_INTERVAL = 3 * 60 * 1000;

const DATA_LIMIT = 2 * 1024 * 1024 * 1024; // 2 GB (byte cinsinden)
const PREMIUM_DATA_LIMIT = 400 * 1024 * 1024 * 1024; // 400 GB (byte cinsinden)

const REDUCED_SPEED = "2mbit";
const REDUCED_PREMIUM_SPEED = "4mbit";
const NORMAL_SPEED = "4mbit";

async function updateAndCleanupPeers() {
    try {
        await confMutex.runExclusive(async () => {
            const serverWGInterface = process.env.SERVER_WG_INTERFACE || 'wg0';
            const confPath = `/etc/wireguard/${serverWGInterface}.conf`;
            const originalConf = fs.readFileSync(confPath, 'utf8');
            let confLines = originalConf.split('\n');

            // Trafik bilgilerini ve handshake zamanlarını çek
            const peerTraffic = execSync(`wg show ${serverWGInterface} transfer`).toString().trim().split('\n');
            const peerHandshakes = execSync(`wg show ${serverWGInterface} latest-handshakes`).toString().trim().split('\n');

            // Yeni verileri işle
            const currentPeerData = {};
            peerTraffic.forEach(line => {
                const [peer, rx, tx] = line.split(/\s+/).map(item => item.trim());
                if (peer) {
                    currentPeerData[peer] = {
                        lastRx: parseInt(rx, 10),
                        lastTx: parseInt(tx, 10)
                    };
                }
            });

            const latestHandshakes = {};
            peerHandshakes.forEach(line => {
                const [peer, handshakeTime] = line.split(/\s+/).map(item => item.trim());
                if (peer) {
                    latestHandshakes[peer] = parseInt(handshakeTime, 10) * 1000; // Convert to milliseconds
                }
            });

            // Get all user data in one query
            const peerKeys = Object.keys(currentPeerData);
            const res = await pool.query("SELECT public_key,is_quota,premium,download_total,upload_total FROM users WHERE public_key = ANY($1)", [peerKeys]);
            const userMap = {};
            res.rows.forEach(row => {
                userMap[row.public_key] = row;
            });

            // Batch update statements
            const updateQueries = [];

            // Verileri karşılaştır ve koşullara göre işlem yap
            for (const peer of peerKeys) {
                const newData = currentPeerData[peer];
                const oldData = peerDataCache[peer];
                const row = userMap[peer];

                let mustClearPeer = false;


                // Mobility check and cleanup
                const lastHandshakeTime = latestHandshakes[peer] || 0;
                const currentTime = Date.now();

            
                // Condition 1: No transfer and no handshake for the cleanup interval
                if (oldData && newData.lastRx === oldData.lastRx && newData.lastTx === oldData.lastTx) {
                    if(lastHandshakeTime !== 0){
                        mustClearPeer = currentTime - lastHandshakeTime > CLEANUP_INTERVAL;
                    }else{
                        mustClearPeer = currentTime - oldData.timeStamp > CLEANUP_INTERVAL;
                    }
                }


                

                if(!mustClearPeer){
                    // Eğer veri transferi veya handshake varsa, cache güncellenirken zaman damgası eklememeli
                    if (newData.lastRx !== 0 && newData.lastTx !== 0 && lastHandshakeTime !== 0) {
                        peerDataCache[peer] = {
                            lastRx: newData.lastRx,
                            lastTx: newData.lastTx
                        };
                    } else {
                        // Eğer hala handshake veya transfer yoksa, zaman damgası korunmalı
                        peerDataCache[peer] = {
                            ...newData,
                            timeStamp: oldData ? oldData.timeStamp : currentTime
                        };
                    }
                }
                    
            
                if (row) {
                    const isPremium = row.premium;
                    const dataLimit = isPremium ? PREMIUM_DATA_LIMIT : DATA_LIMIT;
                    const reducedSpeed = isPremium ? REDUCED_PREMIUM_SPEED : REDUCED_SPEED;
            
                    // Data usage update and quota check
                    let isQuotaApplied = row.is_quota;
                    const totalUsage = Number(row.download_total) + Number(row.upload_total);
            
                    // Quota control
                    const availableIP = Object.keys(ip_pubkey_classid_map).find(ip => ip_pubkey_classid_map[ip].publicKey === peer);

                    if(!isQuotaApplied && totalUsage >= dataLimit){
                        isQuotaApplied = true;
                        
                        if(!mustClearPeer){
                            const classid = ip_pubkey_classid_map[availableIP].classid;
                            console.log(`Quota exceeded: ${peer}, reducing speed...`);
                            execSync(`sudo bash ${process.env.CLEAR_IP_SH_PATH} ${availableIP} ${classid}`);
                            execSync(`sudo bash ${process.env.SPEED_LIMITER_SH_PATH} ${availableIP} ${classid} ${reducedSpeed}`);
                        }
                    }
            
                    // Update database
                    const oldDownload = oldData ? parseInt(oldData.lastRx, 10) : 0;
                    const oldUpload = oldData ? parseInt(oldData.lastTx, 10) : 0;
                    
                    const updatedDownload = parseInt(row.download_total, 10) + (parseInt(newData.lastRx, 10) - oldDownload);
                    const updatedUpload = parseInt(row.upload_total, 10) + (parseInt(newData.lastTx, 10) - oldUpload);

                    updateQueries.push(pool.query(
                        "UPDATE users SET download_total = $1, upload_total = $2, is_quota = $3, updated_at = NOW() WHERE public_key = $4",
                        [updatedDownload, updatedUpload, isQuotaApplied, peer]
                    ));

                }else{
                    if(!mustClearPeer)
                        console.warn(`No user data found for peer ${peer}. Skipping postgres queries...`);
                }

                if (mustClearPeer) {
                    cleanUpPeer(peer, confLines);
                    delete peerDataCache[peer];
                }
            }
            

            for (const peer of Object.keys(peerDataCache)) {
                if (!currentPeerData[peer]) {
                    delete peerDataCache[peer];
                }
            }

            // Execute all updates
            await Promise.all(updateQueries);

            // Write the updated config file
            const newConf = confLines.join('\n');
            fs.writeFileSync(confPath, newConf);
            execSync(`sudo bash -c 'wg syncconf ${serverWGInterface} <(wg-quick strip ${serverWGInterface})'`);
            console.log("Configuration updated and applied.");
        });
    } catch (error) {
        console.error("An error occurred during peer update and cleanup:", error);
    }
}


function cleanUpPeer(peer, confLines) {
    const availableIP = Object.keys(ip_pubkey_classid_map).find(ip => ip_pubkey_classid_map[ip].publicKey === peer);
    if (availableIP) {
        const oldClassid = ip_pubkey_classid_map[availableIP].classid;
        execSync(`sudo bash ${process.env.CLEAR_IP_SH_PATH} ${availableIP} ${oldClassid}`);
        classIdPool.push(oldClassid);
        classIdPool.sort((a, b) => a - b);
        delete ip_pubkey_classid_map[availableIP];
    }

    const clientHeaderIndex = confLines.findIndex(line => line.includes(`### Client ${peer}`));
    if (clientHeaderIndex > -1) {
        if (clientHeaderIndex <= 19) {
            confLines.splice(clientHeaderIndex, 6);
        } else {
            confLines.splice(clientHeaderIndex - 1, 6);
        }
    }
}



// Başlangıçta ve belirli aralıklarla fonksiyonu çalıştır
updateAndCleanupPeers().catch(console.error);
setInterval(() => {
    updateAndCleanupPeers().catch(console.error);
}, CLEAN_RUN_INTERVAL);

app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.API_KEY}`) {
        return res.status(403).send({ error: "Unauthorized access" });
    }
    next();
});

function extractIPv4(ip) {
    if (ip.startsWith('::ffff:')) {
        return ip.split('::ffff:')[1];
    }
    return ip;
}

app.get('/connect', async (req, res) => {
    try {
        const deviceId = req.headers['x-deviceid']; // Device ID header'dan al
        const isPremium = req.headers['x-is-premium'] === 'true'; // Premium bilgisi header'dan al ve boolean'a çevir
        const publicIp = extractIPv4(req.headers['x-forwarded-for'] || req.connection.remoteAddress); // Kullanıcının public IP'sini al ve IPv4'e çevir

        if (!deviceId) {
            return sendErrorResponse(res, 400, "Device ID is required.");
        }

        await confMutex.runExclusive(async () => {
            const userData = await getUserData(deviceId);

            const { privateKey, publicKey, preSharedKey } = generateKeysAndConfig();
            const server_pubkey = process.env.SERVER_PUBKEY;
            const availableIP = findAvailableIP('10.66.66.1/18');
            const serverWGInterface = process.env.SERVER_WG_INTERFACE || 'wg0';
            const endpoint = `${process.env.SERVER_PUBLIC_IP}:${process.env.SERVER_PORT}`;

            const clientConfig = `[Interface]
PrivateKey = ${privateKey}
Address = ${availableIP}/32
DNS = 8.8.8.8

[Peer]
PublicKey = ${server_pubkey}
PresharedKey = ${preSharedKey}
Endpoint = ${endpoint}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
`;

            const confPath = `/etc/wireguard/${serverWGInterface}.conf`;
            const peerConf = `
### Client ${publicKey}
[Peer]
PublicKey = ${publicKey}
PresharedKey = ${preSharedKey}
AllowedIPs = ${availableIP}/32
`;

            fs.appendFileSync(confPath, peerConf);
            execSync(`sudo bash -c 'wg addconf ${serverWGInterface} <(wg-quick strip ${serverWGInterface})'`);

            //oldclassid temizleme
            if (ip_pubkey_classid_map[availableIP]) {
                const oldClassid = ip_pubkey_classid_map[availableIP].classid;
                execSync(`sudo bash ${process.env.CLEAR_IP_SH_PATH} ${availableIP} ${oldClassid}`);
                classIdPool.push(oldClassid);
                classIdPool.sort((a, b) => a - b);
                delete ip_pubkey_classid_map[availableIP];
            }

            // Allocate a new classid
            const newClassid = classIdPool.shift();
            console.log(`new class id: ${newClassid}`);
            ip_pubkey_classid_map[availableIP] = {
                classid: newClassid,
                publicKey: publicKey
            };

            let dedicated_speed = NORMAL_SPEED;
            if(userData){
                if(isPremium)
                    dedicated_speed = userData.is_quota ? REDUCED_PREMIUM_SPEED : NORMAL_SPEED;
                else
                    dedicated_speed = userData.is_quota ? REDUCED_SPEED : NORMAL_SPEED;
            }
            // Setup speed limiter with new classid
            execSync(`sudo bash ${process.env.SPEED_LIMITER_SH_PATH} ${availableIP} ${newClassid} ${dedicated_speed}`);

            // Veritabanında kullanıcıyı güncelle veya ekle
            await pool.query(`
                INSERT INTO users (device_id, public_ip, wg_ip, public_key, premium) 
                VALUES ($1, $2, $3, $4, $5) 
                ON CONFLICT (device_id) 
                DO UPDATE SET public_ip = EXCLUDED.public_ip, wg_ip = EXCLUDED.wg_ip, public_key = EXCLUDED.public_key, premium = EXCLUDED.premium
            `, [deviceId, publicIp, availableIP, publicKey, isPremium]);

            res.json({
                confFile: clientConfig // JSON olarak clientConfig'i gönder
            });
        });
    } catch (error) {
        console.error(`Error in /connect endpoint: ${error}`);
        sendErrorResponse(res, 500, `Error while connecting.`);
    }
});

app.get('/clear', async (req, res) => {
    try {
        clear_all();
        res.send("All peers have been cleared.");
    } catch (error) {
        console.error(`Error in /clear endpoint: ${error}`);
        sendErrorResponse(res, 500, `Error clearing peers.`);
    }
});

async function getUserData(deviceId) {
    try {
        const result = await pool.query(`
            SELECT is_quota FROM users WHERE device_id = $1
        `, [deviceId]);

        if (result.rows.length > 0) {
            return result.rows[0]; // Kullanıcı bulunduysa verileri döndür
        } else {
            return null; // Kullanıcı bulunamadı
        }
    } catch (error) {
        console.error(`Error retrieving user data: ${error}`);
        throw error;
    }
}

async function clear_all() {
    await confMutex.runExclusive(async () => {
        const serverWGInterface = process.env.SERVER_WG_INTERFACE || 'wg0';
        const confPath = `/etc/wireguard/${serverWGInterface}.conf`;
        const originalConf = fs.readFileSync(confPath, 'utf8');
        let keepLines = true;
        const newConf = originalConf.split('\n').filter(line => {
            if (line.startsWith('### Client') || line.startsWith('[Peer]')) {
                keepLines = false; // ### Client ve sonrasındaki satırları kaldır
            }
            return keepLines;
        }).join('\n');

        execSync(`sudo bash ${process.env.CLEAR_ALL_IP_SH_PATH}`);

        fs.writeFileSync(confPath, newConf);

        // Konfigürasyonu güncelle
        execSync(`sudo bash -c 'wg syncconf ${serverWGInterface} <(wg-quick strip ${serverWGInterface})'`);

        classIdPool = Array.from({ length: 65000 }, (_, i) => i + 1); // 1'den 65000'e kadar classid'leri hazırla
        peerDataCache = {};
        ip_pubkey_classid_map = {};
    });
}

const PORT = process.env.PORT || 3000;
const options = {
    key: fs.readFileSync(`${process.env.CERTBOT_PRIVKEY_PATH}`),
    cert: fs.readFileSync(`${process.env.CERTBOT_FULLCHAIN_PATH}`)
};

https.createServer(options, app).listen(PORT, () => {
    console.log(`HTTPS Server running on port ${PORT}`);
});
