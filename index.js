const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { JsonDatabase } = require('wio.db');
const config = new JsonDatabase({ databasePath: "./config.json" });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

client.slashCommands = new Collection();

// Carregar Handlers
const eventHandler = require('./Handler/events');
const slashHandler = require('./Handler/slash');

eventHandler.run(client);
slashHandler(client);

client.login(config.get('token')).catch((err) => {
    console.error('❌ Erro ao logar o bot. Verifique o token no config.json');
    console.error(err);
});
