'use strict';

/**
 * @fileoverview Lógica para a página de criação e edição de partidas (criar.html).
 * Permite que usuários autenticados criem novas partidas ou editem partidas existentes.
 */
document.addEventListener('DOMContentLoaded', () => {
    
    // Aplica o tema do usuário (claro/escuro) se a função estiver disponível
    if (typeof applyUserTheme === 'function') {
        applyUserTheme();
    }

    // Verificação de dependências
    if (typeof firebase === 'undefined' || typeof showToast === 'undefined') {
        console.error("Firebase ou utils.js não foram carregados.");
        return;
    }

    // Inicialização dos serviços Firebase
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;

    // Variáveis de estado para controlar o modo de edição
    let isEditMode = false;
    let currentMatchId = null;

    // Mapeamento dos elementos da UI
    const ui = {
        form: document.getElementById('matchForm'),
        dateInput: document.getElementById('data'),
        imageInput: document.getElementById('imagemPartidaInput'),
        imagePreview: document.getElementById('imagePreview'),
        pageTitle: document.querySelector('.form-header h2'),
        submitButton: document.querySelector('.submit-btn'),
        matchIdInput: document.getElementById('matchIdInput')
    };

    /**
     * Observador do estado de autenticação.
     * Quando o usuário está logado, inicia a lógica da página.
     */
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            // Verifica se a página está em modo de edição
            checkForEditMode();
        }
    });

    /**
     * Verifica se há um 'id' de partida na URL.
     * Se houver, configura a página para o modo de edição.
     */
    async function checkForEditMode() {
        const urlParams = new URLSearchParams(window.location.search);
        currentMatchId = urlParams.get('id');

        if (currentMatchId) {
            isEditMode = true;
            ui.matchIdInput.value = currentMatchId;
            
            // Altera os textos da UI para refletir o modo de edição
            ui.pageTitle.textContent = 'Editar Partida';
            ui.submitButton.textContent = 'Salvar Alterações';

            try {
                // Busca os dados da partida no Firestore
                const doc = await db.collection('partidas').doc(currentMatchId).get();
                if (doc.exists) {
                    // Preenche o formulário com os dados existentes
                    fillFormWithMatchData(doc.data());
                } else {
                    showToast('Partida não encontrada.', 'error');
                    window.location.href = 'inicio.html';
                }
            } catch (error) {
                console.error("Erro ao buscar dados da partida:", error);
                showToast('Erro ao carregar dados da partida.', 'error');
            }
        }
    }

    /**
     * Preenche os campos do formulário com os dados de uma partida existente.
     * @param {object} data - Os dados da partida vindos do Firestore.
     */
    function fillFormWithMatchData(data) {
        ui.form.nome.value = data.nome || '';
        ui.form.data.value = data.data || '';
        ui.form.hora.value = data.hora || '';
        ui.form.local.value = data.local || '';
        ui.form.modalidade.value = data.modalidade || '';
        ui.form.tipo.value = data.tipo || '';
        ui.form.vagasTotais.value = data.vagasTotais || ''; 
        
        if (data.imagemURL) {
            ui.imagePreview.src = data.imagemURL;
            ui.imagePreview.style.display = 'block';
        }
    }
    
    /**
     * Prepara o formulário, definindo a data mínima e adicionando o listener de submit.
     */
    const setupForm = () => {
        // Impede que o usuário selecione uma data passada
        const today = new Date().toISOString().split('T')[0];
        if (ui.dateInput) ui.dateInput.min = today;
        
        // Adiciona os listeners aos elementos do formulário
        if (ui.form) ui.form.addEventListener('submit', handleFormSubmit);
        if (ui.imageInput) ui.imageInput.addEventListener('change', previewImage);
    };

    /**
     * Exibe um preview da imagem selecionada pelo usuário.
     * @param {Event} event - O evento de mudança do input de imagem.
     */
    function previewImage(event) {
        const file = event.target.files[0];
        if (file && ui.imagePreview) {
            const reader = new FileReader();
            reader.onload = e => {
                ui.imagePreview.src = e.target.result;
                ui.imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    }

    /**
     * Lida com o envio do formulário, tanto para criar quanto para atualizar uma partida.
     * @param {Event} event - O evento de submit.
     */
    async function handleFormSubmit(event) {
        event.preventDefault();
        if (!currentUser) {
            return showToast("Você precisa estar logado.", "error");
        }
        
        // Coleta os dados do formulário
        const partida = {
            nome: document.getElementById('nome').value,
            data: document.getElementById('data').value,
            hora: document.getElementById('hora').value,
            local: document.getElementById('local').value,
            modalidade: document.getElementById('modalidade').value,
            tipo: document.getElementById('tipo').value,
            vagasTotais: Number(document.getElementById('vagasTotais').value)
        };

        // Validação simples
        if (!partida.nome || !partida.data || !partida.hora || !partida.local || !partida.modalidade || !partida.tipo || !partida.vagasTotais) {
            return showToast("Por favor, preencha todos os campos obrigatórios.", "error");
        }

        toggleLoading(true);

        try {
            // Se uma nova imagem foi selecionada, converte para Base64
            const imageFile = ui.imageInput.files[0];
            if (imageFile) {
                partida.imagemURL = await convertImageToBase64(imageFile);
            }

            if (isEditMode) {
                // Se estiver em modo de edição, atualiza o documento existente
                partida.atualizadoEm = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('partidas').doc(currentMatchId).update(partida);
                showToast("Partida atualizada com sucesso!", "success");
            } else {
                // Caso contrário, cria um novo documento
                partida.creatorId = currentUser.uid;
                partida.creatorName = currentUser.displayName || 'Usuário Anônimo';
                partida.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('partidas').add(partida);
                showToast("Partida criada com sucesso!", "success");
            }

            // Redireciona para a página inicial após o sucesso
            setTimeout(() => { window.location.href = 'inicio.html'; }, 1500);

        } catch (error) {
            console.error("Erro ao salvar partida: ", error);
            showToast("Não foi possível salvar a partida. Tente novamente.", "error");
        } finally {
            toggleLoading(false);
        }
    }

    // Inicializa a configuração do formulário.
    setupForm();
});