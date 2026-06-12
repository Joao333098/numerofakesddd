const { Client, GatewayIntentBits, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');

const token = process.env.BOT_TOKEN;
const API_BASE = process.env.API_BASE || 'http://localhost:' + (process.env.PORT || 3000);

const GUILD_ID = '1269486391541239881';
const CHANNEL_ID = '1269507229325721640';

if (!token) {
  console.log('[Discord Listener] BOT_TOKEN não definido — listener desativado');
  process.exit(0);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ]
});

async function apiPost(endpoint, body) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(API_BASE + endpoint);
    const options = {
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function apiGet(endpoint) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + endpoint);
    http.get(url.href, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    }).on('error', reject);
  });
}

function buildDeliveryContainer(title, fields, options = {}) {
  const now = new Date();
  const dataStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(title)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(2)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(fields.join('\n'))
    );

  if (options.footer) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1)
    ).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(options.footer + '\n<:celular:1457254465470992425> ' + dataStr)
    );
  }

  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== CHANNEL_ID) return;

  const content = message.content.trim().toUpperCase();
  console.log(`[Discord Listener] Msg in #${message.channel.name}: "${content}"`);
  if (content.length < 4) return;

  try {
    const verify = await apiPost('/api/code/verify', { codigo: content });
    console.log(`[Discord Listener] Verify result:`, JSON.stringify(verify));
    if (!verify || !verify.valid) return;

    console.log(`[Discord Listener] Valid code "${content}" from ${message.author.tag}`);

    await message.delete().catch(() => {});

    const useResult = await apiPost('/api/code/use', {
      codigo: content,
      discordId: message.author.id
    });
    console.log(`[Discord Listener] Use result:`, JSON.stringify(useResult));

    if (!useResult || !useResult.success) {
      await message.author.send('Ocorreu um erro ao processar seu código. Tente novamente.').catch(() => {});
      return;
    }

    // Se o SMS já veio junto (modo OFF), entrega tudo de uma vez
    let smsCode = useResult.codigoSMS || null;
    if (!smsCode && useResult.historyId) {
      const status = await apiGet('/api/code/status/' + useResult.historyId).catch(() => null);
      if (status && status.codigoSMS) smsCode = status.codigoSMS;
    }

    const codigoField = '<:membros_cristalstore:1457254954283700348> Código: `' + content + '`';
    const servicoField = '<:bagdinheiro_cristalstore:1457177684688764948> Serviço: ' + (useResult.serviceName || 'N/A');
    const numeroField = '<:celular:1457254465470992425> Número: ' + (useResult.numero || 'Aguardando...');
    const fields = [codigoField, servicoField, numeroField];
    let footer = null;
    if (smsCode) {
      fields.push('');
      fields.push('<:confirm:1457255097758122058> **Código SMS:** `' + smsCode + '`');
    } else {
      footer = '_Aguardando SMS..._';
    }
    const dmPayload = buildDeliveryContainer('## <:raiobranco_cristalstore:1457177790129373259> Código Resgatado!', fields, { footer });
    const dmSent = await message.author.send(dmPayload).then(() => true).catch(async (err) => {
      console.error(`[Discord Listener] ERRO ao enviar DM para ${message.author.tag}: ${err.message}`);
      await message.channel.send({ content: '<@' + message.author.id + '> Sua DM está fechada!', ...dmPayload }).catch(() => {});
      return false;
    });

    if (smsCode) {
      console.log(`[Discord Listener] SMS entregue para código ${content} para ${message.author.tag}`);
      return;
    }

    if (!useResult.historyId) return;
    const maxAttempts = 24;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 10000));

      try {
        const st = await apiGet('/api/code/status/' + useResult.historyId);
        if (st && st.codigoSMS) {
          const smsFields = [
            '<:celular:1457254465470992425> Número: `' + st.numero + '`',
            '<:confirm:1457255097758122058> **Código SMS:** `' + st.codigoSMS + '`'
          ];
          const smsPayload = buildDeliveryContainer('## 📩 SMS Recebido!', smsFields, { footer: 'Obrigado por usar a Kaeli System!' });
          await message.author.send(smsPayload).catch(() => {
            message.channel.send({ content: '<@' + message.author.id + '>', ...smsPayload }).catch(() => {});
          });
          console.log(`[Discord Listener] SMS entregue para código ${content} para ${message.author.tag}`);
          return;
        }
        if (st && (st.status === 'CANCELADO' || st.status === 'TIMEOUT')) {
          const failFields = ['<:celular:1457254465470992425> Número: `' + (st.numero || 'N/A') + '`'];
          const failPayload = buildDeliveryContainer('## ❌ SMS não recebido', failFields, { footer: 'Entre em contato com o suporte.' });
          await message.author.send(failPayload).catch(() => {});
          return;
        }
      } catch (e) {}
    }

    const timeoutFields = ['<:celular:1457254465470992425> Número: `' + (useResult.numero || 'N/A') + '`'];
    const timeoutPayload = buildDeliveryContainer('## ⏰ Tempo Esgotado', timeoutFields, { footer: 'Entre em contato com o suporte.' });
    await message.author.send(timeoutPayload).catch(() => {});

  } catch (err) {
    console.error('[Discord Listener Error]', err.message);
  }
});

client.once('ready', () => {
  console.log(`[Discord Listener] Logged in as ${client.user.tag}`);
  console.log(`[Discord Listener] Monitoring ${client.guilds.cache.size} guilds:`);
  client.guilds.cache.forEach(g => {
    const hasChannel = g.channels.cache.has(CHANNEL_ID);
    console.log(`  - ${g.name} (${g.id}) ${hasChannel ? '✓ TEM O CANAL' : '✗ SEM O CANAL'}`);
  });
  const targetGuild = client.guilds.cache.get(GUILD_ID);
  if (targetGuild) {
    const channel = targetGuild.channels.cache.get(CHANNEL_ID);
    console.log(`[Discord Listener] Canal alvo: ${channel ? '#'+channel.name : 'NÃO ENCONTRADO'}`);
  } else {
    console.log(`[Discord Listener] BOT NÃO ESTÁ NO SERVIDOR ${GUILD_ID}!`);
  }
  client.user.setActivity('códigos de entrega', { type: 'WATCHING' });
});

client.login(token).catch(err => {
  console.error('[Discord Listener] Failed to login:', err.message);
  process.exit(1);
});
