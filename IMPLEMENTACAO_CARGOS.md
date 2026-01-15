# Implementação do Sistema de Cargos e Correção do Bug de Adiciona Saldo

## Resumo
Esta implementação resolve o bug onde usuários não conseguiam adicionar saldo no ticket e cria um sistema completo de gerenciamento de cargos (Membro/Cliente).

## Alterações Realizadas

### 1. Estrutura de Dados
- **Arquivo criado**: `DataBaseJson/cargos.json`
  - Armazena os cargos dos usuários no formato: `usuarios.{userId}.cargo`
  - Cargos suportados: `membro` e `cliente`

- **Arquivo modificado**: `DataBaseJson/index.js`
  - Adicionada exportação do banco `cargos`

### 2. Sistema de Gerenciamento de Cargos no Painel Admin

#### Arquivo: `ComandosSlash/Administracao/painel.js`
- **Adicionada opção** "Gerenciar Cargos" no menu do painel administrativo
- **Adicionado modal** `modal_cargos` para selecionar usuário e atribuir cargo
- **Campos do modal**:
  - `user_id`: ID do usuário
  - `cargo`: Cargo desejado (membro/cliente)

#### Arquivo: `Eventos/Sistema de Config/ConfigModais.js`
- **Adicionada função** `handleCargos()` para processar o modal
- **Validação**: Verifica se o cargo é válido (membro ou cliente)
- **Armazenamento**: Salva o cargo no banco de dados `cargos.json`

#### Arquivo: `index.js`
- **Adicionado** `modal_cargos` à lista de modais processados

### 3. Correção do Bug de Adiciona Saldo

#### Arquivo: `Eventos/SistemaDeHandlers/ticketHandler.js`

**Alterações realizadas**:
1. **Importação do banco de cargos**: Adicionado `cargos` às importações

2. **Verificação de permissão no botão** (case 'menu_depositar'):
   ```javascript
   const cargoUsuario = cargos.get(`usuarios.${user.id}.cargo`);
   if (cargoUsuario !== 'membro') {
       return interaction.followUp({ 
           content: '❌ Você não tem permissão para adicionar saldo. Apenas usuários com cargo **Membro** podem adicionar saldo.', 
           flags: [MessageFlags.Ephemeral] 
       });
   }
   ```

3. **Verificação de permissão no select menu**:
   - Mesma lógica aplicada no handler do select menu

4. **Modificação do modal de depósito**:
   - **Campo adicionado**: `cargo_deposito`
   - **Label**: "Cargo desejado (membro/cliente)"
   - **Placeholder**: "Digite: membro ou cliente"

5. **Atribuição automática de cargo após pagamento**:
   - Quando o pagamento PIX é aprovado, o cargo é atribuído automaticamente
   - **Validação**: Verifica se o cargo é válido antes de atribuir
   - **Mensagem de confirmação**: Inclui o cargo atribuído na mensagem de sucesso

## Como Funciona

### Para o Administrador:
1. Usa o comando `/painel`
2. Seleciona "Gerenciar Cargos" no menu
3. Digita o ID do usuário e o cargo desejado (membro ou cliente)
4. O cargo é salvo na base de dados

### Para o Usuário:
1. **Se for Cliente**:
   - Ao clicar em "Adicionar Saldo", recebe mensagem de erro
   - Não pode gerar PIX para adicionar saldo

2. **Se for Membro**:
   - Pode clicar em "Adicionar Saldo"
   - Modal solicita valor e cargo desejado
   - Após pagamento, o saldo é adicionado E o cargo é confirmado

3. **Fluxo de Atribuição de Cargo via Pagamento**:
   - Usuário (qualquer cargo) acessa o modal de depósito
   - Digita o valor e o cargo que deseja (membro ou cliente)
   - Paga o PIX
   - Após confirmação, recebe saldo E o cargo selecionado

## Benefícios

1. **Segurança**: Apenas membros podem adicionar saldo
2. **Flexibilidade**: Administradores podem gerenciar cargos manualmente
3. **Automação**: Usuários podem obter cargos pagando
4. **Controle**: Sistema completo de permissões baseado em cargos

## Testes Sugeridos

1. Testar adicionar cargo a um usuário via painel admin
2. Testar tentar adicionar saldo sem ter cargo membro (deve bloquear)
3. Testar adicionar saldo com cargo membro (deve funcionar)
4. Testar pagamento PIX para obter novo cargo
5. Testar troca de cargo via pagamento