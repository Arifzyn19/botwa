import cmd, {} from "../commands/map.js";
cmd.add({
    name: "test",
    alias: ["test"],
    category: ["test"],
    desc: "Test command",
    async run({ m }) {
        m.reply("Test command works!");
    },
});
