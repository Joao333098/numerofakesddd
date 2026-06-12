const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { JsonDatabase } = require('wio.db');
const path = require('path');
const fs = require('fs');

// Tenta ler token do DataBaseJson (onde o admin salva), fallback pro config.json da raiz
let botToken = null;
try {
  const dbConfig = new JsonDatabase({ databasePath: './DataBaseJson/config.json' });
  botToken = dbConfig.get('bot.token');
} catch (e) {}
if (!botToken) {
  try {
    const rootConfig = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    botToken = rootConfig.token;
  } catch (e) {}
}
if (!botToken) {
  console.error('❌ Token do bot não encontrado. Configure em /admin');
}

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

if (botToken) {
  client.login(botToken).catch((err) => {
      console.error('❌ Erro ao logar o bot. Verifique o token no config.json');
      console.error(err);
  });
} else {
  console.error('❌ Bot não iniciado: token não configurado');
}
