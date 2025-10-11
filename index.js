import dotenv from "dotenv";
dotenv.config();
import { Boom } from "@hapi/boom";
import NodeCache from "@cacheable/node-cache";
import * as readline from "readline";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, getAggregateVotesInPollMessage, makeCacheableSignalKeyStore, proto, useMultiFileAuthState, } from "baileys";
import * as P from "pino";
import { procMsg } from "./src/utils/msg.js";
import { prMsg } from "./src/utils/fmt.js";
const { default: CmdRegis } = await import('./src/commands/register.js');
try {
    await CmdRegis.load();
    await CmdRegis.watch();
}
catch (error) {
    console.error("Error loading or watching commands:", error);
}
import handler from "./src/commands/handler.js";
const localStore = {
    messages: {},
    groupMetadata: {},
    contacts: {}
};
const logger = P.pino({
    level: "silent",
});
const msgRetryCounterCache = new NodeCache();
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
rl.on('close', () => {
    console.log('Readline interface closed');
});
const question = (text) => new Promise((resolve, reject) => {
    try {
        rl.question(text, resolve);
    }
    catch (error) {
        console.error('Error with readline question:', error);
        reject(error);
    }
});
const startWhatsApp = async () => {
    const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);
    const whatsapp = makeWASocket({
        version,
        printQRInTerminal: false,
        logger,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        msgRetryCounterCache,
        generateHighQualityLinkPreview: true,
        getMessage,
    });
    if (!whatsapp.authState.creds.registered) {
        try {
            const phoneNumber = await question("Please enter your phone number:\n");
            const code = await whatsapp.requestPairingCode(phoneNumber);
            console.log(`Pairing code: ${code}`);
        }
        catch (error) {
            console.error("Error getting phone number:", error.message);
            console.log("Continuing without phone number registration...");
        }
    }
    whatsapp.ev.process(async (events) => {
        if (events["connection.update"]) {
            const update = events["connection.update"];
            const { connection, lastDisconnect } = update;
            if (connection === "close") {
                if (lastDisconnect?.error?.output?.statusCode !==
                    DisconnectReason.loggedOut) {
                    console.log("Restarting...");
                    startWhatsApp();
                }
                else {
                    console.log("Connection closed. You are logged out.");
                }
            }
            if (connection === "open") {
                console.log("Success Connect to WhatsApp");
            }
        }
        if (events["creds.update"]) {
            await saveCreds();
        }
        if (events["labels.association"]) {
            console.log(events["labels.association"]);
        }
        if (events["labels.edit"]) {
            console.log(events["labels.edit"]);
        }
        if (events["messaging-history.set"]) {
            const { chats, contacts, messages, isLatest, progress, syncType } = events["messaging-history.set"];
            if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
                console.log("received on-demand history sync, messages=", messages);
            }
            console.log(`recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`);
        }
        if (events["messages.upsert"]) {
            const upsert = events["messages.upsert"];
            if (localStore.groupMetadata && Object.keys(localStore.groupMetadata).length < 1)
                localStore.groupMetadata = await whatsapp.groupFetchAllParticipating();
            if (!!upsert.requestId) {
                console.log("placeholder message received for request of id=" + upsert.requestId, upsert);
            }
            for (let msg of upsert.messages) {
                const jid = msg.key.participant ?? msg.key.remoteJid;
                if (jid) {
                    if (!localStore.messages[jid])
                        localStore.messages[jid] = [msg];
                    localStore.messages[jid].push(msg);
                }
                if (upsert.type == "notify") {
                    const processedMessage = await procMsg(msg, whatsapp, localStore);
                    if (!processedMessage)
                        return;
                    await handler.handleCommand(processedMessage, whatsapp, localStore);
                    prMsg(processedMessage);
                }
            }
        }
        if (events["messages.update"]) {
            for (const { update } of events["messages.update"]) {
                if (update.pollUpdates) {
                    const pollCreation = {};
                    if (pollCreation) {
                        console.log("got poll update, aggregation: ", getAggregateVotesInPollMessage({
                            message: pollCreation,
                            pollUpdates: update.pollUpdates,
                        }));
                    }
                }
            }
        }
        if (events["contacts.update"]) {
            for (const contact of events["contacts.update"]) {
                if (typeof contact.imgUrl !== "undefined") {
                    const newUrl = contact.imgUrl === null
                        ? null
                        : await whatsapp.profilePictureUrl(contact.id).catch(() => null);
                    console.log(`contact ${contact.id} has a new profile pic: ${newUrl}`);
                }
            }
        }
        if (events["group-participants.update"]) {
            const { id, participants } = events["group-participants.update"];
            for (const participant of participants) {
                try {
                    const welcomeMessage = `Hello @${participant.split('@')[0]}! Welcome to the group! 🎉\n\nPlease read the group description and follow the rules.`;
                    await whatsapp.sendMessage(id, {
                        text: welcomeMessage,
                        mentions: [participant]
                    });
                }
                catch (e) {
                    console.error("Error sending welcome message:", e);
                }
            }
        }
        if (events["chats.delete"]) {
            console.log("chats deleted ", events["chats.delete"]);
        }
    });
    return whatsapp;
    async function getMessage() {
        return proto.Message.create({ conversation: "test" });
    }
};
startWhatsApp();
