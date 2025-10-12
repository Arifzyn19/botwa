import dotenv from "dotenv";
dotenv.config();
import NodeCache from "@cacheable/node-cache";
import * as readline from "readline";
import { DisconnectReason, jidNormalizedUser, fetchLatestBaileysVersion, getAggregateVotesInPollMessage, makeCacheableSignalKeyStore, proto, useMultiFileAuthState, } from "baileys";
import makeWASocket from './src/utils/socket.js';
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
const LocalStore = {
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
    async function getMessage(key) {
        if (!key.remoteJid || !key.id)
            return undefined;
        return proto.Message.fromObject({ conversation: "test" });
    }
    const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);
    const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
    const config = {
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
        cachedGroupMetadata: async (jid) => Promise.resolve(groupCache.get(jid)),
    };
    const whatsapp = await makeWASocket(config);
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
            if (LocalStore.groupMetadata && Object.keys(LocalStore.groupMetadata).length < 1)
                LocalStore.groupMetadata = await whatsapp.groupFetchAllParticipating();
            if (!!upsert.requestId) {
                console.log("placeholder message received for request of id=" + upsert.requestId, upsert);
            }
            for (let msg of upsert.messages) {
                const jid = msg.key.participant ?? msg.key.remoteJid;
                if (jid) {
                    if (jid && !LocalStore.messages[jid])
                        LocalStore.messages[jid] = [msg];
                    LocalStore.messages[jid].push(msg);
                }
                if (upsert.type == "notify") {
                    const processedMessage = await procMsg(msg, whatsapp, LocalStore);
                    if (!processedMessage)
                        return;
                    const oldSock = whatsapp;
                    if (processedMessage.isGroup) {
                        const store = processedMessage?.metadata;
                        if (store) {
                            const metadata = await whatsapp.groupMetadata(processedMessage.chat);
                            if (typeof store.ephemeralDuration === "undefined")
                                store.ephemeralDuration = 0;
                            if (store.ephemeralDuration && store.ephemeralDuration !== metadata?.ephemeralDuration) {
                                console.log(`ephemeralDuration for ${processedMessage.chat} has changed!\nupdate groupMetadata...`);
                                if (processedMessage)
                                    processedMessage.metadata = metadata;
                                console.log(processedMessage.metadata?.ephemeralDuration);
                                groupCache.set(processedMessage.chat, metadata);
                            }
                        }
                    }
                    const originalSendMessage = whatsapp.sendMessage.bind(whatsapp);
                    whatsapp.sendMessage = async (jid, content, options = {}) => {
                        return originalSendMessage(jid, content, {
                            ...options,
                            ephemeralExpiration: processedMessage.isGroup
                                ? (processedMessage.metadata && processedMessage.metadata.ephemeralDuration) || null
                                : (processedMessage.message[processedMessage.type]?.contextInfo?.expiration) || null,
                        });
                    };
                    await handler.handleCommand(processedMessage, whatsapp, LocalStore);
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
        if (events["contacts.upsert"]) {
            const update = events["contacts.upsert"];
            for (let contact of update) {
                let id = jidNormalizedUser(contact.id);
                if (LocalStore && LocalStore.contacts)
                    LocalStore.contacts[id] = { ...(contact || {}), isContact: true };
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
                let id = jidNormalizedUser(contact.id);
                if (LocalStore && LocalStore.contacts)
                    LocalStore.contacts[id] = {
                        ...(LocalStore.contacts?.[id] || {}),
                        ...(contact || {}),
                    };
            }
        }
        if (events["groups.upsert"]) {
            const newGroups = events["groups.upsert"];
            for (const groupMetadata of newGroups) {
                try {
                    groupCache.set(groupMetadata.id, groupMetadata);
                    LocalStore.groupMetadata[groupMetadata.id] = groupMetadata;
                }
                catch (error) {
                    console.error(`[GROUPS.UPSERT] Error adding group ${groupMetadata.id}:`, error);
                }
            }
        }
        if (events["groups.update"]) {
            const updates = events["groups.update"];
            for (const update of updates) {
                const id = update.id;
                if (!id)
                    continue;
                try {
                    const metadata = await whatsapp.groupMetadata(id);
                    groupCache.set(id, metadata);
                    if (LocalStore.groupMetadata[id]) {
                        LocalStore.groupMetadata[id] = {
                            ...(LocalStore.groupMetadata[id] || {}),
                            ...metadata,
                        };
                    }
                    else {
                        LocalStore.groupMetadata[id] = metadata;
                    }
                }
                catch (error) {
                    console.error(`[GROUPS.UPDATE] Error updating group ${id}:`, error);
                }
            }
        }
        if (events["group-participants.update"]) {
            const { id, participants, action } = events["group-participants.update"];
            if (id) {
                try {
                    const metadata = await whatsapp.groupMetadata(id);
                    groupCache.set(id, metadata);
                    LocalStore.groupMetadata[id] = metadata;
                    if (LocalStore.groupMetadata[id] && LocalStore.groupMetadata[id].participants) {
                        switch (action) {
                            case "add":
                                LocalStore.groupMetadata[id].participants.push(...participants.map((jid) => ({
                                    id: jidNormalizedUser(jid),
                                    admin: null,
                                })));
                                break;
                            case "demote":
                                for (const participant of LocalStore.groupMetadata[id].participants) {
                                    let participantId = jidNormalizedUser(participant.id);
                                    if (participants.includes(participantId)) {
                                        participant.admin = null;
                                    }
                                }
                                break;
                            case "promote":
                                for (const participant of LocalStore.groupMetadata[id].participants) {
                                    let participantId = jidNormalizedUser(participant.id);
                                    if (participants.includes(participantId)) {
                                        participant.admin = "admin";
                                    }
                                }
                                break;
                            case "remove":
                                LocalStore.groupMetadata[id].participants = LocalStore.groupMetadata[id].participants.filter((p) => !participants.includes(jidNormalizedUser(p.id)));
                                break;
                        }
                    }
                }
                catch (error) {
                    console.error(`[GROUP-PARTICIPANTS.UPDATE] Error processing group ${id}:`, error);
                }
            }
        }
        if (events["chats.delete"]) {
            console.log("chats deleted ", events["chats.delete"]);
        }
    });
    return whatsapp;
};
startWhatsApp();
