const { SlashCommandBuilder } = require("discord.js");
const store = require("../hire/store");
const { updateCaseViews, promptTemplateBank, isSenior, isCaseBuilder } = require("../handlers/hiringhandler");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("paperwork")
        .setDescription("File the closing paperwork for this hire case (Builder).")
        .addStringOption(o =>
            o.setName("servername").setDescription("The name of the server that was built").setRequired(true))
        .addStringOption(o =>
            o.setName("notes").setDescription("Any other closing details").setRequired(false))
        .addAttachmentOption(o =>
            o.setName("image1").setDescription("Screenshot of the finished build").setRequired(false))
        .addAttachmentOption(o =>
            o.setName("image2").setDescription("Another screenshot").setRequired(false))
        .addAttachmentOption(o =>
            o.setName("image3").setDescription("Another screenshot").setRequired(false)),

    async execute(interaction, client, config) {
        const record = store.getCaseByChannel(interaction.channel.id);
        if (!record) {
            return interaction.reply({ content: "❌ Run this inside a hire case ticket.", flags: 64 });
        }
        if (!isCaseBuilder(interaction.member, record, config)) {
            return interaction.reply({ content: "❌ Only Builders on the case can file paperwork.", flags: 64 });
        }

        const serverName = interaction.options.getString("servername");
        const notes = interaction.options.getString("notes") || "";
        const images = ["image1", "image2", "image3"]
            .map(n => interaction.options.getAttachment(n))
            .filter(Boolean)
            .map(a => a.url);

        const updated = store.updateCase(record.ticketId, {
            paperwork: { serverName, notes, images, filedAt: new Date().toISOString() },
            status: "paperwork-filed",
        });
        await updateCaseViews(interaction.guild, updated);

        // Post the paperwork (with images) into the ticket for the record
        await interaction.reply({
            embeds: [{
                title: "📋 Paperwork Filed",
                color: 0x3498db,
                fields: [
                    { name: "Server Name", value: serverName },
                    ...(notes ? [{ name: "Notes", value: notes }] : []),
                    { name: "Images", value: images.length ? `${images.length} attached` : "None" },
                ],
                image: images.length ? { url: images[0] } : undefined,
                timestamp: new Date().toISOString(),
            }],
        });

        // Step 8 — now ask the Lead about the template bank
        await promptTemplateBank(interaction.channel, updated, config);
    },
};
