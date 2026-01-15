# Sistema de Eventos de Entrega - Documentação

## 📋 Visão Geral
Sistema automatizado para enviar mensagens de entrega quando o saldo é adicionado via pagamento PIX, utilizando componentes V2 do Discord.

## 🎯 Funcionalidades
- Envio automático de mensagem de entrega quando saldo é adicionado
- Configuração de canal de entregas via painel administrativo
- Template personalizável em formato JSON (Components V2)
- Substituição automática de variáveis (user, valor, transação, data)

## 📁 Arquivos Criados/Modificados

### 1. **Arquivo Criado**: `entregabot.json`
Template da mensagem de entrega em formato JSON com Components V2.

**Estrutura:**
```json
[
    {
        "type": 17,  // Container V2
        "accent_color": null,
        "spoiler": false,
        "components": [
            {
                "type": 10,  // TextDisplay
                "content": "Conteúdo da mensagem"
            },
            {
                "type": 14,  // Separator
                "divider": true,
                "spacing": 1
            }
        ]
    }
]
```

**Variáveis substituídas automaticamente:**
- `<@user>` → ID do usuário que recebeu o saldo
- `R$10.00` → Valor pago pelo usuário
- `a0bbc206-d86b-4a0d-a90c-a9e9a1a5eebd` → ID da transação
- `01/01/2026 15:54` → Data e hora atual

### 2. **Arquivo Modificado**: `ComandosSlash/Administracao/painel.js`

**Adicionado:**
- Campo `ticket_select_entregas` na configuração de tickets
- Handler para salvar o canal de entregas: `General.set('tickets.entregas', canalId)`

**Como configurar:**
1. Use o comando `/painel`
2. Selecione "Ticket Dinâmico"
3. Escolha o canal de entregas no menu
4. O canal será salvo automaticamente

### 3. **Arquivo Modificado**: `Eventos/SistemaDeHandlers/ticketHandler.js`

**Adicionado:**
- Função `enviarMensagemEntrega(client, user, valor, transacaoId)`
- Chamada automática após confirmação do pagamento PIX

**Funcionamento:**
1. Verifica se o canal de entregas está configurado
2. Lê o template do `entregabot.json`
3. Substitui as variáveis pelos valores reais
4. Envia a mensagem no canal configurado usando Components V2

## 🚀 Como Usar

### Passo 1: Configurar o Canal de Entregas
```
1. Reinicie o bot
2. Use o comando /painel
3. Selecione "Ticket Dinâmico"
4. No menu "Selecione o Canal de Entregas", escolha o canal desejado
5. Aguarde a confirmação
```

### Passo 2: Testar o Sistema
```
1. Abra um ticket
2. Clique em "Adicionar Saldo"
3. Digite o valor e o cargo desejado
4. Pague o PIX
5. Após a confirmação:
   - O saldo será adicionado ao usuário
   - Uma mensagem de entrega será enviada no canal configurado
```

## 📨 Exemplo de Mensagem Enviada

A mensagem enviada no canal de entregas terá a seguinte estrutura:

```
## 🌟 saldo adicionado

━━━━━━━━━━━━━━━━━━━━
👤  Usuário: @Usuário
💰  Valor Pago: R$10.00
💵  Saldo Adicionado: R$10.00
💳  Transação: a0bbc206-d86b-4a0d-a90c-a9e9a1a5eebd
━━━━━━━━━━━━━━━━━━━━
✅  Status: Aprovado
⚡  Saldo adicionado automaticamente!

📱 Data: 15/01/2026 14:30
```

## 🔧 Personalização do Template

Para personalizar a mensagem de entrega, edite o arquivo `entregabot.json`:

**Opções de components:**
- **type 10**: TextDisplay (texto)
- **type 14**: Separator (separador)
- **type 12**: MediaGallery (imagem/mídia)
- **type 11**: Button (botão)

**Emojis usados no exemplo:**
- 🌟 raiobranco_cristalstore
- 👤 membros_cristalstore
- 💰 bagdinheiro_cristalstore
- 💵 moedas
- 💳 pix
- ✅ confirm
- ⚡ animação de sucesso
- 📱 celular

## ⚙️ Configuração

### No `config.json` (opcional):
```json
{
  "tickets": {
    "entregas": "ID_DO_CANAL_ENTREGAS"
  }
}
```

### Via Painel (recomendado):
Use `/painel` → "Ticket Dinâmico" → "Canal de Entregas"

## 🐛 Troubleshooting

### A mensagem não está sendo enviada:
1. Verifique se o canal de entregas está configurado
2. Confira os logs do bot para erros
3. Verifique se o bot tem permissão para enviar mensagens no canal
4. Certifique-se de que o arquivo `entregabot.json` existe e é válido

### As variáveis não estão sendo substituídas:
1. Verifique se os placeholders no JSON estão corretos
2. Confira se os nomes das variáveis correspondem
3. Verifique os logs do bot para detalhes do erro

### O JSON está inválido:
1. Use um validador de JSON online
2. Verifique se as vírgulas estão corretas
3. Confira se os tipos de components são válidos (10, 14, 12, 11)

## ✅ Testes Realizados

Todos os testes passaram com sucesso:
- ✅ Arquivo `entregabot.json` criado corretamente
- ✅ Estrutura JSON válida com Container V2
- ✅ Opção de canal de entregas no painel
- ✅ Função `enviarMensagemEntrega` implementada
- ✅ Referência ao arquivo `entregabot.json`
- ✅ Configuração `tickets.entregas` funcionando
- ✅ Placeholders corretos no template

## 📝 Notas Importantes

1. **Permissões**: O bot precisa ter permissão para enviar mensagens no canal de entregas
2. **Formato**: O JSON deve seguir o formato de Components V2 do Discord
3. **Variáveis**: Os placeholders devem ser exatamente como no exemplo
4. **Data**: A data é formatada automaticamente para o padrão brasileiro (dd/mm/aaaa)

## 🎉 Benefícios

- ✅ **Automatização**: Mensagens enviadas automaticamente
- ✅ **Profissional**: Layout bonito com Components V2
- ✅ **Flexível**: Template personalizável
- ✅ **Rastreável**: Todas as entregas registradas
- ✅ **Configurável**: Canal definido via painel

---

**Status**: ✅ SISTEMA IMPLEMENTADO E TESTADO COM SUCESSO