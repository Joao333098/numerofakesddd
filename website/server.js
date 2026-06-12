const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { MongoDatabase, initAll } = require('./lib/mongo-db');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = path.resolve(__dirname, '..');
const PIX_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutos

function isPixExpired(createdAt) {
  return Date.now() - createdAt > PIX_EXPIRATION_MS;
}

const services = require('../services.json');
let MercadoPagoHandler;

let usersDB, saldoDB, historicoDB, depositosDB, codigosDB, configDB, produtosDB, carrinhosDB, rendimentosDB;

async function initDatabases() {
  const dbs = await initAll(['users', 'saldo', 'historico', 'depositos', 'codigos', 'config', 'produto', 'carrinhos', 'rendimentos']);
  usersDB = dbs.users;
  saldoDB = dbs.saldo;
  historicoDB = dbs.historico;
  depositosDB = dbs.depositos;
  codigosDB = dbs.codigos;
  configDB = dbs.config;
  produtosDB = dbs.produto;
  carrinhosDB = dbs.carrinhos;
  rendimentosDB = dbs.rendimentos;
}

let mpHandler = null;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: 'kaelisystem_secret_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

function isAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
  next();
}

function isAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
  const users = usersDB.get('users') || [];
  const user = users.find(u => u.id === req.session.user.id);
  if (!user || !user.admin) return res.status(403).json({ error: 'Acesso negado' });
  next();
}

function ensureDB() {
  if (!usersDB.get('users')) usersDB.set('users', []);
  if (!depositosDB.get('depositos')) depositosDB.set('depositos', []);
  if (!codigosDB.get('codigos')) codigosDB.set('codigos', []);
}

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ======================== AUTH ========================

app.post('/api/register', async (req, res) => {
  try {
    ensureDB();
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });

    const users = usersDB.get('users') || [];
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Usuário já existe' });
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email já cadastrado' });

    const id = 'web_' + uuidv4().slice(0, 8);
    const hash = await bcrypt.hash(password, 10);
    users.push({ id, username, email, password: hash, admin: false, createdAt: Date.now() });
    usersDB.set('users', users);
    saldoDB.set(id, '0.00');
    historicoDB.set(id, []);

    req.session.user = { id, username, email };
    res.json({ success: true, user: { id, username, email } });
  } catch (err) {
    console.error('[Register]', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    ensureDB();
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Preencha todos os campos' });

    const users = usersDB.get('users') || [];
    const user = users.find(u => u.username === username);
    if (!user) return res.status(400).json({ error: 'Usuário ou senha inválidos' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Usuário ou senha inválidos' });

    req.session.user = { id: user.id, username: user.username, email: user.email, admin: user.admin || false };
    res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, admin: user.admin || false } });
  } catch (err) {
    console.error('[Login]', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', isAuth, (req, res) => {
  const users = usersDB.get('users') || [];
  const userData = users.find(u => u.id === req.session.user.id);
  const balance = parseFloat(saldoDB.get(req.session.user.id) || '0');
  const history = historicoDB.get(req.session.user.id) || [];

  let totalSpent = 0;
  let totalPurchases = 0;
  history.forEach(item => {
    if (item.tipo !== 'deposito' && item.valor) {
      totalSpent += Number(item.valor);
      totalPurchases++;
    }
  });

  res.json({
    user: { ...req.session.user, admin: userData?.admin || false },
    balance,
    totalSpent,
    totalPurchases,
    historyCount: history.length
  });
});

// ======================== SERVICES ========================

app.get('/api/services', (req, res) => {
  const disabled = configDB.get('disabled_services') || [];
  const servicos = (services.servicos || []).filter(s => !disabled.includes(s.id)).map(s => ({
    id: s.id,
    nome: s.nome,
    qtd_disp: s.qtd_disp,
    preco: s.preco_final
  }));
  res.json({ services: servicos });
});

app.get('/api/services/public', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const search = (req.query.search || '').toLowerCase();
  const disabled = configDB.get('disabled_services') || [];
  let servicos = (services.servicos || []).map(s => ({
    id: s.id,
    nome: s.nome,
    qtd_disp: s.qtd_disp,
    preco: s.preco_final,
    preco_base: s.preco_base
  })).filter(s => !disabled.includes(s.id));

  if (search) {
    servicos = servicos.filter(s => s.nome.toLowerCase().includes(search) || s.id.toLowerCase().includes(search));
  }

  servicos = servicos.slice(0, limit);
  res.json({ services: servicos, total: (services.servicos || []).length });
});

// ======================== GUEST CHECKOUT ========================

app.post('/api/guest/checkout', async (req, res) => {
  try {
    ensureDB();
    const { serviceId, discordId } = req.body;
    if (!serviceId) return res.status(400).json({ error: 'Selecione um serviço' });

    const service = (services.servicos || []).find(s => s.id === serviceId);
    if (!service) return res.status(400).json({ error: 'Serviço inválido' });

    if (!mpHandler) return res.status(500).json({ error: 'Pagamento indisponível no momento' });

    const valor = service.preco_final;
    if (valor < 0.10) return res.status(400).json({ error: 'Valor inválido' });

    const payment = await mpHandler.criarPagamentoPix(
      valor,
      `Kaeli System - ${service.nome}`
    );

    // Create pending purchase record
    const guestId = 'guest_' + uuidv4().slice(0, 12);
    const guestKey = `guest_${payment.id}`;
    const guestPurchases = codigosDB.get('guest_purchases') || {};
    guestPurchases[guestKey] = {
      id: guestId,
      paymentId: payment.id,
      serviceId: service.id,
      serviceName: service.nome,
      valor: valor,
      discordId: discordId || null,
      status: 'pending',
      numero: null,
      codigoSMS: null,
      historyId: null,
      createdAt: Date.now()
    };
    codigosDB.set('guest_purchases', guestPurchases);

    const depositos = depositosDB.get('depositos') || [];
    depositos.push({
      id: payment.id,
      userId: guestId,
      username: `guest_${service.nome}`,
      amount: valor,
      qr_code: payment.qr_code,
      qr_code_base64: payment.qr_code_base64,
      status: payment.status,
      guestKey: guestKey,
      createdAt: Date.now(),
      expiresAt: Date.now() + PIX_EXPIRATION_MS
    });
    depositosDB.set('depositos', depositos);

    res.json({
      success: true,
      payment: {
        id: payment.id,
        valor,
        qr_code: payment.qr_code,
        qr_code_base64: payment.qr_code_base64,
        ticket_url: payment.ticket_url,
        status: payment.status
      },
      guestKey
    });
  } catch (err) {
    console.error('[Guest Checkout]', err);
    res.status(500).json({ error: 'Erro ao criar pagamento: ' + err.message });
  }
});

