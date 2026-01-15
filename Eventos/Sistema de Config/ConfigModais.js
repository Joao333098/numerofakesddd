const { General, emoji, saldo, moder, perms, cargos } = require('../../DataBaseJson');
const axios = require('axios');
const config = require('../../config.json');

module.exports = {
    name: 'interactionCreate',
    run: async (interaction, client) => {
        // Verificar se a interação já foi respondida ou processada por outro handler
        if (interaction.replied || interaction.deferred || interaction.__adminHandlerProcessed) {
            return;
        }

        // Processar apenas submits de modal específicos
        if (!interaction.isModalSubmit()) {
            return;
        }

        const modalId = interaction.customId;

        try {
            switch (modalId) {
                case 'modal_sms24h':
                    await handleSMS24H(interaction);
                    break;

                case 'modal_pix':
                    await handlePIX(interaction);
                    break;

                case 'modal_mp':
                    await handleMercadoPago(interaction);
                    break;

                case 'modal_ticket':
                    await handleTicket(interaction);
                    break;

                case 'modal_saldo':
                    await handleSaldo(interaction);
                    break;

                case 'modal_blacklist':
                    await handleBlacklist(interaction);
                    break;

                case 'modal_cargos':
                    await handleCargos(interaction);
                    break;

                case 'modal_atualizar_msg':
                    await handleAtualizarMensagens(interaction);
                    break;

                default:
                    return; // Não processar outros modais
            }
        } catch (error) {
            console.error(`Erro ao processar modal ${modalId}:`, error);
            
            // NÃO tentar responder se já ocorreu erro de resposta duplicada
            // Apenas logar o erro
        }
    }
};

// Funções auxiliares para processar cada modal
async function handleSMS24H(interaction) {
    const apiKey = interaction.fields.getTextInputValue('api_key');
    
    General.set('sms24h.api_key', apiKey);
    
    await interaction.reply({
        content: `${emoji.certo} API Key do SMS24H configurada com sucesso!`,
        ephemeral: true
    });
}

async function handlePIX(interaction) {
    const chave = interaction.fields.getTextInputValue('chave_pix');
    const tipo = interaction.fields.getTextInputValue('tipo_pix');
    
    General.set('pix.chave', chave);
    General.set('pix.tipo', tipo);
    
    await interaction.reply({
        content: `${emoji.certo} Chave PIX configurada com sucesso!`,
        ephemeral: true
    });
}

async function handleMercadoPago(interaction) {
    const accessToken = interaction.fields.getTextInputValue('access_token');
    
    General.set('mp.access_token', accessToken);
    
    await interaction.reply({
        content: `${emoji.certo} Mercado Pago configurado com sucesso!`,
        ephemeral: true
    });
}

async function handleTicket(interaction) {
    const categoria = interaction.fields.getTextInputValue('categoria');
    const logs = interaction.fields.getTextInputValue('logs');
    
    // Verificar se são números válidos
    if (isNaN(categoria) || isNaN(logs)) {
        return interaction.reply({
            content: `${emoji.erro} IDs inválidos! Por favor, forneça números válidos.`,
            ephemeral: true
        });
    }
    
    General.set('ticket.categoria', categoria);
    General.set('ticket.logs', logs);
    
    await interaction.reply({
        content: `${emoji.certo} Sistema de tickets configurado com sucesso!`,
        ephemeral: true
    });
}

async function handleSaldo(interaction) {
    const userId = interaction.fields.getTextInputValue('user_id');
    const valor = interaction.fields.getTextInputValue('valor');
    
    // Verificar se o valor é um número válido
    const valorNumerico = parseFloat(valor);
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
        return interaction.reply({
            content: `${emoji.erro} Valor inválido! Por favor, forneça um valor numérico positivo.`,
            ephemeral: true
        });
    }
    
    // Adicionar saldo ao usuário
    const saldoAtual = parseFloat(saldo.get(userId) || 0);
    saldo.set(userId, (saldoAtual + valorNumerico).toFixed(2));
    
    await interaction.reply({
        content: `${emoji.certo} Saldo de R$ ${valorNumerico.toFixed(2)} adicionado para o usuário ${userId}!`,
        ephemeral: true
    });
}

