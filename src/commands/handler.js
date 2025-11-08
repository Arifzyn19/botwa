import cmd from "./map.js";
import { botDb } from "../utils/db.js";

class CommandHandler {
  async handleCommand(processedMessage, socket, store) {
    if (
      process.env.isSelf &&
      processedMessage.sender.split("@")[0] !== process.env.OWNER
    )
      return;

    const messageText = processedMessage.body.trim() || "";
    const parseResult = this.parseCommand(messageText);
    const commandName = parseResult[0];
    const args = parseResult[1];
    const text = args.join(" ") || "";
    
    const context = {
      m: processedMessage,
      sock: socket,
      store: store,
      db: botDb, 
      text,
      args,
      command: commandName,
      isCmd: this.isCommand(messageText),
    };
    
    if (processedMessage.sender) {
      try {
        await botDb.getUser(processedMessage.sender);
      } catch (error) {
        console.error("Error auto-saving user:", error);
      }
    }
    
    if (processedMessage.isGroup && processedMessage.chat) {
      try {
        await botDb.getGroup(processedMessage.chat);
      } catch (error) {
        console.error("Error auto-saving group:", error);
      }
    }
    
    if (processedMessage.sender) {
      try {
        const isBanned = await botDb.isBanned(processedMessage.sender);
        if (isBanned) {
          const user = await botDb.getUser(processedMessage.sender);
          await processedMessage.reply(
            `❌ Kamu dibanned!\nAlasan: ${user.banReason || "No reason"}`
          );
          return;
        }
      } catch (error) {
        console.error("Error checking ban status:", error);
      }
    }
    
    if (processedMessage.sender) {
      try {
        const user = await botDb.getUser(processedMessage.sender);
        await botDb.updateUser(processedMessage.sender, {
          stats: {
            ...user.stats,
            messages: user.stats.messages + 1,
          },
          lastChat: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Error updating user stats:", error);
      }
    }
    
    for (const command of cmd.values()) {
      if (command.middleware) {
        await Promise.resolve(command.middleware(context));
      }
    }

    if (!this.isCommand(messageText)) return;

    const foundCommand = cmd
      .values()
      .find((plugin) =>
        plugin?.name
          ? plugin.name.toLowerCase().trim() ===
            commandName.toLowerCase().trim()
          : plugin?.alias &&
            plugin.alias
              .map((a) => a.toLowerCase().trim())
              .includes(commandName.toLowerCase().trim()),
      );

    if (!foundCommand) return;

    try {
      if (foundCommand.run) {
        if (!this.checkPermissions(foundCommand, processedMessage)) {
          processedMessage.reply(
            "❌ You do not have permission to use this command."
          );
          return;
        }

        // Check if command requires registration
        if (foundCommand.isRegistered) {
          const user = await botDb.getUser(processedMessage.sender);
          if (!user.registered) {
            await processedMessage.reply(
              "❌ Kamu belum register! Ketik .register <nama>|<umur>"
            );
            return;
          }
        }

        // Check limit
        if (foundCommand.useLimit) {
          const user = await botDb.getUser(processedMessage.sender);
          if (!user.premium && user.limit < 1) {
            await processedMessage.reply(
              `❌ Limit kamu habis!\nLimit: ${user.limit}\n\nUpgrade ke premium untuk unlimited limit!`
            );
            return;
          }

          // Use limit
          if (!user.premium) {
            const success = await botDb.useLimit(processedMessage.sender, 1);
            if (!success) {
              await processedMessage.reply("❌ Limit tidak cukup!");
              return;
            }
          }
        }
        
        await Promise.resolve(foundCommand.run(context));
        
        if (processedMessage.sender) {
          try {
            const user = await botDb.getUser(processedMessage.sender);
            await botDb.updateUser(processedMessage.sender, {
              stats: {
                ...user.stats,
                commands: user.stats.commands + 1,
              },
            });
            
            const expGain = foundCommand.exp || 10;
            const result = await botDb.addExp(processedMessage.sender, expGain);
            
            if (result.levelUp) {
              await processedMessage.reply(
                `🎉 *LEVEL UP!*\nLevel: ${result.currentLevel} ➜ ${result.newLevel}`
              );
            }
          } catch (error) {
            console.error("Error updating command stats:", error);
          }
        }
      }
    } catch (error) {
      console.error(`Error executing command '${commandName}':`, error);
      processedMessage.reply(
        `❌ An error occurred while executing the command: ${error.message}`
      );
    }
  }

  isCommand(text) {
    return /^(!|\/|\.)/.test(text);
  }

  parseCommand(text) {
    const args = text.slice(1).trim().split(/\s+/);
    const commandName = args.shift()?.toLowerCase() || "";
    return [commandName, args];
  }

  checkPermissions(command, message) {
    if (command.isOwner && message.sender.split("@")[0] !== process.env.OWNER) {
      return false;
    }
    if (command.isGroup && !message.isGroup) {
      return false;
    }
    if (command.isPrivate && message.isGroup) {
      return false;
    }
    if (command.isSelf && !message.fromMe) {
      return false;
    }
    return true;
  }
}

export default new CommandHandler();