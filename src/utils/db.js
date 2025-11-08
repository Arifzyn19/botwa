import { db } from "../lib/database.js";
import { createSchema } from "./schema.js";

/**
 * Database Schemas untuk Bot WhatsApp
 */
export const schemas = {
  users: createSchema({
    id: "",
    jid: "",
    name: "Guest",
    age: 0,
    registered: false,
    premium: false,
    banned: false,
    limit: 10,
    exp: 0,
    level: 1,
    role: "user",
    lastChat: null,
    profile: {
      bio: "",
      avatar: null,
      country: "",
    },
    stats: {
      commands: 0,
      messages: 0,
    },
    inventory: [],
    settings: {
      notifications: true,
      language: "id",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),

  groups: createSchema({
    id: "",
    name: "",
    desc: "",
    owner: "",
    members: [],
    admins: [],
    settings: {
      welcome: false,
      goodbye: false,
      antilink: false,
      antidelete: false,
      mute: false,
      nsfw: false,
    },
    messages: {
      welcome: "Welcome @user to @group!",
      goodbye: "Goodbye @user!",
    },
    rules: [],
    warnings: {},
    stats: {
      messages: 0,
      commands: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),

  chats: createSchema({
    id: "",
    jid: "",
    type: "private", // private or group
    lastMessage: null,
    unreadCount: 0,
    muted: false,
    pinned: false,
    archived: false,
    lastActivity: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),

  settings: createSchema({
    id: "bot_settings",
    botName: "WhatsApp Bot",
    ownerNumber: "",
    prefix: ["!", ".", "/"],
    mode: "public", // public or self
    maxLimit: 20,
    maintenance: false,
    autoread: false,
    autoTyping: false,
    autoRecording: false,
    features: {
      ai: true,
      downloader: true,
      game: true,
      tools: true,
    },
    apiKeys: {},
    database: {
      autoBackup: false,
      backupInterval: 86400000, // 24 hours
      lastBackup: null,
    },
    updatedAt: new Date().toISOString(),
  }),
};

/**
 * Database helper untuk bot WhatsApp
 */
export class BotDatabase {
  constructor() {
    // Initialize tables dengan schema
    this.users = db.get("users", schemas.users.getDefaults());
    this.groups = db.get("groups", schemas.groups.getDefaults());
    this.chats = db.get("chats", schemas.chats.getDefaults());
    this.settings = db.get("settings", schemas.settings.getDefaults());
  }

  /**
   * Get atau create user data
   * @param {string} jid - WhatsApp JID
   * @returns {Promise<object>}
   */
  async getUser(jid) {
    const userId = jid.split("@")[0];
    let user = await this.users.get("id", userId);

    if (!user) {
      // Create new user dengan schema default
      user = schemas.users.create({
        id: userId,
        jid: jid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.users.set("id", userId, user);
    }

    return user;
  }

  /**
   * Update user data
   * @param {string} jid - WhatsApp JID
   * @param {object} data - Data yang mau diupdate
   * @returns {Promise<string>}
   */
  async updateUser(jid, data) {
    const userId = jid.split("@")[0];
    const user = await this.getUser(jid);
    
    // Merge dengan schema untuk validasi
    const updatedUser = schemas.users.merge({
      ...user,
      ...data,
      updatedAt: new Date().toISOString(),
    });

    return await this.users.set("id", userId, updatedUser);
  }

  /**
   * Get atau create group data
   * @param {string} groupJid - Group JID
   * @returns {Promise<object>}
   */
  async getGroup(groupJid) {
    let group = await this.groups.get("id", groupJid);

    if (!group) {
      group = schemas.groups.create({
        id: groupJid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.groups.set("id", groupJid, group);
    }

    return group;
  }

  /**
   * Update group data
   * @param {string} groupJid - Group JID
   * @param {object} data - Data yang mau diupdate
   * @returns {Promise<string>}
   */
  async updateGroup(groupJid, data) {
    const group = await this.getGroup(groupJid);
    
    const updatedGroup = schemas.groups.merge({
      ...group,
      ...data,
      updatedAt: new Date().toISOString(),
    });

    return await this.groups.set("id", groupJid, updatedGroup);
  }

  /**
   * Update group settings
   * @param {string} groupJid - Group JID
   * @param {object} settings - Settings yang mau diupdate
   * @returns {Promise<string>}
   */
  async updateGroupSettings(groupJid, settings) {
    const group = await this.getGroup(groupJid);
    
    const updatedGroup = schemas.groups.merge({
      ...group,
      settings: {
        ...group.settings,
        ...settings,
      },
      updatedAt: new Date().toISOString(),
    });

    return await this.groups.set("id", groupJid, updatedGroup);
  }

  /**
   * Get bot settings
   * @returns {Promise<object>}
   */
  async getSettings() {
    let settings = await this.settings.get("id", "bot_settings");

    if (!settings) {
      settings = schemas.settings.create({
        id: "bot_settings",
        updatedAt: new Date().toISOString(),
      });
      await this.settings.set("id", "bot_settings", settings);
    }

    return settings;
  }

  /**
   * Update bot settings
   * @param {object} data - Settings yang mau diupdate
   * @returns {Promise<string>}
   */
  async updateSettings(data) {
    const settings = await this.getSettings();
    
    const updatedSettings = schemas.settings.merge({
      ...settings,
      ...data,
      updatedAt: new Date().toISOString(),
    });

    return await this.settings.set("id", "bot_settings", updatedSettings);
  }

  /**
   * Add exp ke user
   * @param {string} jid - WhatsApp JID
   * @param {number} amount - Jumlah exp
   * @returns {Promise<object>} - { levelUp: boolean, newLevel: number }
   */
  async addExp(jid, amount) {
    const user = await this.getUser(jid);
    const newExp = user.exp + amount;
    
    // Level calculation
    const currentLevel = user.level;
    const newLevel = Math.floor(Math.sqrt(newExp / 100)) + 1;
    const levelUp = newLevel > currentLevel;

    await this.updateUser(jid, {
      exp: newExp,
      level: newLevel,
    });

    return {
      levelUp,
      newLevel,
      currentLevel,
      exp: newExp,
    };
  }

  /**
   * Add limit ke user
   * @param {string} jid - WhatsApp JID
   * @param {number} amount - Jumlah limit
   * @returns {Promise<void>}
   */
  async addLimit(jid, amount) {
    const user = await this.getUser(jid);
    await this.updateUser(jid, {
      limit: user.limit + amount,
    });
  }

  /**
   * Use limit dari user
   * @param {string} jid - WhatsApp JID
   * @param {number} amount - Jumlah limit yang dipakai
   * @returns {Promise<boolean>} - true jika berhasil, false jika limit tidak cukup
   */
  async useLimit(jid, amount = 1) {
    const user = await this.getUser(jid);
    
    if (user.premium) return true; // Premium user unlimited
    if (user.limit < amount) return false;

    await this.updateUser(jid, {
      limit: user.limit - amount,
    });

    return true;
  }

  /**
   * Get all users
   * @returns {Promise<object[]>}
   */
  async getAllUsers() {
    return await this.users.all();
  }

  /**
   * Get all groups
   * @returns {Promise<object[]>}
   */
  async getAllGroups() {
    return await this.groups.all();
  }

  /**
   * Count total users
   * @returns {Promise<number>}
   */
  async countUsers() {
    return await this.users.count();
  }

  /**
   * Count registered users
   * @returns {Promise<number>}
   */
  async countRegisteredUsers() {
    const users = await this.getAllUsers();
    return users.filter(u => u.registered).length;
  }

  /**
   * Count premium users
   * @returns {Promise<number>}
   */
  async countPremiumUsers() {
    const users = await this.getAllUsers();
    return users.filter(u => u.premium).length;
  }

  /**
   * Count total groups
   * @returns {Promise<number>}
   */
  async countGroups() {
    return await this.groups.count();
  }

  /**
   * Ban user
   * @param {string} jid - WhatsApp JID
   * @param {string} reason - Alasan ban
   * @returns {Promise<void>}
   */
  async banUser(jid, reason = "No reason") {
    await this.updateUser(jid, {
      banned: true,
      banReason: reason,
      bannedAt: new Date().toISOString(),
    });
  }

  /**
   * Unban user
   * @param {string} jid - WhatsApp JID
   * @returns {Promise<void>}
   */
  async unbanUser(jid) {
    await this.updateUser(jid, {
      banned: false,
      banReason: null,
      bannedAt: null,
    });
  }

  /**
   * Check if user is banned
   * @param {string} jid - WhatsApp JID
   * @returns {Promise<boolean>}
   */
  async isBanned(jid) {
    const user = await this.getUser(jid);
    return user.banned;
  }

  /**
   * Delete user
   * @param {string} jid - WhatsApp JID
   * @returns {Promise<boolean>}
   */
  async deleteUser(jid) {
    const userId = jid.split("@")[0];
    return await this.users.delete("id", userId);
  }

  /**
   * Delete group
   * @param {string} groupJid - Group JID
   * @returns {Promise<boolean>}
   */
  async deleteGroup(groupJid) {
    return await this.groups.delete("id", groupJid);
  }

  /**
   * Get schema info
   * @param {string} tableName - Nama tabel
   * @returns {object}
   */
  getSchemaInfo(tableName) {
    return schemas[tableName]?.info() || null;
  }
}

export const botDb = new BotDatabase(); 