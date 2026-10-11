// handlers/botlog.js
// One place every BSCH bot action is written down: commands, button presses,
// pastes, and the things the bot does on its own (leaving servers, closing
// unclaimed cases). Lives in the main server's bot log channel.
//
// Logging must never break the thing being logged, so every failure here is
// swallowed.

const COLOURS = {
    command: 0x2f6bff,
    button: 0x5865f2,
    auto: 0xf1c40f,
    leave: 0xe67e22,
    error: 0xe74c3c,
    done: 0x2ecc71,
};

async function botLog(client, config, { kind = "auto", title, description, fields, user, guild }) {
    try {
        const id = config.channels && config.channels.botLogChannel;
        if (!id) return;
        const channel = await client.channels.fetch(id).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const extra = [];
        if (user) extra.push({ name: "By", value: `<@${user.id}> (${user.tag || user.username})`, inline: true });
        if (guild && guild.id !== config.guildId) {
            extra.push({ name: "Server", value: `${guild.name} (${guild.id})`, inline: true });
        }

        await channel.send({
            embeds: [{
                title: String(title || "Bot action").slice(0, 256),
                description: description ? String(description).slice(0, 4000) : undefined,
                color: COLOURS[kind] || COLOURS.auto,
                fields: [...extra, ...(fields || [])].slice(0, 25),
                timestamp: new Date().toISOString(),
            }],
            allowedMentions: { parse: [] },
        });
    } catch {
        // never let a log failure stop the bot
    }
}

// "/pasteserver template: Site-19" style summary of a slash command
function describeCommand(interaction) {
    const parts = [`/${interaction.commandName}`];
    const walk = options => {
        for (const o of options || []) {
            if (o.options) {
                parts.push(o.name);
                walk(o.options);
            } else {
                let value = o.value;
                if (o.user) value = `@${o.user.username}`;
                else if (o.channel) value = `#${o.channel.name}`;
                else if (o.role) value = `@${o.role.name}`;
                else if (o.attachment) value = o.attachment.name;
                parts.push(`${o.name}: ${String(value).slice(0, 200)}`);
            }
        }
    };
    walk(interaction.options.data);
    return parts.join(" ");
}

function logInteraction(interaction, client, config) {
    const where = interaction.channel ? ` in <#${interaction.channel.id}>` : " in DMs";
    if (interaction.isChatInputCommand()) {
        return botLog(client, config, {
            kind: "command",
            title: "Command used",
            description: `\`${describeCommand(interaction)}\`${where}`,
            user: interaction.user,
            guild: interaction.guild,
        });
    }
    const label = interaction.isModalSubmit() ? "Form sent" : interaction.isButton() ? "Button pressed" : "Option picked";
    return botLog(client, config, {
        kind: "button",
        title: label,
        description: `\`${interaction.customId}\`${where}`,
        user: interaction.user,
        guild: interaction.guild,
    });
}

module.exports = { botLog, logInteraction };
