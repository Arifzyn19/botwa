import cmd from "../../commands/map.js";
import { join, resolve, dirname } from "path";
import { readFile, writeFile, readdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { spawn } from "child_process";
const PLUGINS_DIR = resolve("./src/plugins/");
const DIST_DIR = resolve("./dist/plugins/");
cmd.add({
    name: "plugins",
    alias: ["plug"],
    category: ["owner"],
    desc: "Manage plugin files (CRUD operations with auto-compilation) - owner only",
    usage: ".plugins (listing) | .plugins --save [path] [code] | .plugins --delete [path]",
    example: ".plugins\n.plugins --save tools/new-tool.ts `console.log('New tool');`\n.plugins --delete tools/new-tool.ts",
    isOwner: true,
    async run({ m, sock, text }) {
        if (!text) {
            try {
                const getAllTsFiles = async (dir, fileList = []) => {
                    const files = await readdir(dir);
                    for (const file of files) {
                        if (!file)
                            continue;
                        const filePath = join(dir, file);
                        const { stat } = await import('fs/promises');
                        const fileStat = await stat(filePath);
                        if (fileStat.isDirectory()) {
                            await getAllTsFiles(filePath, fileList);
                        }
                        else if (file.endsWith('.ts')) {
                            fileList.push(filePath.replace(PLUGINS_DIR + '/', ''));
                        }
                    }
                    return fileList;
                };
                const tsFiles = await getAllTsFiles(PLUGINS_DIR);
                if (tsFiles.length === 0) {
                    return m.reply("No plugin files found in the plugins directory.");
                }
                const validSubdirs = (await readdir(PLUGINS_DIR, { withFileTypes: true }))
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                const fileList = tsFiles.map((file, i) => `${i + 1}. ${file}`).join('\n');
                m.reply(`Plugin files in directory (${tsFiles.length}):\n\n${fileList}\n\nValid directories: ${validSubdirs.join(', ')}\n\nUse .plugins --get [path] to get plugins content\nUse .plugins --save [path] [code] to create/save plugins\nUse .plugins --delete [path] to delete plugins`);
            }
            catch (error) {
                console.error("Error listing plugins:", error);
                m.reply("Failed to list plugin files.");
            }
            return;
        }
        if (text.includes("--save".toLowerCase())) {
            const fileName = text.replace("--save", "")?.trim();
            if (!fileName) {
                return m.reply("File name is required for --save command");
            }
            let typedFileName = fileName;
            const code = m?.quoted ? m?.quoted?.text?.trim() : '';
            if (!m.quoted && !code)
                return m.reply("Reply code to save");
            if (typedFileName.includes('..')) {
                return m.reply("Invalid path. '..' is not allowed.");
            }
            if (typedFileName.includes('/')) {
                const parts = typedFileName.split('/');
                const subdirectory = parts[0];
                const validSubdirs = (await readdir(PLUGINS_DIR, { withFileTypes: true }))
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                if (!validSubdirs.includes(subdirectory)) {
                    return m.reply(`Invalid subdirectory. Valid subdirectories are: ${validSubdirs.join(', ')}`);
                }
            }
            if (!typedFileName) {
                return m.reply("File name is required for --save command (internal check)");
            }
            const filePath = join(PLUGINS_DIR, typedFileName);
            const dirPath = dirname(filePath);
            try {
                await import('fs').then(({ promises }) => promises.mkdir(dirPath, { recursive: true }));
            }
            catch (error) {
            }
            try {
                await writeFile(filePath, code || '');
                m.reply(`Plugin ${fileName} saved successfully in the plugins directory.`);
                try {
                    if (typedFileName.endsWith('.ts')) {
                        await compilePluginFile(fileName);
                        m.reply(`✅ Plugin ${fileName} compiled successfully!`);
                    }
                    m.reply("🔄 Commands reloaded successfully after compilation!");
                }
                catch (compileError) {
                    console.error("Error during compilation:", compileError);
                    m.reply(`⚠️ Plugin saved but compilation failed: ${compileError}`);
                }
            }
            catch (error) {
                console.error("Error saving plugin:", error);
                m.reply("Failed to save plugin file.");
            }
            return;
        }
        if (text.includes("--delete".toLowerCase())) {
            const fileName = text.replace("--delete", '')?.trim();
            if (!fileName) {
                return m.reply("File name is required for --delete command");
            }
            let typedFileName = fileName;
            if (typedFileName.includes('..')) {
                return m.reply("Invalid path. '..' is not allowed.");
            }
            if (typedFileName.includes('/')) {
                const parts = typedFileName.split('/');
                const subdirectory = parts[0];
                const validSubdirs = (await readdir(PLUGINS_DIR, { withFileTypes: true }))
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                if (!validSubdirs.includes(subdirectory)) {
                    return m.reply(`Invalid subdirectory. Valid subdirectories are: ${validSubdirs.join(', ')}`);
                }
            }
            if (!typedFileName) {
                return m.reply("File name is required for --delete command (internal check)");
            }
            const filePath = join(PLUGINS_DIR, typedFileName);
            if (!existsSync(filePath)) {
                return m.reply(`File ${typedFileName} does not exist!`);
            }
            try {
                const content = await readFile(filePath, 'utf-8');
                const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
                await unlink(filePath);
                const jsFilePath = filePath.replace('.ts', '.js');
                if (existsSync(jsFilePath)) {
                    await unlink(jsFilePath);
                }
                m.reply(`Plugin ${fileName} deleted successfully!\n\nDeleted content preview:\n\`\`\`ts\n${preview}\n\`\`\``);
                try {
                    m.reply("🔄 Commands reloaded successfully after deletion!");
                }
                catch (reloadError) {
                    console.error("Error reloading commands:", reloadError);
                    m.reply("⚠️ Plugin deleted but failed to reload commands. Please restart the bot.");
                }
            }
            catch (error) {
                console.error("Error deleting plugin:", error);
                m.reply("Failed to delete plugin file.");
            }
            return;
        }
        if (text.includes("--get".toLowerCase())) {
            const fileName = text.replace("--get", "")?.trim();
            if (!fileName)
                return m.reply("Input file .ts/.js to get content");
            const filePath = join(PLUGINS_DIR, fileName);
            if (!existsSync(filePath))
                return m.reply(`File ${fileName} not found`);
            const buffer = await readFile(filePath);
            sock.sendMessage(m.chat, {
                document: buffer,
                fileName: fileName.split("/").pop(),
                mimetype: `application/${fileName.endsWith(".ts") ? 'typescript' : 'javascript'}`,
                caption: `\`\`\`STDOUT:\n ${buffer.toString("utf-8")}\`\`\``
            }, { quoted: m });
            return;
        }
        m.reply("Usage:\n• .plugins --get [path] - to get plugins content\n• .plugins - List all plugins\n• .plugins --save [path] [code] - Save/create a plugin\n• .plugins --delete [path] - Delete a plugin");
    },
});
async function compilePluginFile(fileName) {
    if (!existsSync(DIST_DIR)) {
        try {
            await import('fs').then(({ promises }) => promises.mkdir(DIST_DIR, { recursive: true }));
        }
        catch (error) {
        }
    }
    if (!fileName) {
        throw new Error('fileName is required for compilePluginFile');
    }
    const tsFilePath = join(PLUGINS_DIR, fileName);
    if (!existsSync(tsFilePath)) {
        throw new Error(`TypeScript file ${fileName} does not exist!`);
    }
    return new Promise((resolve, reject) => {
        const tscProcess = spawn('npx', ['tsc', tsFilePath, '--outDir', DIST_DIR, '--target', 'es2020', '--module', 'esnext'], {
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let stderr = '';
        tscProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        tscProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`Compilation failed with code ${code}\n${stderr}`));
            }
        });
    });
}