app.post('/api/guest/test-checkout', async (req, res) => {
  try {
    ensureDB();
    const { serviceId } = req.body;
    if (!serviceId) return res.status(400).json({ error: 'Selecione um serviço' });

    const service = (services.servicos || []).find(s => s.id === serviceId);
    if (!service) return res.status(400).json({ error: 'Serviço inválido' });

    const { v4: uuidv4 } = require('uuid');
    const codigoEntrega = generateCode();
    const guestKey = 'test_' + uuidv4().slice(0, 12);
    const testPaymentId = 'test_pix_' + Date.now();

    const guestPurchases = codigosDB.get('guest_purchases') || {};
    guestPurchases[guestKey] = {
      id: 'guest_' + uuidv4().slice(0, 8),
      paymentId: testPaymentId,
      serviceId: service.id,
      serviceName: service.nome,
      valor: service.preco_final,
      status: 'approved',
      codigo_entrega: codigoEntrega,
      numero: null,
      codigoSMS: null,
      createdAt: Date.now()
    };
    codigosDB.set('guest_purchases', guestPurchases);

    const historyId = 'test_hist_' + uuidv4().slice(0, 8);
    const codigos = codigosDB.get('codigos') || [];
    codigos.push({
      codigo: codigoEntrega,
      historyId: historyId,
      guestKey: guestKey,
      serviceId: service.id,
      serviceName: service.nome,
      numero: null,
      codigoSMS: null,
      used: false,
      createdAt: Date.now()
    });
    codigosDB.set('codigos', codigos);

    const historicoGeral = codigosDB.get('historico_geral') || {};
    historicoGeral[historyId] = {
      serviceName: service.nome,
      valor: service.preco_final,
      numero: null,
      codigoSMS: null,
      status: 'Aguardando SMS',
      createdAt: Date.now()
    };
    codigosDB.set('historico_geral', historicoGeral);

    res.json({
      success: true,
      guestKey,
      payment: { id: testPaymentId, valor: service.preco_final, status: 'approved' },
      codigo: codigoEntrega
    });
  } catch (err) {
    console.error('[Test Checkout]', err);
    res.status(500).json({ error: 'Erro no teste: ' + err.message });
  }
});

