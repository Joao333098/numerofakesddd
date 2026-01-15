/**
 * Script de Teste para Verificação do Sistema de Entregas
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Iniciando verificação do sistema de entregas...\n');

// Teste 1: Verificar se o arquivo entregabot.json existe
console.log('📁 Teste 1: Verificando arquivo entregabot.json...');
const entregabotPath = path.join(__dirname, 'entregabot.json');
if (fs.existsSync(entregabotPath)) {
    console.log('   ✅ Arquivo encontrabot.json encontrado');
    
    try {
        const entregabotData = JSON.parse(fs.readFileSync(entregabotPath, 'utf8'));
        if (Array.isArray(entregabotData) && entregabotData.length > 0) {
            console.log('   ✅ Estrutura JSON válida');
            if (entregabotData[0].type === 17) {
                console.log('   ✅ Container V2 (type 17) encontrado');
            }
        } else {
            console.log('   ❌ Estrutura JSON inválida');
        }
    } catch (error) {
        console.log('   ❌ Erro ao ler JSON:', error.message);
    }
} else {
    console.log('   ❌ Arquivo entregabot.json não encontrado');
}

// Teste 2: Verificar se painel.js tem a opção de canal de entregas
console.log('\n⚙️  Teste 2: Verificando painel.js...');
const painelPath = path.join(__dirname, 'ComandosSlash', 'Administracao', 'painel.js');
const painelContent = fs.readFileSync(painelPath, 'utf8');

if (painelContent.includes('ticket_select_entregas')) {
    console.log('   ✅ Opção "ticket_select_entregas" encontrada');
} else {
    console.log('   ❌ Opção "ticket_select_entregas" não encontrada');
}

if (painelContent.includes('Canal de Entregas')) {
    console.log('   ✅ Texto "Canal de Entregas" encontrado');
} else {
    console.log('   ❌ Texto "Canal de Entregas" não encontrado');
}

// Teste 3: Verificar se ticketHandler.js tem a função de envio de entrega
console.log('\n🎫 Teste 3: Verificando ticketHandler.js...');
const ticketHandlerPath = path.join(__dirname, 'Eventos', 'SistemaDeHandlers', 'ticketHandler.js');
const ticketHandlerContent = fs.readFileSync(ticketHandlerPath, 'utf8');

if (ticketHandlerContent.includes('enviarMensagemEntrega')) {
    console.log('   ✅ Função "enviarMensagemEntrega" encontrada');
} else {
    console.log('   ❌ Função "enviarMensagemEntrega" não encontrada');
}

if (ticketHandlerContent.includes('entregabot.json')) {
    console.log('   ✅ Referência a "entregabot.json" encontrada');
} else {
    console.log('   ❌ Referência a "entregabot.json" não encontrada');
}

if (ticketHandlerContent.includes('tickets.entregas')) {
    console.log('   ✅ Configuração "tickets.entregas" encontrada');
} else {
    console.log('   ❌ Configuração "tickets.entregas" não encontrada');
}

// Teste 4: Verificar se o template tem os campos esperados
console.log('\n📋 Teste 4: Verificando template do entregabot.json...');
if (fs.existsSync(entregabotPath)) {
    const entregabotData = JSON.parse(fs.readFileSync(entregabotPath, 'utf8'));
    
    let content = JSON.stringify(entregabotData);
    
    if (content.includes('<@user>')) {
        console.log('   ✅ Placeholder <@user> encontrado');
    } else {
        console.log('   ❌ Placeholder <@user> não encontrado');
    }
    
    if (content.includes('R$10.00')) {
        console.log('   ✅ Placeholder de valor encontrado');
    } else {
        console.log('   ❌ Placeholder de valor não encontrado');
    }
    
    if (content.includes('Transação')) {
        console.log('   ✅ Campo de transação encontrado');
    } else {
        console.log('   ❌ Campo de transação não encontrado');
    }
    
    if (content.includes('Data:')) {
        console.log('   ✅ Campo de data encontrado');
    } else {
        console.log('   ❌ Campo de data não encontrado');
    }
}

console.log('\n✨ Verificação concluída!\n');
console.log('📝 Próximos passos:');
console.log('1. Reinicie o bot');
console.log('2. Use /painel → "Ticket Dinâmico" → Configure o canal de entregas');
console.log('3. Faça um teste de pagamento PIX');
console.log('4. Verifique se a mensagem aparece no canal de entregas');