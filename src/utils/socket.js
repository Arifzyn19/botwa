import makeWASocket from "baileys";
export default async function createSocket(config) {
    const sock = makeWASocket(config);
    return sock;
}