app.get('/api/guest/check/:guestKey', async (req, res) => {
  try {
    ensureDB();
    const { guestKey } = req.params;
    const guestPurchases = codigosDB.get('guest_purchases') || {};
    const purchase = guestPurchases[guestKey];
    if (!purchase) return res.status(404).json({ error: 'Compra não encontrada' });

    res.json({
      status: purchase.status,
      serviceName: purchase.serviceName,
      valor: purchase.valor,
      discordId: purchase.discordId,
      codigo: purchase.codigo_entrega || null,
      numero: purchase.numero || null,
      codigoSMS: purchase.codigoSMS || null
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/guest/check-payment', async (req, res) => {
  try {
    ensureDB();
    const { paymentId, guestKey } = req.body;
    if (!paymentId) return res.status(400).json({ error: 'ID do pagamento obrigatório' });

    // Check expiration first
    const depositos = depositosDB.get('depositos') || [];
    const dep = depositos.find(d => String(d.id) === String(paymentId));
    if (dep && dep.expiresAt && Date.now() > dep.expiresAt && dep.status !== 'approved') {
      dep.status = 'expired';
      depositosDB.set('depositos', depositos);
      return res.json({ success: true, status: 'expired' });
    }

    let status = 'pending';
    if (mpHandler) {
      try {
        const result = await mpHandler.verificarPagamento(paymentId);
        status = result.status;
      } catch (e) {
        // keep pending
      }
    }

    if (status === 'approved') {
      if (dep && dep.status !== 'approved') {
        dep.status = 'approved';
        depositosDB.set('depositos', depositos);
      }

      if (guestKey) {
        const guestPurchases = codigosDB.get('guest_purchases') || {};
        const purchase = guestPurchases[guestKey];
        if (purchase && purchase.status === 'pending') {
          const service = (services.servicos || []).find(s => s.id === purchase.serviceId);

          const codigoEntrega = generateCode();
          const historyId = 'hist_' + uuidv4().slice(0, 8);

          purchase.status = 'approved';
          purchase.codigo_entrega = codigoEntrega;
          purchase.historyId = historyId;
          purchase.numero = 'Aguardando...';
          purchase.codigoSMS = null;

          const codigos = codigosDB.get('codigos') || [];
          codigos.push({
            codigo: codigoEntrega,
            historyId: historyId,
            guestKey: guestKey,
            serviceId: purchase.serviceId,
            serviceName: purchase.serviceName,
            discordId: purchase.discordId,
            numero: null,
            codigoSMS: null,
            used: false,
            createdAt: Date.now()
          });
          codigosDB.set('codigos', codigos);

          const historicoGeral = codigosDB.get('historico_geral') || {};
          historicoGeral[historyId] = {
            serviceName: purchase.serviceName,
            valor: purchase.valor,
            numero: null,
            codigoSMS: null,
            status: 'Aguardando SMS',
            createdAt: Date.now()
          };
          codigosDB.set('historico_geral', historicoGeral);

          guestPurchases[guestKey] = purchase;
          codigosDB.set('guest_purchases', guestPurchases);
        }
      }
    }

    res.json({ success: true, status });
  } catch (err) {
    console.error('[Check Payment]', err);
    res.json({ success: true, status: 'pending' });
  }
});

// ======================== CODE VERIFICATION (used by Discord bot) ========================

app.post('/api/code/verify', (req, res) => {
  try {
    ensureDB();
    const { codigo } = req.body;
    if (!codigo) return res.status(400).json({ error: 'Código obrigatório' });

    const codigos = codigosDB.get('codigos') || [];
    const entry = codigos.find(c => c.codigo === codigo.toUpperCase());

    if (!entry) return res.json({ valid: false, error: 'Código inválido' });
    if (entry.used) return res.json({ valid: false, error: 'Código já utilizado' });

    res.json({
      valid: true,
      historyId: entry.historyId,
      serviceName: entry.serviceName,
      discordId: entry.discordId
    });
  } catch (err) {
    console.error('[Code Verify]', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/code/use', async (req, res) => {
  try {
    ensureDB();
    const { codigo, discordId } = req.body;
    if (!codigo) return res.status(400).json({ error: 'Código obrigatório' });

    const codigos = codigosDB.get('codigos') || [];
    const entry = codigos.find(c => c.codigo === codigo.toUpperCase());

    if (!entry) return res.status(400).json({ error: 'Código inválido' });
    if (entry.used) return res.status(400).json({ error: 'Código já utilizado' });

    // Mark as used
    entry.used = true;
    entry.usedAt = Date.now();
    if (discordId) entry.usedByDiscord = discordId;

    // Get number from SMS API
    const SMS24H = require(path.join(BASE, 'Handler/sms24h'));
    const apiKey = configDB.get('sms24h.api_key');
    const smsService = configDB.get('sms_service') || 'ON';
    const smsDiscordLink = configDB.get('sms_discord_link') || '';
    let numero = null;
    let numeroId = null;
    let codigoSMS = null;

    if (smsService === 'OFF' || !apiKey) {
      if (!apiKey) console.log('[Code Use] Sem API key SMS24H, usando fallback');
      const ddds = ['11','21','31','41','51','61','71','81','19','15','48','47'];
      numero = '(' + ddds[Math.floor(Math.random()*ddds.length)] + ') 9' + String(Math.floor(1000 + Math.random()*9000)) + '-' + String(Math.floor(1000 + Math.random()*9000));
      codigoSMS = String(Math.floor(100000 + Math.random()*900000));
      entry.numero = numero;
      entry.codigoSMS = codigoSMS;
      entry.status = 'Concluído';

      const historicoGeral = codigosDB.get('historico_geral') || {};
      if (historicoGeral[entry.historyId]) {
        historicoGeral[entry.historyId].numero = numero;
        historicoGeral[entry.historyId].codigoSMS = codigoSMS;
        historicoGeral[entry.historyId].status = 'Concluído';
        codigosDB.set('historico_geral', historicoGeral);
      }

      if (entry.guestKey) {
        const gp = codigosDB.get('guest_purchases') || {};
        if (gp[entry.guestKey]) {
          gp[entry.guestKey].numero = numero;
          gp[entry.guestKey].codigoSMS = codigoSMS;
          gp[entry.guestKey].status = 'Concluído';
          codigosDB.set('guest_purchases', gp);
        }
      }
    } else if (apiKey) {
      try {
        const sms24h = new SMS24H(apiKey);
        const result = await sms24h.getNumber(entry.serviceId, 73, 'any');
        numero = result.numero;
        numeroId = result.id;
        entry.numero = numero;
        entry.numeroId = numeroId;

        // Store in history
        const historicoGeral = codigosDB.get('historico_geral') || {};
        if (historicoGeral[entry.historyId]) {
          historicoGeral[entry.historyId].numero = numero;
          historicoGeral[entry.historyId].status = 'Aguardando SMS';
          historicoGeral[entry.historyId].numeroId = numeroId;
          codigosDB.set('historico_geral', historicoGeral);
        }

        // Update guest purchase
        if (entry.guestKey) {
          const guestPurchases = codigosDB.get('guest_purchases') || {};
          if (guestPurchases[entry.guestKey]) {
            guestPurchases[entry.guestKey].numero = numero;
            guestPurchases[entry.guestKey].status = 'Aguardando SMS';
            codigosDB.set('guest_purchases', guestPurchases);
          }
        }

        codigosDB.set('codigos', codigos);

        // Start waiting for SMS in background
        sms24h.waitForCode(numeroId, 60, 5).then(smsResult => {
          if (smsResult.status === 'RECEBIDO' || smsResult.codigo) {
            entry.codigoSMS = smsResult.codigo;
            entry.status = 'Concluído';
            codigosDB.set('codigos', codigos);

            // Update history
            const histGeral = codigosDB.get('historico_geral') || {};
            if (histGeral[entry.historyId]) {
              histGeral[entry.historyId].codigoSMS = smsResult.codigo;
              histGeral[entry.historyId].status = 'Concluído';
              codigosDB.set('historico_geral', histGeral);
            }

            // Update guest purchase
            if (entry.guestKey) {
              const gp = codigosDB.get('guest_purchases') || {};
              if (gp[entry.guestKey]) {
                gp[entry.guestKey].codigoSMS = smsResult.codigo;
                gp[entry.guestKey].status = 'Concluído';
                codigosDB.set('guest_purchases', gp);
              }
            }
          }
        }).catch(err => {
          console.error('[SMS Wait Error]', err.message);
        });

      } catch (err) {
        console.error('[Get Number Error]', err.message);
      }
    }

    codigosDB.set('codigos', codigos);

    res.json({
      success: true,
      historyId: entry.historyId,
      numero: numero,
      serviceName: entry.serviceName
    });
  } catch (err) {
    console.error('[Code Use]', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/code/status/:historyId', async (req, res) => {
  try {
    const { historyId } = req.params;
    const historicoGeral = codigosDB.get('historico_geral') || {};
    const entry = historicoGeral[historyId];
    if (!entry) return res.status(404).json({ error: 'Histórico não encontrado' });

    res.json({
      serviceName: entry.serviceName,
      numero: entry.numero || null,
      codigoSMS: entry.codigoSMS || null,
      status: entry.status || 'unknown',
      createdAt: entry.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/code/resend/:historyId', async (req, res) => {
  try {
    const { historyId } = req.params;
    const codigos = codigosDB.get('codigos') || [];
    const entry = codigos.find(c => c.historyId === historyId);
    if (!entry) return res.status(404).json({ error: 'Compra não encontrada' });

    const SMS24H = require(path.join(BASE, 'Handler/sms24h'));
    const apiKey = configDB.get('sms24h.api_key');

    if (apiKey && entry.numeroId) {
      const sms24h = new SMS24H(apiKey);

      // Check current status
      if (entry.status === 'Concluído' && entry.codigoSMS) {
        return res.json({ success: true, numero: entry.numero, codigoSMS: entry.codigoSMS });
      }

      try {
        const status = await sms24h.getStatus(entry.numeroId);
        if (status.status === 'RECEBIDO' && status.codigo) {
          entry.codigoSMS = status.codigo;
          entry.status = 'Concluído';
          codigosDB.set('codigos', codigos);

          const histGeral = codigosDB.get('historico_geral') || {};
          if (histGeral[historyId]) {
            histGeral[historyId].codigoSMS = status.codigo;
            histGeral[historyId].status = 'Concluído';
            codigosDB.set('historico_geral', histGeral);
          }

          return res.json({ success: true, numero: entry.numero, codigoSMS: status.codigo });
        } else {
          return res.json({ success: false, status: status.status, message: 'Aguardando SMS...' });
        }
      } catch (err) {
        return res.json({ success: true, numero: entry.numero, codigoSMS: entry.codigoSMS });
      }
    }

    res.json({ success: true, numero: entry.numero, codigoSMS: entry.codigoSMS });
  } catch (err) {
    console.error('[Resend]', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ======================== LOGGED-IN PURCHASE ========================

app.post('/api/buy', isAuth, async (req, res) => {
  try {
    const { serviceId } = req.body;
    if (!serviceId) return res.status(400).json({ error: 'ID do serviço obrigatório' });

    const service = (services.servicos || []).find(s => s.id === serviceId);
    if (!service) return res.status(400).json({ error: 'Serviço não encontrado' });

    const userId = req.session.user.id;
    const balance = parseFloat(saldoDB.get(userId) || '0');
    if (balance < service.preco_final) return res.status(400).json({ error: 'Saldo insuficiente' });

    const newBalance = balance - service.preco_final;
    saldoDB.set(userId, newBalance.toFixed(2));

    // Get number from SMS API
    const SMS24H = require(path.join(BASE, 'Handler/sms24h'));
    const apiKey = configDB.get('sms24h.api_key');
    const smsService = configDB.get('sms_service') || 'ON';
    const smsDiscordLink = configDB.get('sms_discord_link') || '';
    let numero = 'Aguardando...';
    let historyIdNum = null;
    let statusText = 'Aguardando SMS';
    let codigoSMS = null;

    if (smsService === 'OFF' || !apiKey) {
      if (!apiKey) console.log('[Buy] Sem API key SMS24H, usando fallback');
      const ddds = ['11','21','31','41','51','61','71','81','19','15','48','47'];
      numero = '(' + ddds[Math.floor(Math.random()*ddds.length)] + ') 9' + String(Math.floor(1000 + Math.random()*9000)) + '-' + String(Math.floor(1000 + Math.random()*9000));
      codigoSMS = String(Math.floor(100000 + Math.random()*900000));
      statusText = 'Concluído';
    } else if (apiKey) {
      try {
        const sms24h = new SMS24H(apiKey);
        const result = await sms24h.getNumber(service.id, 73, 'any');
        numero = result.numero;
        historyIdNum = result.id;

        // Start SMS waiting in background
        sms24h.waitForCode(result.id, 60, 5).then(smsResult => {
          if (smsResult.status === 'RECEBIDO' || smsResult.codigo) {
            const hist = historicoDB.get(userId) || [];
            const idx = hist.findIndex(h => h.id === result.id);
            if (idx !== -1) {
              hist[idx].status = 'Concluído';
              hist[idx].codigo = smsResult.codigo;
              hist[idx].numero = result.numero;
              historicoDB.set(userId, hist);
            }
          }
        }).catch(() => {});
      } catch (err) {
        console.error('[Buy SMS API Error]', err.message);
      }
    }

    const history = historicoDB.get(userId) || [];
    history.push({
      plataforma: service.nome,
      valor: service.preco_final,
      numero: numero,
      codigo: codigoSMS,
      status: statusText,
      timestamp: Date.now(),
      id: historyIdNum || uuidv4().slice(0, 8)
    });
    historicoDB.set(userId, history);

    if (service.qtd_disp > 0) {
      service.qtd_disp -= 1;
    }

    res.json({ success: true, balance: newBalance, message: 'Compra realizada!' });
  } catch (err) {
    console.error('[Buy]', err);
    res.status(500).json({ error: 'Erro ao processar compra' });
  }
});

// ======================== DEPOSIT ========================

app.post('/api/deposit', isAuth, async (req, res) => {
  try {
    const { amount } = req.body;
    const valor = Number(amount);
    if (!valor || valor < 1) return res.status(400).json({ error: 'Valor mínimo de R$ 1,00' });
    if (!mpHandler) return res.status(500).json({ error: 'Mercado Pago não configurado' });

    const payment = await mpHandler.criarPagamentoPix(valor, `Depósito Kaeli - ${req.session.user.username}`);

    const depositos = depositosDB.get('depositos') || [];
    depositos.push({
      id: payment.id,
      userId: req.session.user.id,
      username: req.session.user.username,
      amount: valor,
      qr_code: payment.qr_code,
      qr_code_base64: payment.qr_code_base64,
      status: payment.status,
      createdAt: Date.now(),
      expiresAt: Date.now() + PIX_EXPIRATION_MS
    });
    depositosDB.set('depositos', depositos);

    res.json({
      success: true,
      payment: {
        id: payment.id, valor,
        qr_code: payment.qr_code,
        qr_code_base64: payment.qr_code_base64,
        ticket_url: payment.ticket_url,
        status: payment.status
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar pagamento: ' + err.message });
  }
});

app.get('/api/deposit/check/:paymentId', isAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Check expiration first
    const depositos = depositosDB.get('depositos') || [];
    const dep = depositos.find(d => String(d.id) === String(paymentId));
    if (dep && dep.expiresAt && Date.now() > dep.expiresAt && dep.status !== 'approved') {
      dep.status = 'expired';
      depositosDB.set('depositos', depositos);
      return res.json({ success: true, status: 'expired' });
    }

    if (mpHandler) {
      const status = await mpHandler.verificarPagamento(paymentId);
      if (status.status === 'approved') {
        if (dep && dep.status !== 'approved') {
          dep.status = 'approved';
          const currentBalance = parseFloat(saldoDB.get(dep.userId) || '0');
          saldoDB.set(dep.userId, (currentBalance + dep.amount).toFixed(2));
          const history = historicoDB.get(dep.userId) || [];
          history.push({ tipo: 'deposito', valor: dep.amount, metodo: 'PIX', status: 'Concluído', timestamp: Date.now() });
          historicoDB.set(dep.userId, history);
          depositosDB.set('depositos', depositos);
        }
      }
      return res.json({ success: true, status: status.status });
    }
    res.json({ success: true, status: 'unknown' });
  } catch (err) {
    res.json({ success: true, status: 'pending' });
  }
});

app.get('/api/history', isAuth, (req, res) => {
  const history = historicoDB.get(req.session.user.id) || [];
  const sorted = history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  res.json({ history: sorted });
});

app.post('/api/history/resend/:historyId', isAuth, async (req, res) => {
  try {
    const { historyId } = req.params;
    const history = historicoDB.get(req.session.user.id) || [];
    const entry = history.find(h => String(h.id) === String(historyId));
    if (!entry) return res.status(404).json({ error: 'Compra não encontrada' });

    if (entry.status === 'Concluído' && entry.codigo) {
      return res.json({ success: true, numero: entry.numero, codigoSMS: entry.codigo });
    }

    const SMS24H = require(path.join(BASE, 'Handler/sms24h'));
    const apiKey = configDB.get('sms24h.api_key');

    if (apiKey && entry.id) {
      const sms24h = new SMS24H(apiKey);
      try {
        const status = await sms24h.getStatus(entry.id);
        if (status.status === 'RECEBIDO' && status.codigo) {
          entry.status = 'Concluído';
          entry.codigo = status.codigo;
          entry.numero = entry.numero || status.numero;
          historicoDB.set(req.session.user.id, history);
          return res.json({ success: true, numero: entry.numero, codigoSMS: status.codigo });
        }
        return res.json({ success: false, message: 'Aguardando SMS...', status: status.status, numero: entry.numero });
      } catch (err) {
        return res.json({ success: true, numero: entry.numero, codigoSMS: entry.codigo || null });
      }
    }

    res.json({ success: true, numero: entry.numero, codigoSMS: entry.codigo || null });
  } catch (err) {
    console.error('[History Resend]', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ======================== ADMIN ========================

function getAdminData() {
  const rendimentos = rendimentosDB.all() || {};
  return {
    config: configDB.all(),
    services: services.servicos || [],
    rendimentos,
    usuarios: (usersDB.get('users') || []).length,
    depositos: (depositosDB.get('depositos') || []).length,
    codigosAtivos: (codigosDB.get('codigos') || []).filter(c => !c.used).length,
    codigosUsados: (codigosDB.get('codigos') || []).filter(c => c.used).length
  };
}

// Admin auth with token instead of session (for API access from anywhere)
app.post('/api/admin/auth', async (req, res) => {
  try {
    ensureDB();
    const { username, password } = req.body;
    const users = usersDB.get('users') || [];
    const user = users.find(u => u.username === username && u.admin === true);
    if (!user) return res.status(403).json({ error: 'Acesso negado' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(403).json({ error: 'Acesso negado' });

    req.session.user = { id: user.id, username: user.username, email: user.email, admin: true };
    res.json({ success: true, admin: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/admin/dashboard', isAdmin, (req, res) => {
  const data = getAdminData();
  res.json(data);
});

app.get('/api/admin/users', isAdmin, (req, res) => {
  const users = usersDB.get('users') || [];
  const search = (req.query.search || '').toLowerCase();
  let enriched = users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    admin: u.admin || false,
    balance: parseFloat(saldoDB.get(u.id) || '0'),
    historyCount: (historicoDB.get(u.id) || []).length,
    createdAt: u.createdAt
  }));
  if (search) {
    enriched = enriched.filter(u => u.username.toLowerCase().includes(search)).slice(0, 15);
  }
  res.json({ users: enriched });
});

app.post('/api/admin/user/balance', isAdmin, (req, res) => {
  try {
    const { userId, username, amount } = req.body;
    if ((!userId && !username) || amount === undefined) return res.status(400).json({ error: 'Dados incompletos' });

    let targetId = userId;
    if (!targetId && username) {
      const users = usersDB.get('users') || [];
      const user = users.find(u => u.username === username);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      targetId = user.id;
    }

    const current = parseFloat(saldoDB.get(targetId) || '0');
    const newBalance = Math.max(0, current + Number(amount));
    saldoDB.set(targetId, newBalance.toFixed(2));

    if (Number(amount) > 0) {
      const history = historicoDB.get(targetId) || [];
      history.push({ tipo: 'deposito', valor: Number(amount), metodo: 'Admin', status: 'Concluído', timestamp: Date.now() });
      historicoDB.set(userId, history);
    }

    res.json({ success: true, newBalance: newBalance.toFixed(2) });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/admin/make-admin', isAdmin, (req, res) => {
  try {
    const { userId, username } = req.body;
    const users = usersDB.get('users') || [];
    let user;
    if (userId) {
      user = users.find(u => u.id === userId);
    } else if (username) {
      user = users.find(u => u.username === username);
    }
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    user.admin = true;
    usersDB.set('users', users);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/admin/codigos', isAdmin, (req, res) => {
  const codigos = codigosDB.get('codigos') || [];
  const sorted = codigos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ codigos: sorted });
});

app.post('/api/admin/validate-code', isAdmin, (req, res) => {
  try {
    const { historyId } = req.body;
    const codigos = codigosDB.get('codigos') || [];
    const entry = codigos.find(c => c.historyId === historyId);
    if (!entry) return res.status(404).json({ error: 'Código não encontrado' });

    res.json({
      success: true,
      codigo: entry.codigo,
      numero: entry.numero,
      codigoSMS: entry.codigoSMS,
      status: entry.status || 'unknown',
      used: entry.used,
      serviceName: entry.serviceName,
      discordId: entry.discordId
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/admin/revalidate-sms', isAdmin, async (req, res) => {
  try {
    const { historyId } = req.body;
    const codigos = codigosDB.get('codigos') || [];
    const entry = codigos.find(c => c.historyId === historyId);
    if (!entry) return res.status(404).json({ error: 'Não encontrado' });

    const SMS24H = require(path.join(BASE, 'Handler/sms24h'));
    const apiKey = configDB.get('sms24h.api_key');

    if (apiKey && entry.numeroId) {
      const sms24h = new SMS24H(apiKey);
      const status = await sms24h.getStatus(entry.numeroId);
      if (status.status === 'RECEBIDO' && status.codigo) {
        entry.codigoSMS = status.codigo;
        codigosDB.set('codigos', codigos);

        const histGeral = codigosDB.get('historico_geral') || {};
        if (histGeral[historyId]) {
          histGeral[historyId].codigoSMS = status.codigo;
          histGeral[historyId].status = 'Concluído';
          codigosDB.set('historico_geral', histGeral);
        }

        return res.json({ success: true, codigoSMS: status.codigo, status: 'RECEBIDO' });
      }
      return res.json({ success: false, status: status.status, message: 'SMS ainda não recebido' });
    }

    res.json({ success: true, codigoSMS: entry.codigoSMS });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/admin/update-service', isAdmin, (req, res) => {
  try {
    const { serviceId, field, value } = req.body;
    const service = (services.servicos || []).find(s => s.id === serviceId);
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado' });

    if (field === 'preco_final') service.preco_final = Number(value);
    else if (field === 'preco_base') service.preco_base = Number(value);
    else if (field === 'qtd_disp') service.qtd_disp = Number(value);
    else return res.status(400).json({ error: 'Campo inválido' });

    const fs = require('fs');
    fs.writeFileSync(path.join(BASE, 'services.json'), JSON.stringify(services, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/admin/adjust-prices', isAdmin, (req, res) => {
  try {
    const { percentage, type } = req.body;
    const pct = Number(percentage);
    if (!pct) return res.status(400).json({ error: 'Porcentagem inválida' });

    const servicos = services.servicos || [];
    servicos.forEach(s => {
      const factor = 1 + (pct / 100);
      if (type === 'base') {
        s.preco_base = Number((s.preco_base * factor).toFixed(2));
        s.preco_final = Number((s.preco_final * factor).toFixed(2));
      } else if (type === 'final') {
        s.preco_final = Number((s.preco_final * factor).toFixed(2));
      }
    });

    const fs = require('fs');
    fs.writeFileSync(path.join(BASE, 'services.json'), JSON.stringify(services, null, 2));
    res.json({ success: true, message: `Preços ajustados em ${pct}%` });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/admin/config', isAdmin, (req, res) => {
  try {
    const { key, value } = req.body;

    if (key.startsWith('mercadopago')) {
      configDB.set('mercadopago.access_token', value);
      configDB.set('mp.access_token', value);
    } else if (key.startsWith('sms24h')) {
      configDB.set('sms24h.api_key', value);
    } else if (key.startsWith('bot')) {
      configDB.set('bot.token', value);
      // Also save to root config.json for the bot process
      try {
        const fs = require('fs');
        const rootCfg = path.join(BASE, 'config.json');
        let cfg = {};
        if (fs.existsSync(rootCfg)) {
          cfg = JSON.parse(fs.readFileSync(rootCfg, 'utf8'));
        }
        cfg.token = value;
        fs.writeFileSync(rootCfg, JSON.stringify(cfg, null, 2));
      } catch (e) {}
    } else if (key.startsWith('vendas')) {
      configDB.set('vendas', value);
    } else {
      configDB.set(key, value);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/admin/depositos', isAdmin, (req, res) => {
  const depositos = depositosDB.get('depositos') || [];
  const sorted = depositos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ depositos: sorted });
});

app.get('/api/admin/earnings', isAdmin, (req, res) => {
  const rend = rendimentosDB.all() || {};
  const codigos = codigosDB.get('codigos') || [];
  const totalVendas = codigos.filter(c => c.used).reduce((acc, c) => {
    const gp = (codigosDB.get('guest_purchases') || {});
    const purchase = Object.values(gp).find(p => p.historyId === c.historyId);
    return acc + (purchase?.valor || 0);
  }, 0);

  res.json({ rendimentos: rend, totalVendas, totalCodigos: codigos.length });
});

app.post('/api/admin/set-webhook', isAdmin, (req, res) => {
  try {
    const { url } = req.body;
    configDB.set('paymentauto.webhook_url', url);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ======================== COUPONS ========================

let cuponsDB;

async function initCuponsDB() {
  cuponsDB = new MongoDatabase('cupons');
  await cuponsDB.init();
}

app.get('/api/admin/coupons', isAdmin, (req, res) => {
  const cupons = cuponsDB.all() || {};
  res.json({ cupons });
});

app.post('/api/admin/coupons', isAdmin, (req, res) => {
  try {
    const { codigo, tipo, valor, usosMaximos, expiraEm } = req.body;
    if (!codigo || !tipo || !valor) return res.status(400).json({ error: 'Código, tipo e valor obrigatórios' });

    const cupons = cuponsDB.all() || {};
    if (cupons[codigo.toUpperCase()]) return res.status(400).json({ error: 'Cupom já existe' });

    cupons[codigo.toUpperCase()] = {
      codigo: codigo.toUpperCase(),
      tipo: tipo,
      valor: Number(valor),
      usosMaximos: Number(usosMaximos) || 1,
      usosAtuais: 0,
      expiraEm: expiraEm || null,
      criadoEm: Date.now(),
      ativo: true
    };
    cuponsDB.set(codigo.toUpperCase(), cupons[codigo.toUpperCase()]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.delete('/api/admin/coupons/:codigo', isAdmin, (req, res) => {
  try {
    const cupons = cuponsDB.all() || {};
    delete cupons[req.params.codigo.toUpperCase()];
    cuponsDB.delete(req.params.codigo.toUpperCase());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/admin/coupons/:codigo/toggle', isAdmin, (req, res) => {
  try {
    const cupons = cuponsDB.all() || {};
    const cupom = cupons[req.params.codigo.toUpperCase()];
    if (!cupom) return res.status(404).json({ error: 'Cupom não encontrado' });
    cupom.ativo = !cupom.ativo;
    cuponsDB.set(req.params.codigo.toUpperCase(), cupom);
    res.json({ success: true, ativo: cupom.ativo });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ======================== SERVICE TOGGLE / COUNTRY ========================

app.get('/api/admin/services/disabled', isAdmin, (req, res) => {
  const disabled = configDB.get('disabled_services') || [];
  res.json({ disabled });
});

app.post('/api/admin/services/toggle', isAdmin, (req, res) => {
  try {
    const { serviceId } = req.body;
    const disabled = configDB.get('disabled_services') || [];
    const idx = disabled.indexOf(serviceId);
    if (idx === -1) {
      disabled.push(serviceId);
    } else {
      disabled.splice(idx, 1);
    }
    configDB.set('disabled_services', disabled);
    res.json({ success: true, disabled });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/admin/services/country', isAdmin, (req, res) => {
  try {
    const { serviceId, country } = req.body;
    const service = (services.servicos || []).find(s => s.id === serviceId);
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado' });
    service.pais = Number(country) || 73;
    const fs = require('fs');
    fs.writeFileSync(path.join(BASE, 'services.json'), JSON.stringify(services, null, 2));
    res.json({ success: true, pais: service.pais });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ======================== BLACKLIST ========================

app.get('/api/admin/blacklist', isAdmin, (req, res) => {
  const blacklist = configDB.get('blacklist') || [];
  res.json({ blacklist });
});

app.post('/api/admin/blacklist', isAdmin, (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'ID do usuário obrigatório' });
    const blacklist = configDB.get('blacklist') || [];
    if (!blacklist.includes(userId)) {
      blacklist.push(userId);
      configDB.set('blacklist', blacklist);
    }
    res.json({ success: true, blacklist });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/admin/blacklist/remove', isAdmin, (req, res) => {
  try {
    const { userId } = req.body;
    const blacklist = configDB.get('blacklist') || [];
    const idx = blacklist.indexOf(userId);
    if (idx !== -1) blacklist.splice(idx, 1);
    configDB.set('blacklist', blacklist);
    res.json({ success: true, blacklist });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ======================== LOGS ========================

app.get('/api/admin/logs', isAdmin, (req, res) => {
  try {
    const fs = require('fs');
    const logFile = path.join(BASE, 'nohup.out');
    if (!fs.existsSync(logFile)) return res.json({ logs: ['Arquivo de log não encontrado (nohup.out)'] });
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const last100 = lines.slice(-100).reverse();
    res.json({ logs: last100 });
  } catch (err) {
    res.json({ logs: ['Erro ao ler logs'] });
  }
});

// ======================== CANCELLATION STATS ========================

app.get('/api/admin/stats', isAdmin, (req, res) => {
  const codigos = codigosDB.get('codigos') || [];
  const total = codigos.length;
  const used = codigos.filter(c => c.used).length;
  const pending = total - used;
  const withSMS = codigos.filter(c => c.codigoSMS).length;
  const withoutSMS = pending;
  const guestPurchases = codigosDB.get('guest_purchases') || {};
  const gpValues = Object.values(guestPurchases);
  const approved = gpValues.filter(p => p.status === 'approved' || p.status === 'Concluído').length;
  const pendingPix = gpValues.filter(p => p.status === 'pending').length;

  res.json({
    totalCodigos: total,
    codigosUsados: used,
    codigosPendentes: pending,
    comSMS: withSMS,
    semSMS: withoutSMS,
    guestAprovados: approved,
    guestPendentes: pendingPix
  });
});

// ======================== PAGES ========================

app.get('/guest', (req, res) => res.sendFile(path.join(__dirname, 'public', 'guest.html')));
app.get('/guest/success', (req, res) => res.sendFile(path.join(__dirname, 'public', 'guest-success.html')));
app.get('/guest/status/:guestKey', (req, res) => res.sendFile(path.join(__dirname, 'public', 'guest.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/dashboard', isAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/cadastro', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'cadastro.html'));
});
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/api/webhook/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === 'payment' && data?.id) {
      if (mpHandler) {
        const paymentInfo = await mpHandler.verificarPagamento(data.id);
        if (paymentInfo.status === 'approved') {
          const depositos = depositosDB.get('depositos') || [];
          const dep = depositos.find(d => String(d.id) === String(data.id));
          if (dep && dep.status !== 'approved') {
            dep.status = 'approved';
            if (dep.userId?.startsWith('guest_')) {
              const gp = codigosDB.get('guest_purchases') || {};
              const purchase = Object.values(gp).find(p => p.paymentId == data.id);
              if (purchase && purchase.status === 'pending') {
                purchase.status = 'approved';
                const codigoEntrega = generateCode();
                purchase.codigo_entrega = codigoEntrega;
                const codigos = codigosDB.get('codigos') || [];
                codigos.push({
                  codigo: codigoEntrega,
                  historyId: purchase.historyId,
                  guestKey: dep.guestKey,
                  serviceId: purchase.serviceId,
                  serviceName: purchase.serviceName,
                  discordId: purchase.discordId,
                  numero: null,
                  codigoSMS: null,
                  used: false,
                  createdAt: Date.now()
                });
                codigosDB.set('codigos', codigos);
                codigosDB.set('guest_purchases', gp);
              }
            } else {
              const currentBalance = parseFloat(saldoDB.get(dep.userId) || '0');
              saldoDB.set(dep.userId, (currentBalance + dep.amount).toFixed(2));
              const history = historicoDB.get(dep.userId) || [];
              history.push({ tipo: 'deposito', valor: dep.amount, metodo: 'PIX', status: 'Concluído', timestamp: Date.now() });
              historicoDB.set(dep.userId, history);
            }
            depositosDB.set('depositos', depositos);
          }
        }
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook Error]', err);
    res.status(200).json({ received: true });
  }
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Rota não encontrada' });
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function migrateFromJson() {
  const fs = require('fs');
  const jsonDir = path.join(BASE, 'DataBaseJson');
  const mapping = {
    'users.json': 'users',
    'saldo.json': 'saldo',
    'historico.json': 'historico',
    'depositos.json': 'depositos',
    'codigos.json': 'codigos',
    'config.json': 'config',
    'produto.json': 'produto',
    'carrinhos.json': 'carrinhos',
    'rendimentos.json': 'rendimentos',
    'cupons.json': 'cupons',
  };
  for (const [file, collection] of Object.entries(mapping)) {
    const fp = path.join(jsonDir, file);
    if (!fs.existsSync(fp)) continue;
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      const parsed = JSON.parse(raw);
      const mdb = new MongoDatabase(collection);
      await mdb.init();
      if (typeof parsed === 'object' && parsed !== null) {
        let count = 0;
        for (const [key, value] of Object.entries(parsed)) {
          if (key === 'ID' && value) continue;
          if (!mdb.get(key)) {
            mdb.set(key, value);
            count++;
          }
        }
        await mdb.save();
        if (count > 0) console.log(`[Migrate] ${file}: ${count} chaves migradas para MongoDB`);
      }
    } catch (e) {
      console.log(`[Migrate] ${file}: ignorado (${e.message})`);
    }
  }
}

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

async function start() {
  try {
    console.log('[Start] Inicializando bancos de dados...');
    await initDatabases();
    console.log('[Start] Bancos OK');
    await initCuponsDB();
    console.log('[Start] Cupons OK');
    await migrateFromJson();
    console.log('[Start] Migração concluída');
    MercadoPagoHandler = require(path.join(BASE, 'Handler/mercadopago'));
    const mpAccessToken = configDB.get('mercadopago.access_token') || configDB.get('mp.access_token');
    if (mpAccessToken) {
      mpHandler = new MercadoPagoHandler(mpAccessToken);
    }
  } catch (err) {
    console.error('[Start] ERRO:', err.message);
    console.error('[Start] Stack:', err.stack);
  }
  app.listen(PORT, () => {
    console.log(`[Kaeli System] Servidor rodando em http://localhost:${PORT}`);
  });
}

start();
