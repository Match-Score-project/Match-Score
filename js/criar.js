'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // 1. INICIALIZAÇÃO E VERIFICAÇÃO
    if (typeof firebase === 'undefined' || typeof showToast === 'undefined') {
        console.error("Firebase ou utils.js não foram carregados.");
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;

    // NOVO: Variáveis para controlar o modo de edição
    let isEditMode = false;
    let currentMatchId = null;

    // 2. ELEMENTOS DA UI
    const ui = {
        form: document.getElementById('matchForm'),
        dateInput: document.getElementById('data'),
        imageInput: document.getElementById('imagemPartidaInput'),
        imagePreview: document.getElementById('imagePreview'),
        logo: document.querySelector('.form-header .logo'),
        pageTitle: document.querySelector('.form-header h2'),
        submitButton: document.querySelector('.submit-btn'),
        matchIdInput: document.getElementById('matchIdInput')
    };

    // 3. AUTENTICAÇÃO E LÓGICA DA PÁGINA
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            checkForEditMode(); // NOVO: Verifica se estamos em modo de edição
        }
    });

    // NOVO: Função para verificar a URL e entrar no modo de edição
    async function checkForEditMode() {
        const urlParams = new URLSearchParams(window.location.search);
        currentMatchId = urlParams.get('id');

        if (currentMatchId) {
            isEditMode = true;
            ui.matchIdInput.value = currentMatchId;
            
            // Altera a UI para o modo de edição
            ui.pageTitle.textContent = 'Editar Partida';
            ui.submitButton.textContent = 'Salvar Alterações';

            // Busca os dados da partida e preenche o formulário
            try {
                const doc = await db.collection('partidas').doc(currentMatchId).get();
                if (doc.exists) {
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

    // NOVO: Função para preencher o formulário com dados existentes
    function fillFormWithMatchData(data) {
        ui.form.nome.value = data.nome || '';
        ui.form.data.value = data.data || '';
        ui.form.hora.value = data.hora || '';
        ui.form.local.value = data.local || '';
        ui.form.tipo.value = data.tipo || '';
        ui.form.jogadores.value = data.jogadoresPorTime || '';
        
        if (data.imagemURL) {
            ui.imagePreview.src = data.imagemURL;
            ui.imagePreview.style.display = 'block';
        }
    }
    
    // 4. LÓGICA DO FORMULÁRIO (CRIAR E ATUALIZAR)
    const setupForm = () => {
        const today = new Date().toISOString().split('T')[0];
        if (ui.dateInput) ui.dateInput.min = today;
        if (ui.form) ui.form.addEventListener('submit', handleFormSubmit);
        if (ui.imageInput) ui.imageInput.addEventListener('change', previewImage);
    };

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

    // ATUALIZADO: A função de salvar agora lida com criar e editar
    async function handleFormSubmit(event) {
        event.preventDefault();
        if (!currentUser) {
            return showToast("Você precisa estar logado.", "error");
        }
        
        const formData = new FormData(ui.form);
        const partida = {
            nome: formData.get('nome'),
            data: formData.get('data'),
            hora: formData.get('hora'),
            local: formData.get('local'),
            tipo: formData.get('tipo'),
            jogadoresPorTime: Number(formData.get('jogadores'))
        };

        // Validação
        if (!partida.nome || !partida.data || !partida.hora || !partida.local || !partida.tipo || !partida.jogadoresPorTime) {
            return showToast("Por favor, preencha todos os campos obrigatórios.", "error");
        }

        toggleLoading(true);

        try {
            const imageFile = ui.imageInput.files[0];
            if (imageFile) {
                partida.imagemURL = await convertImageToBase64(imageFile);
            }

            if (isEditMode) {
                // MODO DE EDIÇÃO: Atualiza o documento existente
                partida.atualizadoEm = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('partidas').doc(currentMatchId).update(partida);
                showToast("Partida atualizada com sucesso!", "success");
            } else {
                // MODO DE CRIAÇÃO: Adiciona um novo documento
                partida.creatorId = currentUser.uid;
                partida.creatorName = currentUser.displayName || 'Usuário Anônimo';
                partida.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('partidas').add(partida);
                showToast("Partida criada com sucesso!", "success");
            }

            setTimeout(() => { window.location.href = 'inicio.html'; }, 1500);

        } catch (error) {
            console.error("Erro ao salvar partida: ", error);
            showToast("Não foi possível salvar a partida. Tente novamente.", "error");
        } finally {
            toggleLoading(false);
        }
    }

    // 5. INICIALIZAÇÃO DA PÁGINA
    setupForm();
});