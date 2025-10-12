import cmd from "./map.js";
class CommandHandler {
    async handleCommand(processedMessage, socket, store) {
        if (process.env.isSelf && processedMessage.sender.split("@")[0] !== process.env.OWNER)
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
            text,
            args,
            command: commandName,
            isCmd: this.isCommand(messageText),
        };
        for (const command of cmd.values()) {
            if (command.middleware) {
                await Promise.resolve(command.middleware(context));
            }
        }
        if (!this.isCommand(messageText))
            return;
        const foundCommand = cmd
            .values()
            .find((plugin) => plugin?.name
            ? plugin.name.toLowerCase().trim() ===
                commandName.toLowerCase().trim()
            : plugin?.alias &&
                plugin.alias
                    .map((a) => a.toLowerCase().trim())
                    .includes(commandName.toLowerCase().trim()));
        if (!foundCommand)
            return;
        try {
            if (foundCommand.run) {
                if (!this.checkPermissions(foundCommand, processedMessage)) {
                    processedMessage.reply("You do not have permission to use this command.");
                    return;
                }
                await Promise.resolve(foundCommand.run(context));
            }
        }
        catch (error) {
            console.error(`Error executing command '${commandName}':`, error);
            processedMessage.reply(`An error occurred while executing the command: ${error.message}`);
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
