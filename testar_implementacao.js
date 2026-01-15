/**
 * Script de Teste para Verificação da Implementação do Sistema de Cargos
 * 
 * Este script verifica:
 * 1. Se os arquivos foram criados corretamente
 * 2. Se as importações estão funcionando
 * 3. Se a estrutura de dados está correta
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Iniciando verificação da implementação...\n');

// Teste 1: Verificar se o arquivo cargos.json existe
console.log('📁 Teste 1: Verificando arquivo cargos.json...');
const cargosPath = path.join(__dirname, 'DataBaseJson', 'cargos.json');
if (fs.existsSync(cargosPath)) {
    console.log('   ✅ Arquivo cargos.json encontrado');
    
    // Verificar estrutura
    const cargosData = JSON.parse(fs.readFileSync(cargosPath, 'utf8'));
    if (cargosData.usuarios !== undefined) {
        console.log('   ✅ Estrutura "usuarios" encontrada');
    } else {
        console.log('   ❌ Estrutura "usuarios" não encontrada');
    }
} else {
    console.log('   ❌ Arquivo cargos.json não encontrado');
}

// Teste 2: Verificar se cargos foi exportado no index.js
console.log('\n📦 Teste 2: Verificando exportação no index.js...');
const indexPath = path.join(__dirname, 'DataBaseJson', 'index.js');
const indexContent = fs.readFileSync(indexPath, 'utf8');
if (indexContent.includes('cargos')) {
    console.log('   ✅ "cargos" exportado no index.js');
} else {
    console.log('   ❌ "cargos" não encontrado no index.js');
}

// Teste 3: Verificar se painel.js tem a opção de gerenciar cargos
console.log('\n⚙️  Teste 3: Verificando painel.js...');
const painelPath = path.join(__dirname, 'ComandosSlash', 'Administracao', 'painel.js');
const painelContent = fs.readFileSync(painelPath, 'utf8');

if (painelContent.includes('opt_cargos')) {
    console.log('   ✅ Opção "opt_cargos" encontrada');
} else {
    console.log('   ❌ Opção "opt_cargos" não encontrada');
}

if (painelContent.includes('modal_cargos')) {
    console.log('   ✅ Modal "modal_cargos" encontrado');
} else {
    console.log('   ❌ Modal "modal_cargos" não encontrado');
}

// Teste 4: Verificar se ConfigModais.js tem o handler
console.log('\n🔧 Teste 4: Verificando ConfigModais.js...');
const configModaisPath = path.join(__dirname, 'Eventos', 'Sistema de Config', 'ConfigModais.js');
const configModaisContent = fs.readFileSync(configModaisPath, 'utf8');

if (configModaisContent.includes('handleCargos')) {
    console.log('   ✅ Função "handleCargos" encontrada');
} else {
    console.log('   ❌ Função "handleCargos" não encontrada');
}

if (configModaisContent.includes('modal_cargos')) {
    console.log('   ✅ Case "modal_cargos" encontrado');
} else {
    console.log('   ❌ Case "modal_cargos" não encontrado');
}

// Teste 5: Verificar se ticketHandler.js tem as verificações
console.log('\n🎫 Teste 5: Verificando ticketHandler.js...');
const ticketHandlerPath = path.join(__dirname, 'Eventos', 'SistemaDeHandlers', 'ticketHandler.js');
const ticketHandlerContent = fs.readFileSync(ticketHandlerPath, 'utf8');

if (ticketHandlerContent.includes('cargos')) {
    console.log('   ✅ Importação de "cargos" encontrada');
} else {
    console.log('   ❌ Importação de "cargos" não encontrada');
}

if (ticketHandlerContent.includes('cargoUsuario')) {
    console.log('   ✅ Verificação de cargo do usuário encontrada');
} else {
    console.log('   ❌ Verificação de cargo do usuário não encontrada');
}

if (ticketHandlerContent.includes('cargo_deposito')) {
    console.log('   ✅ Campo "cargo_deposito" encontrado no modal');
} else {
    console.log('   ❌ Campo "cargo_deposito" não encontrado no modal');
}

if (ticketHandlerContent.includes('cargoDesejado')) {
    console.log('   ✅ Processamento de cargoDesejado encontrado');
} else {
    console.log('   ❌ Processamento de cargoDesejado não encontrado');
}

// Teste 6: Verificar se index.js tem modal_cargos na lista
console.log('\n🚀 Teste 6: Verificando index.js principal...');
const mainIndexPath = path.join(__dirname, 'index.js');
const mainIndexContent = fs.readFileSync(mainIndexPath, 'utf8');

if (mainIndexContent.includes('modal_cargos')) {
    console.log('   ✅ "modal_cargos" encontrado na lista de modais');
} else {
    console.log('   ❌ "modal_cargos" não encontrado na lista de modais');
}

console.log('\n✨ Verificação concluída!\n');
console.log('📝 Próximos passos:');
console.log('1. Reinicie o bot');
console.log('2. Teste o comando /painel');
console.log('3. Tente gerenciar cargos');
console.log('4. Teste adicionar saldo com e sem permissão');
console.log('5. Teste pagamento PIX para atribuir cargo');