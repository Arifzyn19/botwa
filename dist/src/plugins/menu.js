import cmd from "../commands/map.js";
cmd.add({
    name: "menu",
    alias: ["help", "list"],
    category: ["info"],
    desc: "Show all commands or filter by category with detailed information",
    async run({ m, args }) {
        const commands = cmd.values();
        if (args.length > 0) {
            const targetCategory = args[0].toLowerCase();
            const filteredCommands = commands.filter((cmd) => cmd.category && Array.isArray(cmd.category) && cmd.category.map(c => c.toLowerCase()).includes(targetCategory));
            if (filteredCommands.length === 0) {
                return m.reply(`No commands found in category: ${targetCategory}`);
            }
            const categoryCommands = filteredCommands
                .map(cmd => {
                const aliases = cmd.alias ? `\n  🏷️ *Aliases:* ${cmd.alias.join(', ')}` : '';
                const usage = cmd.usage ? `\n  📋 *Usage:* ${cmd.usage}` : '';
                const example = cmd.example ? `\n  💡 *Example:* ${cmd.example}` : '';
                const permissions = [];
                if (cmd.isOwner)
                    permissions.push('owner only');
                if (cmd.isGroup)
                    permissions.push('group only');
                if (cmd.isPrivate)
                    permissions.push('private chat only');
                if (cmd.isSelf)
                    permissions.push('self only');
                const permText = permissions.length > 0 ? `\n  🔐 *Permissions:* ${permissions.join(', ')}` : '';
                return `• *${cmd.name}*\n  📝 ${cmd.desc || 'No description'}${usage}${example}${aliases}${permText}`;
            })
                .join('\n\n');
            const response = `*📁 ${targetCategory.toUpperCase()} Commands*\n\n${categoryCommands}\n\nTotal: ${filteredCommands.length} command(s)`;
            return m.reply(response);
        }
        const commandsByCategory = {};
        commands.forEach(command => {
            if (command.category) {
                command.category.forEach(cat => {
                    if (!commandsByCategory[cat]) {
                        commandsByCategory[cat] = [];
                    }
                    commandsByCategory[cat].push(command);
                });
            }
            else {
                if (!commandsByCategory['uncategorized']) {
                    commandsByCategory['uncategorized'] = [];
                }
                commandsByCategory['uncategorized'].push(command);
            }
        });
        let menuText = "*🤖 BOTWA COMMAND MENU*\n\n";
        const categories = Object.keys(commandsByCategory).sort();
        for (const category of categories) {
            const categoryCommands = commandsByCategory[category];
            menuText += `*📁 ${category.toUpperCase()} (${categoryCommands.length})*\n`;
            for (const command of categoryCommands) {
                const aliases = command.alias ? ` | ${command.alias.join(', ')}` : '';
                const permissions = [];
                if (command.isOwner)
                    permissions.push('owner');
                if (command.isGroup)
                    permissions.push('group');
                if (command.isPrivate)
                    permissions.push('private');
                if (command.isSelf)
                    permissions.push('self');
                const permText = permissions.length > 0 ? ` (${permissions.join(', ')})` : '';
                const usage = command.usage ? ` | 📋 ${command.usage}` : '';
                menuText += `  • *${command.name}*${aliases}${permText}${usage}\n    📝 ${command.desc || 'No description'}\n`;
            }
            menuText += '\n';
        }
        menuText += `*💡 Usage:* To see commands in a specific category, use: .menu [category]\n`;
        menuText += `*📋 Example:* .menu info\n`;
        menuText += `\n*📊 Total Commands:* ${commands.length}`;
        m.reply(menuText);
    },
});