async function handleBlacklist(interaction) {
    const userId = interaction.fields.getTextInputValue('user_id');
    
    // Verificar se o usuário já está na blacklist
    const blacklist = moder.get('blacklist') || [];
    
    if (blacklist.includes(userId)) {
        // Remover da blacklist
        moder.pull('blacklist', userId);
        
        await interaction.reply({
            content: `${emoji.certo} Usuário ${userId} removido da blacklist!`,
            ephemeral: true
        });
    } else {
        // Adicionar à blacklist
        moder.push('blacklist', userId);
        
        await interaction.reply({
            content: `${emoji.certo} Usuário ${userId} adicionado à blacklist!`,
            ephemeral: true
        });
    }
}

async function handleCargos(interaction) {
    const userId = interaction.fields.getTextInputValue('user_id');
    const cargo = interaction.fields.getTextInputValue('cargo').toLowerCase();
    
    // Validar o cargo
    if (cargo !== 'membro' && cargo !== 'cliente') {
        return interaction.reply({
            content: `${emoji.erro} Cargo inválido! Use "membro" ou "cliente".`,
            ephemeral: true
        });
    }
    
    // Salvar o cargo do usuário
    cargos.set(`usuarios.${userId}.cargo`, cargo);
    
    await interaction.reply({
        content: `${emoji.certo} Cargo "${cargo}" atribuído ao usuário ${userId}!`,
        ephemeral: true
    });
}

async function handleAtualizarMensagens(interaction) {
    const jsonContent = interaction.fields.getTextInputValue('json_components');
    const channelId = interaction.fields.getTextInputValue('channel_id');
    const messageId = interaction.fields.getTextInputValue('message_id');

    try {
        // Parsear JSON
        let cleanContent = jsonContent.replace(/```json|```/g, '').trim();
        let userComponents = JSON.parse(cleanContent);

        // Validação e correção V2
        userComponents = userComponents.filter(comp => {
            const validV2Types = [1, 9, 10, 11, 12, 13, 14];
            if (!validV2Types.includes(comp.type)) {
                console.warn(`Tipo inválido removido: ${comp.type}`);
                return false;
            }
            // Limpa imagens vazias (type 12)
            if (comp.type === 12 && comp.items) {
                comp.items = comp.items.filter(item => 
                    item.media?.url && item.media.url.length > 10
                );
                if (comp.items.length === 0) return false;
            }
            return true;
        });

        if (userComponents.length === 0) {
            throw new Error('Nenhum componente válido após correção');
        }

        const finalPayload = {
            content: null,
            components: [
                {
                    type: 17, // Container V2
                    accent_color: 9225410, // Roxo
                    spoiler: false,
                    components: userComponents
                }
            ],
            flags: 32768  // ← CRUCIAL: IS_COMPONENTS_V2 (1 << 15)
        };

        // Determinar o canal
        const targetChannelId = channelId || interaction.channelId;

        // Fazer a requisição PATCH para atualizar a mensagem
        await axios.patch(
            `https://discord.com/api/v10/channels/${targetChannelId}/messages/${messageId}`,
            finalPayload,
            {
                headers: {
                    'Authorization': `Bot ${config.token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        await interaction.reply({
            content: `${emoji.certo} **Interface V2 atualizada com sucesso!**\n\n📝 Mensagem: \`${messageId}\`\n📍 Canal: \`${targetChannelId}\``,
            ephemeral: true
        });

    } catch (error) {
        console.error('Erro ao atualizar mensagem V2:', error);
        
        let errorMessage = `${emoji.erro} Erro ao atualizar mensagem:\n`;
        
        if (error.response) {
            const errorData = error.response.data;
            errorMessage += `\`\`\`json\n${JSON.stringify(errorData.errors || errorData, null, 2)}\n\`\`\``;
        } else if (error instanceof SyntaxError) {
            errorMessage += 'JSON inválido. Verifique o formato e tente novamente.';
        } else {
            errorMessage += error.message;
        }
        
        await interaction.reply({
            content: errorMessage,
            ephemeral: true
        });
    }
}